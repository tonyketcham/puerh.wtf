/**
 * The pure pipeline core shared by `pnpm geo` and `pnpm geo:test`:
 * window → stitch → blur → contour → simplify → project → path strings.
 */
import { contourGrid, thresholdsFor } from "./contour.mjs"
import { blur, extent, sample, stitch } from "./grid.mjs"
import { quantize, subpath, polygonsPath } from "./project.mjs"
import { latToPx, lonToPx, pixelWindow } from "./tiles.mjs"
import { round } from "./util.mjs"

/**
 * `intervals` lists candidate contour intervals, finest first; the finest that yields at
 * most `maxBands` bands wins, so steep insets stay legible (and within budget).
 * Every `indexEvery`-th contour is an index line. `clip` is the padded viewBox ([x0, y0, x1, y1]).
 * @returns {Promise<{ raw, grid, interval: number, indexInterval: number, bands: { elev: number, index: boolean, d: string }[] }>}
 */
export async function renderTerrain({
	bbox,
	zoom,
	margin,
	blurSigma,
	intervals,
	maxBands = Infinity,
	indexEvery,
	simplify,
	project,
	minArea,
	clip = null,
	curve = true,
	source,
}) {
	const win = pixelWindow(bbox, zoom, margin)
	const raw = await stitch(win, source)
	const grid = blur(raw, blurSigma)
	const interval =
		intervals.find((iv) => thresholdsFor(grid.values, iv).length <= maxBands) ??
		intervals[intervals.length - 1]
	const indexInterval = interval * indexEvery
	const contours = await contourGrid(grid, { interval, simplify })
	const bands = contours
		.map(({ elev, polygons }) => ({
			elev,
			index: elev % indexInterval === 0,
			d: polygonsPath(polygons, project, { minArea, clip, curve }),
		}))
		.filter((b) => b.d)
	return { raw, grid, interval, indexInterval, bands }
}

/**
 * "Unknown Pleasures" ridgelines: stacked W→E elevation profiles, north row first
 * (furthest back). The renderer fills each row with the ground color down to `base`
 * to occlude the rows behind it.
 */
export function renderRidges(rawGrid, bbox, params) {
	const grid = blur(rawGrid, params.blurSigma)
	const [w, s, e, n] = bbox
	const z = grid.z
	const { rows, samples, width, spacing, amplitude, taper } = params
	const lift = spacing * amplitude
	// Fade relief to flat at both ends, like the stacked pulsar plots the hero borrows from.
	const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
	const envelope = (u) => smooth(u / taper) * smooth((1 - u) / taper)
	const profiles = []
	for (let r = 0; r < rows; r++) {
		const lat = n - ((n - s) * r) / (rows - 1)
		const gy = latToPx(lat, z)
		const elevs = []
		for (let i = 0; i < samples; i++) {
			const lon = w + ((e - w) * i) / (samples - 1)
			elevs.push(sample(grid, lonToPx(lon, z), gy))
		}
		profiles.push({ lat, elevs })
	}
	const [min, max] = extent(profiles.flatMap((p) => p.elevs))
	const span = Math.max(1, max - min)
	const top = lift + spacing
	const out = profiles.map(({ lat, elevs }, r) => {
		const base = top + r * spacing
		const pts = elevs.map((h, i) => {
			const u = i / (samples - 1)
			return [width * u, base - ((h - min) / span) * lift * envelope(u)]
		})
		const q = quantize(pts, (p) => p)
		return { lat: round(lat, 5), base: round(base, 1), d: subpath(q, false) }
	})
	return {
		width,
		height: round(top + (rows - 1) * spacing + spacing, 1),
		minElev: Math.round(min),
		maxElev: Math.round(max),
		rows: out,
	}
}
