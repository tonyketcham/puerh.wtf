/**
 * One detail cell (plan §4.7.2, v3): the footprint of a terrarium tile, contoured from finer tiles
 * on a grid with a margin around it, emitted with reference layers and elevation label anchors.
 * Every cell uses the same interval, blur and simplification, and judges speckle on whole rings,
 * so a line crossing into the next cell is the same line there; paths run a little past the rect
 * and the runtime clips each cell to its exact rect. Shared by `pnpm geo` and the `geo:test`
 * fixture so the snapshot covers the real emit path.
 */
import { cellId, cellRect, unitsPerKmAt } from "./cells.mjs"
import { frameContext } from "./context.mjs"
import { clipRect } from "./project.mjs"
import { renderTerrain } from "./render.mjs"
import { pxToLat, pxToLon } from "./tiles.mjs"
import { round } from "./util.mjs"

export { unitsPerKmAt }

/** Frame paths are clipped to the viewBox grown by this fraction, so clip edges never show */
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

/** The grid window of a cell: its tile at `dataZoom`, grown by `marginPx` on every side */
export function cellWindow({ z, x, y }, dataZoom, marginPx) {
	const size = 256 * 2 ** (dataZoom - z)
	return {
		z: dataZoom,
		left: x * size - marginPx,
		top: y * size - marginPx,
		width: size + 2 * marginPx,
		height: size + 2 * marginPx,
	}
}

/**
 * @param {{
 *   tile: { z: number, x: number, y: number }, region: string,
 *   params: { dataZoom: number, marginPx: number, clipPadKm: number, decimals: number,
 *             displayPx: number, blurSigma: number, interval: number, indexEvery: number,
 *             simplify: string|number, rivers: number, lakes: number, thinMaxUpp?: number, thinCoarse?: number },
 *   contextParams: { linePx: number, hardPx: number },
 *   labelParams: { perBand: number, areaPx: number, spacingPx: number, insetPx: number, minRunPx: number },
 *   has: (tile: { z: number, x: number, y: number }) => boolean,
 *   labelAccept?: (x: number, y: number) => boolean,
 *   scale: number, source: object, ctx: object, projection: Function,
 * }} opts
 */
export async function renderCell({
	tile,
	region,
	params,
	contextParams,
	labelParams,
	has,
	labelAccept = null,
	scale,
	source,
	ctx,
	projection,
}) {
	const { decimals } = params
	const rect = cellRect(tile, projection, decimals)
	const win = cellWindow(tile, params.dataZoom, params.marginPx)
	const bbox = windowBBox(win)
	const midLat = pxToLat(win.top + win.height / 2, win.z)
	const unitsPerKm = unitsPerKmAt(scale, midLat)
	const project = (p) => projection(p)
	const unitsPerPx = rect[2] / params.displayPx
	const clip = clipRect(rect, params.clipPadKm * unitsPerKm)
	const { bands, interval, indexInterval, contourLabels } = await renderTerrain({
		bbox,
		pixelWin: win,
		zoom: win.z,
		blurSigma: params.blurSigma,
		intervals: [params.interval],
		indexEvery: params.indexEvery,
		simplify: params.simplify,
		project,
		minArea: (unitsPerPx * 2) ** 2,
		areaBeforeClip: true,
		clip,
		decimals,
		viewBox: rect,
		displayPx: params.displayPx,
		labels: labelParams,
		labelAccept,
		has,
		thinMaxUpp: params.thinMaxUpp ?? null,
		thinCoarse: params.thinCoarse ?? 0,
		source,
	})
	const context = await frameContext(ctx, {
		bbox,
		clip,
		project,
		unitsPerPx,
		kmPerPx: rect[2] / unitsPerKm / params.displayPx,
		rivers: params.rivers,
		lakes: params.lakes,
		linePx: contextParams.linePx,
		hardPx: contextParams.hardPx,
		decimals,
	})
	return {
		id: cellId(tile),
		kind: "cell",
		space: "shared",
		tile: [tile.z, tile.x, tile.y],
		region,
		// the tile's own lon/lat box [W, S, E, N]
		bbox: [
			pxToLon(tile.x * 256, tile.z),
			pxToLat((tile.y + 1) * 256, tile.z),
			pxToLon((tile.x + 1) * 256, tile.z),
			pxToLat(tile.y * 256, tile.z),
		].map((v) => round(v, 5)),
		viewBox: rect,
		zoom: win.z,
		interval,
		indexInterval,
		bands,
		contourLabels,
		context,
	}
}
