import { readdir, readFile, writeFile, mkdir, access } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"
import sharp from "sharp"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function sources(directory) {
	const found = new Set()
	const walk = (value) => {
		if (
			typeof value === "string" &&
			/^\/images\/uploads\/.+\.(jpe?g|png|webp)$/i.test(value) &&
			!value.startsWith("/images/uploads/authoring/")
		)
			found.add(value)
		else if (Array.isArray(value)) value.forEach(walk)
		else if (value && typeof value === "object") Object.values(value).forEach(walk)
	}
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = path.join(directory, entry.name)
		if (entry.isDirectory()) for (const src of await sources(file)) found.add(src)
		else if (entry.name.endsWith(".md")) {
			const raw = await readFile(file, "utf8")
			const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
			if (frontmatter) walk(parse(frontmatter[1]))
		}
	}
	return found
}

/** Generate browser-sized derivatives without changing source URLs or originals. */
export async function buildLegacyImageIndex({
	contentDir = path.join(appRoot, "content"),
	publicDir = path.join(appRoot, "public"),
} = {}) {
	/** @type {Record<string, Array<{src: string, mime: "image/webp", width: number, height: number}>>} */
	const index = {}
	for (const src of [...(await sources(contentDir))].sort()) {
		const original = path.resolve(publicDir, "." + src)
		if (!original.startsWith(path.resolve(publicDir) + path.sep))
			throw new Error("Image outside public directory.")
		const bytes = await readFile(original)
		const hash = createHash("sha256").update("webp-q82-v1:").update(bytes).digest("hex")
		const metadata = await sharp(bytes).metadata()
		const width = (metadata.orientation || 0) >= 5 ? metadata.height : metadata.width
		if (!width) continue
		const widths = [...new Set([320, 640, 960, 1600].map((size) => Math.min(width, size)))]
		const variants = []
		const folder = "/images/derived/" + hash
		await mkdir(path.join(publicDir, folder), { recursive: true })
		for (const size of widths) {
			const target = path.join(publicDir, folder, size + ".webp")
			try {
				await access(target)
			} catch {
				await sharp(bytes)
					.rotate()
					.resize({ width: size, withoutEnlargement: true })
					.webp({ quality: 82 })
					.toFile(target)
			}
			const output = await sharp(await readFile(target)).metadata()
			variants.push({
				src: folder + "/" + size + ".webp",
				mime: "image/webp",
				width: output.width,
				height: output.height,
			})
		}
		index[src] = variants
	}
	return index
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const index = await buildLegacyImageIndex()
	await writeFile(
		path.join(appRoot, "src/generated/legacy-images.json"),
		JSON.stringify(index, null, 2) + "\n"
	)
	console.log("Prepared responsive WebP for " + Object.keys(index).length + " legacy images.")
}
