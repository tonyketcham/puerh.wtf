/**
 * Placed origins as the maps draw them, from the build's origins.geo.json (scripts/geo): each
 * point already projected into the shared frame. Server-side only (the JSON is ~80 KB); pages
 * hand the slim list to the client maps.
 */
import geo from "@/generated/origins.geo.json"

export type MapPoint = {
	slug: string
	title: string
	hanzi: string | null
	pinyin: string | null
	kind: string
	/** what the point actually means (§4.1 marker) */
	precision: string
	radiusKm: number
	/** radius in shared units */
	r: number
	/** shared-projection position */
	x: number
	y: number
	lon: number
	lat: number
	/** typical garden range (m) */
	elevation: [number, number] | null
	parent: string | null
	/** nearest first */
	ancestors: string[]
	/** a detail patch exists for it (the finest LOD layer) */
	detail: boolean
}

type Feature = {
	id: string
	properties: {
		slug: string
		role?: string
		title?: string
		hanzi?: string | null
		pinyin?: string | null
		kind?: string
		precision?: string
		radius_km?: number | null
		elevation_m?: [number, number] | null
		parent?: string | null
		ancestors?: string[]
		shared?: { x: number; y: number; r: number }
		detail?: string | null
	}
	geometry: { type: string; coordinates: unknown }
}

let cache: MapPoint[] | null = null

/** Every placed origin (points only, not their area polygons), by slug order. */
export function getMapPoints(): MapPoint[] {
	if (cache) return cache
	const out: MapPoint[] = []
	for (const f of (geo as { features: Feature[] }).features) {
		const p = f.properties
		if (p.role || !p.shared || f.geometry.type !== "Point") continue
		const [lon, lat] = f.geometry.coordinates as [number, number]
		out.push({
			slug: p.slug,
			title: p.title ?? p.slug,
			hanzi: p.hanzi ?? null,
			pinyin: p.pinyin ?? null,
			kind: p.kind ?? "unknown",
			precision: p.precision ?? "unknown",
			radiusKm: p.radius_km ?? 0,
			r: p.shared.r,
			x: p.shared.x,
			y: p.shared.y,
			lon,
			lat,
			elevation: p.elevation_m ?? null,
			parent: p.parent ?? null,
			ancestors: p.ancestors ?? [],
			detail: !!p.detail,
		})
	}
	cache = out
	return out
}
