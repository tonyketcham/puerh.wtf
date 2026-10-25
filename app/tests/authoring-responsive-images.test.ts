import { expect, test } from "@playwright/test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { withPhotoCaptions } from "../src/lib/photo-captions"
import { stringify } from "yaml"
import { buildAuthoringImageIndex, buildPhotoCaptionIndex } from "../scripts/authoring-images.mjs"

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

test("visible photo captions stay record-specific and independent of image descriptions", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "cms-captions-"))
	try {
		await writeFile(
			path.join(root, "one.md"),
			"---\n" +
				stringify({
					id: "one",
					images: [
						{ image: "/shared.webp", alt: "Accessible description", caption: "A golden cup" },
						{ image: "/blank.webp", caption: "" },
						{
							image: "/shared.webp",
							alt: "Another accessible description",
							caption: "Last leaves",
						},
					],
				}) +
				"---\n"
		)
		await writeFile(
			path.join(root, "two.md"),
			"---\n" +
				stringify({
					id: "two",
					images: [{ image: "/shared.webp", caption: "A different thought" }],
				}) +
				"---\n"
		)
		const captions = await buildPhotoCaptionIndex({ contentDir: root })
		expect(captions).toEqual({
			one: [
				{ image: "/shared.webp", caption: "A golden cup" },
				null,
				{ image: "/shared.webp", caption: "Last leaves" },
			],
			two: [{ image: "/shared.webp", caption: "A different thought" }],
		})
		const images = [
			{ image: "/shared.webp", alt: "Accessible description" },
			{ image: "/blank.webp", alt: "Blank caption" },
			{ image: "/shared.webp", alt: "Another accessible description" },
		]
		expect(withPhotoCaptions(images, captions.one)).toEqual([
			{ ...images[0], caption: "A golden cup" },
			images[1],
			{ ...images[2], caption: "Last leaves" },
		])
		expect(withPhotoCaptions([{ image: "/replaced.webp" }], captions.one)).toEqual([
			{ image: "/replaced.webp" },
		])
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
