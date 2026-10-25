import { expect, test } from "@playwright/test"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import {
	createDocument,
	createDraft,
	isDraftDirty,
	parseDocument,
	serializeDocument,
	setDocumentField,
} from "../src/lib/authoring/documents"
import { COLLECTION_NAMES, type CmsDocument, type CmsDraft } from "../src/lib/authoring/types"
import { planChanges } from "../src/lib/authoring/planning"
import { validateDocument } from "../src/lib/authoring/schema"
import { saveDraft } from "../src/lib/authoring/drafts"

function document(collection: string, id: string, fields = "", body = "") {
	return parseDocument({
		path: "app/content/" + collection + "/" + id + ".md",
		sha: "blob-" + id,
		content: "---\nid: " + id + "\ntitle: " + id + "\n" + fields + "---\n" + body,
	})
}
const plan = (documents: CmsDocument[], drafts: CmsDraft[], selectedIds: string[], extra = {}) =>
	planChanges({ documents, drafts, selectedIds, head: "head-main", branch: "main", ...extra })
const edit = (base: CmsDocument, patch: Record<string, unknown>) => ({
	...createDraft(base, "head-main", "main"),
	document: serializeDocument(base, patch),
	revision: 2,
})
const fresh = (doc: CmsDocument) => ({
	...createDraft({ ...doc, sha: null }, "head-main", "main"),
	base: null,
})

test("every checked-in document parses and no-op serialization preserves all source bytes", async () => {
	for (const collection of COLLECTION_NAMES) {
		const directory = path.resolve(import.meta.dirname, "../content", collection)
		for (const filename of await readdir(directory)) {
			if (!filename.endsWith(".md")) continue
			const content = await readFile(path.join(directory, filename), "utf8")
			const source = {
				path: "app/content/" + collection + "/" + filename,
				sha: "original-blob",
				content,
			}
			const parsed = parseDocument(source)
			expect(serializeDocument(parsed).raw, source.path).toBe(content)
			expect(parsed.sha).toBe(source.sha)
		}
	}
})

test("field patching retains comments, unknown frontmatter, stable identity, units and exact stored date", () => {
	const raw =
		"---\r\nid: stable\r\n# human provenance\r\ntitle: 'Original tea' # keep quote style\r\ndate: 2022-03-07T22:19:25.393Z\r\nbrewing:\r\n  temperature: 210 # Fahrenheit\r\n  material_amount: 5.34\r\nunknown_field: [one, two] # future schema\r\n---\r\n\r\nBody.\r\n"
	const original = parseDocument({
		path: "app/content/tastings/stable.md",
		sha: "sha",
		content: raw,
	})
	const next = setDocumentField(original, ["brewing", "material_amount"], 6.1)
	expect(next.data.brewing).toEqual({ temperature: 210, material_amount: 6.1 })
	expect(next.data.date).toBe("2022-03-07T22:19:25.393Z")
	expect(next.data.unknown_field).toEqual(["one", "two"])
	expect(next.raw).toContain("# human provenance")
	expect(next.raw).toContain("# Fahrenheit")
	expect(next.raw).toContain("# future schema")
	expect(next.raw).toContain("title: 'Original tea'")
	expect(next.body).toBe(original.body)
	expect(next.path).toBe(original.path)
	expect(next.id).toBe(original.id)
	expect(() => serializeDocument(original, { id: "replacement" })).toThrow(/stable content ID/)
})

test("body-only edits retain frontmatter bytes and explicit nested deletion preserves siblings", () => {
	const original = document(
		"vendors",
		"vendor",
		"# custom comment\nlinks: {website: 'https://example.org', instagram: 'tea'}\nunknown: >-\n  Keep this scalar\n",
		"\nOriginal body\n"
	)
	const changedBody = serializeDocument(original, undefined, "\nRevised body\n")
	expect(changedBody.raw.slice(0, -changedBody.body.length)).toBe(
		original.raw.slice(0, -original.body.length)
	)
	const next = serializeDocument(original, { links: { instagram: undefined } })
	expect(next.data.links).toEqual({ website: "https://example.org" })
	expect(next.raw).toContain("# custom comment")
	expect(next.data.unknown).toBe("Keep this scalar")
})

test("new records get permanent unique paths and malformed YAML/path/identity is rejected", () => {
	const created = createDocument("vendors", { title: "New vendor" })
	expect(created.path).toMatch(/^app\/content\/vendors\/new-vendor-[0-9a-f]+\.md$/)
	expect(serializeDocument(created, { title: "Renamed vendor" }).path).toBe(created.path)
	expect(() =>
		parseDocument({ path: "app/content/vendors/../x.md", sha: null, content: "---\nid: x\n---\n" })
	).toThrow(/Unsupported content path/)
	expect(() =>
		parseDocument({
			path: "app/content/vendors/x.md",
			sha: null,
			content: "---\nid: x\nid: y\n---\n",
		})
	).toThrow(/Invalid YAML/)
	expect(() =>
		parseDocument({ path: "app/content/vendors/x.md", sha: null, content: "---\ntitle: x\n---\n" })
	).toThrow(/stable ID/)
})

test("only new referenced helpers join selection; existing related edits remain omitted", () => {
	const vendor = document("vendors", "existing-vendor")
	const oldVendorEdit = edit(vendor, { title: "Unrelated rename" })
	const newVendor = fresh(document("vendors", "new-vendor"))
	const session = fresh(
		document(
			"tastings",
			"session",
			"date: 2026-10-24T12:00:00.000Z\nvendor: [existing-vendor, new-vendor]\n"
		)
	)
	const result = plan([vendor], [oldVendorEdit, newVendor, session], ["session"])
	expect(result.errors).toEqual([])
	expect(result.included.map((draft) => draft.id)).toEqual(["session", "new-vendor"])
	expect(result.required).toEqual([{ id: "new-vendor", requiredBy: ["session"] }])
	expect(result.omitted.map((draft) => draft.id)).toEqual(["existing-vendor"])
	expect(result.documents.find((doc) => doc.id === vendor.id)?.data.title).toBe("existing-vendor")
	expect(plan([vendor], [oldVendorEdit, newVendor, session], []).included).toEqual([])
})

test("new origin parents are recursively required and parent cycles cannot pass", () => {
	const parent = fresh(document("origins", "parent"))
	const village = fresh(document("origins", "village", "parent: parent\n"))
	const session = fresh(
		document("tastings", "session", "date: 2026-10-24T12:00:00.000Z\norigin: [village]\n")
	)
	const result = plan([], [parent, village, session], ["session"])
	expect(result.errors).toEqual([])
	expect(result.required.map((entry) => entry.id)).toEqual(["parent", "village"])
	const cycle = serializeDocument(parent.document, { parent: "village" })
	expect(
		validateDocument(cycle, [cycle, village.document]).some((issue) =>
			issue.message.includes("cycle")
		)
	).toBe(true)
})

test("required helpers never redirect a root into their PR and multiple root PRs block", () => {
	const vendor = {
		...fresh(document("vendors", "vendor")),
		branch: "cms/authoring/actor/pr1",
		prNumber: 1,
	}
	const session = fresh(
		document("tastings", "session", "date: 2026-10-24T12:00:00.000Z\nvendor: [vendor]\n")
	)
	const result = plan([], [vendor, session], ["session"])
	expect(result.destination.kind).toBe("new")
	expect(result.included.map((draft) => draft.id)).toEqual(["session"])
	expect(result.errors.some((issue) => issue.code === "dependency-owner")).toBe(true)
	const other = {
		...fresh(document("vendors", "other")),
		branch: "cms/authoring/actor/pr2",
		prNumber: 2,
	}
	const mixed = plan([], [vendor, other], ["vendor", "other"])
	expect(mixed.destination.kind).toBe("blocked")
	expect(mixed.errors.some((issue) => issue.code === "multiple-prs")).toBe(true)
})

test("exact target bases and excluded edits govern candidate validation", () => {
	const vendor = document("vendors", "vendor")
	const draft = edit(vendor, { title: "Edited" })
	const moved = serializeDocument(vendor, { description: "Remote edit" })
	expect(
		plan([moved], [draft], ["vendor"]).errors.some((issue) => issue.code === "stale-base")
	).toBe(true)
	const deleted = { ...createDraft(vendor, "head-main", "main"), deleted: true }
	const session = document(
		"tastings",
		"session",
		"date: 2026-10-24T12:00:00.000Z\nvendor: [vendor]\n"
	)
	expect(
		plan([vendor, session], [deleted], ["vendor"]).errors.some(
			(issue) => issue.code === "referenced-deletion"
		)
	).toBe(true)
})

test("only referenced selected media is included and temporary URLs block pushing", () => {
	const original = document("vendors", "vendor")
	const draft = edit(original, { image: "/images/uploads/authoring/digest/640.webp" })
	const asset = {
		id: "digest",
		path: "app/public/images/uploads/authoring/digest/640.webp",
		filename: "640.webp",
		mime: "image/webp",
		width: 640,
		height: 480,
		blob: new Blob(["image"]),
	}
	draft.assets = [
		asset,
		{ ...asset, id: "unused", path: "app/public/images/uploads/authoring/unused/640.webp" },
	]
	const result = plan([original], [draft], ["vendor"])
	expect(result.errors).toEqual([])
	expect(result.assets.map((item) => item.id)).toEqual(["digest"])
	const temporary = edit(original, { image: "blob:temporary" })
	expect(
		plan([original], [temporary], ["vendor"]).errors.some(
			(issue) => issue.code === "local-media-url"
		)
	).toBe(true)
})

test("metadata ordering is deterministic and cumulative PR titles include earlier records", () => {
	const existing = document("vendors", "earlier")
	const vendor = fresh(document("vendors", "new-vendor"))
	const session = fresh(document("tastings", "session", "date: 2026-10-24T12:00:00.000Z\n"))
	const a = plan([], [vendor, session], ["new-vendor", "session"])
	const b = plan([], [session, vendor], ["session", "new-vendor"])
	expect(a.reviewKey).toBe(b.reviewKey)
	expect(a.commitMessage).toBe("Update 1 session, 1 vendor")
	expect(a.changedFields).toEqual(b.changedFields)
	const edited = {
		...edit(existing, { description: "Next delta" }),
		prNumber: 7,
		branch: "cms/authoring/user/pr7",
	}
	const cumulative = plan([existing], [edited], ["earlier"], {
		branch: edited.branch,
		prNumber: 7,
		productionDocuments: [],
	})
	expect(cumulative.title).toBe("Add earlier")
	expect(cumulative.commitMessage).toBe("Update earlier")
	expect(cumulative.changedFields[0].fields).toEqual(["description"])
})

test("dirty state leaves clean PR-backed documents available and storage failures are explicit", async () => {
	const original = document("vendors", "vendor")
	const clean = createDraft(original, "head-main", "main")
	expect(isDraftDirty(clean)).toBe(false)
	expect(isDraftDirty(edit(original, { description: "Edited" }))).toBe(true)
	expect(isDraftDirty(fresh(document("vendors", "new-vendor")))).toBe(true)
	await expect(
		saveDraft(clean, { repository: "tonyketcham/puerh.wtf", account: "user" })
	).rejects.toThrow(/cannot store drafts/)
})

test("the shared editable schema accepts the complete checked-in catalog without coercing legacy fields", async () => {
	const documents: CmsDocument[] = []
	for (const collection of COLLECTION_NAMES) {
		const directory = path.resolve(import.meta.dirname, "../content", collection)
		for (const filename of await readdir(directory))
			if (filename.endsWith(".md"))
				documents.push(
					parseDocument({
						path: "app/content/" + collection + "/" + filename,
						sha: "sha",
						content: await readFile(path.join(directory, filename), "utf8"),
					})
				)
	}
	const issues = documents.flatMap((doc) =>
		validateDocument(doc, documents).map((issue) => ({ path: doc.path, ...issue }))
	)
	expect(issues).toEqual([])
})

test("retained pushed media stays available for preview without being uploaded in a note-only update", () => {
	const original = document(
		"vendors",
		"vendor",
		"image: /images/uploads/authoring/digest/640.webp\n"
	)
	const draft = edit(original, { description: "Only this note changed" })
	draft.assets = [
		{
			id: "digest",
			path: "app/public/images/uploads/authoring/digest/640.webp",
			filename: "640.webp",
			mime: "image/webp",
			width: 640,
			height: 480,
			blob: new Blob(["image"]),
		},
	]
	const result = plan([original], [draft], ["vendor"])
	expect(result.errors).toEqual([])
	expect(result.assets).toEqual([])
	expect(result.previewAssets.map((asset) => asset.id)).toEqual(["digest"])
	expect(result.media).toEqual([])
})
