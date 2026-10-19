#!/usr/bin/env node
/**
 * geo:check (CI, no network): hash the inputs (origin frontmatter + pipeline params +
 * SCRIPT_VERSION) and compare with the committed maps-manifest.json, then make sure
 * every file the manifest lists is present.
 */
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { inputHash } from "./lib/inputs.mjs"
import { readOrigins } from "./lib/origins.mjs"
import { appRoot, paths } from "./lib/util.mjs"

async function main() {
	let manifest
	try {
		manifest = JSON.parse(await readFile(paths.manifest, "utf8"))
	} catch {
		console.error("geo:check: src/generated/maps-manifest.json is missing. Run `pnpm geo`.")
		process.exit(1)
	}

	const hash = inputHash(await readOrigins(paths.origins))
	if (manifest.inputHash !== hash) {
		console.error(
			[
				"geo:check: origins or map pipeline params changed since the maps were generated.",
				"Run `pnpm geo` (needs network the first time) and commit public/maps, src/generated and public/fonts.",
				`  manifest ${manifest.inputHash}`,
				`  current  ${hash}`,
			].join("\n")
		)
		process.exit(1)
	}

	const urls = [
		...manifest.frames.map((f) => f.url),
		...manifest.insets.map((f) => f.url),
		manifest.ridges?.url,
		manifest.font?.url,
	].filter(Boolean)
	const files = [...urls.map((u) => path.join(appRoot, "public", ...u.split("/").filter(Boolean)))]
	if (manifest.origins?.file) files.push(path.join(appRoot, ...manifest.origins.file.split("/")))
	const missing = []
	for (const file of files) {
		try {
			await access(file)
		} catch {
			missing.push(path.relative(appRoot, file))
		}
	}
	if (missing.length) {
		console.error(
			`geo:check: ${missing.length} generated file(s) missing:\n  ${missing.join(
				"\n  "
			)}\nRun \`pnpm geo\`.`
		)
		process.exit(1)
	}
	console.log(
		`geo:check ok · ${manifest.frames.length} frames, ${
			manifest.insets.length
		} insets · ${hash.slice(0, 12)}`
	)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
