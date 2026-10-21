/**
 * Coverage-tiled detail (plan §4.7.2, v3): the finest LOD layer as a grid of cells instead of one
 * square per origin.
 *
 *   coverage  every origin precise enough contributes a disk of R = min(radius_km, capKm) + padKm
 *   cells     the footprints of terrarium tiles at `zoom` that meet a disk. In the shared Web
 *             Mercator a tile footprint is an axis-aligned rectangle, and neighbours share edges
 *             exactly, so the runtime can clip each cell to its own rect and the seams vanish.
 *   regions   connected groups of cells (8-neighbour), each with one organic edge mask (masks.mjs)
 *
 * Pure and deterministic: geo:test covers it through the fixture.
 */
import { EARTH_KM } from "./project.mjs"
import { pxToLat, pxToLon } from "./tiles.mjs"
import { round } from "./util.mjs"

/** Shared units per km at a latitude (Mercator: scale ÷ (R · cos φ)) */
export const unitsPerKmAt = (scale, lat) => scale / (EARTH_KM * Math.cos((lat * Math.PI) / 180))

export const cellId = ({ z, x, y }) => `${z}-${x}-${y}`

/**
 * The shared-unit rect of tile {z, x, y}: [x, y, w, h], each edge rounded to `decimals` from the
 * tile's own edge coordinate, so two neighbours compute the same number for the edge they share.
 */
export function cellRect({ z, x, y }, projection, decimals) {
	const edgeX = (tx) => round(projection([pxToLon(tx * 256, z), 0])[0], decimals)
	const edgeY = (ty) => round(projection([0, pxToLat(ty * 256, z)])[1], decimals)
	const x0 = edgeX(x)
	const x1 = edgeX(x + 1)
	const y0 = edgeY(y)
	const y1 = edgeY(y + 1)
	return [x0, y0, round(x1 - x0, decimals), round(y1 - y0, decimals)]
}

/**
 * Coverage disks, by slug: { slug, origin, lon, lat, km, point: [x, y], r } (r in shared units).
 * @param {{ precision: string[], capKm: number, padKm: number }} coverage
 */
export function coverageDisks(origins, coverage, projection, scale) {
	return origins
		.filter((o) => o.geo && coverage.precision.includes(o.geo.precision) && o.kind !== "unknown")
		.map((o) => {
			const km = Math.min(o.geo.radius_km ?? 0, coverage.capKm) + coverage.padKm
			const point = projection([o.geo.lon, o.geo.lat])
			return {
				slug: o.slug,
				origin: o,
				lon: o.geo.lon,
				lat: o.geo.lat,
				km,
				point,
				r: km * unitsPerKmAt(scale, o.geo.lat),
			}
		})
}

/** Squared distance from a point to a rect [x, y, w, h] (0 inside) */
export function rectDist2([x, y, w, h], [px, py]) {
	const dx = Math.max(x - px, 0, px - (x + w))
	const dy = Math.max(y - py, 0, py - (y + h))
	return dx * dx + dy * dy
}

/**
 * The tiles at `z` whose footprint meets any disk (in shared units; Mercator is conformal, so a
 * disk of a few tens of km is a circle there to well under a pixel). Sorted by y, then x.
 */
export function deriveCells(disks, z, projection, decimals) {
	const keys = new Map()
	const n = 2 ** z
	for (const d of disks) {
		const [px, py] = d.point
		// the tile range of the disk's box, found from its lon/lat corners
		const [w, nlat] = projection.invert([px - d.r, py - d.r])
		const [e, s] = projection.invert([px + d.r, py + d.r])
		const tx0 = Math.floor(((w + 180) / 360) * n)
		const tx1 = Math.floor(((e + 180) / 360) * n)
		const ty = (lat) => {
			const sn = Math.sin((lat * Math.PI) / 180)
			return Math.floor((0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * n)
		}
		for (let y = ty(nlat); y <= ty(s); y++) {
			for (let x = tx0; x <= tx1; x++) {
				const tile = { z, x, y }
				const id = cellId(tile)
				if (keys.has(id)) {
					keys.get(id).disks.add(d.slug)
					continue
				}
				const rect = cellRect(tile, projection, decimals)
				if (rectDist2(rect, d.point) >= d.r * d.r) continue
				keys.set(id, { id, tile, rect, disks: new Set([d.slug]) })
			}
		}
	}
	// a disk may meet a tile first found through another disk without being tested against it
	for (const cell of keys.values()) {
		for (const d of disks) {
			if (!cell.disks.has(d.slug) && rectDist2(cell.rect, d.point) < d.r * d.r)
				cell.disks.add(d.slug)
		}
	}
	return [...keys.values()]
		.map((c) => ({ ...c, disks: [...c.disks].sort() }))
		.sort((a, b) => a.tile.y - b.tile.y || a.tile.x - b.tile.x)
}

/**
 * Connected groups of cells (8-neighbour), each with the disks that touch it. A region is named
 * after its widest disk (ties by slug), e.g. the Xishuangbanna cluster after Mengla.
 * @returns {{ id: string, cells: object[], disks: object[], rect: number[] }[]} sorted by id
 */
export function deriveRegions(cells, disks) {
	const byKey = new Map(cells.map((c) => [`${c.tile.x},${c.tile.y}`, c]))
	const seen = new Set()
	const bySlug = new Map(disks.map((d) => [d.slug, d]))
	const regions = []
	for (const start of cells) {
		if (seen.has(start.id)) continue
		const group = []
		const stack = [start]
		seen.add(start.id)
		while (stack.length) {
			const c = stack.pop()
			group.push(c)
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					const nb = byKey.get(`${c.tile.x + dx},${c.tile.y + dy}`)
					if (nb && !seen.has(nb.id)) {
						seen.add(nb.id)
						stack.push(nb)
					}
				}
		}
		group.sort((a, b) => a.tile.y - b.tile.y || a.tile.x - b.tile.x)
		const slugs = [...new Set(group.flatMap((c) => c.disks))].sort()
		const members = slugs.map((s) => bySlug.get(s))
		const widest = [...members].sort((a, b) => b.km - a.km || (a.slug < b.slug ? -1 : 1))[0]
		let x0 = Infinity
		let y0 = Infinity
		let x1 = -Infinity
		let y1 = -Infinity
		for (const c of group) {
			const [x, y, w, h] = c.rect
			x0 = Math.min(x0, x)
			y0 = Math.min(y0, y)
			x1 = Math.max(x1, x + w)
			y1 = Math.max(y1, y + h)
		}
		regions.push({
			id: widest.slug,
			cells: group,
			disks: members,
			rect: [x0, y0, x1 - x0, y1 - y0].map((v) => round(v, 2)),
		})
	}
	return regions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
