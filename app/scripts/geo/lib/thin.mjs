/**
 * Cartographic contour thinning (plan §4.7, "thinning"): where intermediate contours bunch on a
 * steep slope, the runtime leaves stretches of them unstroked, as a cartographer would, and the
 * index contours carry the structure. This module works out, for every stretch of every
 * intermediate ring, the coarsest zoom at which it may still be stroked.
 *
 * Ranks, per sheet (its interval I and index interval X):
 *   index    elev % X = 0          never thinned
 *   rank 1   elev % 2I = 0         its lattice: the multiples of 2I and of X
 *   rank 2   the rest              its lattice: every contour
 * A line's spacing to its neighbours in its own lattice is gap ÷ |∇h|, where gap is the elevation
 * step to the nearer of its two lattice neighbours and |∇h| the slope of the (blurred) DEM the
 * contours were traced from, sampled where each spline segment's curve passes. It may show while
 * that spacing is at least MIN_PX on screen, i.e. while units-per-px ≤ spacing ÷ MIN_PX.
 * A rank-1 line's gap is never smaller than a rank-2 line's, so rank 2 goes first.
 *
 * Output, per band (`thin`, intermediates only; absent when nothing of it ever thins): a code per
 * ring, in the order of the rings in `d`, joined by ",". A ring's code is runs of
 * `<tier letter><segments>` over its spline segments (one per control vertex, the hard clip
 * vertices doubled, exactly as `splineSubpath` writes them), the last run's count left out; an
 * empty code is a ring that never thins at the sheet's zooms. Tier letter `a` + k means
 * maxUpp ≈ 2^(k + TIER_MIN) shared units per CSS px (rounded in log2). `*` and a letter: every
 * ring of the band at that one tier (the coarsest fallback, `coarse` ≥ BAND_AT).
 */
import { sample } from "./grid.mjs"
import { pxToLat, pxToLon } from "./tiles.mjs"

/** on-screen spacing (CSS px) under which a stretch of intermediate contour gives way */
export const MIN_PX = 3
/** log2 of the finest tier ('a'); anything finer is clamped to it */
export const TIER_MIN = -8
/** runs shorter than this many segments merge into a neighbour */
const MIN_RUN = 4
/** smoothing window along the ring (segments each side), in log2 space */
const SMOOTH = 3
/** tiers kept below the sheet's coarsest: finer ones would only matter closer than any view */
const SPAN = 6
/** from this `coarse` on, one tier per band (the median of its segments') */
const BAND_AT = 4
/** rings of fewer segments take one tier throughout (their mean) */
const SHORT_RING = 12

/** The elevation step from `elev` to its nearer neighbour in its own lattice, or null for index */
export function latticeGap(elev, interval, indexInterval) {
	if (elev % indexInterval === 0) return null
	if (elev % (2 * interval) !== 0) return interval
	const step = (m) => {
		const below = Math.floor((elev - 1) / m) * m
		const above = Math.ceil((elev + 1) / m) * m
		return [below, above]
	}
	const [b2, a2] = step(2 * interval)
	const [bx, ax] = step(indexInterval)
	return Math.min(elev - Math.max(b2, bx), Math.min(a2, ax) - elev)
}

/**
 * The thinning context of a grid: shared units ↔ grid px (both are Web Mercator here, so the map
 * is affine) and the DEM slope in metres per shared unit at a point.
 */
export function thinContext(grid, project) {
	const { left, top, width, height, z } = grid
	const p0 = project([pxToLon(left, z), pxToLat(top, z)])
	const p1 = project([pxToLon(left + width, z), pxToLat(top + height, z)])
	const sx = width / (p1[0] - p0[0])
	const sy = height / (p1[1] - p0[1])
	const unitsPerPx = 1 / Math.abs(sx)
	return {
		/** |∇h| in metres per shared unit at (ux, uy) */
		slope(ux, uy) {
			const gx = left + (ux - p0[0]) * sx
			const gy = top + (uy - p0[1]) * sy
			const dx = (sample(grid, gx + 1, gy) - sample(grid, gx - 1, gy)) / 2
			const dy = (sample(grid, gx, gy + 1) - sample(grid, gx, gy - 1)) / 2
			return Math.hypot(dx, dy) / unitsPerPx
		},
	}
}

/**
 * One band's code (see above), or null when none of its rings ever thins below `tierMax`.
 * @param {number[][][]} rings quantized rings (integers of 10^-decimals units, [x, y, hard?])
 * @param {number} gap the band's lattice gap (m)
 * @param {number} tierMax log2 of the coarsest units-per-px the sheet is drawn at: a stretch whose
 *   tier reaches it shows at every zoom of the sheet
 * @param {number} coarse 0, or more for longer runs and wider smoothing (each step doubles the
 *   shortest run): a cell that can't be split any further uses it to stay within its budget
 */
export function thinBand(rings, gap, ctx, decimals, tierMax, coarse = 0) {
	const minRun = MIN_RUN << coarse
	const smoothW = SMOOTH + 2 * coarse
	const f = 10 ** -decimals
	const codes = []
	const all = []
	let any = false
	for (const ring of rings) {
		// the segments as splineSubpath writes them: one per control vertex, hard ones doubled
		const q = ring.flatMap((p) => (p[2] ? [p, p] : [p]))
		const n = q.length
		const tau = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			const a = q[(i - 1 + n) % n]
			const b = q[i]
			const c = q[(i + 1) % n]
			// where the curve passes: the midpoint of segment i
			const ux = ((a[0] + 6 * b[0] + c[0]) / 8) * f
			const uy = ((a[1] + 6 * b[1] + c[1]) / 8) * f
			const s = ctx.slope(ux, uy)
			// spacing in units ÷ MIN_PX = the coarsest units-per-px it may show at
			tau[i] = s > 1e-9 ? Math.log2(gap / s / MIN_PX) : 99
		}
		const smooth = new Float64Array(n)
		const w = Math.min(smoothW, Math.floor((n - 1) / 2))
		for (let i = 0; i < n; i++) {
			let sum = 0
			for (let k = -w; k <= w; k++) sum += Math.min(tau[(i + k + n) % n], tierMax + 2)
			smooth[i] = sum / (2 * w + 1)
		}
		if (coarse >= BAND_AT) {
			all.push(...smooth)
			continue
		}
		const floor = Math.max(TIER_MIN, tierMax - SPAN)
		const tier = (t) => Math.max(floor, Math.min(tierMax, Math.round(t)))
		const runs =
			n < Math.max(SHORT_RING, 3 * minRun)
				? [[tier(smooth.reduce((a, b) => a + b, 0) / n), n]]
				: mergeRuns(toRuns(Array.from(smooth, tier)), minRun)
		if (runs.length === 1 && runs[0][0] >= tierMax) {
			codes.push("")
			continue
		}
		any = true
		codes.push(
			runs.map(([t, len], i) => tierLetter(t) + (i === runs.length - 1 ? "" : String(len))).join("")
		)
	}
	if (coarse >= BAND_AT) {
		if (!all.length) return null
		all.sort((a, b) => a - b)
		const t = Math.max(
			TIER_MIN,
			tierMax - SPAN,
			Math.min(tierMax, Math.round(all[all.length >> 1]))
		)
		return t >= tierMax ? null : "*" + tierLetter(t)
	}
	return any ? codes.join(",") : null
}

const tierLetter = (t) => String.fromCharCode(97 + t - TIER_MIN)

/** [tier, length] runs of a sequence */
function toRuns(tiers) {
	const runs = []
	for (const t of tiers) {
		const last = runs[runs.length - 1]
		if (last && last[0] === t) last[1]++
		else runs.push([t, 1])
	}
	return runs
}

/**
 * Fold runs shorter than `minRun` into a neighbour (the one of nearer tier, then the longer), so a
 * line never flickers in and out over a vertex or two.
 */
function mergeRuns(runs, minRun) {
	const out = runs.map((r) => [...r])
	for (;;) {
		let k = -1
		for (let i = 0; i < out.length; i++)
			if (out.length > 1 && out[i][1] < minRun && (k < 0 || out[i][1] < out[k][1])) k = i
		if (k < 0) break
		const prev = out[k - 1]
		const next = out[k + 1]
		const pick = !prev
			? next
			: !next
			? prev
			: Math.abs(prev[0] - out[k][0]) < Math.abs(next[0] - out[k][0])
			? prev
			: Math.abs(prev[0] - out[k][0]) > Math.abs(next[0] - out[k][0])
			? next
			: prev[1] >= next[1]
			? prev
			: next
		pick[1] += out[k][1]
		out.splice(k, 1)
		// neighbours of one tier become one run
		for (let i = out.length - 1; i > 0; i--)
			if (out[i][0] === out[i - 1][0]) {
				out[i - 1][1] += out[i][1]
				out.splice(i, 1)
			}
	}
	return out
}
