"use client"

/**
 * The terrain as level-of-detail layers (plan §4.3, §4.7.2): locator → china-east / japan →
 * yunnan → six-mountains → the detail regions, all in one north-up projection so they register
 * exactly. A finer layer fades in over the coarser one as the camera zooms into it.
 *
 * Each layer stands on its own ground: sea, then land, then its contours and reference lines,
 * then the elevations on its index contours. Where it gives way to the layer beneath, its edge is
 * organic: a mask built from the origins' areas (a metaball union, scripts/geo/lib/masks.mjs), so
 * no LOD boundary reads as a rectangle. China-east keeps a feathered box, the locator covers all.
 *
 * A detail region is a set of cells (terrarium tile footprints), each its own JSON, loaded when it
 * comes into view; every cell is clipped to its exact rect, and since neighbours carry the same
 * lines past their shared edge, the seams vanish. The region is drawn whole, then its mask.
 *
 * Two renderers, one look:
 * - TerrainCanvas draws every sheet and cell onto a <canvas> (terrainCanvas.ts), once per camera
 *   rebase; in between the camera just moves the bitmap (camera.ts). SVG drawn this way stalled
 *   while panning: its tiled raster tessellates every band once per tile.
 * - FocusLayer draws the cells around the map's own origin in SVG, on top, while they draw on;
 *   its highlighted line is where the elevation tag finds its place. The canvas then takes over.
 *
 * Presence is worked out per rebase for the area the pane renders (the view plus its margin), and
 * what finer layers hide is skipped: a layer is drawn only where some point of the area reaches it
 * (and cheaply when that is only in the margin).
 * Layers load the first time they'd be seen, not before: a session page fetches only its
 * origin's cells until someone reaches for the map.
 */
import {
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type MutableRefObject,
} from "react"
import { motion, motionValue, useTransform, type MotionValue } from "motion/react"
import { ContourFadeContext } from "./contourFade"
import type { BaseTick, Camera } from "./camera"
import { ContextLines, ContourLines, TanakaBands, type DrawTiming } from "./Contours"
import {
	CELL_SIDE,
	CREAM,
	DETAIL_INTERVAL,
	FRAMES,
	LAND,
	REGIONS,
	SEA,
	type Box,
	type CellJson,
	type CellMeta,
	type ContourLabel,
	type FrameJson,
	type FrameMeta,
	type MaskMeta,
	type RegionMeta,
} from "./geo"
import {
	cachedMapJson,
	cachedMapMask,
	loadMapJson,
	loadMapMask,
	prefetchMapJson,
	prefetchMapMask,
	useMapJsonAll,
	type MapMask,
} from "./mapData"
import {
	drawTerrain,
	type CanvasLayer,
	type CanvasPart,
	type DrawStyle,
	type Highlight,
	type HighlightStyle,
	type Reach,
} from "./terrainCanvas"
import {
	onTerrainWorkerFail,
	terrainWorker,
	type LitTable,
	type TerrainFrame,
	type WorkerLayer,
} from "./terrainWorker"
import { graticuleFor } from "./MapFurniture"

export type TerrainInk = "tanaka" | "hairline"

export type { Highlight, Reach }

/**
 * The origin a map is about: the detail cells around it draw on (in SVG) and its elevation lights
 * up, in `ink`, within `reach` of it.
 */
export type TerrainFocus = {
	id: string
	/** its detail region, and the cells of it the map opens on (none when detail isn't shown) */
	region: string | null
	cells: readonly CellMeta[]
	draw?: DrawTiming
	highlight?: Highlight
	reach?: Reach
	/** the highlight's color (the SVG copy strokes through a gradient of it) */
	ink?: string
}

type FrameLayer = {
	kind: "frame"
	id: string
	url: string
	viewBox: Box
	/** feather as a fraction of the layer's shorter side (0: a hard edge, or its mask's) */
	feather: number
	mask: MaskMeta | null
}

type RegionLayer = {
	kind: "region"
	id: string
	viewBox: Box
	mask: MaskMeta
	cells: readonly CellMeta[]
}

type Layer = FrameLayer | RegionLayer

/**
 * Coarse → fine, by what a layer resolves: contour interval first, then the tile zoom, then the
 * larger sheet first; the detail regions (50 m) above every frame.
 */
const LAYERS: readonly Layer[] = [
	...[...FRAMES]
		.sort((a, b) => b.interval - a.interval || a.zoom - b.zoom || b.viewBox[2] - a.viewBox[2])
		.map(
			(f): FrameLayer => ({
				kind: "frame",
				id: f.id,
				url: f.url,
				viewBox: f.viewBox,
				feather: f.id === "locator" || f.mask ? 0 : 0.03,
				mask: f.mask,
			})
		),
	...REGIONS.map(
		(r: RegionMeta): RegionLayer => ({
			kind: "region",
			id: r.id,
			viewBox: r.rect,
			mask: r.mask,
			cells: r.cells,
		})
	),
]

const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r] as const))

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const meets = ([ax, ay, aw, ah]: Box, [bx, by, bw, bh]: Box) =>
	ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah

const holds = ([x, y, w, h]: Box, px: number, py: number) =>
	px >= x && py >= y && px <= x + w && py <= y + h

/**
 * How present a frame is for a view: 0 off, 1 on (fades in from 1.45× its size to 1.05×). It
 * counts as in view when it overlaps `area` (the view itself, or the larger area the pane renders).
 */
export function lodOpacity(
	meta: { id: string; viewBox: Box },
	view: Box,
	area: Box = view
): number {
	if (meta.id === "locator") return 1
	const [, , vw, vh] = view
	const [fx, fy, fw, fh] = meta.viewBox
	if (!meets(area, meta.viewBox)) return 0
	const z = Math.min(vw / fw, vh / fh)
	return clamp01((1.45 - z) / 0.4)
}

/** How present the detail cells are for a view (the same ramp, against one cell's side) */
export function detailOpacity(view: Box): number {
	return clamp01((1.45 - Math.min(view[2], view[3]) / CELL_SIDE) / 0.4)
}

function presence(l: Layer, view: Box, area: Box) {
	if (l.kind === "frame") return lodOpacity(l, view, area)
	return meets(area, l.viewBox) ? detailOpacity(view) : 0
}

/** The finest frame fully present for a view (what the sheet label names). */
export function activeFrame(view: Box): FrameMeta {
	let best = FRAMES[0]
	for (const f of FRAMES) if (lodOpacity(f, view) >= 0.5) best = f
	return best
}

/** The cells of a region meeting `box` */
const cellsIn = (cells: readonly CellMeta[], box: Box) => cells.filter((c) => meets(c.rect, box))

/** The cells of `region` the camera opens on for `box` (none when detail wouldn't show) */
export function focusCells(region: string | null, box: Box): readonly CellMeta[] {
	const r = region ? REGION_BY_ID.get(region) : undefined
	if (!r || detailOpacity(box) <= 0) return []
	return cellsIn(r.cells, box)
}

/** Warm the layers a view is about to need (pointer over the map, about to zoom out). */
export function prefetchLayersFor(view: Box) {
	const [vx, vy, vw, vh] = view
	const wider: Box = [vx - vw * 1.5, vy - vh * 1.5, vw * 4, vh * 4]
	for (const l of LAYERS) {
		if (l.kind === "frame") {
			if (lodOpacity(l, view) > 0 || lodOpacity(l, wider) > 0) {
				prefetchMapJson(l.url)
				prefetchMapMask(l.mask?.url)
			}
		} else if (meets(l.viewBox, wider)) {
			prefetchMapMask(l.mask.url)
			if (detailOpacity(view) > 0) for (const c of cellsIn(l.cells, view)) prefetchMapJson(c.url)
		}
	}
}

/** A mask's value (0..1) at a point, bilinear between pixel centres as the canvas scales it */
function maskAt(m: MapMask, [rx, ry, rw, rh]: Box, px: number, py: number) {
	const fx = ((px - rx) / rw) * m.w - 0.5
	const fy = ((py - ry) / rh) * m.h - 0.5
	const x0 = Math.max(0, Math.min(m.w - 1, Math.floor(fx)))
	const y0 = Math.max(0, Math.min(m.h - 1, Math.floor(fy)))
	const x1 = Math.min(m.w - 1, x0 + 1)
	const y1 = Math.min(m.h - 1, y0 + 1)
	const tx = clamp01(fx - x0)
	const ty = clamp01(fy - y0)
	const g = m.gray
	const a = g[y0 * m.w + x0] * (1 - tx) + g[y0 * m.w + x1] * tx
	const b = g[y1 * m.w + x0] * (1 - tx) + g[y1 * m.w + x1] * tx
	return (a * (1 - ty) + b * ty) / 255
}

/** Index contours carry elevations below this many units per px (the "detail" tier). */
export const FINE_UPP = 0.16

/** Zoom-dependent emphasis: 0 up close (≤ ~1.2 units/px) → 1 zoomed out (≥ ~8). */
export function emphasis(upp: number) {
	const t = Math.max(
		0,
		Math.min(1, (Math.log(upp) - Math.log(1.2)) / (Math.log(8) - Math.log(1.2)))
	)
	return t * t * (3 - 2 * t)
}

/** One scratch surface for compositing faded and masked layers, shared by every map. */
let scratch: HTMLCanvasElement | null = null
function scratchFor(w: number, h: number) {
	if (!scratch) scratch = document.createElement("canvas")
	if (scratch.width !== w || scratch.height !== h) {
		scratch.width = w
		scratch.height = h
	}
	return scratch
}

let fontFamily: string | null = null
const monoFont = () =>
	(fontFamily ??=
		getComputedStyle(document.body).getPropertyValue("--font-fira-code").trim() || "monospace")

/** Pictures the page keeps: the one shown, one fading in over it, one being staged behind. */
const SLOTS = 4
/** Device px a draft may cover (the full render: up to 2 per CSS px over the whole pane) */
const DRAFT_PX = 3e6
/**
 * A draft zooming out covers more than the view, so the edges stay covered until the next one is
 * in: as far as the zoom will have gone by then (its rate × how long pictures have been taking to
 * show, with room to spare), from 1.6 to 4 views across.
 */
const draftOut = (rate: number, latency: number) =>
	Math.max(1.6, Math.min(4, 1.4 * Math.exp((rate * (latency + 60)) / 1000)))
/**
 * Under everything, a coarse picture of the view's surroundings, this many views across, drawn
 * once the camera rests and again while a zoom out outruns it (at about this many device px):
 * zooming out faster than the drafts come in, the edges show the land around rather than nothing.
 * It is drawn as the map looks at twice the view's width (the LOD mix, thinning and emphasis the
 * zoom out is heading for), so it reads as a softer continuation of the picture, not another map.
 */
const BACKDROP = 4
const BACKDROP_PX = 2e6
/** ms each new picture takes to fade in over the last: mid-gesture, at rest, new data */
const FADE = { draft: 120, rest: 240, data: 280 }

type Slot = {
	area: Box | null
	/** the render it holds */
	seq: number
	z: number
	live: boolean
	anim: { cancel: () => void } | null
}

/**
 * How a picture comes in: fading over `ms`, or (a pan's: the picture of render `onto` moved,
 * plus the strips it exposed) at once if that picture is what shows, settled, else fading briefly.
 */
type Fade = number | { onto: number }

/**
 * Fade `el` in over `ms`, then `done`: a compositor animation, so a fade costs the main thread
 * nothing per frame, and a busy main thread can't stall it.
 */
function fadeIn(el: HTMLElement, ms: number, done: () => void) {
	if (typeof el.animate !== "function") {
		done()
		return null
	}
	const a = el.animate([{ opacity: 0 }, { opacity: 1 }], {
		duration: ms,
		// most of the change early, settling gently
		easing: "cubic-bezier(0.25, 0.6, 0.4, 1)",
	})
	a.onfinish = done
	return { cancel: () => a.cancel() }
}

const union = (a: Box, b: Box): Box => {
	const x = Math.min(a[0], b[0])
	const y = Math.min(a[1], b[1])
	return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y]
}

const closeFrame = (f: TerrainFrame) =>
	f.bands.forEach((b) => b.bitmaps.forEach((bm) => bm.close()))

/** The picture a map shows, and the area it covers: what the full-screen view grows out of */
export type TerrainSeed = { image: ImageBitmap; area: Box }

/**
 * Snapshot the picture on top of a map (TerrainCanvas `seed`). An ImageBitmap of a page canvas is
 * a reference to it, copied only if the canvas is drawn again: no copy on this thread and no new
 * canvas to allocate, where drawing it into one as the full-screen view mounted was a 2–3 ms
 * copy, and 6 MB more toward the next garbage collection, in the mount's own frame. Only the
 * picture: a slot's canvas may be larger than the render it holds (see stage).
 */
export async function terrainSeed(root: HTMLElement | null): Promise<TerrainSeed | null> {
	const src = root?.querySelector<HTMLCanvasElement>("canvas[data-terrain-area]")
	const area = src?.dataset.terrainArea?.split(" ").map(Number)
	if (!src || area?.length !== 4 || !(src.width > 0) || typeof createImageBitmap !== "function")
		return null
	const share = (v: string, n: number) =>
		v.endsWith("%") ? Math.min(n, Math.round((100 * n) / parseFloat(v))) : n
	try {
		const image = await createImageBitmap(
			src,
			0,
			0,
			share(src.style.width, src.width),
			share(src.style.height, src.height)
		)
		return { image, area: area as Box }
	} catch {
		return null
	}
}

/**
 * Every sheet and cell, rendered for the area the pane covers. The focus cells join them once they
 * have drawn on (`focusSettled`); until then they are FocusLayer's, in SVG, and this pass sets its
 * presence (`focusRef`), since the same pass decides what covers what.
 *
 * The drawing happens in a worker (terrainWorker.ts): each camera rebase asks for a new bitmap and
 * the page keeps showing the last one, placed by the area it was drawn for, until it arrives. So
 * neither a pan past the margin, a zoom coming to rest, nor new cells loading ever holds a frame.
 * Where workers or OffscreenCanvas are missing, it draws on the page as before.
 *
 * Nothing changes in one frame: each picture fades in over the one before (both placed by their
 * own areas, so they register), whether it is the next step of a zoom, the sharp one at rest or
 * one with newly loaded cells. The LOD mixes, contour thinning and zoom emphasis a render bakes in
 * so move in small crossfaded steps (the camera renders again every ~0.15 of ln zoom). Drafts
 * mid-zoom are drawn in the map's own ink at a lower resolution (never a different style), over a
 * wider area when zooming out, so the shrinking picture never leaves its edges bare.
 */
export function TerrainCanvas({
	camera,
	ink,
	contours = true,
	rivers = true,
	focus = null,
	focusSettled = true,
	focusRef,
	eager = true,
	dim,
	seed,
	graticule = false,
}: {
	camera: Camera
	ink: TerrainInk
	contours?: boolean
	rivers?: boolean
	focus?: TerrainFocus | null
	/** the focus cells have finished drawing on: the canvas takes them over */
	focusSettled?: boolean
	focusRef?: MutableRefObject<SVGGElement | null>
	/**
	 * load what the margin around the view needs too (false: only what the view itself shows,
	 * until the reader reaches for the map; a session page then fetches just its own cells)
	 */
	eager?: boolean
	/** opacity (the /origins ridge hero dims the plan view) */
	dim?: MotionValue<number>
	/** another map's picture to show until this one's first render (the full-screen view) */
	seed?: TerrainSeed | null
	/** degree lines over the terrain (MapFurniture's step) */
	graticule?: boolean
}) {
	const fadeCtx = useContext(ContourFadeContext)
	const wrapRef = useRef<HTMLDivElement>(null)
	/**
	 * A ring of slots, each a picture (and, on the hero, its faded twin): a render from the workers
	 * is copied into a hidden one a band per frame (a whole one at once, 30 MB at 2×, was a 10–12 ms
	 * copy on this thread), then fades in over what shows; when it is opaque the ones beneath are
	 * hidden and free again. Drawing here, only the first is used.
	 */
	const slotEls = useRef<(HTMLDivElement | null)[]>([])
	const fullEls = useRef<(HTMLCanvasElement | null)[]>([])
	const fadeEls = useRef<(HTMLCanvasElement | null)[]>([])
	const slots = useRef<Slot[]>(
		Array.from({ length: SLOTS }, () => ({ area: null, seq: -1, z: 0, live: false, anim: null }))
	)
	const zTop = useRef(0)
	const staging = useRef<(() => void) | null>(null)
	/** a render waiting for a free slot (every one showing or fading) */
	const pending = useRef<{ f: TerrainFrame; fade: Fade } | null>(null)
	const backdropRef = useRef<HTMLCanvasElement>(null)
	const backdropArea = useRef<Box | null>(null)
	const backdropStaging = useRef<(() => void) | null>(null)
	const backdropAsked = useRef(false)
	const seedRef = useRef<HTMLCanvasElement>(null)
	/** the area the seed (the map this one grows out of) shows, until the first render is in */
	const seedArea = useRef<Box | null>(null)
	const mapId = useId()
	const last = useRef<BaseTick | null>(null)
	const drawnAs = useRef<{
		sig: string
		area: Box
		focus: TerrainFocus | null
		seq: number
	} | null>(null)
	// after strips, a full redraw once the camera has rested a moment
	const pendingFull = useRef(false)
	const loading = useRef(new Set<string>())
	/** the worker, or null to draw here; undefined until mounted */
	const worker = useRef<ReturnType<typeof terrainWorker> | undefined>(undefined)
	const seq = useRef(0)
	/** when each area was asked for, how long pictures take to show (ms, smoothed), the zoom's rate */
	const askedAt = useRef(new WeakMap<Box, number>())
	const latency = useRef(120)
	const zoomRate = useRef({ at: 0, rate: 0 })
	const redrawQueued = useRef(0)
	/** the plain contours' floor when the map fades them as it scrolls away (Hero.tsx) */
	const [fade, setFade] = useState<number | null>(null)
	const opts = useRef({ ink, contours, rivers, eager, focus, focusSettled, fade, graticule })
	useLayoutEffect(() => {
		opts.current = { ink, contours, rivers, eager, focus, focusSettled, fade, graticule }
	})

	/** keep the shown pictures where they belong in the pane (it moves on every rebase) */
	const place = useCallback(() => {
		const t = last.current
		if (!t) return
		const [bx, by] = t.area
		const u = t.upp
		const put = (el: HTMLElement | null, a: Box | null) => {
			if (!el) return
			if (!a) {
				el.style.visibility = "hidden"
				return
			}
			const s = el.style
			s.visibility = "visible"
			s.left = `${(a[0] - bx) / u}px`
			s.top = `${(a[1] - by) / u}px`
			s.width = `${a[2] / u}px`
			s.height = `${a[3] / u}px`
		}
		let top = -1
		slots.current.forEach((s, i) => {
			put(slotEls.current[i], s.live ? s.area : null)
			if (s.live && (top < 0 || s.z > slots.current[top].z)) top = i
		})
		put(backdropRef.current, backdropArea.current)
		put(seedRef.current, seedArea.current)
		// the full-screen view seeds itself from the picture on top
		fullEls.current.forEach((el, i) => {
			const a = slots.current[i].area
			if (!el) return
			if (i === top && a) el.dataset.terrainArea = a.join(" ")
			else delete el.dataset.terrainArea
		})
	}, [])

	/** `i` is staged: fade it in over what shows, then free whatever it covers */
	const reveal = useCallback(
		(i: number, area: Box, seq: number, fade: Fade, next: () => void) => {
			const s = slots.current[i]
			const el = slotEls.current[i]
			let fadeMs = typeof fade === "number" ? fade : FADE.draft
			if (typeof fade !== "number") {
				let top: Slot | null = null
				for (const o of slots.current) if (o.live && (!top || o.z > top.z)) top = o
				if (top && top.seq === fade.onto && !top.anim) fadeMs = 0
			}
			const asked = askedAt.current.get(area)
			if (asked) latency.current = 0.7 * latency.current + 0.3 * (performance.now() - asked)
			s.area = area
			s.seq = seq
			s.live = true
			s.z = ++zTop.current
			if (el) el.style.zIndex = `${s.z}`
			const under = slots.current.some((o) => o !== s && o.live) || !!seedArea.current
			place()
			const done = () => {
				s.anim = null
				for (const o of slots.current) {
					if (o === s || !o.live || o.z > s.z) continue
					o.anim?.cancel()
					o.anim = null
					o.live = false
				}
				const seed = seedRef.current
				if (seedArea.current && seed) {
					seedArea.current = null
					seed.getContext("bitmaprenderer")?.transferFromImageBitmap(null)
					seed.width = 0
					seed.height = 0
				}
				place()
				next()
			}
			if (!el || !under || fadeMs <= 0) return done()
			s.anim = fadeIn(el, fadeMs, done)
		},
		[place]
	)

	/** a finished render: into a free slot (or wait for one), then in */
	const accept = useCallback(
		(f: TerrainFrame, fade: Fade) => {
			// a newer render replaces the one waiting or being copied in
			staging.current?.()
			staging.current = null
			if (pending.current) closeFrame(pending.current.f)
			pending.current = null
			const i = slots.current.findIndex((s) => !s.live)
			if (i < 0) {
				pending.current = { f, fade }
				return
			}
			staging.current = stage(
				f,
				[fullEls.current[i], fadeEls.current[i]],
				() => {
					staging.current = null
					reveal(i, f.area, f.seq, fade, () => {
						const p = pending.current
						pending.current = null
						if (p) accept(p.f, p.fade)
					})
				},
				true
			)
		},
		[reveal]
	)

	const update = useCallback(
		/**
		 * full: draw everything, never just the strips a pan exposed. `backdrop`: the coarse
		 * picture under the rest, for a tick as wide as it covers
		 */
		(t: BaseTick, full = false, backdrop = false) => {
			if (!backdrop) last.current = t
			const canvas = fullEls.current[0]
			const { view, W, upp } = t
			if (!W || !canvas) return
			if (worker.current === undefined) return
			const wk = worker.current
			if (backdrop && !wk) return
			const { ink, contours, rivers, eager, focus, focusSettled, fade, graticule } = opts.current
			if (!backdrop) place()
			// what to draw, and how finely: a draft mid-zoom covers more (zooming out) at fewer px
			let area = t.area
			let dpr = Math.min(2, window.devicePixelRatio || 1)
			if (backdrop)
				dpr = Math.min(dpr, Math.sqrt(BACKDROP_PX / ((area[2] / upp) * (area[3] / upp))))
			else if (t.draft && wk) {
				const now = performance.now()
				const zr = zoomRate.current
				// (a gesture's first step: as if from about a fifth of a second before)
				zr.rate = (1000 * t.zoom) / Math.min(200, Math.max(8, now - zr.at))
				zr.at = now
				if (t.zoom > 0) {
					const [vx, vy, vw, vh] = view
					const g = draftOut(zr.rate, latency.current)
					area = union(area, [vx + (vw * (1 - g)) / 2, vy + (vh * (1 - g)) / 2, vw * g, vh * g])
				}
				dpr = Math.min(dpr, Math.sqrt(DRAFT_PX / ((area[2] / upp) * (area[3] / upp))))
			}
			// many cells land at once: one pass for all of them, on the next frame
			const redraw = () => {
				if (redrawQueued.current) return
				redrawQueued.current = requestAnimationFrame(() => {
					redrawQueued.current = 0
					if (last.current) update(last.current, true)
				})
			}
			const isLoaded = (url: string) => (wk ? wk.ready(url) : !!cachedMapJson(url))
			const load = (url: string, mask = false) => {
				if (loading.current.has(url)) return
				loading.current.add(url)
				if (wk && !mask) return wk.load(url, redraw, () => loading.current.delete(url))
				;(mask ? loadMapMask(url) : loadMapJson(url)).then(redraw, () =>
					loading.current.delete(url)
				)
			}
			// the SVG copy holds the focus cells while they draw on
			const held = new Set(focusSettled || backdrop ? [] : focus?.cells.map((c) => c.id) ?? [])
			const present = LAYERS.map((l) => presence(l, view, area))
			const maskOf = (l: Layer) => (l.mask ? cachedMapMask(l.mask.url) : null)
			const cellAt = (l: RegionLayer, px: number, py: number) =>
				l.cells.find((c) => holds(c.rect, px, py))
			// What shows where: sample the box on a grid and, at each point, look down from the
			// finest layer until one that is fully present, loaded and opaque there (its mask at
			// 1, or inside its feathered edge) hides the rest. Layers no point reaches aren't drawn
			// at all; those reached only in the margin are drawn cheaply. For loading (`loadedOnly`
			// false) a layer counts as there before it arrives, and its mask, until it arrives, as
			// opaque wherever the layer has ground: what it may hide waits for the mask to say so.
			const shows = (box: Box, loadedOnly = true) => {
				const seen = new Set<number>()
				const NX = 24
				const NY = 18
				for (let ix = 0; ix < NX; ix++)
					for (let iy = 0; iy < NY; iy++) {
						const px = box[0] + (ix / (NX - 1)) * box[2]
						const py = box[1] + (iy / (NY - 1)) * box[3]
						for (let i = LAYERS.length - 1; i >= 0; i--) {
							const l = LAYERS[i]
							if (present[i] <= 0 || !holds(l.viewBox, px, py)) continue
							const m = maskOf(l)
							if (loadedOnly && l.mask && !m) continue
							if (l.kind === "region") {
								const cell = cellAt(l, px, py)
								if (!cell || (loadedOnly && !isLoaded(cell.url))) continue
							} else if (loadedOnly && !isLoaded(l.url)) continue
							const a = m ? maskAt(m, l.mask!.rect, px, py) : 1
							if (a <= 0) continue
							seen.add(i)
							if (present[i] < 0.999) continue
							if (l.mask ? a >= 0.999 : inside(l as FrameLayer, px, py)) break
						}
					}
				return seen
			}
			const drawn = shows(area)
			const inView = backdrop ? drawn : shows(view)

			// load what the view (eager: the whole area) is about to show, and nothing it hides
			const want = eager ? area : view
			if (!backdrop)
				for (const i of shows(want, false)) {
					const l = LAYERS[i]
					if (l.mask && !maskOf(l)) load(l.mask.url, true)
					if (l.kind === "frame") {
						if (!isLoaded(l.url)) load(l.url)
					} else for (const c of cellsIn(l.cells, want)) if (!isLoaded(c.url)) load(c.url)
				}

			const reach = focus?.highlight ? focus.reach : undefined
			const highlight = reach ? focus?.highlight : undefined
			const lit = wk && highlight ? litTable(highlight) : null
			const layers: CanvasLayer[] = []
			const wlayers: WorkerLayer[] = []
			LAYERS.forEach((l, i) => {
				const o = drawn.has(i) ? present[i] : 0
				if (!backdrop && l.kind === "region" && l.id === focus?.region) {
					// the SVG copy shows while it draws on (the elevation tag finds its line there
					// meanwhile); once the canvas has it, TerrainMap unmounts it: every rebase sets
					// the svg's viewBox, which lays out each of its paths again, display: none or not
					const el = focusRef?.current
					if (el) {
						el.style.opacity = `${o}`
						el.style.visibility = focusSettled || o < 0.005 ? "hidden" : "visible"
					}
				}
				if (o <= 0) return
				const m = maskOf(l)
				if (l.mask && !m) return
				if (wk) {
					if (m) wk.mask(l.mask!.url, m.image)
					const parts: WorkerLayer["parts"] = []
					if (l.kind === "frame") {
						if (wk.ready(l.url)) parts.push({ url: l.url, clip: l.viewBox, cheap: !inView.has(i) })
					} else
						for (const c of cellsIn(l.cells, area))
							if (wk.ready(c.url) && !held.has(c.id))
								parts.push({ url: c.url, clip: c.rect, cheap: !meets(c.rect, view) })
					if (!parts.length) return
					wlayers.push({
						parts,
						viewBox: l.viewBox,
						feather: l.kind === "frame" ? l.feather : 0,
						mask: m ? { url: l.mask!.url, rect: l.mask!.rect } : null,
						opacity: o,
						lit,
						reach,
					})
					return
				}
				const parts: CanvasPart[] = []
				if (l.kind === "frame") {
					const data = cachedMapJson<FrameJson>(l.url)
					if (data) parts.push({ data, clip: l.viewBox, cheap: !inView.has(i) })
				} else {
					for (const c of cellsIn(l.cells, area)) {
						const data = cachedMapJson<CellJson>(c.url)
						if (data && !held.has(c.id))
							parts.push({ data, clip: c.rect, cheap: !meets(c.rect, view) })
					}
				}
				if (!parts.length) return
				layers.push({
					parts,
					viewBox: l.viewBox,
					feather: l.kind === "frame" ? l.feather : 0,
					mask: m ? { image: m.image, rect: l.mask!.rect } : null,
					opacity: o,
					highlight,
					reach,
				})
			})

			// size the backing store to the area (≤ 2 device px per CSS px; fewer for a draft)
			const cw = Math.round((area[2] / upp) * dpr)
			const ch = Math.round((area[3] / upp) * dpr)
			const e = emphasis(upp)
			const minor = fade == null && fadeCtx ? fadeCtx.minor.get() : 1
			const style: DrawStyle = {
				// one ink throughout: a draft is coarser, never a different style
				ink,
				contours,
				rivers,
				contourA: 1 - 0.62 * e,
				refA: 0.85 + 0.8 * e,
				fine: upp <= FINE_UPP,
				minorA: minor,
				font: monoFont(),
				dpr,
			}
			// a pan at the same scale and look: move the picture, draw only the strips it exposed
			// (then, once the camera rests, everything again: layers that came or went, or that were
			// drawn cheaply for the margin, are drawn as they should be)
			const grid = graticule ? graticuleFor(t, area) : null
			const sig = JSON.stringify([style, cw, ch, upp, held.size, fade, grid?.step])
			/** the backdrop around `t`'s view (as the map looks zoomed out to twice its width) */
			const surroundings = (t: BaseTick) => {
				const [vx, vy, vw, vh] = t.view
				const around = (g: number): Box => [
					vx + (vw * (1 - g)) / 2,
					vy + (vh * (1 - g)) / 2,
					vw * g,
					vh * g,
				]
				backdropAsked.current = true
				update(
					{ ...t, view: around(2), area: around(BACKDROP), upp: t.upp * 2, zoom: 0, draft: false },
					true,
					true
				)
			}
			const prev = drawnAs.current
			const reuse =
				!backdrop && !full && prev && prev.sig === sig && prev.focus === focus ? prev.area : null
			if (!backdrop) {
				pendingFull.current = !!reuse
				drawnAs.current = { sig, area, focus, seq: seq.current + 1 }
			}
			// a pan's picture is the last one moved (nothing to fade); anything else fades in
			const comeIn: Fade =
				reuse && prev ? { onto: prev.seq } : t.draft ? FADE.draft : full ? FADE.data : FADE.rest

			if (wk) {
				if (!backdrop) askedAt.current.set(area, performance.now())
				const { minorA: _m, ...rest } = style
				void _m
				wk.render(
					{
						map: backdrop ? `${mapId}~` : mapId,
						seq: ++seq.current,
						layers: wlayers,
						area,
						cw,
						ch,
						full: !reuse,
						sig,
						style: rest,
						minor: backdrop ? [1] : fade == null ? [minor] : [1, fade],
						grid,
					},
					(f) => {
						if (backdrop) backdropAsked.current = false
						if (f.bands.some((b) => !b.bitmaps.length)) {
							// a band failed: keep what's shown, and try again
							closeFrame(f)
							return redraw()
						}
						if (backdrop) {
							backdropStaging.current?.()
							backdropStaging.current = stage(f, [backdropRef.current], () => {
								backdropStaging.current = null
								backdropArea.current = f.area
								place()
							})
							return
						}
						accept(f, comeIn)
						// at rest: the surroundings, for the next zoom out
						if (!t.draft && !reuse) surroundings(t)
					}
				)
				// zooming out past what the backdrop covers: a new one, wider
				const bd = backdropArea.current
				const [vx, vy, vw, vh] = view
				if (
					!backdrop &&
					t.draft &&
					t.zoom > 0 &&
					!backdropAsked.current &&
					(!bd ||
						!(
							bd[0] <= vx - vw &&
							bd[1] <= vy - vh &&
							bd[0] + bd[2] >= vx + 2 * vw &&
							bd[1] + bd[3] >= vy + 2 * vh
						))
				)
					surroundings(t)
				return
			}
			if (canvas.width !== cw || canvas.height !== ch) {
				canvas.width = cw
				canvas.height = ch
			}
			const ctx = canvas.getContext("2d")
			if (!ctx) return
			drawTerrain(ctx, scratchFor(cw, ch), layers, area, cw / area[2], style, reuse, grid)
			const s0 = slots.current[0]
			s0.area = area
			if (!s0.live) reveal(0, area, 0, 0, () => {})
			else place()
		},
		[focusRef, mapId, place, fadeCtx, accept, reveal]
	)

	// choose the renderer, and show the map this one grows out of until the first render lands
	useLayoutEffect(() => {
		const floor = fadeCtx?.floor ?? null
		const wk = terrainWorker(monoFont())
		worker.current = wk
		if (wk && floor != null) {
			opts.current.fade = floor
			setFade(floor)
		}
		// what the panel shows, handed over as it is (a detached bitmap: this seed was shown already)
		const own = seedRef.current
		if (seed?.image.width) {
			const ctx = wk ? own?.getContext("bitmaprenderer") : null
			if (ctx) {
				ctx.transferFromImageBitmap(seed.image)
				seedArea.current = seed.area
			} else seed.image.close()
		}
		// the worker didn't start: draw here (nothing has been shown through it yet)
		const off = onTerrainWorkerFail(() => {
			worker.current = null
			// These URLs were requested only in the workers. Let the page load them again.
			loading.current.clear()
			opts.current.fade = null
			setFade(null)
			if (last.current) update(last.current, true)
		})
		const list = slots.current
		return () => {
			off()
			staging.current?.()
			staging.current = null
			backdropStaging.current?.()
			backdropStaging.current = null
			if (pending.current) closeFrame(pending.current.f)
			pending.current = null
			for (const s of list) {
				s.anim?.cancel()
				s.anim = null
			}
			if (wk) {
				wk.drop(mapId)
				wk.drop(`${mapId}~`)
			}
		}
	}, [mapId, seed, fadeCtx, place, update])

	useEffect(() => camera.subscribeBase(update), [camera, update])
	useEffect(() => {
		let timer = 0
		const off = camera.subscribe(() => {
			window.clearTimeout(timer)
			timer = window.setTimeout(() => {
				if (pendingFull.current && last.current) update(last.current, true)
			}, 220)
		})
		return () => {
			off()
			window.clearTimeout(timer)
		}
	}, [camera, update])
	// a changed style or loading rule redraws what's there (not on mount: subscribing has just drawn
	// it, and a second request the same as the first was rendered, staged and faded in again)
	const mounted = useRef(false)
	useEffect(() => {
		if (!mounted.current) {
			mounted.current = true
			return
		}
		if (last.current) update(last.current, true)
	}, [ink, contours, rivers, eager, focus, focusSettled, fade, graticule, update])
	// the focus cells arriving can cover (and so hide) what's beneath (drawn here; the worker
	// says so itself)
	const focusUrls = useMemo(() => focus?.cells.map((c) => c.url) ?? [], [focus])
	const focusData = useMapJsonAll<CellJson>(focusUrls)
	useEffect(() => {
		if (focusData && last.current && worker.current === null) update(last.current, true)
	}, [focusData, update])

	// drawing here, the origin hero redraws as it fades its plain contours scrolling away (Hero.tsx);
	// the worker instead draws both ends once, and the full one fades over the faded one
	useEffect(() => {
		if (!fadeCtx || worker.current !== null) return
		let raf = 0
		const off = fadeCtx.minor.on("change", () => {
			cancelAnimationFrame(raf)
			raf = requestAnimationFrame(() => last.current && update(last.current, true))
		})
		return () => {
			cancelAnimationFrame(raf)
			off()
		}
	}, [fadeCtx, update])
	const fullA = useTransform(fadeCtx?.minor ?? ONE, [fadeCtx?.floor ?? 0, 1], [0, 1])

	const cls = "absolute left-0 top-0 block"
	const fill = "absolute left-0 top-0 block w-full h-full"
	return (
		<motion.div
			ref={wrapRef}
			aria-hidden
			className="absolute inset-0"
			style={dim ? { opacity: dim } : undefined}
		>
			<canvas ref={backdropRef} className={cls} style={{ visibility: "hidden" }} />
			<canvas ref={seedRef} className={cls} style={{ visibility: "hidden" }} />
			{Array.from({ length: SLOTS }, (_, i) => (
				<div
					key={i}
					ref={(el) => {
						slotEls.current[i] = el
					}}
					className="absolute left-0 top-0 overflow-hidden"
					style={{ visibility: "hidden" }}
				>
					{fade != null && (
						<canvas
							ref={(el) => {
								fadeEls.current[i] = el
							}}
							className={fill}
						/>
					)}
					{/* over the faded copy: the full contours, as much as the scroll leaves of them */}
					<motion.canvas
						ref={(el) => {
							fullEls.current[i] = el
						}}
						className={fill}
						style={{ opacity: fade != null ? fullA : undefined }}
					/>
				</div>
			))}
		</motion.div>
	)
}

/**
 * A render from the workers into hidden page canvases (one per variant), a band per animation
 * frame, then `done` (the caller fades them in). Returns a cancel: a newer render replaces it.
 * Page canvases, not bitmaprenderers: the full-screen view copies one on the GPU, and a canvas per
 * band, each handed its bitmap, measured worse (more layers, more garbage collection).
 */
function stage(
	f: TerrainFrame,
	targets: (HTMLCanvasElement | null)[],
	done: () => void,
	/**
	 * keep the canvas as large as it has been and draw into its top-left corner, showing only that
	 * (by its CSS size, in a box that clips): drafts and full renders differ in size, and a slot
	 * reallocated for each one cost a GPU allocation and a garbage collection with it
	 */
	grow = false
) {
	const cw = f.bands[0].cw
	const ch = Math.max(...f.bands.map((b) => b.y + b.ch))
	for (const c of targets) {
		if (!c) continue
		if (!grow) {
			if (c.width !== cw || c.height !== ch) {
				c.width = cw
				c.height = ch
			}
			continue
		}
		// grow to fit; shrink only when it is mostly unused (the map got smaller)
		const small = c.width < cw || c.height < ch
		const big = cw * ch < 0.25 * c.width * c.height
		if (small || big) {
			const w = big ? cw : Math.max(cw, c.width)
			const h = big ? ch : Math.max(ch, c.height)
			c.width = w
			c.height = h
		}
		c.style.width = `${(100 * c.width) / cw}%`
		c.style.height = `${(100 * c.height) / ch}%`
	}
	let i = 0
	let raf = 0
	const step = () => {
		const b = f.bands[i++]
		b.bitmaps.forEach((bm, v) => {
			const ctx = targets[v]?.getContext("2d")
			// the slot held an older picture: where this one is clear (past every sheet), so is it
			ctx?.clearRect(0, b.y, b.cw, b.ch)
			ctx?.drawImage(bm, 0, b.y)
			bm.close()
		})
		if (i < f.bands.length) raf = requestAnimationFrame(step)
		else done()
	}
	step()
	return () => {
		cancelAnimationFrame(raf)
		for (const b of f.bands.slice(i)) b.bitmaps.forEach((bm) => bm.close())
	}
}

const ONE = motionValue(1)

/** A highlight evaluated at every elevation of every interval in use (the worker gets a table) */
const litTables = new WeakMap<Highlight, LitTable>()
const INTERVALS = [...new Set([...FRAMES.map((f) => f.interval), DETAIL_INTERVAL])]
function litTable(h: Highlight): LitTable {
	let t = litTables.get(h)
	if (!t) {
		t = {}
		for (const iv of INTERVALS) {
			const row: LitTable[number] = {}
			for (let e = Math.floor(-500 / iv) * iv; e <= 9000; e += iv) {
				const s = h(e, iv)
				if (s) row[e] = s
			}
			t[iv] = row
		}
		litTables.set(h, t)
	}
	return t
}

/** Inside a plain frame's feathered edge */
function inside({ viewBox: [fx, fy, fw, fh], feather }: FrameLayer, px: number, py: number) {
	const f = Math.min(fw, fh) * feather
	return px > fx + f && py > fy + f && px < fx + fw - f && py < fy + fh - f
}

/**
 * The cells around the map's own origin, in SVG over the canvas while they draw on (their
 * presence is set by TerrainCanvas): each clipped to its rect, all of them through the region's
 * organic mask, the bands rising in one stagger across the cells. Their intermediates are thinned
 * for the camera's zoom (in eighths of an octave, and only while the copy shows), as the canvas
 * thins them.
 */
export const FocusLayer = memo(function FocusLayer({
	focus,
	ink,
	contours = true,
	rivers = true,
	gRef,
	camera,
}: {
	focus: TerrainFocus
	ink: TerrainInk
	contours?: boolean
	rivers?: boolean
	gRef: MutableRefObject<SVGGElement | null>
	camera?: Camera
}) {
	const [upp, setUpp] = useState<number | null>(() => {
		const t = camera?.tick()
		return t && t.W > 0 ? t.upp : null
	})
	useEffect(() => {
		if (!camera) return
		return camera.subscribeBase((t) => {
			if (!t.W) return
			const q = 2 ** (Math.round(Math.log2(t.upp) * 8) / 8)
			setUpp((u) => (u === q ? u : q))
		})
	}, [camera])
	const region = focus.region ? REGION_BY_ID.get(focus.region) : undefined
	const urls = useMemo(() => focus.cells.map((c) => c.url), [focus.cells])
	const data = useMapJsonAll<CellJson>(urls)
	const id = useId()
	const { draw, reach } = focus
	// the hero's fade, on this group only, and only while it shows (the canvas has its own)
	const fade = useContext(ContourFadeContext)
	useEffect(() => {
		const g = gRef.current
		if (!fade || !g) return
		const set = (v: number) => {
			if (g.style.visibility !== "hidden") g.style.setProperty("--minor-contours", `${v}`)
		}
		g.style.setProperty("--minor-contours", `${fade.minor.get()}`)
		return fade.minor.on("change", set)
	}, [fade, gRef])
	// one stagger for every cell, by elevation, and the lit lines after the highest band
	const timing = useMemo(() => {
		if (!data || !draw) return null
		const elevs = [...new Set(data.flatMap((d) => d.bands.map((b) => b.elev)))].sort(
			(a, b) => a - b
		)
		const step = (draw.total ?? 400) / Math.max(1, elevs.length)
		const at = new Map(elevs.map((e, i) => [e, i] as const))
		const litAt = (draw.delay ?? 0) + (draw.total ?? 400) + 80
		return data.map(
			(d): DrawTiming => ({
				...draw,
				delay: (draw.delay ?? 0) + (at.get(d.bands[0]?.elev) ?? 0) * step,
				total: d.bands.length * step,
				litAt,
			})
		)
	}, [data, draw])
	const highlight = useMemo(() => {
		const h = focus.highlight
		if (!h) return undefined
		const gradient = reach && focus.ink ? `url(#${id}-hl)` : null
		return (elev: number) => {
			const s = h(elev, DETAIL_INTERVAL)
			return s && gradient ? { ...s, color: gradient } : s
		}
	}, [focus.highlight, focus.ink, reach, id])
	if (!region || !focus.cells.length) return null
	const [mx, my, mw, mh] = region.mask.rect
	return (
		<g ref={gRef} data-focus={focus.id} mask={`url(#${id}-m)`} style={{ visibility: "hidden" }}>
			<defs>
				<mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={mx} y={my} width={mw} height={mh}>
					<image
						href={region.mask.url}
						x={mx}
						y={my}
						width={mw}
						height={mh}
						preserveAspectRatio="none"
					/>
				</mask>
				{focus.cells.map((c, i) => (
					<clipPath key={c.id} id={`${id}-c${i}`} clipPathUnits="userSpaceOnUse">
						<rect x={c.rect[0]} y={c.rect[1]} width={c.rect[2]} height={c.rect[3]} />
					</clipPath>
				))}
				{reach && focus.ink && (
					<radialGradient
						id={`${id}-hl`}
						gradientUnits="userSpaceOnUse"
						cx={reach.x}
						cy={reach.y}
						r={reach.outer}
					>
						<stop offset={Math.min(0.999, reach.inner / reach.outer)} stopColor={focus.ink} />
						<stop offset={1} stopColor={focus.ink} stopOpacity={0} />
					</radialGradient>
				)}
			</defs>
			{data &&
				focus.cells.map((c, i) => {
					const d = data[i]
					const [x, y, w, h] = c.rect
					return (
						<g key={c.id} clipPath={`url(#${id}-c${i})`}>
							<rect x={x} y={y} width={w} height={h} fill={SEA} />
							<path d={d.context.land} fill={LAND} fillRule="evenodd" />
							{contours && (
								<Bands
									bands={d.bands}
									ink={ink}
									draw={timing?.[i]}
									highlight={highlight}
									upp={upp}
								/>
							)}
							{/* zoomed out, the contours give way to the reference layers: a veil of land */}
							<path
								d={d.context.land}
								fill={LAND}
								fillRule="evenodd"
								className="map-contour-veil pointer-events-none"
							/>
							<ContextLines context={d.context} layers={{ rivers }} />
							{contours && <ContourLabels labels={d.contourLabels} />}
						</g>
					)
				})}
		</g>
	)
})

/** Memoized so camera moves never re-render a layer's (large) path data. */
const Bands = memo(function Bands({
	bands,
	ink,
	draw,
	highlight,
	upp,
}: {
	bands: CellJson["bands"]
	ink: TerrainInk
	draw?: DrawTiming
	highlight?: (elev: number) => HighlightStyle | null
	upp?: number | null
}) {
	if (ink === "tanaka")
		return <TanakaBands bands={bands} ground={LAND} draw={draw} highlight={highlight} upp={upp} />
	return <ContourLines bands={bands} draw={draw} highlight={highlight} upp={upp} />
})

/**
 * Elevations on the index contours, along the line, cut out of it by a halo of ground. Shown
 * only up close (the root's data-fine; map.css).
 */
const ContourLabels = memo(function ContourLabels({ labels }: { labels: ContourLabel[] }) {
	if (!labels.length) return null
	return (
		<g className="map-clabels pointer-events-none" aria-hidden>
			{labels.map((l, i) => (
				<g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.angle})`}>
					<g className="map-px">
						<text
							y={2.8}
							textAnchor="middle"
							fontSize={8}
							className="map-clabel font-fira-code"
							fill={CREAM}
							stroke={LAND}
							strokeWidth={3}
							strokeLinejoin="round"
							paintOrder="stroke"
						>
							{l.elev}
						</text>
					</g>
				</g>
			))}
		</g>
	)
})
