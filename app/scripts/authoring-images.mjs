#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseDocument } from "yaml"
import sharp from "sharp"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const variantPath = /^\/images\/uploads\/authoring\/[a-f0-9]{64}\/([1-9]\d*)\.webp$/

function publicPath(value) {
	if (typeof value !== "string") throw new Error("A responsive image path must be a string.")
	return value.startsWith("app/public/") ? "/" + value.slice("app/public/".length) : value
}
async function markdownFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true })
	const files = []
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.isDirectory()) files.push(...(await markdownFiles(path.join(directory, entry.name))))
		else if (entry.isFile() && /\.md$/i.test(entry.name))
			files.push(path.join(directory, entry.name))
	}
	return files
}

/** Build-time validation keeps responsive metadata independent of Flatbread's inferred schema. */
export async function buildAuthoringImageIndex({
	contentDir = path.join(appRoot, "content"),
	publicDir = path.join(appRoot, "public"),
} = {}) {
	const index = {}
	const checked = new Map()
	async function checkVariant(variant) {
		if (!variant || typeof variant !== "object")
			throw new Error("An image variant must be an object.")
		const src = publicPath(variant.path || variant.src)
		const match = src.match(variantPath)
		if (!match || variant.mime !== "image/webp")
			throw new Error("Image variants must use local optimized WebP paths.")
		const { width, height } = variant
		if (
			!Number.isInteger(width) ||
			!Number.isInteger(height) ||
			width < 1 ||
			height < 1 ||
			width > 1600 ||
			height > 1600 ||
			Number(match[1]) !== width
		)
			throw new Error(
				"Variant dimensions must match the optimized filename and stay within 1600px."
			)
		const key = src + ":" + width + "x" + height
		if (!checked.has(key)) {
			const file = path.resolve(publicDir, "." + src)
			const publicRoot = path.resolve(publicDir) + path.sep
			if (!file.startsWith(publicRoot))
				throw new Error("Image variant is outside the public folder.")
			const bytes = await readFile(file)
			if (bytes.length > 2 * 1024 * 1024) throw new Error("An optimized variant exceeds 2 MiB.")
			const metadata = await sharp(bytes, { limitInputPixels: 1600 * 1600 }).metadata()
			if (metadata.format !== "webp" || metadata.width !== width || metadata.height !== height)
				throw new Error("Variant metadata does not match the actual WebP image.")
			if (metadata.exif || metadata.xmp || metadata.icc)
				throw new Error("Optimized variants must not contain private image metadata.")
			checked.set(key, true)
		}
		return { src, mime: "image/webp", width, height }
	}
	async function add(image, variants, file) {
		if (variants == null) return
		try {
			const src = publicPath(image)
			if (!variantPath.test(src))
				throw new Error("A responsive fallback must be a local optimized WebP.")
			if (!Array.isArray(variants) || !variants.length || variants.length > 6)
				throw new Error("Responsive images need between one and six variants.")
			const validated = []
			for (const variant of variants) validated.push(await checkVariant(variant))
			validated.sort((a, b) => a.width - b.width)
			if (new Set(validated.map((variant) => variant.width)).size !== validated.length)
				throw new Error("Variant widths must be unique.")
			if (!validated.some((variant) => variant.src === src))
				throw new Error("The fallback must be one of the validated variants.")
			const largest = validated[validated.length - 1]
			for (const variant of validated)
				if (Math.abs(variant.height - (variant.width * largest.height) / largest.width) > 1.1)
					throw new Error("Responsive variants must share one aspect ratio.")
			if (index[src] && JSON.stringify(index[src]) !== JSON.stringify(validated))
				throw new Error("The same image has conflicting responsive variants.")
			index[src] = validated
		} catch (error) {
			throw new Error(
				path.relative(contentDir, file) + ": " + (error instanceof Error ? error.message : error)
			)
		}
	}
	for (const file of await markdownFiles(contentDir)) {
		const raw = await readFile(file, "utf8")
		const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
		if (!frontmatter) continue
		const document = parseDocument(frontmatter[1], { uniqueKeys: true })
		if (document.errors.length)
			throw new Error(
				path.relative(contentDir, file) + ": invalid YAML: " + document.errors[0].message
			)
		const data = document.toJS()
		if (!data || typeof data !== "object") continue
		await add(data.image, data.image_variants, file)
		if (Array.isArray(data.images))
			for (const image of data.images)
				if (image && typeof image === "object") await add(image.image, image.variants, file)
	}
	return Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)))
}

/** Captions remain independent of Flatbread's optional-field inference. */
export async function buildPhotoCaptionIndex({ contentDir = path.join(appRoot, "content") } = {}) {
	/** @type {Record<string, Array<{ image: string, caption: string } | null>>} */
	const captions = {}
	for (const file of await markdownFiles(contentDir)) {
		const raw = await readFile(file, "utf8")
		const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
		if (!frontmatter) continue
		const data = parseDocument(frontmatter[1]).toJS()
		if (typeof data?.id !== "string" || !Array.isArray(data.images)) continue
		const entries = data.images.map((image) =>
			typeof image?.image === "string" && typeof image.caption === "string" && image.caption.trim()
				? { image: image.image, caption: image.caption }
				: null
		)
		if (entries.some(Boolean)) captions[data.id] = entries
	}
	return captions
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const index = await buildAuthoringImageIndex()
	const captions = await buildPhotoCaptionIndex()
	const output = path.join(appRoot, "src/generated/authoring-images.json")
	await mkdir(path.dirname(output), { recursive: true })
	await writeFile(output, JSON.stringify(index, null, 2) + "\n")
	await writeFile(
		path.join(appRoot, "src/generated/authoring-captions.json"),
		JSON.stringify(captions, null, 2) + "\n"
	)
	console.log("Indexed responsive variants for " + Object.keys(index).length + " authored images.")
}
