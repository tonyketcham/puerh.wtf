/**
 * Steps 4–5: d3-contour on the blurred grid, then mapshaper simplification.
 *
 * Each threshold yields the MultiPolygon of "ground at or above elev". Those nested
 * band polygons are what the renderer needs: stroking one draws the contour line,
 * and filling/clipping by it gives Tanaka's light and dark offset strokes (plan §4.1).
 */
import { contours } from "d3-contour"
import mapshaper from "mapshaper"
import { extent } from "./grid.mjs"
import { pxToLat, pxToLon } from "./tiles.mjs"

export function thresholdsFor(values, interval) {
	const [min, max] = extent(values)
	const out = []
	for (let t = Math.max(interval, Math.ceil(min / interval) * interval); t < max; t += interval)
		out.push(t)
	return out
}

/**
 * Contour → simplify → lon/lat.
 * @returns {Promise<{ elev: number, polygons: number[][][][] }[]>} sorted by elev
 */
export async function contourGrid(grid, { interval, simplify }) {
	const { width, height, values, left, top, z } = grid
	const thresholds = thresholdsFor(values, interval)
	if (!thresholds.length) return []
	const generator = contours().size([width, height]).thresholds(thresholds)
	const features = generator(values)
		.filter((mp) => mp.coordinates.length)
		.map((mp) => ({
			type: "Feature",
			properties: { elev: mp.value },
			geometry: { type: "MultiPolygon", coordinates: mp.coordinates },
		}))
	if (!features.length) return []

	// Simplify in grid (pixel) space so the tolerance means the same thing at every zoom.
	const input = JSON.stringify({ type: "FeatureCollection", features })
	const out = await mapshaper.applyCommands(
		`-i bands.json -simplify ${
			typeof simplify === "string" ? simplify : `weighted percentage=${simplify * 100}%`
		} keep-shapes planar -o format=geojson bands.json`,
		{ "bands.json": input }
	)
	const simplified = JSON.parse(String(out["bands.json"]))

	const toLonLat = ([x, y]) => [pxToLon(left + x, z), pxToLat(top + y, z)]
	return simplified.features
		.filter((f) => f.geometry)
		.map((f) => {
			const g = f.geometry
			const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates
			return {
				elev: f.properties.elev,
				polygons: polys.map((poly) => poly.map((ring) => ring.map(toLonLat))),
			}
		})
		.sort((a, b) => a.elev - b.elev)
}
