// A plain ESM worker copied to public by prepare-codecs.mjs. It is never bundled into reader JS.
import {
	validateImageFile,
	readImageDimensions,
	validateDimensions,
	variantDimensions,
	MAX_VARIANT_BYTES,
} from "./limits.js"

let busy = false
const root = new URL("./", import.meta.url)
function progress(id, stage, completed, total, message) {
	self.postMessage({ type: "progress", id, progress: { stage, completed, total, message } })
}
async function wasmModule(relative) {
	const response = await fetch(new URL(relative, root), { credentials: "same-origin" })
	if (!response.ok) throw new Error("Image tools could not load. Refresh the app and try again.")
	return WebAssembly.compile(await response.arrayBuffer())
}
async function codecs() {
	const [
		{ default: factory },
		{ defaultOptions },
		{ default: resize, initResize },
		webpModule,
		resizeModule,
	] = await Promise.all([
		import("./webp/codec/enc/webp_enc.js"),
		import("./webp/meta.js"),
		import("./resize/index.js"),
		wasmModule("./webp/codec/enc/webp_enc.wasm"),
		wasmModule("./resize/lib/resize/pkg/squoosh_resize_bg.wasm"),
	])
	const encoder = await factory({
		noInitialRun: true,
		instantiateWasm(imports, receiveInstance) {
			const instance = new WebAssembly.Instance(webpModule, imports)
			receiveInstance(instance, webpModule)
			return instance.exports
		},
	})
	await initResize(resizeModule)
	return { encoder, resize, options: { ...defaultOptions, quality: 80, method: 4 } }
}
async function optimize(file, id) {
	validateImageFile(file)
	progress(id, "reading", 0, 1, "Checking image size and format on this device…")
	const header = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer())
	const source = readImageDimensions(header, file.type)
	validateDimensions(source.width, source.height)
	if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function")
		throw new Error(
			"This browser cannot process images in a background worker. Try a current Chrome, Edge, Firefox, or Safari."
		)
	progress(id, "decoding", 0, 1, "Reading oriented image pixels…")
	const bitmap = await createImageBitmap(file, {
		imageOrientation: "from-image",
		premultiplyAlpha: "none",
	})
	let pixels
	let width, height
	try {
		width = bitmap.width
		height = bitmap.height
		validateDimensions(width, height)
		const canvas = new OffscreenCanvas(width, height)
		const context = canvas.getContext("2d", { willReadFrequently: true })
		if (!context) throw new Error("Image pixels could not be read on this device.")
		context.drawImage(bitmap, 0, 0)
		pixels = context.getImageData(0, 0, width, height)
		canvas.width = canvas.height = 0
	} finally {
		bitmap.close()
	}
	progress(id, "loading-codecs", 0, 2, "Loading local WebAssembly image tools…")
	const { encoder, resize, options } = await codecs()
	progress(id, "loading-codecs", 2, 2, "WebAssembly encoder and resizer ready.")
	const dimensions = variantDimensions(width, height)
	const largest = dimensions[dimensions.length - 1]
	progress(id, "resizing", 0, dimensions.length, "Preparing the largest image in WebAssembly…")
	// Drop the full decoded source before encoding. Each smaller variant is processed sequentially.
	const master =
		largest.width === width && largest.height === height
			? pixels
			: await resize(pixels, {
					...largest,
					method: "lanczos3",
					fitMethod: "stretch",
					premultiply: true,
					linearRGB: true,
			  })
	pixels = null
	const encoded = []
	for (let i = dimensions.length - 1; i >= 0; i--) {
		const size = dimensions[i]
		progress(
			id,
			"resizing",
			dimensions.length - 1 - i,
			dimensions.length,
			"Resizing " + size.width + "px variant in WebAssembly…"
		)
		const image =
			i === dimensions.length - 1
				? master
				: await resize(master, {
						...size,
						method: "lanczos3",
						fitMethod: "stretch",
						premultiply: true,
						linearRGB: true,
				  })
		progress(
			id,
			"encoding",
			dimensions.length - 1 - i,
			dimensions.length,
			"Encoding " + size.width + "px WebP on this device…"
		)
		const result = encoder.encode(image.data, image.width, image.height, options)
		if (!result || !result.length)
			throw new Error("The WebAssembly image encoder could not encode this photo.")
		const bytes = Uint8Array.from(result)
		if (bytes.byteLength > MAX_VARIANT_BYTES)
			throw new Error(
				"An optimized image is still over 2 MB. Choose a smaller or simpler image; your original stays on this device."
			)
		encoded.push({
			...size,
			blob: new Blob([bytes], { type: "image/webp" }),
			bytes: i === dimensions.length - 1 ? bytes : null,
		})
	}
	const digest = await crypto.subtle.digest("SHA-256", encoded[0].bytes)
	const contentHash = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0")
	).join("")
	const folder = "images/uploads/authoring/" + contentHash
	const variants = encoded
		.sort((a, b) => a.width - b.width)
		.map((item) => ({
			id: contentHash + "-" + item.width,
			path: "app/public/" + folder + "/" + item.width + ".webp",
			filename: item.width + ".webp",
			mime: "image/webp",
			width: item.width,
			height: item.height,
			blob: item.blob,
		}))
	const fallback = variants[variants.length - 1]
	const publicSrc = "/" + folder + "/" + fallback.filename
	const result = {
		id: contentHash,
		contentHash,
		originalName: file.name.replace(/[\\/\0]/g, "").slice(0, 200),
		width: fallback.width,
		height: fallback.height,
		variants,
		picture: {
			src: publicSrc,
			srcSet: variants.map((v) => "/" + folder + "/" + v.filename + " " + v.width + "w").join(", "),
			width: fallback.width,
			height: fallback.height,
			type: "image/webp",
		},
		manifest: {
			version: 1,
			codec: "libwebp-wasm",
			quality: 80,
			source: { width, height, mime: file.type, bytes: file.size },
			variants: variants.map(({ blob, ...metadata }) => metadata),
		},
		diagnostics: { worker: true, webpWasm: true, resizeWasm: true },
	}
	progress(
		id,
		"complete",
		variants.length,
		variants.length,
		"Image variants are ready and saved only on this device."
	)
	return result
}
self.addEventListener("message", async (event) => {
	if (event.data?.type !== "optimize") return
	const { file, id } = event.data
	if (busy) {
		self.postMessage({ type: "error", id, error: "This image worker is busy." })
		return
	}
	busy = true
	try {
		self.postMessage({ type: "complete", id, result: await optimize(file, id) })
	} catch (error) {
		self.postMessage({
			type: "error",
			id,
			error: error instanceof Error ? error.message : "This image could not be optimized.",
		})
	} finally {
		busy = false
	}
})
