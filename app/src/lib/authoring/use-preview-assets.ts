"use client"
import { useEffect, useMemo, useState } from "react"
import { fetchPreviewMedia } from "./client"
import { asPreviewAsset, localPreviewAssets, previewAssetRequests } from "./preview-assets"
import type { CmsAsset, CmsDocument, CmsDraft } from "./types"

export function usePreviewAssets(
	document: CmsDocument | undefined,
	before: CmsDocument | undefined,
	drafts: readonly CmsDraft[],
	branch?: string,
	head?: string,
	beforeBranch = branch,
	beforeHead = head
) {
	const paths = useMemo(
		() => previewAssetRequests(document, before, branch, head, beforeBranch, beforeHead),
		[document, before, branch, head, beforeBranch, beforeHead]
	)
	const local = useMemo(() => localPreviewAssets(paths, drafts), [paths, drafts])
	const missing = useMemo(
		() => paths.filter((detail) => !local.some((asset) => asset.path === detail.path)),
		[paths, local]
	)
	const key = JSON.stringify(missing.map(({ path, branch, head }) => ({ path, branch, head })))
	const [remote, setRemote] = useState<{ key: string; assets: CmsAsset[]; error: string }>({
		key: "",
		assets: [],
		error: "",
	})
	useEffect(() => {
		if (!missing.length) return
		const controller = new AbortController()
		if (missing.some((detail) => !detail.branch || !detail.head)) {
			setRemote({
				key,
				assets: [],
				error: "This image is missing from local storage. Restore its draft backup before pushing.",
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
				if (!controller.signal.aborted) setRemote({ key, assets, error: "" })
			})
			.catch((error: Error) => {
				if (!controller.signal.aborted)
					setRemote({
						key,
						assets: [],
						error: error.message + " Reopen this edition’s review to refresh it.",
					})
			})
		return () => controller.abort()
	}, [key, missing])
	const loaded = !missing.length || remote.key === key
	const assets = useMemo(
		() => [...local, ...(remote.key === key ? remote.assets : [])],
		[local, remote.key, remote.assets, key]
	)
	return {
		assets,
		loading: !loaded,
		error: missing.length && remote.key === key ? remote.error : "",
	}
}
