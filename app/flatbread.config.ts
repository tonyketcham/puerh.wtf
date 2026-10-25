import { defineConfig, transformerMarkdown, sourceFilesystem } from "flatbread"
import { wrapMany } from "./plugins/flatbread/wrap.js"

const elementsToWrap = ["h1", "h2", "h3", "h4", "h5", "h6", "li", "p"]

const transformerConfig = {
	markdown: {
		gfm: true,
		externalLinks: true,
		rehypePlugins: [
			[
				wrapMany,
				{
					tagsToWrap: elementsToWrap,
					wrapper: "span.background-box",
				},
			],
		],
	},
}
export default defineConfig({
	source: sourceFilesystem(),
	transformer: transformerMarkdown(transformerConfig),

	content: [
		{
			path: "content/tastings",
			collection: "Session",
			refs: {
				author: "Author",
				style: "Style",
				cultivar: "Varietal",
				origin: "Origin",
				vendor: "Vendor",
				// the vendor's own supplier, when they resold someone else's tea
				sourced_from: "Vendor",
				tags: "Tags",
				// top-level on purpose: refs on nested fields are unverified in Flatbread, so
				// brewing.vessel stays as the free-text note
				vessel: "Vessel",
			},
			// Image URLs stay raw; build-time authoring variants feed the public picture component.
		},
		{
			path: "content/authors",
			collection: "Author",
		},
		{
			path: "content/categories",
			collection: "Category",
		},
		{
			path: "content/styles",
			collection: "Style",
			refs: {
				category: "Category",
			},
		},
		{
			path: "content/cultivars",
			collection: "Varietal",
			refs: {
				styles: "Style",
			},
		},
		{
			path: "content/origins",
			collection: "Origin",
			refs: {
				// self-ref: village → mountain-area → county → prefecture → province → country
				parent: "Origin",
			},
		},
		{
			path: "content/tags",
			collection: "Tags",
		},
		{
			path: "content/vendors",
			collection: "Vendor",
		},
		{
			path: "content/vessels",
			collection: "Vessel",
		},
	],
	codegen: {
		enabled: true,
		// Explicitly list plugins for compatibility with current alpha
		plugins: ["typescript", "typescript-operations", "typed-document-node"],
		outputDir: "./src/generated",
		outputFile: "graphql.ts",
	},
})
