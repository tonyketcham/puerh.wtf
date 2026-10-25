import type { CmsDocument, CmsDraft } from "./types"
import type { CmsPullRequest } from "./client"

export interface PushPayload {
	operationId: string
	target: { branch: string; head: string; pullRequestNumber?: number }
	documents: { path: string; content: string; expectedBlobSha: string | null; deleted: boolean }[]
	assets: { path: string; mime: string; base64: string }[]
}

/** Persist this exact request before the first network attempt. New editing never changes it. */
export interface PendingPush {
	id: string
	reviewKey: string
	createdAt: number
	payload: PushPayload
	captured: CmsDraft[]
	rootIds: string[]
	candidateDocuments: CmsDocument[]
	/** Server-confirmed precommit rejection; exact payload is kept until explicit return to review. */
	rejection?: { code: string; message: string; confirmedAt: number }
}
export interface PushReceipt {
	branch: string
	/** Immutable operation commit; remoteHead may already be newer. */
	head: string
	commitHead?: string
	remoteHead?: string
	pullRequest: CmsPullRequest
	documents: { path: string; sha: string }[]
}

/** Merge acknowledgement metadata into the latest local revision, never the captured text. */
export function acknowledgeDraft(
	current: CmsDraft,
	captured: CmsDraft,
	receipt: PushReceipt
): CmsDraft {
	if (current.id !== captured.id || current.document.path !== captured.document.path)
		throw new Error("The local record no longer matches the pending push.")
	const sha = receipt.documents.find((entry) => entry.path === captured.document.path)?.sha
	if (!sha)
		throw new Error(
			"The server did not acknowledge every captured source document. Resume this pending push."
		)
	const pushed = { ...captured.document, sha }
	if (
		current.baseHead === receipt.head &&
		current.branch === receipt.branch &&
		current.prNumber === receipt.pullRequest.number &&
		current.base?.raw === pushed.raw &&
		current.base?.sha === sha &&
		current.document.sha === sha
	)
		return current
	return {
		...current,
		base: pushed,
		baseHead: receipt.head,
		branch: receipt.branch,
		prNumber: receipt.pullRequest.number,
		// Even newer local source uses the pushed blob as its next expected base.
		document: { ...current.document, sha },
		revision: current.revision + 1,
	}
}

export function reconcileMergedDraft(
	current: CmsDraft,
	mainDocuments: readonly CmsDocument[],
	mainHead: string,
	defaultBranch = "main"
): { draft: CmsDraft; conflict?: string } {
	const published = mainDocuments.find((document) => document.id === current.id)
	if (current.base) {
		if (!published || published.path !== current.base.path || published.raw !== current.base.raw) {
			return {
				draft: current,
				conflict:
					"The merged version of " +
					String(current.document.data.title || current.id) +
					" differs from this draft's recorded base. Your local work is intact; reconcile the versions before starting another PR.",
			}
		}
	} else if (
		published &&
		(published.path !== current.document.path || published.raw !== current.document.raw)
	) {
		return {
			draft: current,
			conflict:
				"This new local record collides with the merged version. Your local work is intact; reconcile its identity before pushing.",
		}
	}
	return {
		draft: {
			...current,
			base: published || null,
			baseHead: mainHead,
			branch: defaultBranch,
			prNumber: undefined,
			document: { ...current.document, sha: published?.sha || null },
			revision: current.revision + 1,
		},
	}
}
