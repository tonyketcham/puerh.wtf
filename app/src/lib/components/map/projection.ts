/**
 * The maps' shared projection at runtime (plan §4.7.1): north-up Web Mercator, the same math as
 * d3-geo's geoMercator().rotate(rotate).center(center).scale(scale).translate(translate) that
 * scripts/geo builds every frame, detail patch and label with. No geo library, no imports:
 * `pnpm geo:test` transpiles this file and checks it against d3 (≤ 0.01 unit) and against the
 * control points in maps-manifest.json.
 *
 * Units: "shared units", y down. Units per km grow with latitude (scale ÷ (R · cos φ)), so a
 * distance on the map converts at the latitude where it is measured.
 */

export type LonLat = [lon: number, lat: number]
export type XY = [x: number, y: number]

/** The projection's parameters as maps-manifest.json `projection` stores them */
export type MercatorParams = {
	/** [λ, φ] degrees; only the λ rotation is supported (φ must be 0: the maps stay north-up) */
	rotate: readonly number[]
	/** [lon, lat] degrees, relative to the rotation, that lands on `translate` */
	center: readonly number[]
	scale: number
	translate: readonly number[]
}

export type SharedProjection = {
	/** lon/lat (degrees) → shared units */
	forward(lon: number, lat: number): XY
	/** shared units → lon/lat (degrees) */
	invert(x: number, y: number): LonLat
	/** shared units per km at a latitude */
	unitsPerKm(lat: number): number
	/** km → shared units at a latitude */
	kmToUnits(km: number, lat: number): number
	/** shared units → km at a latitude */
	unitsToKm(units: number, lat: number): number
	/** units per km at the latitude of a shared y (handy for a camera's view center) */
	unitsPerKmAtY(y: number): number
	readonly params: MercatorParams
}

/** Mean earth radius (km) of the sphere d3 projects onto */
export const EARTH_RADIUS_KM = 6371.0088

const PI = Math.PI
const TAU = 2 * PI
const HALF_PI = PI / 2
const RAD = PI / 180
const DEG = 180 / PI

/** d3's mercatorRaw y */
const mercY = (phi: number) => Math.log(Math.tan((HALF_PI + phi) / 2))

/** d3's longitude wrap after a rotation */
function wrap(lambda: number) {
	return Math.abs(lambda) > PI ? lambda - Math.round(lambda / TAU) * TAU : lambda
}

export function createMercator(params: MercatorParams): SharedProjection {
	if (params.rotate[1] || params.rotate[2])
		throw new Error("projection.ts: only a longitude rotation is supported")
	const k = params.scale
	const dLambda = params.rotate[0] * RAD
	const [tx, ty] = params.translate
	// d3 recenter(): the center (in rotated coordinates) maps to translate
	const cx = k * (params.center[0] * RAD)
	const cy = -k * mercY(params.center[1] * RAD)
	const dx = tx - cx
	const dy = ty - cy

	const unitsPerKm = (lat: number) => k / (EARTH_RADIUS_KM * Math.cos(lat * RAD))
	const proj: SharedProjection = {
		params,
		forward(lon, lat) {
			const lambda = wrap(lon * RAD + dLambda)
			return [dx + k * lambda, dy - k * mercY(lat * RAD)]
		},
		invert(x, y) {
			const lambda = wrap((x - dx) / k - dLambda)
			const phi = 2 * Math.atan(Math.exp((dy - y) / k)) - HALF_PI
			return [lambda * DEG, phi * DEG]
		},
		unitsPerKm,
		kmToUnits: (km, lat) => km * unitsPerKm(lat),
		unitsToKm: (units, lat) => units / unitsPerKm(lat),
		unitsPerKmAtY: (y) => unitsPerKm(proj.invert(0, y)[1]),
	}
	return proj
}
