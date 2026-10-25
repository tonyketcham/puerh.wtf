import { validateImageFile } from "./limits.js"
import type { ImageOptimizationProgress, OptimizedImage } from "./types"

export type { ImageVariant, ImageOptimizationProgress, OptimizedImage } from "./types"
export { MAX_FILE_BYTES, MAX_INPUT_PIXELS, MAX_OUTPUT_EDGE, variantDimensions } from "./limits.js"

let queue: Promise<void> = Promise.resolve()
const abortError = () => new DOMException("Image processing was cancelled.", "AbortError")

function run(
	file: File,
	onProgress?: (progress: ImageOptimizationProgress) => void,
	signal?: AbortSignal
) {
	return new Promise<OptimizedImage>((resolve, reject) => {
		if (signal?.aborted) return reject(abortError())
		let worker: Worker
		try {
			worker = new Worker("/authoring-codecs/v1/optimizer.worker.js", {
				type: "module",
				name: "local-image-optimizer",
			})
		} catch {
			reject(new Error("Image tools could not start in this browser."))
			return
		}
		const id = crypto.randomUUID()
		let settled = false
		const timeout = window.setTimeout(
			() => finish(new Error("Image processing took too long. Choose a smaller image.")),
			120_000
		)
		const abort = () => finish(abortError())
		const finish = (error?: Error, result?: OptimizedImage) => {
			if (settled) return
			settled = true
			window.clearTimeout(timeout)
			signal?.removeEventListener("abort", abort)
			worker.terminate() // Also releases WASM memory and cancels synchronous work.
			if (error) reject(error)
			else resolve(result!)
		}
		signal?.addEventListener("abort", abort, { once: true })
		worker.onmessage = (event) => {
			if (event.data?.id !== id || settled) return
			if (event.data.type === "progress") onProgress?.(event.data.progress)
			else if (event.data.type === "complete") finish(undefined, event.data.result)
			else if (event.data.type === "error") finish(new Error(event.data.error))
		}
		worker.onerror = (event) => {
			event.preventDefault()
			finish(new Error("Image tools could not load. Refresh the app and try again."))
		}
		worker.onmessageerror = () =>
			finish(new Error("Image results could not be read. Try this photo again."))
		worker.postMessage({ type: "optimize", id, file })
	})
}

/** Lazy, sequential, device-only WASM work. This function never uploads media. */
export function optimizeImage(
	file: File,
	onProgress?: (progress: ImageOptimizationProgress) => void,
	signal?: AbortSignal
): Promise<OptimizedImage> {
	try {
		validateImageFile(file)
	} catch (error) {
		return Promise.reject(error)
	}
	if (typeof window === "undefined")
		return Promise.reject(new Error("Image optimization is available in the browser."))
	if (signal?.aborted) return Promise.reject(abortError())
	onProgress?.({
		stage: "queued",
		completed: 0,
		total: 1,
		message: "Queued for processing on this device…",
	})
	const task = queue.then(() => run(file, onProgress, signal))
	queue = task.then(
		() => undefined,
		() => undefined
	)
	// A queued cancellation rejects immediately; its slot later skips starting a worker.
	if (!signal) return task
	return new Promise((resolve, reject) => {
		const abort = () => reject(abortError())
		signal.addEventListener("abort", abort, { once: true })
		task.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
	})
}
