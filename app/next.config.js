import path from "node:path"
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js"

/** @type {import('next').NextConfig} */
export default (phase) => {
	const isDev = phase === PHASE_DEVELOPMENT_SERVER
	const isUsingTurbopack = Boolean(process.env.TURBOPACK)

	return {
		output: "export",
		trailingSlash: true,
		images: {
			unoptimized: true,
		},
		env: {
			FLATBREAD_URL: process.env.FLATBREAD_URL || "http://localhost:5057/graphql",
		},
		experimental: {
			// Only use Jotai SWC plugins when NOT using Turbopack (due to a compatibility issue)
			...(isDev &&
				!isUsingTurbopack && {
					swcPlugins: [
						["@swc-jotai/debug-label", {}],
						["@swc-jotai/react-refresh", {}],
					],
				}),
		},
		transpilePackages: [
			/** see: https://jotai.org/docs/tools/devtools#ui-devtools */
			...(isDev ? ["jotai-devtools"] : []),
		],
		turbopack: {
			// __dirname is not defined in ES module scope
			root: path.join(process.cwd(), ".."),
		},
	}
}
