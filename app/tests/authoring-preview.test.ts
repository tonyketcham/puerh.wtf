import { expect, test } from "@playwright/test"
import { createAssetUrlSet, recordImages } from "../src/lib/authoring/preview-media"
import type { CmsAsset, CmsDocument } from "../src/lib/authoring/types"

const document = (
	collection: CmsDocument["collection"],
	data: CmsDocument["data"]
): CmsDocument => ({
	id: "record",
	collection,
	path: "app/content/hidden-source.md",
	sha: null,
	raw: "RAW SOURCE MUST NOT APPEAR",
	data,
	body: "A quiet session.",
})

test("single-image descriptions retain authored wording and intentional empty alt text", () => {
	const doc = document("vendors", {
		title: "white2tea",
		image: "/images/vendor.webp",
		image_alt: "Tea cakes on a bamboo tray",
	})
	expect(recordImages(doc)[0].alt).toBe("Tea cakes on a bamboo tray")
	expect(recordImages({ ...doc, data: { ...doc.data, image_alt: "" } })[0].alt).toBe("")
	expect(
		recordImages(document("vendors", { title: "white2tea", image: "/images/vendor.webp" }))[0].alt
	).toBe("white2tea")
})

test("asset URL ownership deduplicates the primary variant and revokes every allocation", () => {
	const primary = new Blob(["primary"]),
		small = new Blob(["small"])
	const asset: CmsAsset = {
		id: "photo",
		filename: "photo.webp",
		path: "app/public/images/uploads/authoring/hash/1600.webp",
		mime: "image/webp",
		width: 1600,
		height: 1000,
		blob: primary,
		variants: [
			{
				path: "app/public/images/uploads/authoring/hash/1600.webp",
				mime: "image/webp",
				width: 1600,
				height: 1000,
				blob: primary,
			},
			{
				path: "app/public/images/uploads/authoring/hash/480.webp",
				mime: "image/webp",
				width: 480,
				height: 300,
				blob: small,
			},
		],
	}
	let allocated = 0
	const revoked: string[] = []
	const owned = createAssetUrlSet([asset], {
		createObjectURL: () => "blob:" + ++allocated,
		revokeObjectURL: (url) => {
			revoked.push(url)
		},
	})
	expect(allocated).toBe(2)
	expect(owned.urls["/images/uploads/authoring/hash/1600.webp"]).toBe("blob:1")
	owned.dispose()
	expect(revoked).toEqual(["blob:1", "blob:2"])
	expect(createAssetUrlSet([]).urls).toBe(createAssetUrlSet([]).urls)
})
