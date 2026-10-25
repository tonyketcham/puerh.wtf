"use client"
import "./authoring.css"
import { atom, useAtomValue, useStore } from "jotai"
import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { authoringBridgeAtom, setAuthoringActivation } from "./bridge"
import {
	cmsRequest,
	fetchCatalog,
	blobBase64,
	CmsApiError,
	type CmsCatalog,
	type CmsSession,
	type CmsPullRequest,
} from "./client"
import { validateDocument, RELATION_FIELDS } from "./schema"
import { createDocument, serializeDocument } from "./documents"
import {
	createDraft,
	listDraftRecoveries,
	recoverableDraftChange,
	undoDraftChange,
	saveRelatedDraft,
	type DraftRecovery,
	isDraftDirty,
	listDrafts,
	saveDraft,
	exportDraftSnapshot,
	importDrafts,
	savePendingPush,
	getPendingPush,
	clearPendingPush,
	rejectPendingPush,
} from "./drafts"
import { planChanges } from "./planning"
import {
	acknowledgeDraft,
	reconcileMergedDraft,
	type PendingPush,
	type PushPayload,
	type PushReceipt,
} from "./operations"
import type { CmsDraft, CmsDocument, Collection, DraftNamespace } from "./types"

export interface CmsState {
	phase: "loading" | "signed-out" | "ready" | "error"
	session: CmsSession | null
	catalogs: Record<string, CmsCatalog>
	source: string
	drafts: CmsDraft[]
	selected: string[]
	lens: "read" | "changes" | "media" | "connections"
	scope: "update" | "pr"
	previewId: string | null
	saving: string[]
	errors: Record<string, string>
	error: string
	notice: string
	busyLabel: string
	localRecoveries: DraftRecovery[]
	undoRecoveryId: string | null
	busy: boolean
	lastPR: CmsPullRequest | null
	pendingOperation: PendingPush | null
	pendingWriteId: string | null
}
export const cmsAtom = atom<CmsState>({
	phase: "loading",
	session: null,
	catalogs: {},
	source: "main",
	drafts: [],
	selected: [],
	lens: "read",
	scope: "update",
	previewId: null,
	saving: [],
	errors: {},
	error: "",
	notice: "",
	busy: false,
	busyLabel: "",
	localRecoveries: [],
	undoRecoveryId: null,
	lastPR: null,
	pendingOperation: null,
	pendingWriteId: null,
})
const pending = new Map<string, Promise<unknown>>()
function namespace(s: CmsState): DraftNamespace {
	if (!s.session?.user) throw new Error("Sign in to restore your repository drafts.")
	return {
		repository: s.session.repository.owner + "/" + s.session.repository.name,
		account: s.session.user.login,
	}
}
function sameNamespace(s: CmsState, ns: DraftNamespace) {
	try {
		const current = namespace(s)
		return current.repository === ns.repository && current.account === ns.account
	} catch {
		return false
	}
}
const writeKey = (ns: DraftNamespace, id: string) =>
	ns.repository + "\u0000" + ns.account + "\u0000" + id
function reviewStorage(s: CmsState) {
	const n = namespace(s)
	return "puerh:review:" + n.repository + ":" + n.account
}
export function selectedBranch(s: CmsState) {
	const roots = s.drafts.filter((d) => s.selected.includes(d.id) && isDraftDirty(d))
	return roots.find((d) => d.prNumber)?.branch || s.session?.repository.defaultBranch || "main"
}
export function currentPlan(s: CmsState) {
	const branch = selectedBranch(s),
		catalog = s.catalogs[branch]
	const main = s.catalogs[s.session?.repository.defaultBranch || "main"]
	if (!catalog) return null
	return planChanges({
		documents: catalog.documents,
		productionDocuments: main?.documents,
		drafts: s.drafts,
		selectedIds: s.selected,
		head: catalog.head,
		branch: catalog.branch,
		prNumber: catalog.pullRequests.find((p) => p.branch === branch)?.number,
	})
}
function contextDocument(s: CmsState, pathname: string): CmsDocument | undefined {
	const parts = pathname.split("/").filter(Boolean),
		segment = parts[0]
	const collection: Collection | undefined =
		segment === "sessions"
			? "tastings"
			: segment === "teaware"
			? "vessels"
			: ["vendors", "origins", "styles", "categories", "cultivars"].includes(segment)
			? (segment as Collection)
			: undefined
	if (!collection || parts.length < 2 || (collection === "tastings" && parts.length < 4)) return
	const slug = decodeURIComponent(parts[parts.length - 1])
	return s.catalogs[s.source]?.documents.find(
		(d) => d.collection === collection && d.path.split("/").pop() === slug + ".md"
	)
}
export function useCms() {
	const state = useAtomValue(cmsAtom),
		store = useStore(),
		router = useRouter()
	const update = (patch: Partial<CmsState>) =>
		store.set(cmsAtom, (s) => ({
			...s,
			...(patch.notice !== undefined ? { undoRecoveryId: null } : {}),
			...patch,
		}))
	const reportFailure = (error: unknown) => {
		const message =
			error instanceof Error
				? error.message
				: "The operation could not finish. Your local work is retained."
		const auth =
			error instanceof CmsApiError &&
			(error.status === 401 ||
				["authentication", "unauthorized", "permission", "repository", "csrf"].includes(error.code))
		store.set(cmsAtom, (s) => ({
			...s,
			busy: false,
			error: message,
			...(auth ? { phase: "signed-out" as const } : {}),
		}))
	}
	const persist = (
		draft: CmsDraft,
		options: { namespace?: DraftNamespace; expectedRevision?: number } = {}
	) => {
		const ns = options.namespace || namespace(store.get(cmsAtom)),
			key = writeKey(ns, draft.id)
		let conflict = false
		if (sameNamespace(store.get(cmsAtom), ns))
			store.set(cmsAtom, (s) => {
				const current = s.drafts.find((d) => d.id === draft.id)
				if (
					(options.expectedRevision !== undefined &&
						current?.revision !== options.expectedRevision) ||
					(current &&
						(draft.revision < current.revision ||
							(draft.revision === current.revision && draft.document.raw !== current.document.raw)))
				) {
					conflict = true
					return s
				}
				return {
					...s,
					drafts: current
						? s.drafts.map((d) => (d.id === draft.id ? draft : d))
						: [...s.drafts, draft],
					saving: [...new Set([...s.saving, draft.id])],
					errors: { ...s.errors, [draft.id]: "" },
				}
			})
		if (conflict) {
			const failure = Promise.reject(
				new Error("A newer local revision is already open. It was not replaced.")
			)
			void failure.catch(() => {})
			return failure
		}
		const job = (pending.get(key) || Promise.resolve())
			.catch(() => {})
			.then(() => saveDraft(draft, ns))
		pending.set(key, job)
		job
			.then(() => {
				if (pending.get(key) === job && sameNamespace(store.get(cmsAtom), ns))
					store.set(cmsAtom, (s) => ({
						...s,
						saving: s.saving.filter((id) => id !== draft.id),
						errors: { ...s.errors, [draft.id]: "" },
					}))
			})
			.catch((error: Error) => {
				if (pending.get(key) === job && sameNamespace(store.get(cmsAtom), ns))
					store.set(cmsAtom, (s) => ({
						...s,
						saving: s.saving.filter((id) => id !== draft.id),
						errors: {
							...s.errors,
							[draft.id]:
								error.message || "Device storage failed. Keep this tab open and export your work.",
						},
					}))
			})
		return job
	}
	const editDraft = (
		id: string,
		data?: Record<string, unknown>,
		body?: string,
		assets?: CmsDraft["assets"]
	) => {
		const d = store.get(cmsAtom).drafts.find((d) => d.id === id)
		if (!d) return
		try {
			const next = {
				...d,
				document: serializeDocument(d.document, data, body),
				assets: assets || d.assets,
				revision: d.revision + 1,
				updatedAt: Date.now(),
			}
			void persist(next)
		} catch (error) {
			reportFailure(error)
		}
	}
	const newDraft = async (
		collection: Collection,
		data: Record<string, unknown> = {},
		returnTo?: { id: string; field: string; multiple?: boolean }
	) => {
		const s = store.get(cmsAtom),
			cat = s.catalogs[s.source]
		if (s.phase !== "ready" || !cat) return
		try {
			const doc = createDocument(
					collection,
					collection === "tastings" ? { date: new Date().toISOString(), ...data } : data
				),
				pr = cat.pullRequests.find((p) => p.branch === cat.branch)
			const d = createDraft(doc, cat.head, cat.branch, pr?.number)
			await persist({ ...d, base: null })
			if (returnTo)
				sessionStorage.setItem("puerh:relation-return:" + doc.id, JSON.stringify(returnTo))
			router.push("/write/?id=" + encodeURIComponent(doc.id))
			return doc.id
		} catch (error) {
			reportFailure(error)
		}
	}

	const createRelatedDraft = async (
		collection: Collection,
		seed: Record<string, unknown>,
		parentId: string,
		field: string,
		multiple = false
	): Promise<CmsDraft | null> => {
		const snapshot = store.get(cmsAtom),
			ns = namespace(snapshot),
			parent = snapshot.drafts.find((d) => d.id === parentId)
		if (snapshot.phase !== "ready" || !parent) return null
		try {
			if (RELATION_FIELDS[parent.document.collection]?.[field] !== collection)
				throw new Error("This relationship does not accept that record type.")
			const cat = snapshot.catalogs[parent.branch] || snapshot.catalogs[snapshot.source]
			if (!cat) throw new Error("Open the parent edition before adding a related record.")
			const doc = createDocument(collection, seed),
				docs = [...cat.documents, ...snapshot.drafts.map((d) => d.document), doc]
			const issues = validateDocument(doc, docs)
			if (issues.length) throw new Error(issues.map((issue) => issue.message).join(" "))
			const child = { ...createDraft(doc, cat.head, parent.branch, parent.prNumber), base: null }
			await pending.get(writeKey(ns, parent.id))
			const latest = store.get(cmsAtom).drafts.find((d) => d.id === parent.id)
			if (!latest || !sameNamespace(store.get(cmsAtom), ns)) return null
			const value = multiple
				? [
						...new Set([
							...(Array.isArray(latest.document.data[field])
								? (latest.document.data[field] as string[])
								: []),
							doc.id,
						]),
				  ]
				: doc.id
			const next = {
				...latest,
				document: serializeDocument(latest.document, { [field]: value }),
				revision: latest.revision + 1,
				updatedAt: Date.now(),
			}

			const key = writeKey(ns, parent.id),
				job = saveRelatedDraft(child, next, latest.revision, ns, latest.document.raw)
			pending.set(key, job)
			// The parent must not expose a reference to a child before their atomic write succeeds.
			// Typing can continue against its current fields and will queue behind this transaction.
			store.set(cmsAtom, (current) => ({
				...current,
				saving: [...new Set([...current.saving, parent.id, child.id])],
			}))
			try {
				await job
			} catch (error) {
				if (sameNamespace(store.get(cmsAtom), ns))
					store.set(cmsAtom, (current) => ({
						...current,
						saving: current.saving.filter(
							(id) => id !== child.id && (id !== parent.id || pending.get(key) !== job)
						),
					}))
				throw error
			}
			if (!sameNamespace(store.get(cmsAtom), ns)) return null
			const currentParent = store.get(cmsAtom).drafts.find((d) => d.id === parent.id)
			if (!currentParent) return child
			const currentValue = multiple
				? [
						...new Set([
							...(Array.isArray(currentParent.document.data[field])
								? (currentParent.document.data[field] as string[])
								: []),
							doc.id,
						]),
				  ]
				: doc.id
			const merged =
				currentParent.revision === latest.revision &&
				currentParent.document.raw === latest.document.raw
					? next
					: {
							...currentParent,
							document: serializeDocument(currentParent.document, { [field]: currentValue }),
							revision: Math.max(currentParent.revision, next.revision) + 1,
							updatedAt: Date.now(),
					  }
			store.set(cmsAtom, (current) => ({
				...current,
				drafts: [...current.drafts.filter((d) => d.id !== child.id), child],
				saving: current.saving.filter((id) => id !== child.id),
			}))
			if (merged === next)
				store.set(cmsAtom, (current) => ({
					...current,
					drafts: current.drafts.map((d) => (d.id === parent.id ? next : d)),
					saving: current.saving.filter((id) => id !== parent.id || pending.get(key) !== job),
				}))
			else await persist(merged, { namespace: ns, expectedRevision: currentParent.revision })
			if (sameNamespace(store.get(cmsAtom), ns))
				update({
					notice:
						"Added " + String(doc.data.title) + " to this draft. Both are saved on this device.",
				})
			return child
		} catch (error) {
			reportFailure(error)
			return null
		}
	}
	const changeLocalDraft = async (id: string, action: "discard" | "revert"): Promise<boolean> => {
		const snapshot = store.get(cmsAtom)
		if (snapshot.pendingOperation || snapshot.busy) return false
		const ns = namespace(snapshot)
		update({
			busy: true,
			busyLabel: action === "revert" ? "Reverting local edits…" : "Setting draft aside…",
			error: "",
		})
		try {
			await pending.get(writeKey(ns, id))
			const latest = store.get(cmsAtom).drafts.find((d) => d.id === id)
			if (!latest || !sameNamespace(store.get(cmsAtom), ns)) {
				update({ busy: false })
				return false
			}
			const replacement =
				action === "revert" && latest.base
					? {
							...latest,
							document: latest.base,
							assets: [],
							deleted: false,
							revision: latest.revision + 1,
							updatedAt: Date.now(),
					  }
					: null

			const key = writeKey(ns, id),
				job = recoverableDraftChange(latest, replacement, ns)
			pending.set(key, job)
			store.set(cmsAtom, (current) => ({
				...current,
				drafts: replacement
					? current.drafts.map((d) => (d.id === id ? replacement : d))
					: current.drafts.filter((d) => d.id !== id),
				selected: current.selected.filter((key) => key !== id),
				previewId: current.previewId === id ? null : current.previewId,
			}))
			let recovery: DraftRecovery
			try {
				recovery = await job
			} catch (error) {
				if (sameNamespace(store.get(cmsAtom), ns))
					store.set(cmsAtom, (current) => ({
						...current,
						drafts: replacement
							? current.drafts.map((d) =>
									d.id === id && d.revision === replacement.revision ? latest : d
							  )
							: current.drafts.some((d) => d.id === id)
							? current.drafts
							: [...current.drafts, latest],
					}))
				throw error
			}
			if (sameNamespace(store.get(cmsAtom), ns))
				store.set(cmsAtom, (current) => ({
					...current,
					localRecoveries: [recovery, ...current.localRecoveries],
					undoRecoveryId: recovery.id,
					busy: false,
					notice:
						action === "revert"
							? "Local edits reverted. You can restore them from Draft recovery."
							: "Draft set aside. You can restore it from Draft recovery.",
					error: "",
				}))
			return true
		} catch (error) {
			reportFailure(error)
			return false
		}
	}
	const undoLocalChange = async (id?: string) => {
		const snapshot = store.get(cmsAtom),
			recovery = id
				? snapshot.localRecoveries.find((item) => item.id === id)
				: snapshot.localRecoveries[0]
		if (!recovery || snapshot.busy || snapshot.pendingOperation) return
		update({ busy: true, busyLabel: "Restoring your draft…", error: "" })
		try {
			const ns = namespace(snapshot),
				key = writeKey(ns, recovery.draft.id)
			await pending.get(key)?.catch(() => {})
			const previous = store.get(cmsAtom).drafts.find((d) => d.id === recovery.draft.id)
			const expected = recovery.replacement
			if (
				expected
					? !previous ||
					  previous.revision !== expected.revision ||
					  previous.document.raw !== expected.document.raw
					: !!previous
			)
				throw new Error(
					"Newer work exists for this record. It was kept; the older draft remains in recovery."
				)
			const restored = {
				...recovery.draft,
				revision: Math.max(recovery.draft.revision, recovery.replacement?.revision || 0) + 1,
				updatedAt: Date.now(),
			}
			const job = undoDraftChange(recovery, ns)
			pending.set(key, job)
			store.set(cmsAtom, (current) => ({
				...current,
				drafts: [...current.drafts.filter((d) => d.id !== restored.id), restored],
			}))
			try {
				await job
			} catch (error) {
				if (sameNamespace(store.get(cmsAtom), ns))
					store.set(cmsAtom, (current) => ({
						...current,
						drafts: current.drafts.flatMap((d) =>
							d.id === restored.id && d.revision === restored.revision
								? previous
									? [previous]
									: []
								: [d]
						),
					}))
				throw error
			}
			if (sameNamespace(store.get(cmsAtom), ns))
				store.set(cmsAtom, (current) => ({
					...current,
					localRecoveries: current.localRecoveries.filter((item) => item.id !== recovery.id),
					undoRecoveryId: null,
					busy: false,
					previewId: restored.id,
					notice:
						"Restored " + String(restored.document.data.title || "your draft") + " on this device.",
					error: "",
				}))
		} catch (error) {
			reportFailure(error)
		}
	}

	const editDocument = async (doc: CmsDocument) => {
		try {
			const s = store.get(cmsAtom)
			let draft = s.drafts.find((d) => d.id === doc.id)
			if (draft && draft.branch !== s.source && draft.prNumber) {
				update({ source: draft.branch, notice: "Resumed the local draft in its PR context." })
				if (!s.catalogs[draft.branch]) {
					const cat = await fetchCatalog(draft.branch)
					store.set(cmsAtom, (v) => ({ ...v, catalogs: { ...v.catalogs, [cat.branch]: cat } }))
				}
			}
			if (!draft) {
				const cat = s.catalogs[s.source],
					pr = cat?.pullRequests.find((p) => p.branch === s.source)
				draft = createDraft(doc, cat.head, cat.branch, pr?.number)
				await persist(draft)
			}
			update({ pendingWriteId: draft.id })
			router.push("/write/?id=" + encodeURIComponent(draft.id))
		} catch (error) {
			reportFailure(error)
		}
	}
	const setSource = async (branch: string) => {
		update({ busy: true, busyLabel: "Opening edition…", error: "" })
		try {
			const cat = await fetchCatalog(branch)
			store.set(cmsAtom, (s) => ({
				...s,
				source: branch,
				catalogs: { ...s.catalogs, [branch]: cat },
				busy: false,
			}))
		} catch (error) {
			reportFailure(error)
		}
	}
	const select = (id: string, checked: boolean) => {
		store.set(cmsAtom, (s) => ({
			...s,
			selected: checked ? [...new Set([...s.selected, id])] : s.selected.filter((x) => x !== id),
			previewId: checked ? id : s.previewId,
		}))
	}
	const review = async (id?: string) => {
		try {
			let s = store.get(cmsAtom)
			const d = s.drafts.find((draft) => draft.id === id && isDraftDirty(draft))
			if (d) {
				const roots = s.selected.filter((key) =>
					s.drafts.some((draft) => draft.id === key && isDraftDirty(draft))
				)
				const candidateIds = [...new Set([...roots, d.id])]
				const owner = s.drafts.find((draft) => candidateIds.includes(draft.id) && draft.prNumber)
				const branch = owner?.branch || s.session?.repository.defaultBranch || "main"
				if (!s.catalogs[branch]) {
					const cat = await fetchCatalog(branch)
					store.set(cmsAtom, (v) => ({ ...v, catalogs: { ...v.catalogs, [branch]: cat } }))
					s = store.get(cmsAtom)
				}
				// Re-read selection after any async fetch; navigation cannot replace later user choices.
				const currentRoots = s.selected.filter((key) =>
					s.drafts.some((draft) => draft.id === key && isDraftDirty(draft))
				)
				const next = [...new Set([...currentRoots, d.id])]
				const candidate = currentPlan({ ...s, selected: next })
				const incompatible = candidate?.errors.find((issue) =>
					[
						"multiple-prs",
						"pr-identity",
						"unknown-owner",
						"stale-base",
						"source-collision",
						"target-context",
						"identity-change",
						"missing-target-record",
						"dependency-owner",
					].includes(issue.code)
				)
				if (currentRoots.length && (!candidate || incompatible))
					update({
						notice:
							(incompatible?.message || "The selection changed while its edition was loading.") +
							" Your previous selection was kept. Clear selection to choose this document separately.",
					})
				else update({ selected: next, previewId: d.id })
			}
			router.push("/working-changes/")
		} catch (error) {
			reportFailure(error)
		}
	}
	const applyReceipt = async (operation: PendingPush, receipt: PushReceipt, ns: DraftNamespace) => {
		for (const captured of operation.captured) {
			await pending.get(writeKey(ns, captured.id))?.catch(() => {})
			// Read latest per record, immediately before its synchronous state merge.
			const currentState = store.get(cmsAtom)
			const inMemory = sameNamespace(currentState, ns)
				? currentState.drafts.find((draft) => draft.id === captured.id)
				: undefined
			const latest =
				inMemory || (await listDrafts(ns)).find((draft) => draft.id === captured.id) || captured
			const acknowledged = acknowledgeDraft(latest, captured, receipt)
			if (acknowledged !== latest)
				await persist(acknowledged, {
					namespace: ns,
					...(inMemory ? { expectedRevision: latest.revision } : {}),
				})
		}
		await clearPendingPush(operation.id, ns)
		if (!sameNamespace(store.get(cmsAtom), ns)) return
		const documents = operation.candidateDocuments.map((document) => ({
			...document,
			sha: receipt.documents.find((entry) => entry.path === document.path)?.sha || document.sha,
		}))
		const pr = {
			...receipt.pullRequest,
			branch: receipt.branch,
			head: receipt.remoteHead || receipt.pullRequest.head || receipt.head,
		}
		store.set(cmsAtom, (s) => ({
			...s,
			catalogs: {
				...s.catalogs,
				[receipt.branch]: {
					branch: receipt.branch,
					head: receipt.head,
					documents,
					pullRequests: [
						...Object.values(s.catalogs)
							.flatMap((catalog) => catalog.pullRequests)
							.filter((pull) => pull.number !== pr.number),
						pr,
					],
				},
			},
			pendingOperation: null,
			selected: s.selected.filter((id) => !operation.rootIds.includes(id)),
			previewId: operation.captured.some((draft) => draft.id === s.previewId) ? null : s.previewId,
			lastPR: pr,
			busy: false,
			notice:
				"Pushed " +
				operation.captured.length +
				" records to draft PR #" +
				pr.number +
				". Newer and omitted edits remain on this device.",
		}))
		if (receipt.remoteHead && receipt.remoteHead !== receipt.head) {
			try {
				const current = await fetchCatalog(receipt.branch)
				if (sameNamespace(store.get(cmsAtom), ns))
					store.set(cmsAtom, (s) => ({
						...s,
						catalogs: { ...s.catalogs, [current.branch]: current },
					}))
			} catch (error) {
				reportFailure(error)
			}
		}
	}
	const recordPushFailure = async (error: unknown, ns: DraftNamespace) => {
		const operation = await getPendingPush(ns)
		if (
			operation &&
			error instanceof CmsApiError &&
			error.details &&
			typeof error.details === "object" &&
			(error.details as { operationStatus?: string }).operationStatus === "not_committed"
		) {
			const rejected = await rejectPendingPush(
				operation.id,
				{ code: error.code, message: error.message, confirmedAt: Date.now() },
				ns
			)
			if (sameNamespace(store.get(cmsAtom), ns)) update({ pendingOperation: rejected })
		} else if (operation && sameNamespace(store.get(cmsAtom), ns))
			update({ pendingOperation: operation })
	}
	const returnToReview = async () => {
		const s = store.get(cmsAtom)
		if (s.busy || s.phase !== "ready") return
		const ns = namespace(s)
		update({ busy: true, busyLabel: "Opening edition…", error: "" })
		try {
			const operation = await getPendingPush(ns)
			if (!operation?.rejection)
				throw new Error(
					"This push has no confirmed rejection. Resume its exact request before starting another update."
				)
			await clearPendingPush(operation.id, ns)
			if (!sameNamespace(store.get(cmsAtom), ns)) return
			update({
				pendingOperation: null,
				notice:
					"The service confirmed this update was not committed. Your local work and selection are preserved; review them before trying again.",
			})
			const catalog = await fetchCatalog(operation.payload.target.branch)
			if (sameNamespace(store.get(cmsAtom), ns))
				store.set(cmsAtom, (current) => ({
					...current,
					catalogs: { ...current.catalogs, [catalog.branch]: catalog },
					busy: false,
				}))
		} catch (error) {
			reportFailure(error)
		}
	}
	const resumePending = async () => {
		const s = store.get(cmsAtom)
		if (s.busy || s.phase !== "ready") return
		const ns = namespace(s)
		update({ busy: true, busyLabel: "Confirming your saved update…", error: "" })
		try {
			const operation = s.pendingOperation || (await getPendingPush(ns))
			if (!operation) {
				update({ busy: false, pendingOperation: null })
				return
			}
			if (operation.rejection) {
				update({
					busy: false,
					pendingOperation: operation,
					error:
						"This update was confirmed not committed. Return to review before preparing another push.",
				})
				return
			}
			update({ pendingOperation: operation })
			const receipt = await cmsRequest<PushReceipt>("push", {
				method: "POST",
				csrf: store.get(cmsAtom).session?.csrfToken,
				data: operation.payload,
			})
			await applyReceipt(operation, receipt, ns)
		} catch (error) {
			try {
				await recordPushFailure(error, ns)
			} catch (storageError) {
				reportFailure(storageError)
				return
			}
			reportFailure(error)
		}
	}
	const push = async (reviewKey: string) => {
		const s = store.get(cmsAtom),
			plan = currentPlan(s)
		if (s.pendingOperation) {
			await resumePending()
			return
		}
		if (
			s.busy ||
			!plan ||
			plan.errors.length ||
			!plan.included.length ||
			plan.reviewKey !== reviewKey
		) {
			update({ error: "The selection changed. Read the refreshed preview before pushing." })
			return
		}
		const ns = namespace(s)
		update({ busy: true, busyLabel: "Committing your selected records…", error: "" })
		try {
			await Promise.all(plan.included.map((draft) => pending.get(writeKey(ns, draft.id))))
			if (plan.included.some((draft) => store.get(cmsAtom).errors[draft.id]))
				throw new Error("Resolve device storage errors before pushing.")
			const alreadyPending = await getPendingPush(ns)
			if (alreadyPending) {
				update({
					pendingOperation: alreadyPending,
					busy: false,
					notice:
						"A previous push needs confirmation. Resume its exact request before committing newer edits.",
				})
				return
			}
			const branch = selectedBranch(s),
				catalog = s.catalogs[branch],
				fresh = await fetchCatalog(branch)
			if (fresh.head !== catalog.head) {
				store.set(cmsAtom, (v) => ({
					...v,
					catalogs: { ...v.catalogs, [branch]: fresh },
					busy: false,
					error:
						"The repository changed. Your local drafts are safe; review the current version before pushing.",
				}))
				return
			}
			const assets = new Map<string, { path: string; blob: Blob; mime: string }>()
			for (const asset of plan.assets) {
				assets.set(asset.path, { path: asset.path, blob: asset.blob, mime: asset.mime })
				for (const variant of asset.variants || [])
					if (variant.blob)
						assets.set(variant.path, { path: variant.path, blob: variant.blob, mime: variant.mime })
			}
			const encoded = await Promise.all(
				[...assets.values()].map(async (asset) => ({
					path: asset.path,
					mime: asset.mime,
					base64: await blobBase64(asset.blob),
				}))
			)
			const operationId = crypto.randomUUID()
			const payload: PushPayload = {
				operationId,
				target: {
					branch,
					head: catalog.head,
					pullRequestNumber: plan.destination.kind === "pr" ? plan.destination.prNumber : undefined,
				},
				documents: plan.included.map((draft) => ({
					path: draft.document.path,
					content: draft.document.raw,
					expectedBlobSha: draft.base?.sha || null,
					deleted: draft.deleted || false,
				})),
				assets: encoded,
			}
			if (new Blob([JSON.stringify(payload)]).size > 4_000_000)
				throw new Error(
					"This update is larger than the upload limit. Push a smaller group of records or remove an image; every draft remains local."
				)
			const operation: PendingPush = {
				id: operationId,
				reviewKey,
				createdAt: Date.now(),
				payload,
				captured: structuredClone(plan.included),
				rootIds: plan.roots.map((draft) => draft.id),
				candidateDocuments: structuredClone(plan.documents),
			}
			// This transaction must complete before a single byte of the mutation request is sent.
			await savePendingPush(operation, ns)
			update({ pendingOperation: operation })
			const receipt = await cmsRequest<PushReceipt>("push", {
				method: "POST",
				csrf: s.session?.csrfToken,
				data: operation.payload,
			})
			await applyReceipt(operation, receipt, ns)
		} catch (error) {
			try {
				await recordPushFailure(error, ns)
			} catch (storageError) {
				reportFailure(storageError)
				return
			}
			reportFailure(error)
		}
	}
	const reconcileAfterPublish = async (number: number, mergedBranch: string) => {
		const s = store.get(cmsAtom),
			ns = namespace(s),
			defaultBranch = s.session?.repository.defaultBranch || "main"
		// The merge is already confirmed; remove its open-PR presentation even if refresh/storage fails.
		store.set(cmsAtom, (current) => ({
			...current,
			catalogs: Object.fromEntries(
				Object.entries(current.catalogs).map(([key, catalog]) => [
					key,
					{ ...catalog, pullRequests: catalog.pullRequests.filter((pr) => pr.number !== number) },
				])
			),
			lastPR: current.lastPR?.number === number ? null : current.lastPR,
			source: current.source === mergedBranch ? defaultBranch : current.source,
			notice:
				"PR #" +
				number +
				" merged. Refreshing its base; the static site will update after deployment finishes.",
		}))
		const main = await fetchCatalog(defaultBranch)
		if (!sameNamespace(store.get(cmsAtom), ns)) return
		store.set(cmsAtom, (current) => ({
			...current,
			catalogs: {
				...current.catalogs,
				[main.branch]: {
					...main,
					pullRequests: main.pullRequests.filter((pr) => pr.number !== number),
				},
			},
		}))
		const conflicts: string[] = []
		const ids = store
			.get(cmsAtom)
			.drafts.filter((draft) => draft.prNumber === number)
			.map((draft) => draft.id)
		for (const id of ids) {
			await pending.get(writeKey(ns, id))?.catch(() => {})
			const latest = store.get(cmsAtom).drafts.find((draft) => draft.id === id)
			if (!latest || latest.prNumber !== number) continue
			const result = reconcileMergedDraft(latest, main.documents, main.head, defaultBranch)
			if (result.conflict) {
				conflicts.push(result.conflict)
				continue
			}
			await persist(result.draft, { namespace: ns, expectedRevision: latest.revision })
		}
		update({
			busy: false,
			notice:
				"PR #" +
				number +
				" merged. The static site will update after deployment finishes. Remaining local edits are preserved.",
			error: conflicts.join(" "),
		})
	}
	const refreshCatalog = async (branch: string) => {
		const catalog = await fetchCatalog(branch)
		store.set(cmsAtom, (current) => ({
			...current,
			catalogs: { ...current.catalogs, [branch]: catalog },
		}))
		return catalog
	}
	const reconcileLocal = async (
		id: string,
		remote: CmsDocument,
		head: string,
		revision: number,
		document: CmsDocument
	) => {
		const snapshot = store.get(cmsAtom),
			ns = namespace(snapshot),
			draft = snapshot.drafts.find((item) => item.id === id)
		if (snapshot.pendingOperation)
			throw new Error("Resolve the pending push before changing this draft's base.")
		if (
			!draft?.base ||
			draft.revision !== revision ||
			document.id !== id ||
			document.path !== remote.path
		)
			throw new Error("This draft changed. Reopen reconciliation before applying it.")
		const fresh = await refreshCatalog(draft.branch)
		if (fresh.head !== head || fresh.documents.find((item) => item.id === id)?.raw !== remote.raw)
			throw new Error(
				"The repository changed again. Reopen reconciliation to review the latest version."
			)
		if (
			draft.prNumber &&
			!fresh.pullRequests.some((pr) => pr.number === draft.prNumber && pr.branch === draft.branch)
		)
			throw new Error(
				"This PR is no longer open for editing. Export the local draft before reconciling it with main."
			)
		const latest = store.get(cmsAtom).drafts.find((item) => item.id === id)
		if (!sameNamespace(store.get(cmsAtom), ns) || latest?.revision !== revision)
			throw new Error("A newer local edit was retained. Reopen reconciliation before applying it.")
		await persist(
			{
				...latest,
				document,
				base: remote,
				baseHead: head,
				revision: latest.revision + 1,
				updatedAt: Date.now(),
			},
			{ namespace: ns, expectedRevision: revision }
		)
		update({
			error: "",
			notice: "Reconciled on this device. Read the selected update before pushing.",
		})
	}
	const signOut = async () => {
		const s = store.get(cmsAtom)
		if (s.busy || s.phase !== "ready") return
		update({ busy: true, busyLabel: "Opening edition…", error: "" })
		try {
			const ns = namespace(s),
				prefix = writeKey(ns, "")
			await Promise.all(
				[...pending].filter(([key]) => key.startsWith(prefix)).map(([, promise]) => promise)
			)
			if (Object.values(store.get(cmsAtom).errors).some(Boolean))
				throw new Error("Some edits could not be saved. Export local drafts before signing out.")
			await cmsRequest("logout", { method: "POST", csrf: s.session?.csrfToken, data: {} })
			setAuthoringActivation(false)
			store.set(authoringBridgeAtom, (bridge) => ({
				...bridge,
				activated: false,
				enabled: false,
				request: null,
				drafts: [],
				count: 0,
			}))
			store.set(cmsAtom, (current) => ({
				...current,
				session: null,
				phase: "signed-out",
				busy: false,
				drafts: [],
				catalogs: {},
				selected: [],
				pendingOperation: null,
				localRecoveries: [],
				undoRecoveryId: null,
				lastPR: null,
				notice: "",
				error: "",
			}))
		} catch (error) {
			reportFailure(error)
		}
	}
	const recovery = async () => {
		try {
			const s = store.get(cmsAtom)
			const json = await exportDraftSnapshot(
					s.drafts,
					namespace(s),
					s.pendingOperation,
					s.localRecoveries
				),
				href = URL.createObjectURL(new Blob([json], { type: "application/json" }))
			const link = document.createElement("a")
			link.href = href
			link.download = "puerh-local-drafts.json"
			link.click()
			setTimeout(() => URL.revokeObjectURL(href), 1000)
		} catch (error) {
			reportFailure(error)
		}
	}

	const restore = async (file: File) => {
		try {
			const ns = namespace(store.get(cmsAtom))
			await importDrafts(await file.text(), ns)
			const [drafts, pendingOperation, localRecoveries] = await Promise.all([
				listDrafts(ns),
				getPendingPush(ns),
				listDraftRecoveries(ns),
			])
			if (!sameNamespace(store.get(cmsAtom), ns)) return
			update({
				drafts,
				pendingOperation,
				localRecoveries,
				undoRecoveryId: null,
				notice:
					"Draft backup restored on this device, including discarded and reverted drafts. Any pending push still requires explicit confirmation.",
			})
		} catch (error) {
			reportFailure(error)
		}
	}

	return {
		state,
		update,
		updatePullRequest: (number: number, patch: Partial<CmsPullRequest>) =>
			store.set(cmsAtom, (current) => ({
				...current,
				catalogs: Object.fromEntries(
					Object.entries(current.catalogs).map(([key, catalog]) => [
						key,
						{
							...catalog,
							pullRequests: catalog.pullRequests.map((pr) =>
								pr.number === number ? { ...pr, ...patch } : pr
							),
						},
					])
				),
				lastPR:
					current.lastPR?.number === number ? { ...current.lastPR, ...patch } : current.lastPR,
			})),
		refreshCatalog,
		reconcileLocal,
		editDraft,
		newDraft,
		createRelatedDraft,
		discardDraft: (id: string) => changeLocalDraft(id, "discard"),
		revertDraft: (id: string) => changeLocalDraft(id, "revert"),
		undoLocalChange,
		editDocument,
		select,
		review,
		push,
		resumePending,
		returnToReview,
		signOut,
		hasPending: !!state.pendingOperation,
		reconcileAfterPublish,
		reportFailure,
		setSource,
		recovery,
		restore,
		persist,
	}
}
export default function CmsRuntime() {
	const store = useStore(),
		bridge = useAtomValue(authoringBridgeAtom),
		state = useAtomValue(cmsAtom),
		cms = useCms(),
		pathname = usePathname(),
		router = useRouter(),
		handled = useRef<number | null>(null),
		committedPathname = useRef(pathname)
	const [loadAttempt, setLoadAttempt] = useState(0)
	useEffect(() => {
		const clearPendingWrite = () =>
			store.set(cmsAtom, (s) => (s.pendingWriteId === null ? s : { ...s, pendingWriteId: null }))
		window.addEventListener("popstate", clearPendingWrite)
		return () => window.removeEventListener("popstate", clearPendingWrite)
	}, [store])
	useEffect(() => {
		const changed = committedPathname.current !== pathname
		committedPathname.current = pathname
		if (state.phase !== "ready" || (changed && pathname !== "/write/" && pathname !== "/write"))
			store.set(cmsAtom, (s) => (s.pendingWriteId === null ? s : { ...s, pendingWriteId: null }))
	}, [pathname, state.phase, store])
	useEffect(() => {
		let alive = true
		;(async () => {
			try {
				const session = await cmsRequest<CmsSession>("session")
				if (!alive) return
				if (!session.authenticated) {
					store.set(cmsAtom, (s) => ({
						...s,
						session,
						phase: "signed-out",
						localRecoveries: [],
						undoRecoveryId: null,
						catalogs: {},
						lastPR: null,
						selected: [],
						previewId: null,
						notice: "",
						error: "",
					}))
					return
				}
				const ns = {
					repository: session.repository.owner + "/" + session.repository.name,
					account: session.user!.login,
				}
				if (!sameNamespace(store.get(cmsAtom), ns))
					store.set(cmsAtom, (current) => ({
						...current,
						session,
						phase: "loading",
						source: session.repository.defaultBranch,
						drafts: [],
						catalogs: {},
						selected: [],
						previewId: null,
						saving: [],
						errors: {},
						notice: "",
						error: "",
						lastPR: null,
						pendingOperation: null,
						pendingWriteId: null,
						localRecoveries: [],
						undoRecoveryId: null,
					}))
				const [local, remote] = await Promise.allSettled([
					Promise.all([listDrafts(ns), getPendingPush(ns), listDraftRecoveries(ns)]),
					fetchCatalog(),
				])
				if (!alive) return
				if (local.status === "rejected") throw local.reason
				const [drafts, pendingOperation, localRecoveries] = local.value
				if (remote.status === "rejected") {
					store.set(cmsAtom, (current) => ({
						...current,
						session,
						drafts,
						pendingOperation,
						localRecoveries,
						undoRecoveryId: null,
						phase: "error",
						busy: false,
						error:
							"Repository access could not load. Device drafts remain available. " +
							(remote.reason instanceof Error
								? remote.reason.message
								: "Try again when connected."),
					}))
					return
				}
				const catalog = remote.value
				if (!alive) return
				// On reload, exact published bases may safely leave an owner no longer in open PRs.
				if (!pendingOperation)
					for (let index = 0; index < drafts.length; index++) {
						const draft = drafts[index]
						if (
							!draft.prNumber ||
							!draft.base ||
							catalog.pullRequests.some((pr) => pr.number === draft.prNumber)
						)
							continue
						const result = reconcileMergedDraft(
							draft,
							catalog.documents,
							catalog.head,
							catalog.branch
						)
						if (!result.conflict) {
							await saveDraft(result.draft, ns)
							drafts[index] = result.draft
						}
					}
				const base: CmsState = {
					...store.get(cmsAtom),
					session,
					phase: "ready",
					source: catalog.branch,
					catalogs: { [catalog.branch]: catalog },
					drafts,
					pendingOperation,
					localRecoveries,
					busy: false,
				}
				try {
					const saved = JSON.parse(localStorage.getItem(reviewStorage(base)) || "null")
					if (saved) {
						base.selected = (saved.selected || []).filter((id: string) =>
							drafts.some((d) => d.id === id && isDraftDirty(d))
						)
						base.previewId = saved.previewId
						if (["read", "changes", "media", "connections"].includes(saved.lens))
							base.lens = saved.lens
						base.scope = saved.scope === "pr" ? "pr" : "update"
					}
				} catch {}
				store.set(cmsAtom, base)
				setAuthoringActivation(true)
			} catch (e) {
				if (alive)
					store.set(cmsAtom, (s) => ({ ...s, phase: "error", error: (e as Error).message }))
			}
		})()
		return () => {
			alive = false
		}
	}, [store, loadAttempt])
	useEffect(() => {
		store.set(authoringBridgeAtom, (b) => ({
			...b,
			enabled: state.phase === "ready",
			account: state.session?.user?.login || "",
			count: state.drafts.filter(isDraftDirty).length,
			drafts:
				state.phase === "ready"
					? state.drafts
							.filter((d) => isDraftDirty(d) || d.prNumber)
							.map((d) => ({
								id: d.id,
								title: String(d.document.data.title || "Untitled"),
								collection: d.document.collection,
								dirty: isDraftDirty(d),
								prNumber: d.prNumber,
							}))
					: [],
		}))
		if (state.phase === "ready" && state.session?.authenticated)
			try {
				localStorage.setItem(
					reviewStorage(state),
					JSON.stringify({
						selected: state.selected,
						previewId: state.previewId,
						lens: state.lens,
						scope: state.scope,
					})
				)
			} catch {}
	}, [state, store])
	useEffect(() => {
		if (state.phase !== "ready") return
		const branch = selectedBranch(state)
		if (state.catalogs[branch]) return
		let alive = true
		fetchCatalog(branch)
			.then((cat) => {
				if (alive) store.set(cmsAtom, (s) => ({ ...s, catalogs: { ...s.catalogs, [branch]: cat } }))
			})
			.catch((e) => {
				if (alive) store.set(cmsAtom, (current) => ({ ...current, error: (e as Error).message }))
			})
		return () => {
			alive = false
		}
	}, [state, store])
	useEffect(() => {
		const request = bridge.request
		if (!request || request.id === handled.current || state.phase === "loading") return
		if (request.action === "enable") {
			handled.current = request.id
			return
		}
		if (request.action === "disable") {
			handled.current = request.id
			Promise.all([...pending.values()])
				.then(() => {
					if (Object.values(store.get(cmsAtom).errors).some(Boolean))
						throw new Error(
							"Some edits could not be saved. Export local drafts before disabling editing."
						)
					setAuthoringActivation(false)
					store.set(authoringBridgeAtom, (b) => ({
						...b,
						activated: false,
						enabled: false,
						request: null,
						drafts: [],
						count: 0,
					}))
					store.set(cmsAtom, (s) => ({
						...s,
						phase: "loading",
						session: null,
						drafts: [],
						catalogs: {},
						selected: [],
						pendingOperation: null,
						localRecoveries: [],
						undoRecoveryId: null,
						lastPR: null,
						notice: "",
						error: "",
					}))
				})
				.catch((error) => cms.reportFailure(error))
			return
		}
		if (state.phase !== "ready") return
		handled.current = request.id
		if (request.action === "working") {
			cms.review()
			return
		}
		const doc = contextDocument(state, request.pathname || pathname)
		if (request.action === "edit") {
			if (doc) void cms.editDocument(doc)
			else {
				cms.update({ notice: "Choose a record below, or start a new session." })
				router.push("/working-changes/")
			}
			return
		}
		if (request.action === "session") {
			const field: Record<string, string> = {
				vendors: "vendor",
				origins: "origin",
				styles: "style",
				cultivars: "cultivar",
				vessels: "vessel",
			}
			const data = doc && field[doc.collection] ? { [field[doc.collection]]: [doc.id] } : {}
			void cms.newDraft("tastings", data)
			return
		}
		if (request.action === "new") {
			const data = request.parentId
				? { parent: request.parentId }
				: request.collection === "origins" && doc?.collection === "origins"
				? { parent: doc.id }
				: request.collection === "styles" && doc?.collection === "categories"
				? { category: doc.id }
				: {}
			void cms.newDraft(
				request.collection || "tastings",
				data,
				request.returnDraftId && request.returnField
					? { id: request.returnDraftId, field: request.returnField, multiple: true }
					: undefined
			)
		}
	}, [bridge.request, state.phase, state, pathname, cms, store, router])
	if (state.phase === "ready")
		return (state.notice || state.error) &&
			!["/write", "/working-changes"].includes(pathname.replace(/\/$/, "")) ? (
			<aside className="cms-auth-notice cms-global-notice" role={state.error ? "alert" : "status"}>
				<p>{state.error || state.notice}</p>
				{!!state.undoRecoveryId && (
					<button onClick={() => void cms.undoLocalChange(state.undoRecoveryId!)}>Undo</button>
				)}
				<button aria-label="Dismiss notice" onClick={() => cms.update({ notice: "", error: "" })}>
					×
				</button>
			</aside>
		) : null
	const returnTo = pathname + (typeof window !== "undefined" ? window.location.search : "")
	return (
		<aside className="cms-auth-notice" role="status">
			<strong>{state.phase === "loading" ? "Opening your notebook…" : "Enable editing"}</strong>
			{state.phase !== "loading" && (
				<>
					<p>
						{state.error ||
							(state.session?.configured === false
								? "GitHub sign-in needs deployment configuration. Public reading is available."
								: "Sign in with a GitHub account that can write to this repository.")}
					</p>
					{state.phase === "error" && (
						<button
							onClick={() => {
								cms.update({ phase: "loading", error: "" })
								setLoadAttempt((attempt) => attempt + 1)
							}}
						>
							Retry loading
						</button>
					)}
					{!!state.drafts.length && (
						<button onClick={() => void cms.recovery()}>Export device drafts</button>
					)}
					{state.session?.configured !== false && state.phase !== "error" && (
						<a href={"/api/cms?action=login&returnTo=" + encodeURIComponent(returnTo)}>
							Continue with GitHub
						</a>
					)}
					<button
						onClick={() => {
							setAuthoringActivation(false)
							store.set(authoringBridgeAtom, (b) => ({ ...b, activated: false, request: null }))
						}}
					>
						Keep reading
					</button>
				</>
			)}
		</aside>
	)
}
