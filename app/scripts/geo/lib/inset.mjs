/**
 * One per-origin inset (Properties › Provenance): a north-up azimuthal square centred
 * on the origin, contoured and emitted with context lines. Shared by `pnpm geo` and
 * the `geo:test` fixture so the snapshot covers the real emit path.
 */
import { frameContext } from "./context.mjs"
import { clipRect, insetProjection, makeProjection } from "./project.mjs"
import { renderTerrain } from "./render.mjs"
import { pixelWindow, pxToLat, pxToLon } from "./tiles.mjs"
import { round } from "./util.mjs"

/** Paths are clipped to the viewBox grown by this fraction, so clip edges never show */
export const CLIP_PAD = 0.02

/** The lon/lat box a pixel window actually covers (frame bbox + margin) */
export function windowBBox(win) {
	return [
		pxToLon(win.left, win.z),
		pxToLat(win.top + win.height, win.z),
		pxToLon(win.left + win.width, win.z),
		pxToLat(win.top, win.z),
	]
}

/** Footprint of the local square [-h, h]² in another projection → [x, y, w, h] */
function footprint(local, size, other) {
	const h = size / 2
	let x0 = Infinity
	let y0 = Infinity
	let x1 = -Infinity
	let y1 = -Infinity
	for (let i = 0; i <= 8; i++) {
		const t = -h + (size * i) / 8
		for (const p of [
			[t, -h],
			[t, h],
			[-h, t],
			[h, t],
		]) {
			const [x, y] = other(local.invert(p))
			x0 = Math.min(x0, x)
			y0 = Math.min(y0, y)
			x1 = Math.max(x1, x)
			y1 = Math.max(y1, y)
		}
	}
	return [round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)]
}

/**
 * @param {{
 *   id: string, lon: number, lat: number, sideKm: number, bbox: number[], zoom: number,
 *   origin: { precision: string, confidence: string|null, radius_km: number|null, elevation_m: number[]|null },
 *   params: { size: number, displayPx: number, blurSigma: number, intervals: number[], maxBands: number,
 *             indexEvery: number, simplify: number, rivers: number, lakes: number },
 *   margin: number, source: object, ctx: object, shared: (p: number[]) => number[],
 * }} opts
 */
export async function renderInset({
	id,
	lon,
	lat,
	sideKm,
	bbox,
	zoom,
	origin,
	params,
	margin,
	source,
	ctx,
	shared,
}) {
	const size = params.size
	const projection = insetProjection(lon, lat, sideKm, size)
	const local = makeProjection(projection)
	const project = (p) => local(p)
	const unitsPerKm = size / sideKm
	const unitsPerPx = size / params.displayPx
	const viewBox = [-size / 2, -size / 2, size, size]
	const clip = clipRect(viewBox, size * CLIP_PAD)
	const win = pixelWindow(bbox, zoom, margin)
	const { bands, interval, indexInterval } = await renderTerrain({
		bbox,
		zoom,
		margin,
		blurSigma: params.blurSigma,
		intervals: params.intervals,
		maxBands: params.maxBands,
		indexEvery: params.indexEvery,
		simplify: params.simplify,
		project,
		minArea: (unitsPerPx * 2) ** 2,
		clip,
		source,
	})
	const context = await frameContext(ctx, {
		bbox: windowBBox(win),
		clip,
		project,
		unitsPerPx,
		kmPerPx: sideKm / params.displayPx,
		rivers: params.rivers,
		lakes: params.lakes,
	})
	const [sx, sy] = shared([lon, lat])
	return {
		id,
		kind: "inset",
		space: "local",
		projection,
		bbox,
		viewBox,
		sideKm,
		unitsPerKm: round(unitsPerKm, 4),
		zoom,
		interval,
		indexInterval,
		origin: {
			precision: origin.precision,
			confidence: origin.confidence,
			point: [0, 0],
			radius: round((origin.radius_km ?? 0) * unitsPerKm, 1),
			elevation_m: origin.elevation_m,
		},
		// Where this inset sits in the shared projection, for panning between insets in one frame
		shared: { point: [round(sx, 1), round(sy, 1)], viewBox: footprint(local, size, shared) },
		elevations: bands.map((b) => b.elev),
		bands,
		context,
	}
}
