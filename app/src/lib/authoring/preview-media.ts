import type { CmsAsset, CmsDocument } from "./types"
import { assetPublicPath } from "./documents"

export const EMPTY_ASSET_URLS: Record<string, string> = {}

/** A primary image and its largest variant often share a path and Blob. Own each URL once. */
export function createAssetUrlSet(
	assets: readonly CmsAsset[],
	api: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL
) {
	const urls: Record<string, string> = assets.length ? {} : EMPTY_ASSET_URLS
	const blobs = new Map<Blob, string>()
	const add = (path: string, blob?: Blob) => {
		const publicPath = assetPublicPath(path)
		if (!(blob instanceof Blob) || urls[publicPath]) return
		let url = blobs.get(blob)
		if (!url) {
			url = api.createObjectURL(blob)
			blobs.set(blob, url)
		}
		urls[publicPath] = url
	}
	for (const asset of assets) {
		add(asset.path, asset.blob)
		for (const variant of asset.variants || []) add(variant.path, variant.blob)
	}
	return { urls, dispose: () => blobs.forEach((url) => api.revokeObjectURL(url)) }
}

export interface RecordImage {
	image: string
	alt?: string
	caption?: string
	width?: number
	height?: number
	variants?: { path?: string; image?: string; width: number; height?: number; mime?: string }[]
}
export function recordImages(doc: CmsDocument): RecordImage[] {
	const images = Array.isArray(doc.data.images)
		? doc.data.images.filter(
				(x): x is RecordImage => !!x && typeof x === "object" && typeof x.image === "string"
		  )
		: []
	return typeof doc.data.image === "string" && doc.data.image
		? [
				{
					image: doc.data.image,
					alt:
						typeof doc.data.image_alt === "string"
							? doc.data.image_alt
							: String(doc.data.title || ""),
					variants: Array.isArray(doc.data.image_variants) ? doc.data.image_variants : undefined,
				},
				...images,
		  ]
		: images
}
