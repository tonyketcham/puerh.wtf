import { expect, test } from "@playwright/test"
import sharp from "sharp"
import {
	readImageDimensions,
	validateDimensions,
	validateImageFile,
	variantDimensions,
} from "../src/lib/authoring/media/limits.js"

test("image limits reject unsupported/oversized input and never upscale portrait or small variants", () => {
	expect(() => validateImageFile({ type: "image/svg+xml", size: 200 })).toThrow(
		/JPEG, PNG, or WebP/
	)
	expect(() => validateImageFile({ type: "image/jpeg", size: 21 * 1024 * 1024 })).toThrow(/20 MB/)
	expect(() => validateDimensions(20_000, 10)).toThrow(/too large/)
	expect(() => validateDimensions(5000, 5000)).toThrow(/too large/)
	expect(variantDimensions(320, 200)).toEqual([{ width: 320, height: 200 }])
	expect(variantDimensions(1200, 2400)).toEqual([
		{ width: 480, height: 960 },
		{ width: 800, height: 1600 },
	])
	expect(variantDimensions(2400, 1600)).toEqual([
		{ width: 480, height: 320 },
		{ width: 960, height: 640 },
		{ width: 1600, height: 1067 },
	])
	const animatedWebp = new Uint8Array(30)
	const header = new DataView(animatedWebp.buffer)
	header.setUint32(0, 0x52494646)
	header.setUint32(8, 0x57454250)
	header.setUint32(12, 0x56503858)
	animatedWebp[20] = 2
	expect(() => readImageDimensions(animatedWebp, "image/webp")).toThrow(/Animated/)
	expect(() => readImageDimensions(new Uint8Array(10), "image/jpeg")).toThrow(/invalid/)
})

test("the actual local worker instantiates both WASM codecs and emits decodable sanitized picture variants", async ({
	page,
}) => {
	const wasmResponses: number[] = []
	page.on("response", (response) => {
		if (response.url().includes("/authoring-codecs/") && response.url().endsWith(".wasm"))
			wasmResponses.push(response.status())
	})
	await page.goto("/")
	const result = await page.evaluate(async () => {
		const canvas = new OffscreenCanvas(2400, 1800)
		const context = canvas.getContext("2d")!
		const gradient = context.createLinearGradient(0, 0, 2400, 1800)
		gradient.addColorStop(0, "#b86925")
		gradient.addColorStop(1, "#2d4938")
		context.fillStyle = gradient
		context.fillRect(0, 0, canvas.width, canvas.height)
		// Native PNG encoding is only fixture creation. Production encoding is libwebp WASM.
		const file = new File([await canvas.convertToBlob({ type: "image/png" })], "photo.png", {
			type: "image/png",
		})
		const worker = new Worker("/authoring-codecs/v1/optimizer.worker.js", { type: "module" })
		const stages: string[] = []
		try {
			const optimized = await new Promise<{
				diagnostics: object
				picture: { src: string; srcSet: string }
				variants: Array<{ path: string; mime: string; width: number; height: number; blob: Blob }>
			}>((resolve, reject) => {
				worker.onerror = (event) => reject(new Error(event.message))
				worker.onmessage = (event) => {
					if (event.data.type === "progress") stages.push(event.data.progress.stage)
					if (event.data.type === "error") reject(new Error(event.data.error))
					if (event.data.type === "complete") resolve(event.data.result)
				}
				worker.postMessage({ type: "optimize", id: "actual-wasm", file })
			})
			const variants = []
			for (const variant of optimized.variants) {
				const bitmap = await createImageBitmap(variant.blob)
				const bytes = new Uint8Array(await variant.blob.arrayBuffer())
				const view = new DataView(bytes.buffer),
					chunks: string[] = []
				for (let offset = 12; offset + 8 <= bytes.length; ) {
					chunks.push(String.fromCharCode(...bytes.slice(offset, offset + 4)))
					const length = view.getUint32(offset + 4, true)
					offset += 8 + length + (length % 2)
				}
				variants.push({
					width: variant.width,
					height: variant.height,
					decodedWidth: bitmap.width,
					decodedHeight: bitmap.height,
					mime: variant.blob.type,
					path: variant.path,
					signature: String.fromCharCode(...bytes.slice(0, 4), ...bytes.slice(8, 12)),
					chunks,
				})
				bitmap.close()
			}
			return { diagnostics: optimized.diagnostics, picture: optimized.picture, variants, stages }
		} finally {
			worker.terminate()
		}
	})
	expect(result.diagnostics).toEqual({ worker: true, webpWasm: true, resizeWasm: true })
	expect(wasmResponses).toHaveLength(2)
	expect(wasmResponses.every((status) => status === 200)).toBe(true)
	expect(result.stages).toContain("loading-codecs")
	expect(result.stages).toContain("resizing")
	expect(result.stages).toContain("encoding")
	expect(result.variants.map((v) => v.width)).toEqual([480, 960, 1600])
	for (const variant of result.variants) {
		expect(variant.width).toBe(variant.decodedWidth)
		expect(variant.height).toBe(variant.decodedHeight)
		expect(variant.mime).toBe("image/webp")
		expect(variant.signature).toBe("RIFFWEBP")
		expect(variant.path).toMatch(
			/^app\/public\/images\/uploads\/authoring\/[a-f0-9]{64}\/\d+\.webp$/
		)
		expect(variant.chunks).not.toEqual(expect.arrayContaining(["EXIF"]))
		expect(variant.chunks).not.toEqual(expect.arrayContaining(["XMP "]))
		expect(variant.chunks).not.toEqual(expect.arrayContaining(["ICCP"]))
	}
	expect(result.picture.src).toMatch(/^\/images\/uploads\/authoring\/[a-f0-9]{64}\/1600.webp$/)
	expect(result.picture.srcSet).toContain("480w")
	expect(result.picture.srcSet).toContain("960w")
	expect(result.picture.srcSet).toContain("1600w")
})

test("EXIF orientation is applied to pixels and is absent from the optimized WebP", async ({
	page,
}) => {
	const fixture = await sharp({
		create: { width: 1200, height: 800, channels: 3, background: "#a76c28" },
	})
		.withMetadata({ orientation: 6 })
		.jpeg()
		.toBuffer()
	await page.goto("/")
	const result = await page.evaluate(async (base64) => {
		const data = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
		const worker = new Worker("/authoring-codecs/v1/optimizer.worker.js", { type: "module" })
		try {
			return await new Promise<{
				width: number
				height: number
				source: { width: number; height: number }
			}>((resolve, reject) => {
				worker.onerror = (event) => reject(new Error(event.message))
				worker.onmessage = (event) => {
					if (event.data.type === "error") reject(new Error(event.data.error))
					if (event.data.type === "complete")
						resolve({
							width: event.data.result.width,
							height: event.data.result.height,
							source: event.data.result.manifest.source,
						})
				}
				worker.postMessage({
					type: "optimize",
					id: "orientation",
					file: new File([data], "rotated.jpg", { type: "image/jpeg" }),
				})
			})
		} finally {
			worker.terminate()
		}
	}, fixture.toString("base64"))
	expect(result.source).toMatchObject({ width: 800, height: 1200 })
	expect(result.width).toBe(800)
	expect(result.height).toBe(1200)
})
