"use client"

/**
 * The page's side of the terrain workers (terrain.worker.ts): a pool of up to four, shared by every
 * map, each drawing a horizontal band of every render. It loads sheets and cells there (the page no
 * longer parses them), hands over the masks it decoded, and asks for renders: one in flight per
 * map, the newest request waiting behind it (older ones are dropped), so a gesture never queues up
 * work the reader has already moved past. A render is shown once all its bands are back.
 *
 * Without workers or OffscreenCanvas, `terrainWorker()` is null and TerrainCanvas draws on the
 * page as before.
 */
import type { Box } from "./geo"
import type { DrawStyle, Graticule, Reach } from "./terrainCanvas"

export type FontSpec = { family: string; src: string; descriptors: FontFaceDescriptors }

/** A band's lit style by contour interval, then elevation (a Highlight, evaluated up front) */
export type LitTable = Record<number, Record<number, { color: string; width?: number; opacity?: number }>>

export type WorkerLayer = {
	parts: { url: string; clip: Box; cheap?: boolean }[]
	viewBox: Box
	feather: number
	mask: { url: string; rect: Box } | null
	opacity: number
	lit: LitTable | null
	reach?: Reach
}

export type RenderRequest = {
	map: string
	seq: number
	layers: WorkerLayer[]
	area: Box
	cw: number
	ch: number
	/** everything (false: a pan at the same `sig` may move the picture and draw the strips) */
	full: boolean
	sig: string
	style: Omit<DrawStyle, "minorA">
	/** one surface per value of minorA (the hero: full and faded, crossfaded by CSS) */
	minor: number[]
	/** degree lines over the terrain */
	grid: Graticule | null
	/** set per worker: which band of rows it draws, and the band's first device row */
	band?: number
	y?: number
}

export type WorkerIn =
	| { type: "fonts"; faces: FontSpec[] }
	| { type: "load"; url: string }
	| { type: "mask"; url: string; image: ImageBitmap }
	| { type: "render"; req: RenderRequest }
	| { type: "drop"; map: string }

/** One worker's band of a render: device rows from `y`, one bitmap per value of minor */
export type TerrainBand = { y: number; cw: number; ch: number; bitmaps: ImageBitmap[] }

/** A whole render, every band of it, for `area` */
export type TerrainFrame = { map: string; seq: number; area: Box; bands: TerrainBand[] }

export type WorkerOut =
	| { type: "loaded"; url: string }
	| { type: "failed"; url: string }
	| { type: "frame"; map: string; seq: number; y: number; cw: number; ch: number; bitmaps: ImageBitmap[] }

type Client = {
	ready: (url: string) => boolean
	/** fetch and parse in the workers; `then` runs once every one has it */
	load: (url: string, then: () => void, fail?: () => void) => void
	mask: (url: string, image: ImageBitmap) => void
	render: (req: RenderRequest, onFrame: (f: TerrainFrame) => void) => void
	drop: (map: string) => void
}

let client: Client | null | undefined
const failures = new Set<() => void>()

/** Called if the worker never starts (its script fails to load): draw on the page instead. */
export function onTerrainWorkerFail(fn: () => void) {
	failures.add(fn)
	return () => {
		failures.delete(fn)
	}
}

/** The @font-face rules of a family (first name of a CSS font list), with absolute URLs */
function facesOf(fontList: string): FontSpec[] {
	const family = fontList.split(",")[0].trim().replace(/^["']|["']$/g, "")
	const out: FontSpec[] = []
	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList
		try {
			rules = sheet.cssRules
		} catch {
			continue
		}
		for (const rule of Array.from(rules)) {
			if (!(rule instanceof CSSFontFaceRule)) continue
			const st = rule.style
			const fam = st.getPropertyValue("font-family").trim().replace(/^["']|["']$/g, "")
			if (fam !== family) continue
			const base = sheet.href ?? location.href
			const src = st
				.getPropertyValue("src")
				.replace(/url\((["']?)([^"')]+)\1\)/g, (_, q, u) => `url(${q}${new URL(u, base).href}${q})`)
			const d: FontFaceDescriptors = {}
			const w = st.getPropertyValue("font-weight")
			const s = st.getPropertyValue("font-style")
			const r = st.getPropertyValue("unicode-range")
			const disp = st.getPropertyValue("font-display")
			if (w) d.weight = w
			if (s) d.style = s
			if (r) d.unicodeRange = r
			if (disp) d.display = disp as FontDisplay
			out.push({ family, src, descriptors: d })
		}
	}
	return out
}

/**
 * How many workers draw: each takes a horizontal band of every render, so a full Tanaka render at
 * 2× (3340 × 2260 device px, ~500 ms on one core) lands in a fraction of that. Each keeps its own
 * copy of the data it was asked to load.
 */
function poolSize() {
	const n = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4
	return Math.max(1, Math.min(4, Math.floor(n / 2)))
}

export function terrainWorker(fontList?: string): Client | null {
	if (client !== undefined) return client
	if (typeof window === "undefined") return null
	if (
		typeof Worker === "undefined" ||
		typeof OffscreenCanvas === "undefined" ||
		typeof createImageBitmap === "undefined"
	)
		return (client = null)
	const workers: Worker[] = []
	try {
		for (let i = 0; i < poolSize(); i++)
			workers.push(new Worker(new URL("./terrain.worker.ts", import.meta.url), { type: "module" }))
	} catch {
		workers.forEach((w) => w.terminate())
		return (client = null)
	}
	const K = workers.length
	/** how many workers hold each url */
	const loaded = new Map<string, number>()
	const waiting = new Map<string, { then: () => void; fail?: () => void }[]>()
	const sentMasks = new WeakSet<ImageBitmap>()
	const maskUrls = new Set<string>()
	/** per map: the render in flight (its seq and the bands back so far), the latest callback, the request waiting */
	const inFlight = new Map<string, { seq: number; area: Box; bands: TerrainBand[] }>()
	const onFrames = new Map<string, (f: TerrainFrame) => void>()
	const queued = new Map<string, RenderRequest>()
	const postAll = (m: WorkerIn) => workers.forEach((w) => w.postMessage(m))

	/** one request, cut into a band of device rows per worker */
	const send = (req: RenderRequest) => {
		inFlight.set(req.map, { seq: req.seq, area: req.area, bands: [] })
		const s = req.cw / req.area[2]
		workers.forEach((w, i) => {
			const y0 = Math.round((req.ch * i) / K)
			const y1 = Math.round((req.ch * (i + 1)) / K)
			const area: Box = [req.area[0], req.area[1] + y0 / s, req.area[2], (y1 - y0) / s]
			w.postMessage({ type: "render", req: { ...req, area, ch: y1 - y0, band: i, y: y0 } })
		})
	}

	let alive = false
	const onError = () => {
		if (alive) return
		client = null
		workers.forEach((w) => w.terminate())
		failures.forEach((fn) => fn())
	}
	const onMessage = (e: MessageEvent<WorkerOut>) => {
		alive = true
		const m = e.data
		if (m.type === "loaded" || m.type === "failed") {
			if (m.type === "failed") {
				const fns = waiting.get(m.url) ?? []
				waiting.delete(m.url)
				loaded.delete(m.url)
				return fns.forEach((f) => f.fail?.())
			}
			const n = (loaded.get(m.url) ?? 0) + 1
			loaded.set(m.url, n)
			if (n < K) return
			const fns = waiting.get(m.url) ?? []
			waiting.delete(m.url)
			return fns.forEach((f) => f.then())
		}
		const cur = inFlight.get(m.map)
		const done = onFrames.get(m.map)
		if (!cur || cur.seq !== m.seq || !done) return m.bitmaps.forEach((b) => b.close())
		cur.bands.push({ y: m.y, cw: m.cw, ch: m.ch, bitmaps: m.bitmaps })
		if (cur.bands.length < K) return
		// every band of it is back: shown together, so no seam between old and new
		inFlight.delete(m.map)
		const next = queued.get(m.map)
		if (next) {
			queued.delete(m.map)
			send(next)
		}
		done({ map: m.map, seq: m.seq, area: cur.area, bands: cur.bands.sort((a, b) => a.y - b.y) })
	}
	workers.forEach((w) => {
		w.addEventListener("error", onError)
		w.addEventListener("message", onMessage)
	})

	if (fontList) postAll({ type: "fonts", faces: facesOf(fontList) })

	client = {
		ready: (url) => (loaded.get(url) ?? 0) >= K,
		load(url, then, fail) {
			if ((loaded.get(url) ?? 0) >= K) return then()
			const list = waiting.get(url)
			if (list) return void list.push({ then, fail })
			waiting.set(url, [{ then, fail }])
			postAll({ type: "load", url })
		},
		mask(url, image) {
			if (maskUrls.has(url) || sentMasks.has(image)) return
			maskUrls.add(url)
			sentMasks.add(image)
			postAll({ type: "mask", url, image })
		},
		render(req, onFrame) {
			onFrames.set(req.map, onFrame)
			if (inFlight.has(req.map)) return void queued.set(req.map, req)
			send(req)
		},
		drop(map) {
			queued.delete(map)
			inFlight.delete(map)
			onFrames.delete(map)
			postAll({ type: "drop", map })
		},
	}
	return client
}
