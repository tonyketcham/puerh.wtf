/**
 * Step 8: subset Noto Sans SC to the hanzi the origin labels use (harfbuzzjs, WASM).
 * The source font is pinned to a google/fonts commit and verified by SHA-256.
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import subsetFont from "subset-font"
import { log, sha256 } from "./util.mjs"

async function ensureFont(dir, font, offline) {
	const file = path.join(dir, font.cacheName)
	let have = false
	try {
		have = (await stat(file)).size > 0
	} catch {}
	if (!have) {
		if (offline)
			throw new Error(`--offline: ${file} is missing. Run \`pnpm geo\` with network once.`)
		log.info(`  downloading ${font.cacheName} (~18 MB)`)
		const res = await fetch(font.url, { signal: AbortSignal.timeout(300000) })
		if (!res.ok) throw new Error(`font download failed: HTTP ${res.status}`)
		const buf = Buffer.from(await res.arrayBuffer())
		await mkdir(dir, { recursive: true })
		await writeFile(`${file}.tmp`, buf)
		await rename(`${file}.tmp`, file)
	}
	const buf = await readFile(file)
	const hash = sha256(buf)
	if (hash !== font.sha256) {
		throw new Error(
			`${file}: sha256 ${hash} does not match the pinned ${font.sha256}; delete it and re-run`
		)
	}
	return buf
}

/** @returns {Promise<Buffer>} woff2 */
export async function subsetHanzi({ dir, font, text, offline }) {
	const source = await ensureFont(dir, font, offline)
	return subsetFont(source, text, {
		targetFormat: "woff2",
		variationAxes: { wght: font.weight },
	})
}
