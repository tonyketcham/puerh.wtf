/**
 * Step 2: terrarium tiles (AWS Terrain Tiles), Web Mercator math, fetch + cache.
 *
 * Cache layout: {cacheRoot}/terrain/{z}/{x}/{y}.png on every OS. Downloads go to a
 * temp file and are renamed into place, so an interrupted run resumes cleanly.
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { PNG } from "pngjs"
import { log } from "./util.mjs"

const TILE = 256

// ---------------------------------------------------------------------------
// Web Mercator (global pixel space at zoom z)
// ---------------------------------------------------------------------------

export const worldPx = (z) => TILE * 2 ** z

export const lonToPx = (lon, z) => ((lon + 180) / 360) * worldPx(z)

export function latToPx(lat, z) {
	const s = Math.sin((lat * Math.PI) / 180)
	return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldPx(z)
}

export const pxToLon = (x, z) => (x / worldPx(z)) * 360 - 180

export function pxToLat(y, z) {
	const n = Math.PI - (2 * Math.PI * y) / worldPx(z)
	return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

/** Highest zoom ≤ maxZoom at which the bbox fits in maxPx on its long side */
export function fitZoom([w, s, e, n], maxPx, maxZoom) {
	for (let z = maxZoom; z > 0; z--) {
		const width = lonToPx(e, z) - lonToPx(w, z)
		const height = latToPx(s, z) - latToPx(n, z)
		if (Math.max(width, height) <= maxPx) return z
	}
	return 1
}

/**
 * Integer pixel window covering bbox at zoom z, grown by `margin` (fraction of size,
 * at least 4 px) so contour closures along the grid edge fall outside the frame.
 */
export function pixelWindow([w, s, e, n], z, margin) {
	const x0 = lonToPx(w, z)
	const x1 = lonToPx(e, z)
	const y0 = latToPx(n, z)
	const y1 = latToPx(s, z)
	const mx = Math.max(4, (x1 - x0) * margin)
	const my = Math.max(4, (y1 - y0) * margin)
	const left = Math.floor(x0 - mx)
	const top = Math.max(0, Math.floor(y0 - my))
	const right = Math.ceil(x1 + mx)
	const bottom = Math.min(worldPx(z), Math.ceil(y1 + my))
	return { z, left, top, width: right - left, height: bottom - top }
}

/** Tiles {z,x,y} covering a pixel window */
export function tilesFor({ z, left, top, width, height }) {
	const n = 2 ** z
	const tiles = []
	for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height - 1) / TILE); ty++) {
		if (ty < 0 || ty >= n) continue
		for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width - 1) / TILE); tx++) {
			tiles.push({ z, x: ((tx % n) + n) % n, y: ty, tx })
		}
	}
	return tiles
}

export const tileKey = ({ z, x, y }) => `${z}/${x}/${y}`

// ---------------------------------------------------------------------------
// Source: cache + network
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function exists(file) {
	try {
		return (await stat(file)).size > 0
	} catch {
		return false
	}
}

/** Decode a terrarium PNG to meters: h = R·256 + G + B/256 − 32768 */
export function decodeTerrarium(buffer) {
	const png = PNG.sync.read(buffer)
	if (png.width !== TILE || png.height !== TILE) {
		throw new Error(`unexpected tile size ${png.width}×${png.height}`)
	}
	const out = new Float32Array(TILE * TILE)
	const d = png.data
	for (let i = 0; i < out.length; i++) {
		const o = i * 4
		out[i] = d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768
	}
	return out
}

/**
 * @param {{ dir: string, url?: string, offline?: boolean, concurrency?: number, retries?: number, timeoutMs?: number }} opts
 */
export function createTileSource({
	dir,
	url,
	offline = false,
	concurrency = 6,
	retries = 5,
	timeoutMs = 30000,
}) {
	const fileFor = ({ z, x, y }) => path.join(dir, String(z), String(x), `${y}.png`)
	const memo = new Map()

	async function download(tile) {
		const file = fileFor(tile)
		const target = url.replace("{z}", tile.z).replace("{x}", tile.x).replace("{y}", tile.y)
		let lastError
		for (let attempt = 0; attempt <= retries; attempt++) {
			if (attempt) await sleep(Math.min(8000, 400 * 2 ** attempt))
			try {
				const res = await fetch(target, { signal: AbortSignal.timeout(timeoutMs) })
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				const buf = Buffer.from(await res.arrayBuffer())
				decodeTerrarium(buf) // reject truncated or corrupt payloads before caching
				await mkdir(path.dirname(file), { recursive: true })
				const tmp = `${file}.${process.pid}.tmp`
				await writeFile(tmp, buf)
				await rename(tmp, file)
				return buf.length
			} catch (err) {
				lastError = err
			}
		}
		throw new Error(
			`tile ${tileKey(tile)} failed after ${retries + 1} attempts: ${lastError?.message}`
		)
	}

	return {
		dir,

		/** Fetch every missing tile (concurrency-limited); returns counts. */
		async ensure(tiles) {
			const unique = [...new Map(tiles.map((t) => [tileKey(t), t])).values()]
			const missing = []
			for (const t of unique) if (!(await exists(fileFor(t)))) missing.push(t)
			if (missing.length && offline) {
				const sample = missing.slice(0, 5).map(tileKey).join(", ")
				throw new Error(
					`--offline: ${missing.length} terrain tile(s) missing from ${dir} (e.g. ${sample}). Run \`pnpm geo\` with network once.`
				)
			}
			let done = 0
			let bytes = 0
			const queue = [...missing]
			async function worker() {
				while (queue.length) {
					const t = queue.shift()
					const n = await download(t)
					bytes += n
					done++
					if (done % 25 === 0 || done === missing.length) {
						log.info(`  fetched ${done}/${missing.length} tiles (${(bytes / 1e6).toFixed(1)} MB)`)
					}
				}
			}
			await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker))
			return { total: unique.length, fetched: missing.length, bytes }
		},

		/** Decoded elevations for one tile (memoized for the run) */
		async read(tile) {
			const key = tileKey(tile)
			if (!memo.has(key)) {
				memo.set(key, readFile(fileFor(tile)).then(decodeTerrarium))
			}
			return memo.get(key)
		},

		/** Drop decoded tiles (keeps memory flat across many frames) */
		clear() {
			memo.clear()
		},
	}
}
