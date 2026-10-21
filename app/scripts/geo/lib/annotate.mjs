/**
 * Label anchors computed from geometry (plan §4.7.4), pure and deterministic so geo:test can
 * cover them:
 *
 *   contourLabels  elevation labels on index contours: { elev, x, y, angle }
 *   riverAnchors   name anchors along rivers, several per long river: { name, name_zh, x, y, rank, angle }
 *
 * Angles are degrees in SVG's frame (x right, y down; positive turns clockwise), normalized to
 * (-90, 90] so text drawn with rotate(angle) never reads upside down.
 */
import { round } from "./util.mjs"

/** Fold a direction (degrees) into (-90, 90] */
export function uprightAngle(deg) {
	let a = deg
	while (a > 90) a -= 180
	while (a <= -90) a += 180
	return round(a, 1)
}

const angleOf = (dx, dy) => uprightAngle((Math.atan2(dy, dx) * 180) / Math.PI)

/**
 * Elevation label anchors on index contours, at the midpoints of long straight edges.
 *
 * Rings are the quantized rings a band path was written from (integers of 10^-decimals units).
 * The closed B-spline of a band passes exactly through each edge midpoint, tangent to the edge,
 * so an anchor there sits on the drawn line, aligned with it. Edges touching a clip-made vertex
 * are skipped (they run along the frame edge).
 *
 * @param {{ elev: number, rings: number[][][] }[]} indexBands
 * @param {number[]} viewBox [x, y, w, h] in units
 * @param {{ perBand: number, areaPx: number, spacingPx: number, insetPx: number, minRunPx: number }} params
 * @param {number} unitsPerPx units per display px
 * @param {(x: number, y: number) => boolean} [accept] where an anchor may go (a detail cell: only
 *   where its mask shows)
 * @returns {{ elev: number, x: number, y: number, angle: number }[]} sorted by elev, x, y
 */
export function contourLabels(
	indexBands,
	viewBox,
	params,
	unitsPerPx,
	decimals = 1,
	accept = null
) {
	const scale = 10 ** decimals
	const [vx, vy, vw, vh] = viewBox
	const spacing = params.spacingPx * unitsPerPx
	const inset = params.insetPx * unitsPerPx
	const minRun = params.minRunPx * unitsPerPx
	const perBand = Math.max(
		params.perBand,
		Math.round((params.perBand * (vw * vh)) / (params.areaPx * unitsPerPx) ** 2)
	)
	const x0 = vx + inset
	const x1 = vx + vw - inset
	const y0 = vy + inset
	const y1 = vy + vh - inset

	const candidates = []
	for (const { elev, rings } of indexBands) {
		for (const ring of rings) {
			const n = ring.length
			for (let i = 0; i < n; i++) {
				const a = ring[i]
				const b = ring[(i + 1) % n]
				if (a[2] || b[2]) continue
				const dx = b[0] - a[0]
				const dy = b[1] - a[1]
				const len = Math.hypot(dx, dy) / scale
				if (len < minRun) continue
				// the spline's on-curve point: the same rounded midpoint splineSubpath writes
				const x = Math.round((a[0] + b[0]) / 2) / scale
				const y = Math.round((a[1] + b[1]) / 2) / scale
				if (x < x0 || x > x1 || y < y0 || y > y1) continue
				if (accept && !accept(x, y)) continue
				candidates.push({ elev, x, y, angle: angleOf(dx, dy), len })
			}
		}
	}
	candidates.sort((p, q) => q.len - p.len || p.elev - q.elev || p.x - q.x || p.y - q.y)

	const taken = []
	const count = new Map()
	for (const c of candidates) {
		if ((count.get(c.elev) ?? 0) >= perBand) continue
		if (taken.some((t) => Math.hypot(t.x - c.x, t.y - c.y) < spacing)) continue
		taken.push(c)
		count.set(c.elev, (count.get(c.elev) ?? 0) + 1)
	}
	return taken
		.map((c) => ({
			elev: c.elev,
			x: round(c.x, decimals),
			y: round(c.y, decimals),
			angle: c.angle,
		}))
		.sort((p, q) => p.elev - q.elev || p.x - q.x || p.y - q.y)
}

/** First [max, rank] pair whose max ≥ value */
export const rankBy = (pairs, value) => (pairs.find(([max]) => value <= max) ?? pairs.at(-1))[1]

/** Chain polylines (projected [x, y] arrays) whose ends meet within `tolerance` units */
export function chainLines(lines, tolerance) {
	const pieces = lines.filter((l) => l.length > 1).map((l) => [...l])
	const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance
	const chains = []
	while (pieces.length) {
		let chain = pieces.shift()
		let grew = true
		while (grew) {
			grew = false
			for (let i = 0; i < pieces.length; i++) {
				const p = pieces[i]
				const head = chain[0]
				const tail = chain[chain.length - 1]
				if (near(tail, p[0])) chain = chain.concat(p.slice(1))
				else if (near(tail, p[p.length - 1])) chain = chain.concat([...p].reverse().slice(1))
				else if (near(head, p[p.length - 1])) chain = p.slice(0, -1).concat(chain)
				else if (near(head, p[0])) chain = [...p].reverse().slice(0, -1).concat(chain)
				else continue
				pieces.splice(i, 1)
				grew = true
				break
			}
		}
		chains.push(chain)
	}
	return chains
}

/** The point at arc length `s` along a polyline with cumulative lengths `cum` */
function pointAt(line, cum, s) {
	const total = cum[cum.length - 1]
	const t = Math.min(Math.max(s, 0), total)
	let i = 1
	while (i < cum.length - 1 && cum[i] < t) i++
	const seg = cum[i] - cum[i - 1] || 1
	const f = (t - cum[i - 1]) / seg
	const a = line[i - 1]
	const b = line[i]
	return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}

/**
 * Name anchors along rivers, nested by zoom tier: each tier adds anchors every
 * `spacingPx × maxUnitsPerPx(tier)` units, skipping spots a coarser tier already covers, so any
 * view of a long river holds a name or two. A river shorter than its first spacing gets one
 * anchor at its middle.
 *
 * @param {{ name: string, name_zh: string, rank: number, lines: number[][][] }[]} rivers
 *   one entry per named river; `lines` already projected to units; `rank` is its first tier
 * @param {{ rank: number, maxUnitsPerPx: number|null }[]} tiers
 * @param {{ spacingPx: number, chordPx: number, joinUnits: number, maxRank: number }} params
 * @param {(p: number[], rank: number) => boolean} inside keeps anchors within the label area
 */
export function riverAnchors(rivers, tiers, params, inside = () => true) {
	const out = []
	for (const river of rivers) {
		const chains = chainLines(river.lines, params.joinUnits)
		for (const line of chains) {
			const cum = [0]
			for (let i = 1; i < line.length; i++)
				cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]))
			const total = cum[cum.length - 1]
			if (!(total > 0)) continue
			const placed = []
			for (let rank = Math.max(1, river.rank); rank <= params.maxRank; rank++) {
				const upp = tiers.find((t) => t.rank === rank)?.maxUnitsPerPx
				if (!upp) continue
				const spacing = upp * params.spacingPx
				const chord = upp * params.chordPx
				const spots = []
				if (total < spacing) {
					if (rank === Math.max(1, river.rank)) spots.push(total / 2)
				} else {
					for (let s = spacing / 2; s < total; s += spacing) spots.push(s)
				}
				for (const s of spots) {
					if (placed.some((p) => Math.abs(p - s) < spacing / 2)) continue
					placed.push(s)
					const [x, y] = pointAt(line, cum, s)
					if (!inside([x, y], rank)) continue
					const a = pointAt(line, cum, s - chord / 2)
					const b = pointAt(line, cum, s + chord / 2)
					out.push({
						name: river.name,
						name_zh: river.name_zh,
						x: round(x, 1),
						y: round(y, 1),
						rank,
						angle: angleOf(b[0] - a[0], b[1] - a[1]),
					})
				}
			}
		}
	}
	return out
}
