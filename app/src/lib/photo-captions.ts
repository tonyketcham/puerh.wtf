/** Captions belong to an occurrence, even when a session reuses the same photo. */
export type PhotoCaption = { image: string; caption: string } | null
export function withPhotoCaptions<T extends { image: string; caption?: string }>(
	images: readonly T[] | null,
	captions: readonly PhotoCaption[] | undefined
): T[] | null {
	return (
		images?.map((image, index) => {
			const entry = captions?.[index]
			return entry?.image === image.image ? { ...image, caption: entry.caption } : image
		}) ?? null
	)
}
