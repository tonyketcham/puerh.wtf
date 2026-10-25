import { expect, test } from "@playwright/test"
import { FlatbreadProvider, type FlatbreadConfig } from "flatbread"
import { stringify } from "yaml"
import config from "../flatbread.config"
import { buildLink } from "../src/lib/utils/BuildLinkToGivenCollectionNode"
import type { TreeNode } from "../src/lib/types/tree"

const image = "/images/uploads/authoring/" + "a".repeat(64) + "/960.webp"
const variant = {
	path: "/images/uploads/authoring/" + "a".repeat(64) + "/480.webp",
	width: 480,
	height: 240,
	mime: "image/webp",
}
const collections = [
	"Session",
	"Author",
	"Category",
	"Style",
	"Varietal",
	"Origin",
	"Tags",
	"Vendor",
	"Vessel",
]
const nodes = Object.fromEntries(
	collections.map((collection, index) => {
		const stem =
			collection === "Session" ? "session-1234abcd" : collection.toLowerCase() + "-1234abcd"
		const fields = {
			id: "fixture-" + index,
			title: "Fixture " + collection,
			description: "Existing description",
			...(collection === "Session"
				? { date: "2026-10-24T12:00:00.000Z", images: [{ image, alt: "Tea", variants: [variant] }] }
				: { image }),
		}
		return [
			collection,
			[
				{
					basename: stem + ".md",
					stem,
					extname: ".md",
					path: "/isolated/" + stem + ".md",
					data: {},
					toString: () =>
						"---\n" +
						stringify(fields) +
						"---\n\nNotes for **" +
						collection +
						"**.\n\n<script>alert('unsafe')</script>\n",
				},
			],
		]
	})
)
// Exercise the checked-in configuration and actual Flatbread inference without files or a server.
const provider = new FlatbreadProvider({
	...config,
	source: {
		fetch: async () => nodes as unknown as Awaited<ReturnType<FlatbreadConfig["source"]["fetch"]>>,
	},
})

test("published authoring images keep scalar public paths and a new session filename produces its date route", async () => {
	const result = await provider.query({
		source:
			"{ allSessions { id title _slug _collection date images { image alt variants { path width height mime } } _content { html } } }",
	})
	expect(result.errors).toBeUndefined()
	const session = (
		result.data!.allSessions as (TreeNode & {
			images: { image: string; variants: typeof variant[] }[]
			_content: { html: string }
		})[]
	)[0]
	expect(session._slug).toBe("session-1234abcd")
	expect(buildLink(session)).toBe("/sessions/2026/10/session-1234abcd")
	expect(session.images[0].image).toBe(image)
	expect(session.images[0].variants).toEqual([variant])
	expect(session._content.html).toContain("<strong>Session</strong>")
	expect(session._content.html).not.toContain("<script")
})

test("all existing entity collections expose their independently editable Markdown body", async () => {
	const roots = [
		"allVendors",
		"allOrigins",
		"allStyles",
		"allCategories",
		"allVarietals",
		"allVessels",
	]
	const result = await provider.query({
		source:
			"{ " +
			roots.map((root) => root + " { title description _content { html } }").join(" ") +
			" }",
	})
	expect(result.errors).toBeUndefined()
	for (const root of roots) {
		const record = (
			result.data![root] as { title: string; description: string; _content: { html: string } }[]
		)[0]
		expect(record.description).toBe("Existing description")
		expect(record._content.html).toContain(
			"Notes for <strong>" + record.title.slice("Fixture ".length) + "</strong>"
		)
		expect(record._content.html).not.toContain("<script")
	}
})
