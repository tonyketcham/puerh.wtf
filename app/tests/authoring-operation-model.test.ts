import { expect, test } from "@playwright/test"
import {
	parseDocument,
	createDraft,
	serializeDocument,
	isDraftDirty,
} from "../src/lib/authoring/documents"
import {
	acknowledgeDraft,
	reconcileMergedDraft,
	type PushReceipt,
} from "../src/lib/authoring/operations"

const source = parseDocument({
	path: "app/content/vendors/tea.md",
	sha: "original",
	content: "---\nid: tea\ntitle: Tea\n---\nOld notes\n",
})
const receipt: PushReceipt = {
	branch: "cms/authoring/7/operation",
	head: "operation-head",
	remoteHead: "later-remote-head",
	pullRequest: {
		number: 101,
		branch: "cms/authoring/7/operation",
		head: "later-remote-head",
		base: "main",
		title: "Tea update",
		draft: true,
		url: "https://github.com/example/repo/pull/101",
	},
	documents: [{ path: source.path, sha: "pushed-blob" }],
}

test("per-record acknowledgement merges the most recent local revision and is replay-safe", () => {
	const captured = {
		...createDraft(source, "old-head", "main"),
		document: serializeDocument(source, { title: "Reviewed tea" }),
		revision: 2,
	}
	const newer = {
		...captured,
		document: serializeDocument(
			captured.document,
			undefined,
			"Typed while the push was in flight\n"
		),
		revision: 5,
		assets: [
			{
				id: "new",
				filename: "new.webp",
				path: "app/public/images/uploads/authoring/new/640.webp",
				mime: "image/webp",
				width: 640,
				height: 480,
				blob: new Blob(["new local attachment"]),
			},
		],
	}
	const next = acknowledgeDraft(newer, captured, receipt)
	expect(next.document.raw).toBe(newer.document.raw)
	expect(next.assets).toEqual(newer.assets)
	expect(next.base?.raw).toBe(captured.document.raw)
	expect(next.baseHead).toBe("operation-head")
	expect(next.baseHead).not.toBe(receipt.remoteHead)
	expect(next.revision).toBe(6)
	expect(isDraftDirty(next)).toBe(true)
	expect(acknowledgeDraft(next, captured, receipt)).toBe(next)
})

test("reading each acknowledgement after the previous durable save preserves later record edits", async () => {
	const first = createDraft(source, "head", "main")
	const secondDoc = parseDocument({
		path: "app/content/vendors/second.md",
		sha: "second-sha",
		content: "---\nid: second\ntitle: Second\n---\n",
	})
	const second = createDraft(secondDoc, "head", "main"),
		current = new Map([
			[first.id, first],
			[second.id, second],
		])
	for (const captured of [first, second]) {
		const latest = current.get(captured.id)!
		const result = acknowledgeDraft(latest, captured, {
			...receipt,
			documents: [{ path: captured.document.path, sha: "pushed" }],
		})
		current.set(captured.id, result)
		// User changes the second record while saving acknowledgement of the first.
		await Promise.resolve()
		if (captured.id === first.id)
			current.set(second.id, {
				...second,
				document: serializeDocument(second.document, undefined, "Newest second-record notes"),
				revision: 3,
			})
	}
	expect(current.get(second.id)?.document.body).toBe("Newest second-record notes")
	expect(current.get(second.id)?.base?.body).toBe(second.document.body)
	expect(current.get(second.id)?.revision).toBe(4)
})

test("publication unbinds only compatible merged bases while preserving newer local content", () => {
	const captured = createDraft(source, "head", "main")
	const bound = acknowledgeDraft(captured, captured, receipt)
	const newer = {
		...bound,
		document: serializeDocument(bound.document, undefined, "Keep this next edit local\n"),
		revision: bound.revision + 1,
	}
	const main = { ...bound.base!, sha: "main-blob" }
	const reconciled = reconcileMergedDraft(newer, [main], "main-head")
	expect(reconciled.conflict).toBeUndefined()
	expect(reconciled.draft.branch).toBe("main")
	expect(reconciled.draft.prNumber).toBeUndefined()
	expect(reconciled.draft.base?.raw).toBe(main.raw)
	expect(reconciled.draft.baseHead).toBe("main-head")
	expect(reconciled.draft.document.raw).toBe(newer.document.raw)
	expect(isDraftDirty(reconciled.draft)).toBe(true)
	const diverged = serializeDocument(main, { title: "Changed during publication" })
	const conflict = reconcileMergedDraft(newer, [diverged], "different-main")
	expect(conflict.conflict).toMatch(/reconcile/)
	expect(conflict.draft).toBe(newer)
})

test("unpushed records created in a merged PR context stay new when moved to Live", () => {
	const document = { ...source, sha: null }
	const local = { ...createDraft(document, "pr-head", receipt.branch, 101), base: null }
	const result = reconcileMergedDraft(local, [], "main-head")
	expect(result.conflict).toBeUndefined()
	expect(result.draft.base).toBeNull()
	expect(result.draft.branch).toBe("main")
	expect(result.draft.prNumber).toBeUndefined()
	expect(result.draft.document.raw).toBe(local.document.raw)
	expect(isDraftDirty(result.draft)).toBe(true)
})

test("cumulative pushed media reuses matching immutable bytes from clean or omitted drafts only", async () => {
	const { previewAssetPaths, localPreviewAssets } = await import(
		"../src/lib/authoring/preview-assets"
	)
	const oldPath = "app/public/images/uploads/authoring/oldhash/640.webp",
		variantPath = "app/public/images/uploads/authoring/oldhash/320.webp",
		newPath = "app/public/images/uploads/authoring/newhash/640.webp"
	const pushed = serializeDocument(source, {
		image: "/images/uploads/authoring/oldhash/640.webp",
		image_alt: "Pushed description",
		image_variants: [
			{ path: "/images/uploads/authoring/oldhash/320.webp", width: 320, height: 240 },
		],
	})
	const newer = {
		...createDraft(pushed, "head", "cms/authoring/7/op", 101),
		document: serializeDocument(pushed, {
			image: "/images/uploads/authoring/newhash/640.webp",
			image_alt: "Unpushed description",
		}),
		assets: [
			{
				id: "old",
				path: oldPath,
				filename: "640.webp",
				width: 640,
				height: 480,
				mime: "image/webp",
				blob: new Blob(["pushed primary"]),
				variants: [
					{
						path: variantPath,
						width: 320,
						height: 240,
						mime: "image/webp",
						blob: new Blob(["pushed variant"]),
					},
				],
			},
			{
				id: "new",
				path: newPath,
				filename: "640.webp",
				width: 640,
				height: 480,
				mime: "image/webp",
				blob: new Blob(["unpublished image"]),
			},
		],
	}
	const paths = previewAssetPaths([pushed]),
		assets = localPreviewAssets(paths, [newer])
	expect(paths.map((item) => item.path)).toEqual([oldPath, variantPath])
	expect(assets.map((asset) => asset.path)).toEqual([oldPath, variantPath])
	expect(await Promise.all(assets.map((asset) => asset.blob.text()))).toEqual([
		"pushed primary",
		"pushed variant",
	])
	expect(pushed.data.image_alt).toBe("Pushed description")
	expect(previewAssetPaths([source])).toEqual([])
})

test("private media requests pin branch/head/path and preserve authentication or stale-head errors", async () => {
	const { fetchPreviewMedia, CmsApiError } = await import("../src/lib/authoring/client")
	const previous = globalThis.fetch,
		calls: { url: string; options: RequestInit | undefined }[] = []
	try {
		globalThis.fetch = async (url, options) => {
			calls.push({ url: String(url), options })
			return new Response(new Blob(["webp bytes"], { type: "image/webp" }), { status: 200 })
		}
		const controller = new AbortController(),
			blob = await fetchPreviewMedia(
				"cms/authoring/7/op",
				"exact-head",
				"app/public/images/uploads/authoring/hash/640.webp",
				controller.signal
			)
		const query = new URL(calls[0].url, "http://localhost").searchParams
		expect(Object.fromEntries(query)).toEqual({
			action: "media",
			branch: "cms/authoring/7/op",
			head: "exact-head",
			path: "app/public/images/uploads/authoring/hash/640.webp",
		})
		expect(calls[0].options).toMatchObject({
			credentials: "same-origin",
			cache: "no-store",
			signal: controller.signal,
		})
		expect(await blob.text()).toBe("webp bytes")
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({ error: { code: "head_conflict", message: "Reopen the review" } }),
				{ status: 409, headers: { "Content-Type": "application/json" } }
			)
		await expect(fetchPreviewMedia("main", "old", "path")).rejects.toMatchObject({
			code: "head_conflict",
			status: 409,
		})
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ error: { code: "authentication", message: "Sign in" } }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		await expect(fetchPreviewMedia("main", "old", "path")).rejects.toBeInstanceOf(CmsApiError)
	} finally {
		globalThis.fetch = previous
	}
})

test("replaced earlier images load from their reviewed base while current and shared images use the current snapshot", async () => {
	const { previewAssetRequests } = await import("../src/lib/authoring/preview-assets")
	const { fetchPreviewMedia } = await import("../src/lib/authoring/client")
	const before = serializeDocument(source, {
		images: [
			{ image: "/images/uploads/authoring/old/640.webp" },
			{ image: "/images/uploads/authoring/shared/640.webp" },
		],
	})
	const current = serializeDocument(source, {
		images: [
			{ image: "/images/uploads/authoring/new/640.webp" },
			{ image: "/images/uploads/authoring/shared/640.webp" },
		],
	})
	const requests = previewAssetRequests(
		current,
		before,
		"cms/authoring/7/op",
		"pr-head",
		"main",
		"base-head"
	)
	expect(requests.map(({ path, branch, head }) => ({ path, branch, head }))).toEqual([
		{
			path: "app/public/images/uploads/authoring/new/640.webp",
			branch: "cms/authoring/7/op",
			head: "pr-head",
		},
		{
			path: "app/public/images/uploads/authoring/shared/640.webp",
			branch: "cms/authoring/7/op",
			head: "pr-head",
		},
		{ path: "app/public/images/uploads/authoring/old/640.webp", branch: "main", head: "base-head" },
	])
	const previous = globalThis.fetch,
		calls: string[] = []
	try {
		globalThis.fetch = async (input) => {
			const query = new URL(String(input), "http://localhost").searchParams
			calls.push(query.get("path")! + ":" + query.get("branch") + ":" + query.get("head"))
			if (query.get("path")?.includes("/old/") && query.get("head") !== "base-head")
				return new Response(
					JSON.stringify({
						error: { code: "media_scope", message: "Image is not referenced at this head" },
					}),
					{ status: 422 }
				)
			return new Response(new Blob([query.get("path")!], { type: "image/webp" }))
		}
		const images = await Promise.all(
			requests.map((request) => fetchPreviewMedia(request.branch!, request.head!, request.path))
		)
		expect(images).toHaveLength(3)
		expect(calls[2]).toBe("app/public/images/uploads/authoring/old/640.webp:main:base-head")
	} finally {
		globalThis.fetch = previous
	}
	const defaults = previewAssetRequests(current, before, "main", "current-head")
	expect(
		defaults.every((request) => request.branch === "main" && request.head === "current-head")
	).toBe(true)
})

test("preview asset bindings stay stable across text edits and distinguish different Blob objects", async () => {
	const { createLocalPreviewAssetCache, previewAssetPaths } = await import(
		"../src/lib/authoring/preview-assets"
	)
	const read = createLocalPreviewAssetCache(),
		imagePath = "app/public/images/uploads/authoring/photo/640.webp"
	const image = serializeDocument(source, {
		image: "/images/uploads/authoring/photo/640.webp",
		image_alt: "Original description",
	})
	const paths = previewAssetPaths([image]),
		draft = createDraft(image, "head", "main")
	const empty = read(paths, [draft])
	expect(
		read(previewAssetPaths([image]), [
			{ ...draft, revision: 2, document: serializeDocument(image, undefined, "New notes") },
		])
	).toBe(empty)
	const bytes = new Blob(["same bytes"], { type: "image/webp" })
	const withImage = {
		...draft,
		assets: [
			{
				id: "photo",
				path: imagePath,
				filename: "640.webp",
				width: 640,
				height: 480,
				mime: "image/webp",
				blob: bytes,
			},
		],
	}
	const first = read(paths, [withImage])
	const edited = {
		...withImage,
		revision: 3,
		document: serializeDocument(image, { image_alt: "New description" }, "New notes"),
	}
	expect(read(previewAssetPaths([edited.document]), [edited])).toBe(first)
	const differentBlob = {
		...edited,
		assets: [{ ...edited.assets[0], blob: new Blob(["same bytes"], { type: "image/webp" }) }],
	}
	const replaced = read(paths, [differentBlob])
	expect(replaced).not.toBe(first)
	expect(replaced[0].blob).toBe(differentBlob.assets[0].blob)
	expect(first[0].blob).toBe(bytes)
})
