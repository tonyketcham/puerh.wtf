import type { PendingPush } from "./operations"
import type { CmsAsset, CmsAssetVariant, CmsDraft, DraftNamespace } from "./types"
import {
	collectionFromPath,
	createDraft,
	isDraftDirty,
	parseDocument,
	stableStringify,
} from "./documents"
export { createDraft, isDraftDirty }

const DATABASE = "puerh-authoring"
const STORE = "drafts"
const VERSION = 3
const RECOVERY = "recovery"
const OPERATIONS = "operations"

export class DraftStorageError extends Error {
	constructor(message: string, readonly code = "storage-failed") {
		super(message)
		this.name = "DraftStorageError"
	}
}
type Entry = { key: string; namespace: string; draft: CmsDraft }
let database: Promise<IDBDatabase> | undefined
let writeQueue: Promise<unknown> = Promise.resolve()

function scope(namespace: DraftNamespace): string {
	if (!namespace?.repository || !namespace?.account)
		throw new DraftStorageError(
			"A verified repository and account are required for draft storage.",
			"missing-namespace"
		)
	return namespace.repository + "\u0000" + namespace.account
}
function open(): Promise<IDBDatabase> {
	if (typeof indexedDB === "undefined")
		return Promise.reject(
			new DraftStorageError(
				"This browser cannot store drafts. Export current work before leaving the page.",
				"unavailable"
			)
		)
	if (!database)
		database = new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(DATABASE, VERSION)
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(STORE))
					request.result.createObjectStore(STORE, { keyPath: "key" })
				if (!request.result.objectStoreNames.contains(RECOVERY))
					request.result.createObjectStore(RECOVERY, { keyPath: "key" })
				if (!request.result.objectStoreNames.contains(OPERATIONS))
					request.result.createObjectStore(OPERATIONS, { keyPath: "key" })
			}
			request.onerror = () => {
				database = undefined
				reject(new DraftStorageError(request.error?.message || "Could not open local drafts."))
			}
			request.onblocked = () => {
				database = undefined
				reject(
					new DraftStorageError(
						"Another tab is blocking draft storage. Close it and retry.",
						"blocked"
					)
				)
			}
			request.onsuccess = () => {
				request.result.onversionchange = () => {
					request.result.close()
					database = undefined
				}
				resolve(request.result)
			}
		})
	return database
}
function enqueue<T>(task: () => Promise<T>): Promise<T> {
	const operation = writeQueue.then(task, task)
	writeQueue = operation.catch(() => undefined)
	return operation
}
function assertDraft(value: CmsDraft) {
	if (
		!value ||
		typeof value.id !== "string" ||
		!Number.isInteger(value.revision) ||
		value.revision < 1 ||
		!Array.isArray(value.assets)
	)
		throw new DraftStorageError("Invalid draft recovery record.", "invalid-backup")
	const parsed = parseDocument({
		path: value.document.path,
		sha: value.document.sha,
		content: value.document.raw,
	})
	if (
		parsed.id !== value.id ||
		parsed.collection !== value.document.collection ||
		parsed.body !== value.document.body ||
		stableStringify(parsed.data) !== stableStringify(value.document.data)
	)
		throw new DraftStorageError("Draft identity does not match its source.", "invalid-backup")
	collectionFromPath(value.document.path)
	if (value.base) {
		const base = parseDocument({
			path: value.base.path,
			sha: value.base.sha,
			content: value.base.raw,
		})
		if (base.id !== value.id || base.path !== value.document.path)
			throw new DraftStorageError("A draft cannot change its source identity.", "invalid-backup")
	}
}
function compatibleStored(previous: CmsDraft | undefined, next: CmsDraft) {
	if (!previous) return
	if (previous.revision > next.revision)
		throw new DraftStorageError(
			"A newer local draft exists. Reload it before saving.",
			"stale-revision"
		)
	if (
		previous.revision === next.revision &&
		(previous.document.raw !== next.document.raw || !!previous.deleted !== !!next.deleted)
	)
		throw new DraftStorageError(
			"Another tab changed this draft. Resolve the local versions before saving.",
			"revision-conflict"
		)
}
/** Resolves only after the IDB transaction completes; callers may then claim Saved. */
export async function saveDraft(draft: CmsDraft, namespace: DraftNamespace): Promise<void> {
	const name = scope(namespace)
	assertDraft(draft)
	// Capture before queuing: later caller mutation cannot alter a pending durable write.
	const snapshot = structuredClone(draft)
	return enqueue(async () => {
		const db = await open()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite")
			const store = tx.objectStore(STORE)
			let failure: unknown
			const key = name + "\u0000" + snapshot.id
			const current = store.get(key)
			current.onsuccess = () => {
				try {
					compatibleStored((current.result as Entry | undefined)?.draft, snapshot)
					const entry: Entry = { key, namespace: name, draft: snapshot }
					store.put(entry)
				} catch (error) {
					failure = error
					tx.abort()
				}
			}
			tx.oncomplete = () => resolve()
			tx.onabort = tx.onerror = () =>
				reject(
					failure ||
						new DraftStorageError(
							tx.error?.message || "The draft could not be saved on this device."
						)
				)
		})
	})
}
export async function listDrafts(namespace: DraftNamespace): Promise<CmsDraft[]> {
	const name = scope(namespace)
	await writeQueue
	const db = await open()
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, "readonly")
		const request = tx.objectStore(STORE).getAll()
		request.onsuccess = () =>
			resolve(
				(request.result as Entry[])
					.filter((entry) => entry.namespace === name)
					.map((entry) => entry.draft)
					.sort((a, b) => b.updatedAt - a.updatedAt)
			)
		request.onerror = () =>
			reject(new DraftStorageError(request.error?.message || "Could not read local drafts."))
	})
}
export function removeDraft(id: string, namespace: DraftNamespace): Promise<void> {
	const name = scope(namespace)
	return enqueue(async () => {
		const db = await open()
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite")
			tx.objectStore(STORE).delete(name + "\u0000" + id)
			tx.oncomplete = () => resolve()
			tx.onabort = tx.onerror = () =>
				reject(new DraftStorageError(tx.error?.message || "Could not discard the draft."))
		})
	})
}

async function encodeBlob(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer())
	let binary = ""
	for (let i = 0; i < bytes.length; i += 32768)
		binary += String.fromCharCode(...bytes.subarray(i, i + 32768))
	return btoa(binary)
}
function decodeBlob(base64: string, mime: string): Blob {
	const binary = atob(base64)
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
	return new Blob([bytes], { type: mime })
}
type AssetBackup = Omit<CmsAsset, "blob" | "variants"> & {
	bytes: string
	variants?: (Omit<CmsAssetVariant, "blob"> & { bytes?: string })[]
}
type DraftBackup = Omit<CmsDraft, "assets"> & { assets: AssetBackup[] }
type OperationBackup = Omit<PendingPush, "captured"> & { captured: DraftBackup[] }
type RecoveryBackup = Omit<DraftRecovery, "draft" | "replacement"> & {
	draft: DraftBackup
	replacement: DraftBackup | null
}
async function encodeDrafts(drafts: readonly CmsDraft[]): Promise<DraftBackup[]> {
	for (const draft of drafts) assertDraft(draft)
	return Promise.all(
		drafts.map(async (draft) => ({
			...draft,
			assets: await Promise.all(
				draft.assets.map(async ({ blob, variants, ...asset }) => ({
					...asset,
					bytes: await encodeBlob(blob),
					variants: variants
						? await Promise.all(
								variants.map(async ({ blob: variantBlob, ...variant }) => ({
									...variant,
									...(variantBlob ? { bytes: await encodeBlob(variantBlob) } : {}),
								}))
						  )
						: undefined,
				}))
			),
		}))
	)
}
function decodeDrafts(drafts: DraftBackup[]): CmsDraft[] {
	return drafts.map((draft) => ({
		...draft,
		assets: draft.assets.map(({ bytes, variants, ...asset }) => ({
			...asset,
			blob: decodeBlob(bytes, asset.mime),
			variants: variants?.map(({ bytes: variantBytes, ...variant }) => ({
				...variant,
				...(variantBytes ? { blob: decodeBlob(variantBytes, variant.mime) } : {}),
			})),
		})),
	}))
}
export async function exportDraftSnapshot(
	current: readonly CmsDraft[],
	namespace: DraftNamespace,
	pendingOperation: PendingPush | null = null,
	recoveries: readonly DraftRecovery[] = []
): Promise<string> {
	scope(namespace)
	const snapshot = structuredClone({ drafts: current, pendingOperation, recoveries })
	const drafts = await encodeDrafts(snapshot.drafts)
	const operation = snapshot.pendingOperation
	const pending: OperationBackup | null = operation
		? { ...operation, captured: await encodeDrafts(operation.captured) }
		: null
	const archives: RecoveryBackup[] = await Promise.all(
		snapshot.recoveries.map(async (recovery) => {
			assertRecovery(recovery)
			return {
				...recovery,
				draft: (await encodeDrafts([recovery.draft]))[0],
				replacement: recovery.replacement ? (await encodeDrafts([recovery.replacement]))[0] : null,
			}
		})
	)
	return JSON.stringify(
		{ version: 2, namespace, drafts, pendingOperation: pending, recoveries: archives },
		null,
		2
	)
}
export async function exportDrafts(namespace: DraftNamespace): Promise<string> {
	const [drafts, operation, recoveries] = await Promise.all([
		listDrafts(namespace),
		getPendingPush(namespace),
		listDraftRecoveries(namespace),
	])
	return exportDraftSnapshot(drafts, namespace, operation, recoveries)
}
/** Recovery preserves an unresolved operation identity and never bypasses namespace/revision checks. */
export async function importDrafts(json: string, namespace: DraftNamespace): Promise<CmsDraft[]> {
	scope(namespace)
	let backup: {
		version: number
		namespace: DraftNamespace
		drafts: DraftBackup[]
		pendingOperation?: OperationBackup | null
		recoveries?: RecoveryBackup[]
	}
	try {
		backup = JSON.parse(json)
	} catch {
		throw new DraftStorageError("The recovery file is not valid JSON.", "invalid-backup")
	}
	if (
		![1, 2].includes(backup.version) ||
		!Array.isArray(backup.drafts) ||
		scope(backup.namespace) !== scope(namespace)
	)
		throw new DraftStorageError(
			"This recovery file belongs to another repository/account or version.",
			"invalid-backup"
		)
	if (backup.recoveries !== undefined && !Array.isArray(backup.recoveries))
		throw new DraftStorageError("The recovery archive list is invalid.", "invalid-backup")
	const recoveries: DraftRecovery[] = (backup.recoveries || []).map((recovery) => ({
		...recovery,
		draft: decodeDrafts([recovery.draft])[0],
		replacement: recovery.replacement ? decodeDrafts([recovery.replacement])[0] : null,
	}))
	for (const recovery of recoveries) assertRecovery(recovery)
	const drafts = decodeDrafts(backup.drafts)
	for (const draft of drafts) assertDraft(draft)
	const pending =
		backup.version === 2 && backup.pendingOperation
			? { ...backup.pendingOperation, captured: decodeDrafts(backup.pendingOperation.captured) }
			: null
	if (pending) {
		if (
			pending.id !== pending.payload?.operationId ||
			!Array.isArray(pending.candidateDocuments) ||
			!Array.isArray(pending.rootIds)
		)
			throw new DraftStorageError("The pending recovery operation is invalid.", "invalid-operation")
		for (const draft of pending.captured) assertDraft(draft)
		const current = await getPendingPush(namespace)
		if (
			current &&
			(current.id !== pending.id ||
				stableStringify(current.payload) !== stableStringify(pending.payload))
		)
			throw new DraftStorageError(
				"A different push already needs confirmation on this device. Resume it before restoring another pending request.",
				"pending-operation"
			)
	}
	const previous = new Map((await listDrafts(namespace)).map((draft) => [draft.id, draft]))
	for (const draft of drafts) compatibleStored(previous.get(draft.id), draft)
	// A partial storage failure rejects; the imported operation is never sent automatically.
	for (const draft of drafts) await saveDraft(draft, namespace)
	if (pending) await savePendingPush(pending, namespace)
	await importRecoveries(recoveries, namespace)
	return drafts
}

/** One unresolved operation per repository/account; it cannot be replaced by a newer selection. */
export function savePendingPush(operation: PendingPush, namespace: DraftNamespace): Promise<void> {
	const name = scope(namespace)
	if (
		!operation ||
		operation.id !== operation.payload?.operationId ||
		!Array.isArray(operation.captured) ||
		!Array.isArray(operation.candidateDocuments)
	)
		return Promise.reject(
			new DraftStorageError("Invalid pending push snapshot.", "invalid-operation")
		)
	for (const draft of operation.captured) assertDraft(draft)
	const snapshot = structuredClone(operation)
	return enqueue(async () => {
		const db = await open()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(OPERATIONS, "readwrite"),
				store = tx.objectStore(OPERATIONS)
			let failure: unknown
			const previous = store.get(name)
			previous.onsuccess = () => {
				try {
					const current = previous.result?.operation as PendingPush | undefined
					if (
						current &&
						(current.id !== snapshot.id ||
							stableStringify(current.payload) !== stableStringify(snapshot.payload))
					)
						throw new DraftStorageError(
							"A previous push still needs confirmation. Resume it before starting another push.",
							"pending-operation"
						)
					if (!current) store.put({ key: name, operation: snapshot })
				} catch (error) {
					failure = error
					tx.abort()
				}
			}
			tx.oncomplete = () => resolve()
			tx.onabort = tx.onerror = () =>
				reject(
					failure ||
						new DraftStorageError(
							tx.error?.message || "The exact push request could not be saved. Nothing was sent."
						)
				)
		})
	})
}
/** This marker is written only after the service explicitly proves the operation was not committed. */
export function rejectPendingPush(
	id: string,
	rejection: NonNullable<PendingPush["rejection"]>,
	namespace: DraftNamespace
): Promise<PendingPush> {
	const name = scope(namespace)
	return enqueue(async () => {
		const db = await open()
		return new Promise<PendingPush>((resolve, reject) => {
			const tx = db.transaction(OPERATIONS, "readwrite"),
				store = tx.objectStore(OPERATIONS)
			let failure: unknown, operation: PendingPush
			const request = store.get(name)
			request.onsuccess = () => {
				try {
					if (!request.result || request.result.operation.id !== id)
						throw new DraftStorageError(
							"The rejected push no longer matches the pending operation.",
							"pending-operation"
						)
					operation = { ...request.result.operation, rejection: { ...rejection } }
					store.put({ key: name, operation })
				} catch (error) {
					failure = error
					tx.abort()
				}
			}
			tx.oncomplete = () => resolve(operation!)
			tx.onabort = tx.onerror = () =>
				reject(
					failure ||
						new DraftStorageError(
							tx.error?.message ||
								"Could not save the confirmed rejection. Resume the exact request to reconcile it."
						)
				)
		})
	})
}
export async function getPendingPush(namespace: DraftNamespace): Promise<PendingPush | null> {
	const name = scope(namespace)
	await writeQueue
	const db = await open()
	return new Promise((resolve, reject) => {
		const request = db.transaction(OPERATIONS, "readonly").objectStore(OPERATIONS).get(name)
		request.onsuccess = () => resolve(request.result?.operation || null)
		request.onerror = () =>
			reject(new DraftStorageError(request.error?.message || "Could not read the pending push."))
	})
}
export function clearPendingPush(id: string, namespace: DraftNamespace): Promise<void> {
	const name = scope(namespace)
	return enqueue(async () => {
		const db = await open()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(OPERATIONS, "readwrite"),
				store = tx.objectStore(OPERATIONS)
			let failure: unknown
			const request = store.get(name)
			request.onsuccess = () => {
				try {
					if (request.result && request.result.operation.id !== id)
						throw new DraftStorageError(
							"A different push is pending. It was not cleared.",
							"pending-operation"
						)
					if (request.result) store.delete(name)
				} catch (error) {
					failure = error
					tx.abort()
				}
			}
			tx.oncomplete = () => resolve()
			tx.onabort = tx.onerror = () =>
				reject(
					failure ||
						new DraftStorageError(
							tx.error?.message ||
								"The confirmed push could not be acknowledged locally. Resume it to retry."
						)
				)
		})
	})
}

/** Discarded and reverted drafts stay recoverable on this device, including image bytes. */
export interface DraftRecovery {
	id: string
	draft: CmsDraft
	action: "discard" | "revert"
	replacement: CmsDraft | null
	createdAt: number
}

function assertRecovery(recovery: DraftRecovery) {
	if (
		!recovery ||
		typeof recovery.id !== "string" ||
		!recovery.id ||
		recovery.id.length > 100 ||
		recovery.id.includes("\u0000") ||
		!Number.isFinite(recovery.createdAt) ||
		!["discard", "revert"].includes(recovery.action) ||
		(recovery.action === "discard" ? recovery.replacement !== null : !recovery.replacement)
	)
		throw new DraftStorageError("The discarded draft recovery is invalid.", "invalid-backup")
	assertDraft(recovery.draft)
	if (recovery.replacement) {
		assertDraft(recovery.replacement)
		if (
			recovery.replacement.id !== recovery.draft.id ||
			recovery.replacement.document.path !== recovery.draft.document.path ||
			recovery.replacement.revision <= recovery.draft.revision
		)
			throw new DraftStorageError(
				"The reverted draft does not match its recovery guard.",
				"invalid-backup"
			)
	}
}
/** Archives are immutable: importing an older backup can add, never replace, a recovery. */
function importRecoveries(recoveries: DraftRecovery[], namespace: DraftNamespace): Promise<void> {
	const name = scope(namespace),
		snapshots = structuredClone(recoveries)
	return enqueue(async () => {
		const db = await open()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(RECOVERY, "readwrite"),
				store = tx.objectStore(RECOVERY)
			for (const recovery of snapshots) {
				const key = name + "\u0000" + recovery.id,
					read = store.get(key)
				read.onsuccess = () => {
					if (!read.result) store.put({ key, namespace: name, recovery })
				}
			}
			tx.oncomplete = () => resolve()
			tx.onabort = tx.onerror = () =>
				reject(
					new DraftStorageError("Could not restore discarded drafts. Keep your backup and retry.")
				)
		})
	})
}
export async function listDraftRecoveries(namespace: DraftNamespace): Promise<DraftRecovery[]> {
	const name = scope(namespace)
	await writeQueue
	const db = await open()
	return new Promise((resolve, reject) => {
		const request = db.transaction(RECOVERY, "readonly").objectStore(RECOVERY).getAll()
		request.onsuccess = () =>
			resolve(
				request.result
					.filter((entry: { namespace: string }) => entry.namespace === name)
					.map((entry: { recovery: DraftRecovery }) => entry.recovery)
					.sort((a: DraftRecovery, b: DraftRecovery) => b.createdAt - a.createdAt)
			)
		request.onerror = () => reject(new DraftStorageError("Could not open recoverable drafts."))
	})
}
/** Compare source and revision inside the transaction; never remove another tab's work. */
export function recoverableDraftChange(
	draft: CmsDraft,
	replacement: CmsDraft | null,
	namespace: DraftNamespace
): Promise<DraftRecovery> {
	const name = scope(namespace),
		captured = structuredClone(draft),
		next = replacement && structuredClone(replacement)
	if (next) assertDraft(next)
	const recovery: DraftRecovery = {
		id: crypto.randomUUID(),
		draft: captured,
		action: next ? "revert" : "discard",
		replacement: next,
		createdAt: Date.now(),
	}
	return enqueue(async () => {
		const db = await open()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction([STORE, RECOVERY, OPERATIONS], "readwrite"),
				store = tx.objectStore(STORE)
			let failure: unknown
			const operation = tx.objectStore(OPERATIONS).get(name)
			operation.onsuccess = () => {
				if (operation.result) {
					failure = new DraftStorageError("Resolve the pending push before setting a draft aside.")
					tx.abort()
					return
				}
				const current = store.get(name + "\u0000" + captured.id)
				current.onsuccess = () => {
					const value = current.result?.draft as CmsDraft | undefined
					if (
						!value ||
						value.revision !== captured.revision ||
						value.document.raw !== captured.document.raw
					) {
						failure = new DraftStorageError(
							"A newer local edit was kept. Reload the draft before trying again."
						)
						tx.abort()
						return
					}
					tx.objectStore(RECOVERY).put({
						key: name + "\u0000" + recovery.id,
						namespace: name,
						recovery,
					})
					if (next) store.put({ key: name + "\u0000" + next.id, namespace: name, draft: next })
					else store.delete(name + "\u0000" + captured.id)
				}
			}
			tx.oncomplete = () => resolve()
			tx.onabort = tx.onerror = () =>
				reject(
					failure ||
						new DraftStorageError("Your draft could not be set aside. It remains on this device.")
				)
		})
		return recovery
	})
}
export function undoDraftChange(
	recovery: DraftRecovery,
	namespace: DraftNamespace
): Promise<CmsDraft> {
	const name = scope(namespace)
	return enqueue(async () => {
		const db = await open()
		const restored = {
			...recovery.draft,
			revision: Math.max(recovery.draft.revision, recovery.replacement?.revision || 0) + 1,
			updatedAt: Date.now(),
		}
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction([STORE, RECOVERY, OPERATIONS], "readwrite"),
				store = tx.objectStore(STORE)
			let failure: unknown
			const operation = tx.objectStore(OPERATIONS).get(name)
			operation.onsuccess = () => {
				if (operation.result) {
					failure = new DraftStorageError("Resolve the pending push before restoring a draft.")
					tx.abort()
					return
				}
				const archived = tx.objectStore(RECOVERY).get(name + "\u0000" + recovery.id)
				archived.onsuccess = () => {
					if (!archived.result) {
						failure = new DraftStorageError("This draft has already been restored.")
						tx.abort()
						return
					}
					const current = store.get(name + "\u0000" + restored.id)
					current.onsuccess = () => {
						const value = current.result?.draft as CmsDraft | undefined,
							expected = recovery.replacement
						if (
							expected
								? !value ||
								  value.revision !== expected.revision ||
								  value.document.raw !== expected.document.raw
								: !!value
						) {
							failure = new DraftStorageError(
								"Newer work exists for this record. It was kept; the older draft remains in recovery."
							)
							tx.abort()
							return
						}
						store.put({ key: name + "\u0000" + restored.id, namespace: name, draft: restored })
						tx.objectStore(RECOVERY).delete(name + "\u0000" + recovery.id)
					}
				}
			}
			tx.oncomplete = () => resolve()
			tx.onabort = tx.onerror = () =>
				reject(failure || new DraftStorageError("Could not restore this draft."))
		})
		return restored
	})
}
/** Related creation and its parent reference become durable together, or neither does. */
export function saveRelatedDraft(
	child: CmsDraft,
	parent: CmsDraft,
	expectedRevision: number,
	namespace: DraftNamespace,
	expectedRaw?: string
): Promise<void> {
	const name = scope(namespace),
		snapshots = structuredClone([child, parent])
	snapshots.forEach(assertDraft)
	return enqueue(async () => {
		const db = await open()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite"),
				store = tx.objectStore(STORE)
			let failure: unknown
			const read = store.get(name + "\u0000" + parent.id)
			read.onsuccess = () => {
				try {
					const previous = read.result?.draft as CmsDraft | undefined
					if (
						!previous ||
						previous.revision !== expectedRevision ||
						(expectedRaw !== undefined && previous.document.raw !== expectedRaw)
					)
						throw new DraftStorageError(
							"The session changed in another tab. Its newer work was kept."
						)
					for (const draft of snapshots)
						store.put({ key: name + "\u0000" + draft.id, namespace: name, draft })
				} catch (error) {
					failure = error
					tx.abort()
				}
			}
			tx.oncomplete = () => resolve()
			tx.onabort = tx.onerror = () =>
				reject(
					failure ||
						new DraftStorageError("The related record could not be saved. Nothing was added.")
				)
		})
	})
}
