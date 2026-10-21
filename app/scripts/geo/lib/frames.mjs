/**
 * Step 1: map frames derived from the origins.
 *
 *   shared frames:  locator · china-east · japan · yunnan · six-mountains   (one projection)
 *   detail framing: per precise origin, the square the camera frames it by (cells: cells.mjs)
 */
import { round } from "./util.mjs"

const KM_PER_DEG = 111.195

/** lon/lat bbox [W, S, E, N] of a km circle */
function circleBBox(lon, lat, km) {
	const dLat = km / KM_PER_DEG
	const dLon = km / (KM_PER_DEG * Math.cos((lat * Math.PI) / 180))
	return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
}

function union(boxes) {
	return boxes.reduce(
		(a, b) => [
			Math.min(a[0], b[0]),
			Math.min(a[1], b[1]),
			Math.max(a[2], b[2]),
			Math.max(a[3], b[3]),
		],
		[Infinity, Infinity, -Infinity, -Infinity]
	)
}

function selects(origin, select) {
	if (!origin.geo) return false
	const precision = origin.geo.precision
	if (select.exclude?.includes(precision) || select.exclude?.includes(origin.kind)) return false
	if (select.precision && !select.precision.includes(precision)) return false
	if (select.within && !origin.ancestors.includes(select.within)) return false
	if (select.roots) {
		const root = origin.ancestors.length
			? origin.ancestors[origin.ancestors.length - 1]
			: origin.slug
		if (!select.roots.includes(root)) return false
	}
	return true
}

const roundBBox = (b) => b.map((v) => round(v, 3))

export function deriveFrames(origins, frameParams) {
	return frameParams.map((params) => {
		const members = origins.filter((o) => selects(o, params.select))
		if (!members.length) throw new Error(`frame ${params.id}: no origins match its selection`)
		const boxes = members.map((o) =>
			params.circles && o.geo.radius_km
				? circleBBox(o.geo.lon, o.geo.lat, o.geo.radius_km)
				: [o.geo.lon, o.geo.lat, o.geo.lon, o.geo.lat]
		)
		const [w, s, e, n] = union(boxes)
		return {
			...params,
			bbox: roundBBox([w - params.pad, s - params.pad, e + params.pad, n + params.pad]),
			members: members.map((o) => o.slug),
		}
	})
}

/**
 * Origins precise enough for detail coverage, with the square the camera frames them by (the
 * session panel, the hero): max(minSideKm, radius_km × 2 × areaPad), v2's patch size.
 */
export function deriveDetails(origins, detail) {
	const { minSideKm, areaPad } = detail.frame
	return origins
		.filter((o) => o.geo && detail.precision.includes(o.geo.precision) && o.kind !== "unknown")
		.map((o) => ({
			id: o.slug,
			origin: o,
			sideKm: round(Math.max(minSideKm, (o.geo.radius_km ?? 0) * 2 * areaPad), 3),
		}))
}
