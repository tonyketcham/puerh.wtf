/**
 * The client side of the origin maps (plan §4.3–§4.5): types for the precomputed JSON in
 * public/maps, the committed manifest, and the little arithmetic the renderers need.
 *
 * There is no runtime geo library. Everything is already projected at build time (scripts/geo):
 * shared frames sit in one conic equal-area projection, insets in their own north-up azimuthal
 * square. The only projection done here is `projectShared`, the same conic as a few lines of
 * trig, for points the pipeline doesn't know (vendor cities for the supply-lines layer).
 */
import manifest from "@/generated/maps-manifest.json"
import { liftLiquor, type RGB } from "@/lib/liquor"

// ---------------------------------------------------------------------------
// JSON shapes (scripts/geo/build.mjs)
// ---------------------------------------------------------------------------

/** [x, y, width, height] in projected units */
export type Box = [number, number, number, number]
export type Point = [number, number]

/** One contour band: the closed outline of the ground at or above `elev` (fill-rule evenodd). */
export type Band = { elev: number; index: boolean; d: string }

export type NamedPath = { name?: string | null; name_zh?: string | null; d: string }

export type MapContext = {
	coast: string
	/** province outlines (never national borders) */
	admin: string
	rivers: NamedPath[]
	lakes: NamedPath[]
}

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
	context: MapContext
}

/** A per-origin inset: a north-up azimuthal square of `sideKm`, the origin at [0, 0]. */
export type InsetJson = {
	id: string
	kind: "inset"
	space: "local"
	projection: { type: string; rotate: [number, number]; scale: number; translate: Point }
	bbox: [number, number, number, number]
	viewBox: Box
	sideKm: number
	unitsPerKm: number
	zoom: number
	interval: number
	indexInterval: number
	origin: {
		precision: string
		confidence: string | null
		point: Point
		/** radius_km in local units */
		radius: number
		elevation_m: [number, number] | null
	}
	/** where the square sits in the shared projection (for panning between insets) */
	shared: { point: Point; viewBox: Box }
	elevations: number[]
	bands: Band[]
	context: MapContext
}

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

export type FrameMeta = { id: FrameId; url: string; viewBox: Box; zoom: number }

/** coarse → fine, the order layers stack in */
export const FRAMES: readonly FrameMeta[] = (
	manifest.frames as { id: string; url: string; viewBox: number[]; zoom: number }[]
)
	.map((f) => ({ id: f.id as FrameId, url: f.url, viewBox: f.viewBox as Box, zoom: f.zoom }))
	.sort((a, b) => b.viewBox[2] - a.viewBox[2])

export const frameMeta = (id: FrameId) => FRAMES.find((f) => f.id === id)!

const INSET_URLS = new Map(
	(manifest.insets as { id: string; url: string }[]).map((i) => [i.id, i.url] as const)
)

/** The inset JSON for an origin, or null when it isn't precise enough to have one. */
export const insetUrl = (slug: string | null | undefined) => (slug && INSET_URLS.get(slug)) || null

export const RIDGES_URL = manifest.ridges?.url ?? null
export const HANZI_FONT_URL = manifest.font?.url ?? null
export const MAP_ATTRIBUTION: readonly string[] = manifest.attribution

/** Shared-projection units per kilometre (scale ÷ earth radius; equal-area, so true to ~2%). */
export const UNITS_PER_KM = manifest.projection.scale / 6371.0088

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

const RAD = Math.PI / 180
const P = manifest.projection as unknown as {
	parallels: [number, number]
	rotate: [number, number]
	center: [number, number]
	scale: number
	translate: Point
}
const SIN0 = Math.sin(P.parallels[0] * RAD)
const N = (SIN0 + Math.sin(P.parallels[1] * RAD)) / 2
const C = 1 + SIN0 * (2 * N - SIN0)
const R0 = Math.sqrt(C) / N
function conicRaw(lambda: number, phi: number): Point {
	const r = Math.sqrt(C - 2 * N * Math.sin(phi)) / N
	return [r * Math.sin(lambda * N), R0 - r * Math.cos(lambda * N)]
}
const CENTER = conicRaw(P.center[0] * RAD, P.center[1] * RAD)

/** lon/lat → shared units; identical to d3's geoConicEqualArea with the manifest's parameters. */
export function projectShared(lon: number, lat: number): Point {
	let l = lon + P.rotate[0]
	l = ((((l + 180) % 360) + 360) % 360) - 180
	const [x, y] = conicRaw(l * RAD, lat * RAD)
	return [P.translate[0] + P.scale * (x - CENTER[0]), P.translate[1] - P.scale * (y - CENTER[1])]
}

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
export const CREAM = "#fff2ca"
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
	const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000]
	return steps.reduce((best, s) => (Math.abs(s - raw) < Math.abs(best - raw) ? s : best), steps[0])
}

/** lon/lat of an inset's center (the azimuthal projection is rotated onto it). */
export const insetLonLat = (inset: InsetJson): Point => [
	-inset.projection.rotate[0],
	-inset.projection.rotate[1],
]
