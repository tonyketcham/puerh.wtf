import path from "node:path"

/** @type {import('next').NextConfig} */
export default {
	output: "export",
	trailingSlash: true,
	images: {
		unoptimized: true,
	},
	env: {
		FLATBREAD_URL: process.env.FLATBREAD_URL || "http://localhost:5057/graphql",
	},
	turbopack: {
		// __dirname is not defined in ES module scope
		root: path.join(process.cwd(), ".."),
	},
}
