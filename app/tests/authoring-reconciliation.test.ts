import { expect, test } from "@playwright/test"
import { createDraft, parseDocument, serializeDocument } from "../src/lib/authoring/documents"
import { reconcileDraft, reconciliationKey } from "../src/lib/authoring/reconciliation"
import type { CmsDocument, CmsDraft } from "../src/lib/authoring/types"

function document(fields = "", body = "Original notes.\n", collection = "tastings") {
	return parseDocument({
		path: "app/content/" + collection + "/stable.md",
		sha: "base-sha",
		content: "---\nid: stable\ntitle: Original tea\n" + fields + "---\n" + body,
	})
}
const draft = (base: CmsDocument, patch: Record<string, unknown>, body = base.body): CmsDraft => ({
	...createDraft(base, "base-head"),
	document: serializeDocument(base, patch, body),
	revision: 2,
})
const latest = (base: CmsDocument, patch: Record<string, unknown>, body = base.body) => ({
	...serializeDocument(base, patch, body),
	sha: "latest-sha",
})

test("nonoverlapping nested edits, removals, zero and false merge without a choice", () => {
	const base = document(
		"brewing:\n  temperature: 210\n  material_amount: 5\n  vessel: gaiwan\nrating: 20\ncustom:\n  enabled: true\n  obsolete: old\n"
	)
	const local = draft(base, {
		brewing: { material_amount: 6, vessel: undefined },
		custom: { enabled: false },
	})
	const remote = latest(
		base,
		{ brewing: { temperature: 200 }, rating: 0, custom: { obsolete: undefined, new: "latest" } },
		"Latest notes.\n"
	)
	const result = reconcileDraft(local, remote)
	expect(result.error).toBeNull()
	expect(result.conflicts).toEqual([])
	expect(result.document?.data.brewing).toEqual({ temperature: 200, material_amount: 6 })
	expect(result.document?.data.custom).toEqual({ enabled: false, new: "latest" })
	expect(result.document?.data.rating).toBe(0)
	expect(result.document?.body).toBe("Latest notes.\n")
	expect(result.document?.sha).toBe("latest-sha")
})

test("overlapping nested edits require an explicit local/latest choice with editorial labels", () => {
	const base = document("brewing: {temperature: 210, material_amount: 5}\n")
	const local = draft(base, { brewing: { material_amount: 6 } })
	const remote = latest(base, { brewing: { material_amount: 7 } })
	const open = reconcileDraft(local, remote)
	expect(open.document).toBeNull()
	expect(open.unresolved).toHaveLength(1)
	expect(open.conflicts[0]).toMatchObject({
		id: "/data/brewing/material_amount",
		label: "Brewing › Leaf (g)",
		base: 5,
		local: 6,
		remote: 7,
	})
	const keepLocal = reconcileDraft(local, remote, { [open.conflicts[0].id]: "local" })
	expect(keepLocal.document?.data.brewing).toEqual({ temperature: 210, material_amount: 6 })
	const keepLatest = reconcileDraft(local, remote, { [open.conflicts[0].id]: "latest" })
	expect(keepLatest.document?.raw).toBe(remote.raw)
})

test("arrays, frontmatter notes and body are atomic, never silently interleaved", () => {
	const base = document("vendor: [original-vendor]\nnotes: {taste: original, finish: short}\n")
	const local = draft(base, { vendor: ["local-vendor"], notes: { taste: "sweet" } }, "My notes.\n")
	const remote = latest(
		base,
		{ vendor: ["latest-vendor"], notes: { finish: "long" } },
		"Latest notes.\n"
	)
	const open = reconcileDraft(local, remote)
	expect(open.unresolved.map((conflict) => conflict.id)).toEqual([
		"/data/vendor",
		"/data/notes",
		"/body",
	])
	expect(open.conflicts.find((conflict) => conflict.id === "/body")?.label).toBe("Notes & story")
	const resolved = reconcileDraft(local, remote, {
		"/data/vendor": "latest",
		"/data/notes": "local",
		"/body": "local",
	})
	expect(resolved.document?.data.vendor).toEqual(["latest-vendor"])
	expect(resolved.document?.data.notes).toEqual({ taste: "sweet", finish: "short" })
	expect(resolved.document?.body).toBe("My notes.\n")
})

test("delete versus changed object is an explicit atomic conflict; unchanged deletion stays automatic", () => {
	const base = document("links: {website: old, instagram: tea}\n", "", "vendors")
	const local = draft(base, { links: undefined })
	const remote = latest(base, { links: { website: "new" } })
	const open = reconcileDraft(local, remote)
	expect(open.conflicts).toHaveLength(1)
	expect(open.conflicts[0].id).toBe("/data/links")
	const removed = reconcileDraft(local, remote, { "/data/links": "local" })
	expect(removed.document?.data).not.toHaveProperty("links")
	expect(reconcileDraft(local, { ...base, sha: "latest-sha" }).document?.data).not.toHaveProperty(
		"links"
	)
})

test("latest source AST, comments, unknown fields and identity survive local resolution", () => {
	const base = parseDocument({
		path: "app/content/vendors/stable.md",
		sha: "base-sha",
		content:
			"---\r\nid: stable\r\ntitle: 'Tea' # earlier label\r\nlinks:\r\n  website: old\r\nunknown: original\r\n---\r\nEarlier notes.\r\n",
	})
	const local = draft(base, { title: "Local tea", links: { website: "local" } })
	const remote = parseDocument({
		path: base.path,
		sha: "latest-sha",
		content:
			"---\r\nid: stable\r\n# latest editorial comment\r\ntitle: 'Latest tea' # retain this source style\r\nlinks:\r\n  website: latest # latest link explanation\r\nunknown: latest # preserve future schema\r\nnew_unknown: [one, two]\r\n---\r\nEarlier notes.\r\n",
	})
	const result = reconcileDraft(local, remote, {
		"/data/title": "local",
		"/data/links/website": "local",
	})
	expect(result.document?.data).toMatchObject({
		id: "stable",
		title: "Local tea",
		unknown: "latest",
		new_unknown: ["one", "two"],
	})
	expect(result.document?.raw).toContain("# latest editorial comment")
	expect(result.document?.raw).toContain("# retain this source style")
	expect(result.document?.raw).toContain("# latest link explanation")
	expect(result.document?.raw).toContain("# preserve future schema")
	expect(result.document?.raw).toContain("\r\n")
	expect(result.document?.path).toBe(base.path)
	expect(result.document?.id).toBe(base.id)
})

test("same edits on both sides need no choice and unchanged local source keeps latest bytes exactly", () => {
	const base = document()
	const remote = latest(base, { title: "Same edit" })
	expect(reconcileDraft(draft(base, { title: "Same edit" }), remote).conflicts).toEqual([])
	expect(reconcileDraft(draft(base, {}), remote).document?.raw).toBe(remote.raw)
})

test("missing remote, new-record collisions, identity/path changes and inconsistent source remain blocked", () => {
	const base = document(),
		local = draft(base, { title: "Local" }),
		remote = latest(base, { title: "Latest" })
	expect(reconcileDraft(local, null).error).toMatch(/missing/)
	expect(reconcileDraft({ ...local, base: null }, remote).error).toMatch(/source collision/)
	expect(
		reconcileDraft(local, { ...remote, path: "app/content/tastings/renamed.md" }).error
	).toMatch(/identity/)
	expect(reconcileDraft(local, { ...remote, id: "different" }).error).toMatch(/identity/)
	expect(
		reconcileDraft(local, {
			...remote,
			data: { ...remote.data, title: "Does not match raw source" },
		}).error
	).toMatch(/saved source/)
	expect(reconcileDraft(local, { ...remote, sha: null }).error).toMatch(
		/verified repository revision/
	)
})

test("review identity changes on later local edits or a changed remote head", () => {
	const base = document(),
		local = draft(base, { title: "Local" }),
		remote = latest(base, { title: "Latest" })
	expect(reconciliationKey(local, remote, "head")).not.toBe(
		reconciliationKey({ ...local, revision: 3 }, remote, "head")
	)
	expect(reconciliationKey(local, remote, "head")).not.toBe(
		reconciliationKey(local, remote, "new-head")
	)
})

test("single-image src and variants cannot automatically combine incompatible versions", () => {
	const base = document("image: /images/old.webp\nimage_alt: Earlier description\n", "", "vendors")
	const local = draft(base, {
		image: "/images/local.webp",
		image_alt: "Authored local description",
	})
	const variants = [{ path: "/images/old.webp", width: 480, height: 320, mime: "image/webp" }]
	const remote = latest(base, { image_variants: variants })
	const open = reconcileDraft(local, remote)
	expect(open.document).toBeNull()
	expect(open.unresolved).toHaveLength(1)
	expect(open.conflicts[0]).toMatchObject({
		id: "/data/image",
		label: "Image",
		field: { name: "image", type: "image" },
	})
	expect(open.conflicts[0].local).toEqual({ image: "/images/local.webp" })
	expect(open.conflicts[0].remote).toEqual({ image: "/images/old.webp", image_variants: variants })
	const localPicture = reconcileDraft(local, remote, { "/data/image": "local" }).document!
	expect(localPicture.data.image).toBe("/images/local.webp")
	expect(localPicture.data).not.toHaveProperty("image_variants")
	expect(localPicture.data.image_alt).toBe("Authored local description")
	const latestPicture = reconcileDraft(local, remote, { "/data/image": "latest" }).document!
	expect(latestPicture.data.image).toBe("/images/old.webp")
	expect(latestPicture.data.image_variants).toEqual(variants)
	expect(latestPicture.data.image_alt).toBe("Authored local description")
})

test("image conflict chooses one whole src/variant set, ignores obsolete variant-only choices", () => {
	const base = document(
		"image: /images/base.webp\nimage_variants: [{path: /images/base.webp, width: 480}]\n",
		"",
		"vendors"
	)
	const localVariants = [{ path: "/images/local.webp", width: 960 }]
	const latestVariants = [{ path: "/images/latest.webp", width: 1600 }]
	const local = draft(base, { image: "/images/local.webp", image_variants: localVariants })
	const remote = latest(base, { image: "/images/latest.webp", image_variants: latestVariants })
	const open = reconcileDraft(local, remote, { "/data/image_variants": "local" })
	expect(open.unresolved.map((conflict) => conflict.id)).toEqual(["/data/image"])
	const result = reconcileDraft(local, remote, {
		"/data/image": "latest",
		"/data/image_variants": "local",
	})
	expect(result.document?.data).toMatchObject({
		image: "/images/latest.webp",
		image_variants: latestVariants,
	})
	expect(result.conflicts).toHaveLength(1)
})

test("picture replacement or removal remains automatic alongside unrelated latest edits", () => {
	const base = document(
		"image: /images/base.webp\nimage_variants: [{path: /images/base.webp, width: 480}]\nimage_alt: Original\n",
		"",
		"vendors"
	)
	const local = draft(base, { image: undefined, image_variants: undefined })
	const remote = latest(base, { title: "Latest name", image_alt: "Latest description" })
	const result = reconcileDraft(local, remote)
	expect(result.conflicts).toEqual([])
	expect(result.document?.data).toMatchObject({
		title: "Latest name",
		image_alt: "Latest description",
	})
	expect(result.document?.data).not.toHaveProperty("image")
	expect(result.document?.data).not.toHaveProperty("image_variants")
})

test("session image lists remain atomic including their image descriptions and variants", () => {
	const base = document("images: [{image: /images/base.webp, alt: Original}]\n")
	const localImages = [
		{
			image: "/images/local.webp",
			alt: "Local",
			variants: [{ path: "/images/local.webp", width: 960 }],
		},
	]
	const remoteImages = [
		{
			image: "/images/remote.webp",
			alt: "Latest",
			variants: [{ path: "/images/remote.webp", width: 480 }],
		},
	]
	const local = draft(base, { images: localImages }),
		remote = latest(base, { images: remoteImages })
	expect(reconcileDraft(local, remote).unresolved.map((conflict) => conflict.id)).toEqual([
		"/data/images",
	])
	expect(reconcileDraft(local, remote, { "/data/images": "local" }).document?.data.images).toEqual(
		localImages
	)
})
