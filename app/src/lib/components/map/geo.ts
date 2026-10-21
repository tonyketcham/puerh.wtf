/**
 * The client side of the origin maps (plan §4.3–§4.5): types for the precomputed JSON in
 * public/maps, the committed manifest, and the little arithmetic the renderers need.
 *
 * There is no runtime geo library. Everything is already projected at build time (scripts/geo):
 * shared frames, the detail cells and labels all sit in one north-up Web Mercator
 * ("shared units", plan §4.7.1). The only projection done here is `projectShared` /
 * `unprojectShared` (projection.ts, a few lines of trig checked against d3 by geo:test), for
 * points the pipeline doesn't know (vendor cities for the supply-lines layer) and cursor readouts.
 */
import manifest from "@/generated/maps-manifest.json"
import { liftLiquor, type RGB } from "@/lib/liquor"
import { createMercator, type MercatorParams } from "./projection"

// ---------------------------------------------------------------------------
// JSON shapes (scripts/geo/build.mjs)
// ---------------------------------------------------------------------------

/** [x, y, width, height] in projected units */
export type Box = [number, number, number, number]
export type Point = [number, number]

/**
 * One contour band: the closed outline of the ground at or above `elev` (fill-rule evenodd).
 * `thin` (intermediates only): where its stretches give way when contours bunch (contourThin.ts).
 */
export type Band = { elev: number; index: boolean; d: string; thin?: string }

export type NamedPath = { name?: string | null; name_zh?: string | null; d: string }

/** Reference layers (Natural Earth 10 m), clipped to the frame or cell (plan §4.7.3). */
export type MapContext = {
	/** land fill (fill-rule evenodd); its edges along the clip rectangle are straight */
	land: string
	coast: string
	/** national borders (Natural Earth's default view; no disputed or indefinite lines) */
	borders: string
	/** province lines (China, Taiwan, Japan) */
	admin: string
	rivers: NamedPath[]
	lakes: NamedPath[]
}

/** An elevation label on an index contour: angle in degrees, (-90, 90], for rotate(angle). */
export type ContourLabel = { elev: number; x: number; y: number; angle: number }

/** A shared frame: locator · china-east · japan · yunnan · six-mountains (one projection). */
export type FrameJson = {
	id: string
	kind: "frame"
	space: "shared"
	bbox: [number, number, number, number]
	viewBox: Box
	zoom: number
	interval: number
	indexInterval: number
	members: string[]
	bands: Band[]
	contourLabels: ContourLabel[]
	context: MapContext
}

/**
 * One detail cell (plan §4.7.2): the footprint of a terrarium tile (`tile`, z10 or a z11 quarter of
 * one), contoured at the same interval as every other cell, so lines run on across cells. Paths
 * run a little past `viewBox` (the cell's exact rect): clip to it when drawing.
 */
export type CellJson = {
	id: string
	kind: "cell"
	space: "shared"
	tile: [number, number, number]
	/** the detail region (connected cells) it belongs to */
	region: string
	bbox: [number, number, number, number]
	viewBox: Box
	/** the terrain-tile zoom it was contoured from */
	zoom: number
	interval: number
	indexInterval: number
	bands: Band[]
	contourLabels: ContourLabel[]
	context: MapContext
}

/** public/maps/labels.json (plan §4.7.4), all positions in shared units */
export type LabelKind =
	| "country"
	| "sea"
	| "province"
	| "city"
	| "town"
	| "origin"
	| "lake"
	| "river"

export type MapLabel = {
	id: string
	kind: LabelKind
	name: string
	name_zh: string | null
	x: number
	y: number
	/** the lowest zoom tier (LABEL_TIERS) it may show at; lower = more important */
	rank: number
	/** degrees, (-90, 90], for rotate(angle) about (x, y); rivers only */
	angle?: number
}

/** Tier `rank` is active while the camera shows ≤ maxUnitsPerPx shared units per CSS px. */
export type LabelTier = {
	rank: number
	name: string
	maxUnitsPerPx: number | null
	viewKm: number
}

export type LabelsJson = { version: string; tiers: LabelTier[]; labels: MapLabel[] }

/** "Unknown Pleasures" ridgelines over the six-mountains frame, north row first. */
export type RidgesJson = {
	id: string
	bbox: [number, number, number, number]
	width: number
	height: number
	minElev: number
	maxElev: number
	rows: { lat: number; base: number; d: string }[]
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export type FrameId = "locator" | "china-east" | "japan" | "yunnan" | "six-mountains"

/**
 * An organic edge (plan §4.7.2): an 8-bit grayscale PNG (white shows the layer) stretched over
 * `rect` in shared units, `size` px.
 */
export type MaskMeta = { url: string; rect: Box; size: [number, number] }

export type FrameMeta = {
	id: FrameId
	url: string
	viewBox: Box
	zoom: number
	/** contour interval (m) */
	interval: number
	/** the organic edge it gives way through (null: its whole box, feathered) */
	mask: MaskMeta | null
}

type RawMask = { url: string; rect: number[]; size: number[] } | null

const maskOf = (m: RawMask | undefined): MaskMeta | null =>
	m ? { url: m.url, rect: m.rect as Box, size: m.size as [number, number] } : null

/** coarse → fine, the order layers stack in */
export const FRAMES: readonly FrameMeta[] = (
	manifest.frames as {
		id: string
		url: string
		viewBox: number[]
		zoom: number
		interval: number
		mask: RawMask
	}[]
)
	.map((f) => ({
		id: f.id as FrameId,
		url: f.url,
		viewBox: f.viewBox as Box,
		zoom: f.zoom,
		interval: f.interval,
		mask: maskOf(f.mask),
	}))
	.sort((a, b) => b.viewBox[2] - a.viewBox[2])

export const frameMeta = (id: FrameId) => FRAMES.find((f) => f.id === id)!

/**
 * The extent of the loaded data: the locator, the widest sheet, which holds every other. It is
 * the origins grown by half the widest view on every side (scripts/geo frames.mjs), so the camera
 * can keep any origin centred all the way out.
 */
export const DATA_EXTENT: Box = FRAMES[0].viewBox

/** manifest.camera (an older manifest has none: the widest view is then the locator) */
const rawCamera = (manifest as { camera?: { maxView: number[]; overview: number[] } }).camera

/**
 * The camera's widest view [w, h] in shared units (params CAMERA.maxView): a view of any aspect
 * fits inside it.
 */
export const MAX_VIEW: [number, number] = (rawCamera?.maxView as [number, number]) ?? [
	DATA_EXTENT[2],
	DATA_EXTENT[3],
]

/**
 * "East Asia": the origins and a few degrees around them (v2's locator box), what the minimap
 * shows and /origins zooms out to. The data runs on past it.
 */
export const OVERVIEW: Box = (rawCamera?.overview as Box) ?? DATA_EXTENT

const rawDetail = manifest.detail as {
	zoom: number
	dataZoom: number
	interval: number
	indexInterval: number
	cellUrl: string
	regions: { id: string; rect: number[]; mask: RawMask; members: string[] }[]
	cells: { id: string; region: string; rect: number[] }[]
}

/** One detail cell as the manifest lists it (its JSON loads when it comes into view). */
export type CellMeta = { id: string; region: string; url: string; rect: Box }

/** A connected group of detail cells and the organic edge they share. */
export type RegionMeta = {
	id: string
	rect: Box
	mask: MaskMeta
	/** the origins whose coverage made it */
	members: string[]
	cells: CellMeta[]
}

/** Every detail cell, by region, then row */
export const CELLS: readonly CellMeta[] = rawDetail.cells.map((c) => ({
	id: c.id,
	region: c.region,
	url: rawDetail.cellUrl.replace("{id}", c.id),
	rect: c.rect as Box,
}))

export const REGIONS: readonly RegionMeta[] = rawDetail.regions.map((r) => ({
	id: r.id,
	rect: r.rect as Box,
	mask: maskOf(r.mask)!,
	members: r.members,
	cells: CELLS.filter((c) => c.region === r.id),
}))

/** Detail contour interval (m), the same in every cell */
export const DETAIL_INTERVAL = rawDetail.interval

/** The side of a cell at its coarsest (one tile at the detail zoom), in shared units */
export const CELL_SIDE = (2 * Math.PI * manifest.projection.scale) / 2 ** rawDetail.zoom

/**
 * What the maps of one origin need before any terrain arrives (the per-origin index): where it
 * is, the square the camera frames it by, and the band elevations around it (the session's
 * highlighted line is the nearest of these).
 */
export type OriginDetail = {
	id: string
	/** the detail region its cells belong to */
	region: string | null
	/** shared units */
	point: Point
	/** the framing square's side (km) and in shared units, and the box itself */
	sideKm: number
	side: number
	box: Box
	/** shared units per km at the origin's latitude */
	unitsPerKm: number
	/** radius_km in shared units */
	radius: number
	precision: string
	confidence: string | null
	elevation_m: [number, number] | null
	/** detail band elevations (m) in the cells around it, ascending */
	elevations: number[]
}

/** Every origin with detail coverage, by slug order */
export const DETAILS: readonly OriginDetail[] = (
	manifest.details as {
		id: string
		region: string | null
		point: number[]
		sideKm: number
		unitsPerKm: number
		radius: number
		precision: string
		confidence: string | null
		elevation_m: number[] | null
		elevations: number[]
	}[]
).map((d) => {
	const side = d.sideKm * d.unitsPerKm
	const [x, y] = d.point
	return {
		id: d.id,
		region: d.region,
		point: d.point as Point,
		sideKm: d.sideKm,
		side,
		box: [x - side / 2, y - side / 2, side, side] as Box,
		unitsPerKm: d.unitsPerKm,
		radius: d.radius,
		precision: d.precision,
		confidence: d.confidence,
		elevation_m: d.elevation_m as [number, number] | null,
		elevations: d.elevations,
	}
})

export const LABELS_URL = manifest.labels?.url ?? null
export const LABEL_TIERS: readonly LabelTier[] = (manifest.labels?.tiers ?? []) as LabelTier[]

export const RIDGES_URL = manifest.ridges?.url ?? null
export const HANZI_FONT_URL = manifest.font?.url ?? null
export const MAP_ATTRIBUTION: readonly string[] = manifest.attribution

/** The shared Web Mercator (projection.ts); geo:test checks it against the pipeline's d3. */
export const SHARED = createMercator(manifest.projection as unknown as MercatorParams)

/**
 * Shared units per km at the projection's centre latitude (25°N). Mercator's scale grows with
 * latitude (≈ +2% at 22°N, −10% at 35°N): prefer `SHARED.unitsPerKm(lat)` or
 * `SHARED.unitsPerKmAtY(y)` for a scale bar.
 */
export const UNITS_PER_KM = SHARED.unitsPerKm(manifest.projection.center[1])

export const boxContains = ([x, y, w, h]: Box, [px, py]: Point) =>
	px >= x && px <= x + w && py >= y && py <= y + h

/** The finest shared frame whose view holds every point (null when none does). */
export function finestFrameFor(points: Point[]): FrameMeta | null {
	if (!points.length) return null
	for (let i = FRAMES.length - 1; i >= 0; i--) {
		const f = FRAMES[i]
		if (points.every((p) => boxContains(f.viewBox, p))) return f
	}
	return null
}

/** Whether two points can share one panning camera (plan §4.5: both inside the Yunnan frame). */
export const inYunnan = (p: Point) => boxContains(frameMeta("yunnan").viewBox, p)

// ---------------------------------------------------------------------------
// The shared projection, for points the pipeline never saw
// ---------------------------------------------------------------------------

/** lon/lat → shared units; identical to the pipeline's d3 geoMercator. */
export const projectShared = (lon: number, lat: number): Point => SHARED.forward(lon, lat)

/** shared units → [lon, lat] */
export const unprojectShared = (x: number, y: number): Point => SHARED.invert(x, y)

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

/** The box around points (with `pad` units on every side, and at least `min` wide/high). */
export function boundsOf(points: Point[], pad = 0, min = 0): Box {
	const xs = points.map((p) => p[0])
	const ys = points.map((p) => p[1])
	let x0 = Math.min(...xs) - pad
	let x1 = Math.max(...xs) + pad
	let y0 = Math.min(...ys) - pad
	let y1 = Math.max(...ys) + pad
	if (x1 - x0 < min) [x0, x1] = [(x0 + x1 - min) / 2, (x0 + x1 + min) / 2]
	if (y1 - y0 < min) [y0, y1] = [(y0 + y1 - min) / 2, (y0 + y1 + min) / 2]
	return [x0, y0, x1 - x0, y1 - y0]
}

/** Grow a box to the aspect (w / h) of the viewport it fills, keeping its center. */
export function fitAspect([x, y, w, h]: Box, aspect: number): Box {
	if (w / h > aspect) {
		const nh = w / aspect
		return [x, y - (nh - h) / 2, w, nh]
	}
	const nw = h * aspect
	return [x - (nw - w) / 2, y, nw, h]
}

/** Convex hull (monotone chain), counter-clockwise; fewer than 3 points come back as given. */
export function convexHull(points: Point[]): Point[] {
	const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
	if (pts.length < 3) return pts
	const cross = (o: Point, a: Point, b: Point) =>
		(a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
	const lower: Point[] = []
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
			lower.pop()
		lower.push(p)
	}
	const upper: Point[] = []
	for (let i = pts.length - 1; i >= 0; i--) {
		const p = pts[i]
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
			upper.pop()
		upper.push(p)
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

// ---------------------------------------------------------------------------
// Ink and labels
// ---------------------------------------------------------------------------

/** Map ground and the cream the line work is drawn in (plan §4.1). */
export const GROUND = "#121012"
/** Land is the ground; the sea sits a shade deeper and a touch cooler (plan §4.7.3). */
export const LAND = GROUND
export const SEA = "#0b0b0e"
export const CREAM = "#fff2ca"
/** Rivers, lakes, coast and water labels */
export const WATER = "rgb(160 188 214)"
export const EASE = [0.22, 1, 0.36, 1] as const
/** UI chrome spring (plan §3) */
export const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const
/** The camera is heavier than chrome: it travels, it doesn't snap. */
export const CAMERA_SPRING = { type: "spring", stiffness: 70, damping: 18, mass: 1 } as const

/** A liquor that still reads as a hairline ring on the dark ground (dark shou → lifted, same hue). */
export function ringInk(hex: string): string {
	const h = hex.replace("#", "")
	const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16)
	if (!Number.isFinite(n)) return hex
	const [r, g, b] = liftLiquor([(n >> 16) & 255, (n >> 8) & 255, n & 255] as RGB, 0.22)
	return `rgb(${r} ${g} ${b})`
}

export const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`
export const fmtLon = (lon: number) => `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`
export const fmtMeters = (m: number) => `${Math.round(m).toLocaleString("en-US")} m`

/** A round scale-bar length (km) whose bar lands near `targetPx`. */
export function niceKm(pxPerKm: number, targetPx = 56): number {
	const raw = targetPx / pxPerKm
	const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000]
	return steps.reduce((best, s) => (Math.abs(s - raw) < Math.abs(best - raw) ? s : best), steps[0])
}
