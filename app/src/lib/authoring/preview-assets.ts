import type { CmsAsset, CmsDocument, CmsDraft } from "./types"
import { assetPublicPath } from "./documents"
import { recordImages } from "./preview-media"

export interface PreviewAssetPath {
	path: string
	width: number
	height: number
}
/** Only immutable generated image paths from the actual rendered source are eligible. */
export function previewAssetPaths(
	documents: readonly (CmsDocument | undefined | null)[]
): PreviewAssetPath[] {
	const paths = new Map<string, PreviewAssetPath>()
	const add = (source: string, width?: number, height?: number) => {
		const publicPath = assetPublicPath(source)
		if (!publicPath.startsWith("/images/uploads/authoring/") || !publicPath.endsWith(".webp"))
			return
		const path = "app/public" + publicPath
		paths.set(path, { path, width: width || 1, height: height || 1 })
	}
	for (const document of documents)
		if (document)
			for (const image of recordImages(document)) {
				add(image.image, image.width, image.height)
				for (const variant of image.variants || [])
					add(variant.path || variant.image || "", variant.width, variant.height)
			}
	return [...paths.values()]
}
export function asPreviewAsset(detail: PreviewAssetPath, blob: Blob): CmsAsset {
	return {
		id: detail.path,
		path: detail.path,
		filename: detail.path.split("/").pop()!,
		mime: "image/webp",
		width: detail.width,
		height: detail.height,
		blob,
	}
}
/** Clean and omitted drafts can hold bytes for an earlier pushed edition; metadata still comes from that edition. */
export function localPreviewAssets(
	paths: readonly PreviewAssetPath[],
	drafts: readonly CmsDraft[]
): CmsAsset[] {
	const wanted = new Map(paths.map((detail) => [detail.path, detail])),
		found = new Map<string, CmsAsset>()
	for (const draft of drafts)
		for (const asset of draft.assets) {
			const detail = wanted.get(asset.path)
			if (detail) found.set(asset.path, asPreviewAsset(detail, asset.blob))
			for (const variant of asset.variants || []) {
				const variantDetail = wanted.get(variant.path)
				if (variantDetail && variant.blob)
					found.set(variant.path, asPreviewAsset(variantDetail, variant.blob))
			}
		}
	return [...found.values()]
}

/** Shared paths prefer the current source; before-only paths belong to its reviewed base. */
export function previewAssetRequests(
	document: CmsDocument | undefined,
	before: CmsDocument | undefined,
	branch?: string,
	head?: string,
	beforeBranch = branch,
	beforeHead = head
) {
	const current = previewAssetPaths([document]),
		seen = new Set(current.map((detail) => detail.path))
	return [
		...current.map((detail) => ({ ...detail, branch, head })),
		...previewAssetPaths([before])
			.filter((detail) => !seen.has(detail.path))
			.map((detail) => ({ ...detail, branch: beforeBranch, head: beforeHead })),
	]
}

/** Bounded to one hook instance; text edits keep the exact path/Blob bindings and object URLs. */
export function createLocalPreviewAssetCache() {
	let previous: CmsAsset[] = []
	return (paths: readonly PreviewAssetPath[], drafts: readonly CmsDraft[]) => {
		const next = localPreviewAssets(paths, drafts)
		if (
			next.length === previous.length &&
			next.every((asset, index) => {
				const prior = previous[index]
				return (
					asset.path === prior.path &&
					asset.blob === prior.blob &&
					asset.width === prior.width &&
					asset.height === prior.height
				)
			})
		)
			return previous
		previous = next
		return previous
	}
}
