import { expect, test } from "@playwright/test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { stringify } from "yaml"
import { buildAuthoringImageIndex } from "../scripts/authoring-images.mjs"

test("published session/vendor variant metadata builds a shared public map and validates actual bytes", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "cms-image-index-"))
	const contentDir = path.join(root, "content"),
		publicDir = path.join(root, "public")
	const folder = "/images/uploads/authoring/" + "a".repeat(64)
	await mkdir(contentDir, { recursive: true })
	await mkdir(path.join(publicDir, folder), { recursive: true })
	const variants = []
	try {
		for (const width of [8, 16]) {
			await sharp({ create: { width, height: width / 2, channels: 3, background: "#b77424" } })
				.webp()
				.toFile(path.join(publicDir, folder, width + ".webp"))
			variants.push({
				path: folder + "/" + width + ".webp",
				mime: "image/webp",
				width,
				height: width / 2,
			})
		}
		const image = folder + "/16.webp"
		const document = (data: object) => "---\n" + stringify(data) + "---\n"
		await writeFile(
			path.join(contentDir, "vendor.md"),
			document({ image, image_variants: variants })
		)
		await writeFile(
			path.join(contentDir, "session.md"),
			document({ images: [{ image, alt: "Tea", variants }] })
		)
		const index = await buildAuthoringImageIndex({ contentDir, publicDir })
		expect(index[image]).toEqual(variants.map(({ path: src, ...rest }) => ({ src, ...rest })))
		expect(Object.keys(index)).toEqual([image])
		await writeFile(
			path.join(contentDir, "session.md"),
			document({
				images: [{ image, variants: [{ ...variants[0], path: "https://example.com/8.webp" }] }],
			})
		)
		await expect(buildAuthoringImageIndex({ contentDir, publicDir })).rejects.toThrow(
			/local optimized WebP/
		)
		await writeFile(
			path.join(contentDir, "session.md"),
			document({ images: [{ image, variants: [{ ...variants[0], height: 8 }, variants[1]] }] })
		)
		await expect(buildAuthoringImageIndex({ contentDir, publicDir })).rejects.toThrow(/actual WebP/)
		await writeFile(
			path.join(contentDir, "session.md"),
			document({ images: [{ image, variants: [variants[0], variants[0], variants[1]] }] })
		)
		await expect(buildAuthoringImageIndex({ contentDir, publicDir })).rejects.toThrow(/unique/)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
