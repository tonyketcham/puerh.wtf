"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchPreviewMedia } from "./client"
import { previewDocuments } from "./journal-data"
import {
	asPreviewAsset,
	createLocalPreviewAssetCache,
	previewAssetRequests,
} from "./preview-assets"
import type { CmsAsset, CmsDocument, CmsDraft } from "./types"

export function usePreviewAssets(
	document: CmsDocument | undefined,
	before: CmsDocument | undefined,
	drafts: readonly CmsDraft[],
	branch?: string,
	head?: string,
	beforeBranch = branch,
	beforeHead = head,
	context: { documents?: readonly CmsDocument[]; beforeDocuments?: readonly CmsDocument[] } = {}
) {
	// Serialize only path/context/dimensions. Body, descriptions and document object identity do not change requests.
	const planIdentity = JSON.stringify(
		previewAssetRequests(
			document,
			before,
			branch,
			head,
			beforeBranch,
			beforeHead,
			previewDocuments(document, context.documents),
			previewDocuments(before, context.beforeDocuments)
		)
	)
	const paths = useMemo(
		() => JSON.parse(planIdentity) as ReturnType<typeof previewAssetRequests>,
		[planIdentity]
	)
	const [readLocal] = useState(createLocalPreviewAssetCache)
	const local = readLocal(paths, drafts)
	const missing = useMemo(
		() => paths.filter((detail) => !local.some((asset) => asset.path === detail.path)),
		[paths, local]
	)
	const key = JSON.stringify(missing.map(({ path, branch, head }) => ({ path, branch, head })))
	const [attempt, setAttempt] = useState(0)
	const [remote, setRemote] = useState<{
		key: string
		attempt: number
		assets: CmsAsset[]
		error: string
	}>({ key: "", attempt: -1, assets: [], error: "" })
	const retry = useCallback(() => setAttempt((current) => current + 1), [])
	useEffect(() => {
		if (!missing.length || (remote.key === key && remote.attempt === attempt)) return
		const controller = new AbortController()
		if (missing.some((detail) => !detail.branch || !detail.head)) {
			setRemote({
				key,
				attempt,
				assets: [],
				error:
					"The image edition is not loaded yet. Retry images after reconnecting to the repository.",
			})
			return
		}
		Promise.all(
			missing.map(async (detail) =>
				asPreviewAsset(
					detail,
					await fetchPreviewMedia(detail.branch!, detail.head!, detail.path, controller.signal)
				)
			)
		)
			.then((assets) => {
				if (!controller.signal.aborted) setRemote({ key, attempt, assets, error: "" })
			})
			.catch((error: Error) => {
				if (!controller.signal.aborted)
					setRemote({
						key,
						attempt,
						assets: [],
						error: error.message + " Retry images to refresh this edition.",
					})
			})
		return () => controller.abort()
	}, [key, missing, attempt, remote.key, remote.attempt])
	const settled = remote.key === key && remote.attempt === attempt
	const assets = useMemo(
		() => [...local, ...(remote.key === key ? remote.assets : [])],
		[local, remote.key, remote.assets, key]
	)
	return {
		assets,
		loading: !!missing.length && !settled,
		error: missing.length && settled ? remote.error : "",
		retry,
	}
}
