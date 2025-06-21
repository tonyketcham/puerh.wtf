/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "export",
	trailingSlash: true,
	images: {
		unoptimized: true,
	},
	env: {
		FLATBREAD_URL: process.env.FLATBREAD_URL || "http://localhost:5057/graphql",
	},
}

module.exports = nextConfig
