export interface ImageVariant {
	id: string
	/** Repository path included only in an explicit content push. */
	path: string
	filename: string
	mime: "image/webp"
	width: number
	height: number
	blob: Blob
}

export interface ImageOptimizationProgress {
	stage: "queued" | "reading" | "decoding" | "loading-codecs" | "resizing" | "encoding" | "complete"
	completed: number
	total: number
	message: string
}

export interface OptimizedImage {
	id: string
	contentHash: string
	originalName: string
	width: number
	height: number
	variants: ImageVariant[]
	picture: {
		src: string
		srcSet: string
		width: number
		height: number
		type: "image/webp"
	}
	/** Content metadata, not a separate uploaded JSON file. */
	manifest: {
		version: 1
		codec: "libwebp-wasm"
		quality: 80
		source: { width: number; height: number; mime: string; bytes: number }
		variants: Array<Omit<ImageVariant, "blob">>
	}
	diagnostics: { worker: true; webpWasm: true; resizeWasm: true }
}
