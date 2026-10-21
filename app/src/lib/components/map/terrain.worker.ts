/**
 * The terrain renderer, off the main thread (plan §7, "performance"). Every sheet and cell is
 * fetched, parsed and turned into Path2D here, and drawn by terrainCanvas.ts onto a software
 * OffscreenCanvas; the page only receives finished bitmaps (terrainWorker.ts) and shows them.
 * Each worker of the pool draws one horizontal band of a render (its `area` is the band's).
 *
 * Why a worker, and why software: a canvas on the page records its strokes on the main thread
 * but rasterizes them in the GPU process, on the same thread that composites every frame, and a
 * Tanaka sheet with its masked regions takes 100–800 ms there. Whatever thread asked, every frame
 * of the page (scrolling included) waited for it. A software canvas in a worker costs the same
 * wall time, but on a core of its own: the page keeps moving the last bitmap meanwhile.
 *
 * Per map it keeps one surface per variant (the origin hero has two: its plain contours full and
 * faded, crossfaded by CSS as it scrolls away) and what each last held, so a pan at the same
 * scale moves the picture and draws only the strips it exposed, as on the page.
 */
import type { Box, CellJson, FrameJson } from "./geo"
import { drawTerrain, type CanvasLayer, type Ctx2D, type DrawStyle } from "./terrainCanvas"
import type { FontSpec, RenderRequest, WorkerIn, WorkerOut } from "./terrainWorker"

type Scope = {
	postMessage(message: WorkerOut, transfer?: Transferable[]): void
	addEventListener(type: "message", fn: (e: MessageEvent<WorkerIn>) => void): void
	fonts?: FontFaceSet
}
const scope = self as unknown as Scope

const data = new Map<string, FrameJson | CellJson>()
const masks = new Map<string, ImageBitmap>()

/** fonts for the elevations: loaded once, awaited before the first render that sets them */
let fontsReady: Promise<unknown> = Promise.resolve()
function loadFonts(faces: FontSpec[]) {
	if (!scope.fonts || typeof FontFace === "undefined") return
	const loads = faces.map((f) => {
		try {
			const face = new FontFace(f.family, f.src, f.descriptors)
			scope.fonts!.add(face)
			return face.load().catch(() => null)
		} catch {
			return null
		}
	})
	// never hold the terrain back for long on a font
	fontsReady = Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 1500))])
}

function load(url: string) {
	if (data.has(url)) return scope.postMessage({ type: "loaded", url })
	fetch(url)
		.then((res) => {
			if (!res.ok) throw new Error(`${url}: ${res.status}`)
			return res.json()
		})
		.then(
			(json: FrameJson | CellJson) => {
				data.set(url, json)
				scope.postMessage({ type: "loaded", url })
			},
			() => scope.postMessage({ type: "failed", url })
		)
}

type Surface = { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D; sig: string; area: Box | null }
const maps = new Map<string, Surface[]>()
let scratch: OffscreenCanvas | null = null

function surface(map: string, i: number, w: number, h: number): Surface {
	const list = maps.get(map) ?? []
	maps.set(map, list)
	let s = list[i]
	if (!s) {
		const canvas = new OffscreenCanvas(w, h)
		// software: the raster happens here, on this thread, not in the GPU process
		const ctx = canvas.getContext("2d", { willReadFrequently: true })!
		s = list[i] = { canvas, ctx, sig: "", area: null }
	}
	if (s.canvas.width !== w || s.canvas.height !== h) {
		s.canvas.width = w
		s.canvas.height = h
		s.area = null
	}
	return s
}

function scratchFor(w: number, h: number) {
	if (!scratch) {
		scratch = new OffscreenCanvas(w, h)
		scratch.getContext("2d", { willReadFrequently: true })
	}
	if (scratch.width < w || scratch.height < h) {
		scratch.width = Math.max(w, scratch.width)
		scratch.height = Math.max(h, scratch.height)
	}
	return scratch
}

/** the request's layers, with their data and masks (parts not loaded here yet are left out) */
function layersOf(req: RenderRequest): CanvasLayer[] {
	const out: CanvasLayer[] = []
	for (const l of req.layers) {
		const mask = l.mask ? masks.get(l.mask.url) : null
		if (l.mask && !mask) continue
		const parts = []
		for (const p of l.parts) {
			const d = data.get(p.url)
			if (d) parts.push({ data: d, clip: p.clip, cheap: p.cheap })
		}
		if (!parts.length) continue
		const lit = l.lit
		out.push({
			parts,
			viewBox: l.viewBox,
			feather: l.feather,
			mask: mask && l.mask ? { image: mask, rect: l.mask.rect } : null,
			opacity: l.opacity,
			highlight: lit ? (elev, interval) => lit[interval]?.[elev] ?? null : undefined,
			reach: l.reach,
		})
	}
	return out
}

async function render(req: RenderRequest) {
	if (req.style.fine) await fontsReady
	const layers = layersOf(req)
	const { cw, ch, area } = req
	const bitmaps: ImageBitmap[] = []
	for (let i = 0; i < req.minor.length; i++) {
		const style: DrawStyle = { ...req.style, minorA: req.minor[i] }
		const s = surface(req.map, i, cw, ch)
		const reuse = !req.full && s.area && s.sig === req.sig ? s.area : null
		drawTerrain(s.ctx as Ctx2D, scratchFor(cw, ch), layers, area, cw / area[2], style, reuse, req.grid)
		s.sig = req.sig
		s.area = area
		bitmaps.push(await createImageBitmap(s.canvas))
	}
	scope.postMessage({ type: "frame", map: req.map, seq: req.seq, y: req.y ?? 0, cw, ch, bitmaps }, bitmaps)
}

scope.addEventListener("message", (e) => {
	const m = e.data
	switch (m.type) {
		case "fonts":
			return loadFonts(m.faces)
		case "load":
			return load(m.url)
		case "mask":
			masks.set(m.url, m.image)
			return
		case "render":
			render(m.req).catch((err) => {
				console.error(err)
				scope.postMessage({ type: "frame", map: m.req.map, seq: m.req.seq, y: m.req.y ?? 0, cw: 0, ch: 0, bitmaps: [] })
			})
			return
		case "drop":
			maps.delete(m.map)
			return
	}
})
