import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const appRoot = path.resolve(import.meta.dirname, "..")

/** Serve the actual pure modules in a secure localhost origin; no app server or auth bypass. */
async function modules(page: Page) {
	await page.route("http://localhost:39999/**", async (route) => {
		const pathname = new URL(route.request().url()).pathname
		if (pathname.startsWith("/modules/")) {
			const filename = pathname.slice("/modules/".length).replace(/\.js$/, ".ts")
			if (filename === "schema-data.mjs")
				return route.fulfill({
					contentType: "text/javascript",
					body: await readFile(path.join(appRoot, "src/lib/authoring", filename), "utf8"),
				})
			if (!["drafts.ts", "documents.ts", "schema.ts", "types.ts"].includes(filename))
				return route.abort()
			const source = await readFile(path.join(appRoot, "src/lib/authoring", filename), "utf8")
			const output = ts
				.transpileModule(source, {
					compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
				})
				.outputText.replace(/from "\.\/(\w+)"/g, 'from "./$1.js"')
				.replace(/from "yaml"/g, 'from "/yaml/index.js"')
			return route.fulfill({ contentType: "text/javascript", body: output })
		}
		if (pathname.startsWith("/yaml/")) {
			const relative = pathname.slice("/yaml/".length)
			if (relative.includes("..")) return route.abort()
			return route.fulfill({
				contentType: "text/javascript",
				body: await readFile(path.join(appRoot, "node_modules/yaml/browser", relative), "utf8"),
			})
		}
		return route.fulfill({
			contentType: "text/html",
			body: "<!doctype html><title>Draft durability fixture</title>",
		})
	})
}
async function load(page: Page) {
	await page.goto("http://localhost:39999/")
	await page.addScriptTag({
		type: "module",
		content:
			'import * as api from "/modules/drafts.js"; import * as docs from "/modules/documents.js"; window.draftFixture = {api,docs};',
	})
	await page.waitForFunction(() => "draftFixture" in window)
}
test.beforeEach(async ({ page }) => {
	await modules(page)
	await load(page)
})

test("durable drafts and variant Blobs survive reload, remain account-scoped, and retain clean pushed editions", async ({
	page,
}) => {
	await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture
		const doc = docs.parseDocument({
			path: "app/content/vendors/tea.md",
			sha: "sha",
			content: "---\nid: tea\ntitle: Tea\n---\n",
		})
		const draft = api.createDraft(doc, "head", "main")
		draft.assets = [
			{
				id: "media",
				filename: "640.webp",
				path: "app/public/images/uploads/authoring/hash/640.webp",
				mime: "image/webp",
				width: 640,
				height: 480,
				blob: new Blob(["source"], { type: "image/webp" }),
				variants: [
					{
						path: "app/public/images/uploads/authoring/hash/320.webp",
						mime: "image/webp",
						width: 320,
						height: 240,
						blob: new Blob(["variant"], { type: "image/webp" }),
					},
				],
			},
		]
		await api.saveDraft(draft, { repository: "repo", account: "alice" })
	})
	await load(page)
	const result = await page.evaluate(async () => {
		const { api } = (window as any).draftFixture
		const drafts = await api.listDrafts({ repository: "repo", account: "alice" })
		return {
			count: drafts.length,
			dirty: api.isDraftDirty(drafts[0]),
			source: await drafts[0].assets[0].blob.text(),
			variant: await drafts[0].assets[0].variants[0].blob.text(),
			otherAccount: (await api.listDrafts({ repository: "repo", account: "bob" })).length,
			otherRepo: (await api.listDrafts({ repository: "other", account: "alice" })).length,
		}
	})
	expect(result).toEqual({
		count: 1,
		dirty: false,
		source: "source",
		variant: "variant",
		otherAccount: 0,
		otherRepo: 0,
	})
})

test("queued stale and conflicting tab writes reject instead of replacing a newer draft", async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture
		const doc = docs.parseDocument({
			path: "app/content/vendors/tea.md",
			sha: "sha",
			content: "---\nid: tea\ntitle: Tea\n---\n",
		})
		const first = api.createDraft(doc, "head", "main")
		const newer = {
			...first,
			document: docs.serializeDocument(doc, { title: "Newer" }),
			revision: 2,
		}
		const ns = { repository: "repo", account: "alice" }
		const settled = await Promise.allSettled([api.saveDraft(newer, ns), api.saveDraft(first, ns)])
		let conflict = ""
		try {
			await api.saveDraft(
				{ ...newer, document: docs.serializeDocument(doc, { title: "Other tab" }) },
				ns
			)
		} catch (error) {
			conflict = (error as any).code
		}
		const drafts = await api.listDrafts(ns)
		return {
			statuses: settled.map((item) => item.status),
			conflict,
			title: drafts[0].document.data.title,
			revision: drafts[0].revision,
		}
	})
	expect(result).toEqual({
		statuses: ["fulfilled", "rejected"],
		conflict: "revision-conflict",
		title: "Newer",
		revision: 2,
	})
})

test("recovery export/import restores source and all Blob bytes and rejects another account", async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture
		const doc = docs.parseDocument({
			path: "app/content/vendors/tea.md",
			sha: "sha",
			content: "---\nid: tea\n# future field\ntitle: Tea\n---\nBody\n",
		})
		const draft = api.createDraft(doc, "head", "main")
		draft.assets = [
			{
				id: "asset",
				filename: "image.webp",
				path: "app/public/images/uploads/authoring/hash/640.webp",
				mime: "image/webp",
				width: 640,
				height: 480,
				blob: new Blob(["phone photo"], { type: "image/webp" }),
			},
		]
		const ns = { repository: "repo", account: "alice" }
		await api.saveDraft(draft, ns)
		const backup = await api.exportDrafts(ns)
		await api.removeDraft(draft.id, ns)
		const restored = await api.importDrafts(backup, ns)
		let foreign = ""
		try {
			await api.importDrafts(backup, { ...ns, account: "bob" })
		} catch (error) {
			foreign = (error as any).code
		}
		return {
			raw: restored[0].document.raw,
			blob: await restored[0].assets[0].blob.text(),
			count: (await api.listDrafts(ns)).length,
			foreign,
		}
	})
	expect(result).toEqual({
		raw: "---\nid: tea\n# future field\ntitle: Tea\n---\nBody\n",
		blob: "phone photo",
		count: 1,
		foreign: "invalid-backup",
	})
})

test("quota failure rejects the write and a later retry remains usable", async ({ page }) => {
	const result = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture
		const doc = docs.parseDocument({
			path: "app/content/vendors/tea.md",
			sha: "sha",
			content: "---\nid: tea\ntitle: Tea\n---\n",
		})
		const draft = api.createDraft(doc, "head", "main"),
			ns = { repository: "repo", account: "alice" }
		const original = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function () {
			throw new DOMException("The device is full", "QuotaExceededError")
		}
		let failed = false
		try {
			await api.saveDraft(draft, ns)
		} catch {
			failed = true
		}
		IDBObjectStore.prototype.put = original
		const afterFailure = (await api.listDrafts(ns)).length
		await api.saveDraft(draft, ns)
		return { failed, afterFailure, afterRetry: (await api.listDrafts(ns)).length }
	})
	expect(result).toEqual({ failed: true, afterFailure: 0, afterRetry: 1 })
})

test("a pending exact request survives reload and newer edits, cannot be replaced, and clears only by its ID", async ({
	page,
}) => {
	const original = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture
		const document = docs.parseDocument({
			path: "app/content/vendors/tea.md",
			sha: "sha",
			content: "---\nid: tea\ntitle: Reviewed tea\n---\nOriginal reviewed notes\n",
		})
		const draft = api.createDraft(document, "old-head", "main"),
			ns = { repository: "repo", account: "alice" }
		const payload = {
			operationId: "operation-1",
			target: { branch: "main", head: "old-head" },
			documents: [
				{ path: document.path, content: document.raw, expectedBlobSha: "sha", deleted: false },
			],
			assets: [],
		}
		const operation = {
			id: payload.operationId,
			reviewKey: "review-1",
			createdAt: 1,
			payload,
			captured: [draft],
			rootIds: [draft.id],
			candidateDocuments: [document],
		}
		await api.saveDraft(draft, ns)
		await api.savePendingPush(operation, ns)
		const newer = {
			...draft,
			document: docs.serializeDocument(document, { title: "Newer unsent title" }),
			revision: 2,
		}
		await api.saveDraft(newer, ns)
		return JSON.stringify(payload)
	})
	await load(page)
	const result = await page.evaluate(async () => {
		const { api } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const operation = await api.getPendingPush(ns)
		let replacement = "",
			wrongClear = ""
		try {
			await api.savePendingPush(
				{
					...operation,
					id: "operation-2",
					payload: { ...operation.payload, operationId: "operation-2" },
				},
				ns
			)
		} catch (error) {
			replacement = (error as any).code
		}
		try {
			await api.clearPendingPush("wrong-operation", ns)
		} catch (error) {
			wrongClear = (error as any).code
		}
		const unchanged = JSON.stringify((await api.getPendingPush(ns)).payload)
		const title = (await api.listDrafts(ns))[0].document.data.title
		await api.clearPendingPush(operation.id, ns)
		return { unchanged, title, replacement, wrongClear, cleared: await api.getPendingPush(ns) }
	})
	expect(result).toEqual({
		unchanged: original,
		title: "Newer unsent title",
		replacement: "pending-operation",
		wrongClear: "pending-operation",
		cleared: null,
	})
})

test("failure to persist the exact operation prevents sending its network request", async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const document = docs.parseDocument({
			path: "app/content/vendors/tea.md",
			sha: "sha",
			content: "---\nid: tea\ntitle: Tea\n---\n",
		})
		const draft = api.createDraft(document, "head", "main")
		const operation = {
			id: "operation",
			reviewKey: "review",
			createdAt: 1,
			payload: {
				operationId: "operation",
				target: { branch: "main", head: "head" },
				documents: [
					{ path: document.path, content: document.raw, expectedBlobSha: "sha", deleted: false },
				],
				assets: [],
			},
			captured: [draft],
			rootIds: [draft.id],
			candidateDocuments: [document],
		}
		const original = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
			if (this.name === "operations") throw new DOMException("Full", "QuotaExceededError")
			return original.apply(this, args)
		}
		let sent = 0,
			failed = false
		try {
			await api.savePendingPush(operation, ns)
			sent++
		} catch {
			failed = true
		}
		IDBObjectStore.prototype.put = original
		return { sent, failed, pending: await api.getPendingPush(ns) }
	})
	expect(result).toEqual({ sent: 0, failed: true, pending: null })
})

test("recovery exports current unsaved text and Blob bytes when its durable save fails", async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const document = docs.parseDocument({
			path: "app/content/vendors/tea.md",
			sha: "sha",
			content: "---\nid: tea\ntitle: Stored title\n---\nStored notes\n",
		})
		const draft = api.createDraft(document, "head", "main")
		await api.saveDraft(draft, ns)
		const current = {
			...draft,
			revision: 2,
			document: docs.serializeDocument(document, { title: "Unsaved title" }, "Unsaved notes\n"),
			assets: [
				{
					id: "new",
					filename: "photo.webp",
					path: "app/public/images/uploads/authoring/hash/640.webp",
					mime: "image/webp",
					width: 640,
					height: 480,
					blob: new Blob(["unsaved photo"]),
				},
			],
		}
		const original = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function () {
			throw new DOMException("Full", "QuotaExceededError")
		}
		try {
			await api.saveDraft(current, ns)
		} catch {}
		IDBObjectStore.prototype.put = original
		const backup = JSON.parse(await api.exportDraftSnapshot([current], ns))
		return {
			durableTitle: (await api.listDrafts(ns))[0].document.data.title,
			exportedTitle: backup.drafts[0].document.data.title,
			exportedBody: backup.drafts[0].document.body,
			bytes: atob(backup.drafts[0].assets[0].bytes),
		}
	})
	expect(result).toEqual({
		durableTitle: "Stored title",
		exportedTitle: "Unsaved title",
		exportedBody: "Unsaved notes\n",
		bytes: "unsaved photo",
	})
})

test("a server-proven rejection stays durable with the exact payload until explicit return to review", async ({
	page,
}) => {
	const original = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const document = docs.parseDocument({
			path: "app/content/vendors/tea.md",
			sha: "sha",
			content: "---\nid: tea\ntitle: Tea\n---\n",
		})
		const draft = api.createDraft(document, "head", "main")
		const operation = {
			id: "rejected",
			reviewKey: "review",
			createdAt: 1,
			payload: {
				operationId: "rejected",
				target: { branch: "main", head: "head" },
				documents: [
					{ path: document.path, content: document.raw, expectedBlobSha: "sha", deleted: false },
				],
				assets: [],
			},
			captured: [draft],
			rootIds: [draft.id],
			candidateDocuments: [document],
		}
		await api.saveDraft(draft, ns)
		await api.savePendingPush(operation, ns)
		let mismatched = false
		try {
			await api.rejectPendingPush(
				"another-operation",
				{ code: "validation", message: "Invalid", confirmedAt: 2 },
				ns
			)
		} catch {
			mismatched = true
		}
		await api.rejectPendingPush(
			operation.id,
			{ code: "validation", message: "Fix the selected snapshot", confirmedAt: 3 },
			ns
		)
		// A repeated initial save must never remove the durable rejection confirmation.
		await api.savePendingPush(operation, ns)
		return { payload: JSON.stringify(operation.payload), mismatched }
	})
	await load(page)
	const result = await page.evaluate(async () => {
		const { api } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const operation = await api.getPendingPush(ns)
		const payload = JSON.stringify(operation.payload),
			rejection = operation.rejection
		await api.clearPendingPush(operation.id, ns)
		return {
			payload,
			rejection,
			pending: await api.getPendingPush(ns),
			drafts: (await api.listDrafts(ns)).length,
		}
	})
	expect(original.mismatched).toBe(true)
	expect(result).toEqual({
		payload: original.payload,
		rejection: { code: "validation", message: "Fix the selected snapshot", confirmedAt: 3 },
		pending: null,
		drafts: 1,
	})
})

test("version 2 recovery carries pending identity and captured image bytes while version 1 remains importable", async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const document = docs.parseDocument({
			path: "app/content/vendors/tea.md",
			sha: "sha",
			content: "---\nid: tea\ntitle: Reviewed tea\n---\n",
		})
		const captured = {
			...api.createDraft(document, "head", "main"),
			assets: [
				{
					id: "photo",
					filename: "640.webp",
					path: "app/public/images/uploads/authoring/hash/640.webp",
					mime: "image/webp",
					width: 640,
					height: 480,
					blob: new Blob(["captured image"], { type: "image/webp" }),
				},
			],
		}
		const current = {
			...captured,
			revision: 2,
			document: docs.serializeDocument(document, { title: "New unsent title" }),
		}
		const operation = {
			id: "recover-op",
			reviewKey: "review",
			createdAt: 1,
			payload: {
				operationId: "recover-op",
				target: { branch: "main", head: "head" },
				documents: [
					{ path: document.path, content: document.raw, expectedBlobSha: "sha", deleted: false },
				],
				assets: [
					{ path: captured.assets[0].path, mime: "image/webp", base64: btoa("captured image") },
				],
			},
			captured: [captured],
			rootIds: [captured.id],
			candidateDocuments: [document],
		}
		const backup = await api.exportDraftSnapshot([current], ns, operation)
		await api.importDrafts(backup, ns)
		const pending = await api.getPendingPush(ns),
			restored = (await api.listDrafts(ns))[0]
		const legacy = JSON.parse(backup)
		legacy.version = 1
		delete legacy.pendingOperation
		await api.clearPendingPush(operation.id, ns)
		await api.importDrafts(JSON.stringify(legacy), ns)
		return {
			version: JSON.parse(backup).version,
			payloadSame: JSON.stringify(pending.payload) === JSON.stringify(operation.payload),
			capturedTitle: pending.captured[0].document.data.title,
			capturedImage: await pending.captured[0].assets[0].blob.text(),
			currentTitle: restored.document.data.title,
			legacyTitle: (await api.listDrafts(ns))[0].document.data.title,
			legacyPending: await api.getPendingPush(ns),
		}
	})
	expect(result).toEqual({
		version: 2,
		payloadSame: true,
		capturedTitle: "Reviewed tea",
		capturedImage: "captured image",
		currentTitle: "New unsent title",
		legacyTitle: "New unsent title",
		legacyPending: null,
	})
})

test("discard and revert remain recoverable after reload with media, without replacing newer work", async ({
	page,
}) => {
	await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const document = docs.parseDocument({
			path: "app/content/vendors/tea.md",
			sha: "sha",
			content: "---\nid: tea\ntitle: Tea\n---\n",
		})
		const draft = {
			...api.createDraft(document, "head", "main"),
			document: docs.serializeDocument(document, { title: "My wording" }),
			revision: 2,
			assets: [
				{
					id: "photo",
					filename: "photo.webp",
					path: "app/public/images/uploads/authoring/hash/480.webp",
					mime: "image/webp",
					width: 480,
					height: 320,
					blob: new Blob(["kept photo"], { type: "image/webp" }),
				},
			],
		}
		await api.saveDraft(draft, ns)
		await api.recoverableDraftChange(draft, null, ns)
	})
	await load(page)
	const restored = await page.evaluate(async () => {
		const { api } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const active = await api.listDrafts(ns),
			recoveries = await api.listDraftRecoveries(ns)
		const other = await api.listDraftRecoveries({ repository: "repo", account: "bob" })
		const draft = await api.undoDraftChange(recoveries[0], ns)
		const replacement = { ...draft, document: draft.base, assets: [], revision: draft.revision + 1 }
		const recovery = await api.recoverableDraftChange(draft, replacement, ns)
		const newer = {
			...replacement,
			document: { ...draft.document },
			revision: replacement.revision + 1,
		}
		await api.saveDraft(newer, ns)
		let refused = false
		try {
			await api.undoDraftChange(recovery, ns)
		} catch {
			refused = true
		}
		return {
			before: active.length,
			archives: recoveries.length,
			other: other.length,
			title: draft.document.data.title,
			photo: await draft.assets[0].blob.text(),
			refused,
			newer: (await api.listDrafts(ns))[0].revision,
			stillRecoverable: (await api.listDraftRecoveries(ns)).length,
		}
	})
	expect(restored).toEqual({
		before: 0,
		archives: 1,
		other: 0,
		title: "My wording",
		photo: "kept photo",
		refused: true,
		newer: 5,
		stillRecoverable: 1,
	})
})

test("discard refuses a stale tab and never changes a pending push", async ({ page }) => {
	const result = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const document = docs.parseDocument({
				path: "app/content/vendors/tea.md",
				sha: "sha",
				content: "---\nid: tea\ntitle: Tea\n---\n",
			}),
			draft = api.createDraft(document, "head", "main")
		await api.saveDraft(draft, ns)
		const newer = {
			...draft,
			revision: 2,
			document: docs.serializeDocument(document, { title: "Newer" }),
		}
		await api.saveDraft(newer, ns)
		let stale = false
		try {
			await api.recoverableDraftChange(draft, null, ns)
		} catch {
			stale = true
		}
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const open = indexedDB.open("puerh-authoring", 3)
			open.onsuccess = () => resolve(open.result)
			open.onerror = () => reject(open.error)
		})
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction("operations", "readwrite")
			tx.objectStore("operations").put({ key: "repo\u0000alice", operation: { id: "pending" } })
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
		let pending = false
		try {
			await api.recoverableDraftChange(newer, null, ns)
		} catch {
			pending = true
		}
		return {
			stale,
			pending,
			title: (await api.listDrafts(ns))[0].document.data.title,
			recoveries: (await api.listDraftRecoveries(ns)).length,
		}
	})
	expect(result).toEqual({ stale: true, pending: true, title: "Newer", recoveries: 0 })
})

test("inline related records and their parent reference save atomically or keep the newer parent", async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const doc = (id: string) =>
			docs.parseDocument({
				path: "app/content/vendors/" + id + ".md",
				sha: "sha",
				content: "---\nid: " + id + "\ntitle: " + id + "\n---\n",
			})
		const parent = api.createDraft(doc("parent"), "head", "main"),
			child = { ...api.createDraft(doc("child"), "head", "main"), base: null }
		await api.saveDraft(parent, ns)
		const next = {
			...parent,
			document: docs.serializeDocument(parent.document, { vendor: "child" }),
			revision: 2,
		}
		await api.saveRelatedDraft(child, next, 1, ns)
		const conflictChild = { ...api.createDraft(doc("conflict"), "head", "main"), base: null }
		let refused = false
		try {
			await api.saveRelatedDraft(conflictChild, { ...next, revision: 3 }, 1, ns)
		} catch {
			refused = true
		}
		const drafts = await api.listDrafts(ns)
		return {
			refused,
			count: drafts.length,
			relation: drafts.find((draft: any) => draft.id === "parent").document.data.vendor,
			hasConflicting: drafts.some((draft: any) => draft.id === "conflict"),
		}
	})
	expect(result).toEqual({ refused: true, count: 2, relation: "child", hasConflicting: false })
})

test("backup carries discarded and reverted archives with image variants and retains safe restore guards", async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const { api, docs } = (window as any).draftFixture,
			ns = { repository: "repo", account: "alice" }
		const source = (id: string) =>
			docs.parseDocument({
				path: "app/content/vendors/" + id + ".md",
				sha: "sha",
				content: "---\nid: " + id + "\ntitle: " + id + "\n---\n",
			})
		const asset = {
			id: "photo",
			filename: "640.webp",
			path: "app/public/images/uploads/authoring/hash/640.webp",
			mime: "image/webp",
			width: 640,
			height: 480,
			blob: new Blob(["archive original"], { type: "image/webp" }),
			variants: [
				{
					path: "app/public/images/uploads/authoring/hash/320.webp",
					mime: "image/webp",
					width: 320,
					height: 240,
					blob: new Blob(["archive variant"], { type: "image/webp" }),
				},
			],
		}
		const discarded = { ...api.createDraft(source("discarded"), "head", "main"), assets: [asset] }
		await api.saveDraft(discarded, ns)
		await api.recoverableDraftChange(discarded, null, ns)
		const original = source("reverted"),
			reverted = {
				...api.createDraft(original, "head", "main"),
				document: docs.serializeDocument(original, undefined, "Archived wording."),
				revision: 2,
				assets: [asset],
			}
		await api.saveDraft(reverted, ns)
		await api.recoverableDraftChange(
			reverted,
			{ ...reverted, document: original, revision: 3, assets: [] },
			ns
		)
		const json = await api.exportDrafts(ns),
			backup = JSON.parse(json)
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open("puerh-authoring", 3)
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(["drafts", "recovery"], "readwrite")
			tx.objectStore("drafts").clear()
			tx.objectStore("recovery").clear()
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
		await api.importDrafts(json, ns)
		const recoveries = await api.listDraftRecoveries(ns),
			discard = recoveries.find((item: any) => item.action === "discard"),
			revert = recoveries.find((item: any) => item.action === "revert")
		const restored = await api.undoDraftChange(discard, ns)
		const current = (await api.listDrafts(ns)).find((draft: any) => draft.id === "reverted")
		await api.saveDraft(
			{
				...current,
				document: docs.serializeDocument(current.document, undefined, "Newer wording."),
				revision: current.revision + 1,
			},
			ns
		)
		let refused = false
		try {
			await api.undoDraftChange(revert, ns)
		} catch {
			refused = true
		}
		return {
			version: backup.version,
			archiveCount: backup.recoveries.length,
			activeCount: backup.drafts.length,
			restoredOriginal: await restored.assets[0].blob.text(),
			restoredVariant: await restored.assets[0].variants[0].blob.text(),
			archivedVariant: await revert.draft.assets[0].variants[0].blob.text(),
			refused,
			newerBody: (await api.listDrafts(ns)).find((draft: any) => draft.id === "reverted").document
				.body,
			remaining: (await api.listDraftRecoveries(ns)).length,
		}
	})
	expect(result).toEqual({
		version: 2,
		archiveCount: 2,
		activeCount: 1,
		restoredOriginal: "archive original",
		restoredVariant: "archive variant",
		archivedVariant: "archive variant",
		refused: true,
		newerBody: "Newer wording.",
		remaining: 1,
	})
})
