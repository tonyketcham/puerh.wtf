import type { CmsDocument } from "./types"
import { parseDocument } from "./documents"

export interface CmsPullRequest {
	number: number
	branch: string
	head: string
	base: string
	title: string
	url: string
	draft: boolean
	editable?: boolean
	state?: string
	checks?: string
}
export interface CmsSession {
	configured: boolean
	authenticated: boolean
	user?: { login: string; avatarUrl?: string }
	repository: { owner: string; name: string; defaultBranch: string }
	csrfToken?: string
}
export interface CmsCatalog {
	head: string
	branch: string
	documents: CmsDocument[]
	pullRequests: CmsPullRequest[]
}
export class CmsApiError extends Error {
	constructor(
		message: string,
		public code = "request_failed",
		public details?: unknown,
		public status = 0
	) {
		super(message)
	}
}
export async function cmsRequest<T>(
	action: string,
	options: { method?: string; data?: unknown; csrf?: string; branch?: string } = {}
): Promise<T> {
	const query = new URLSearchParams({ action })
	if (options.branch) query.set("branch", options.branch)
	const response = await fetch("/api/cms?" + query, {
		method: options.method || "GET",
		credentials: "same-origin",
		cache: "no-store",
		headers:
			options.data === undefined
				? undefined
				: { "Content-Type": "application/json", "X-CSRF-Token": options.csrf || "" },
		body: options.data === undefined ? undefined : JSON.stringify(options.data),
	})
	const body = await response.json().catch(() => null)
	if (!response.ok)
		throw new CmsApiError(
			body?.error?.message || "The authoring service could not complete this request.",
			body?.error?.code,
			body?.error?.details,
			response.status
		)
	return body as T
}
export async function fetchCatalog(branch?: string): Promise<CmsCatalog> {
	const result = await cmsRequest<{
		head: string
		branch: string
		records: { path: string; sha: string; content: string }[]
		pullRequests: CmsPullRequest[]
	}>("catalog", { branch })
	return {
		...result,
		pullRequests: result.pullRequests.filter((pr) => pr.editable !== false),
		documents: result.records.map(parseDocument),
	}
}
export function blobBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result).split(",")[1])
		reader.onerror = () =>
			reject(new Error("An image could not be read. Your draft is still saved locally."))
		reader.readAsDataURL(blob)
	})
}

/** Private authoring media is pinned to the same reviewed branch and head as its document. */
export async function fetchPreviewMedia(
	branch: string,
	head: string,
	path: string,
	signal?: AbortSignal
): Promise<Blob> {
	const query = new URLSearchParams({ action: "media", branch, head, path })
	const response = await fetch("/api/cms?" + query, {
		credentials: "same-origin",
		cache: "no-store",
		signal,
	})
	if (!response.ok) {
		const body = await response.json().catch(() => null)
		throw new CmsApiError(
			body?.error?.message ||
				"A reviewed image could not be loaded. Reopen the review to refresh its edition.",
			body?.error?.code,
			body?.error?.details,
			response.status
		)
	}
	const blob = await response.blob()
	if (blob.type !== "image/webp")
		throw new Error("The authoring service returned an unsupported image format.")
	return blob
}

export interface CmsPublicationStatus {
	number: number
	head: string
	baseHead: string
	draft: boolean
	requiresUpdate: boolean
	protectionReady: boolean
	requiredApprovals: number | null
	reviewState: string
	mergeState: string
	checkState: string
	checks: {
		name: string
		state: "pending" | "success" | "failure"
		url?: string
		required: boolean
	}[]
	checksTruncated: boolean
	url: string
}
