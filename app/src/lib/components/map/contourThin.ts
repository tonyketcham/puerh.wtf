/**
 * Cartographic contour thinning at runtime (plan §4.7, "thinning"; the pipeline side is
 * scripts/geo/lib/thin.mjs). Where intermediate contours bunch on a steep slope, stretches of them
 * go unstroked, rank 2 (odd multiples of the interval) before rank 1 (multiples of 2×), so the
 * index contours carry the structure. Fills are untouched: Tanaka still fills every band from its
 * whole outline, so a stretch that isn't stroked is simply hidden by the band above, as before.
 *
 * A band's `thin` holds, per ring, runs of tiers over its spline segments: a tier k says the
 * stretch may show while the camera shows ≤ 2^k shared units per CSS px. Here each segment gets
 * τ, its tier ramped over two segments either side of a change (so a line fades out along its
 * length, never ending blunt), and is stroked at alpha clamp(τ − log2(upp) + ½): fully there at
 * half its limit, gone at twice it, so it also fades in and out as the camera zooms.
 */
import type { Band, Box } from "./geo"

/** log2 of tier `a` (scripts/geo/lib/thin.mjs TIER_MIN) */
const TIER_MIN = -8

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g

/**
 * One ring of a band's `d` (`x y q cx cy ex ey t ex ey … z`, the M stripped), absolute: the start
 * point, then a control and an end point per segment ([sx, sy, c0x, c0y, e0x, e0y, …]).
 */
export function parseRing(ring: string): Float64Array {
	const n = ring.match(NUM)?.map(Number) ?? []
	if (n.length < 6) return new Float64Array(0)
	const segs = (n.length - 4) / 2
	const out = new Float64Array(2 + 4 * segs)
	let x = n[0]
	let y = n[1]
	out[0] = x
	out[1] = y
	let cx = x + n[2]
	let cy = y + n[3]
	x += n[4]
	y += n[5]
	out[2] = cx
	out[3] = cy
	out[4] = x
	out[5] = y
	for (let i = 6, o = 6; i + 1 < n.length; i += 2, o += 4) {
		cx = 2 * x - cx
		cy = 2 * y - cy
		x += n[i]
		y += n[i + 1]
		out[o] = cx
		out[o + 1] = cy
		out[o + 2] = x
		out[o + 3] = y
	}
	return out
}

/** The box of a parsed ring's control polygon (which holds the curve) */
export function ringBoxOf(pts: Float64Array): Box {
	if (pts.length < 2) return [0, 0, 0, 0]
	let x0 = pts[0]
	let y0 = pts[1]
	let x1 = x0
	let y1 = y0
	for (let i = 2; i + 1 < pts.length; i += 2) {
		const x = pts[i]
		const y = pts[i + 1]
		if (x < x0) x0 = x
		if (x > x1) x1 = x
		if (y < y0) y0 = y
		if (y > y1) y1 = y
	}
	return [x0, y0, x1 - x0, y1 - y0]
}

/**
 * Per-segment τ of a ring from its code (null: it never thins). A change of tier ramps over two
 * segments each side (weights 1 2 2 2 1 around each segment), so τ steps by an eighth of it.
 */
export function ringTaus(code: string, n: number): Float32Array | null {
	if (!code || n <= 0) return null
	const base = new Float32Array(n)
	let i = 0
	const runs = code.match(/[a-z]\d*/g) ?? []
	runs.forEach((r, k) => {
		const t = r.charCodeAt(0) - 97 + TIER_MIN
		const len = k === runs.length - 1 ? n - i : Number(r.slice(1))
		for (let j = 0; j < len && i < n; j++) base[i++] = t
	})
	for (; i < n; i++) base[i] = base[i - 1] ?? 0
	if (n < 5) return base
	const out = new Float32Array(n)
	for (let s = 0; s < n; s++) {
		const at = (o: number) => base[(s + o + n) % n]
		out[s] = (at(-2) + 2 * at(-1) + 2 * at(0) + 2 * at(1) + at(2)) / 8
	}
	return out
}

/** How much of a stretch of tier τ shows at log2(units per CSS px) `v` */
export const thinAlpha = (tau: number, v: number) => Math.max(0, Math.min(1, tau - v + 0.5))

/**
 * The code of each ring of a band, by its index: `thin` lists them joined by ",", or, as `*` and
 * one letter, gives every ring that tier (a cell that had to save bytes).
 */
export function ringCodes(b: Band): (i: number) => string {
	if (!b.thin || b.index) return () => ""
	if (b.thin[0] === "*") {
		const all = b.thin.slice(1)
		return () => all
	}
	const codes = b.thin.split(",")
	return (i) => codes[i] ?? ""
}

/** The rings of a band's `d` (strings without their M) and their codes, paired */
export function bandRings(b: Band): { ring: string; code: string }[] {
	const code = ringCodes(b)
	return b.d
		.split("M")
		.filter(Boolean)
		.map((ring, i) => ({ ring, code: code(i) }))
}

// ---------------------------------------------------------------------------------------------
// SVG: a band's stroke outline at one zoom, as a few paths of one alpha each
// ---------------------------------------------------------------------------------------------

export type ThinPiece = { d: string; a: number }

const svgCache = new WeakMap<Band, Map<number, ThinPiece[]>>()

const f2 = (v: number) => String(Math.round(v * 100) / 100)

/**
 * A band's outline to stroke at `upp` shared units per CSS px: its whole `d` where nothing thins,
 * otherwise the stretches that show, grouped by alpha (thirds). Index bands never thin.
 */
export function thinPieces(b: Band, upp: number | null | undefined): ThinPiece[] {
	if (!b.thin || !upp || b.index) return [{ d: b.d, a: 1 }]
	const key = Math.round(Math.log2(upp) * 8)
	let m = svgCache.get(b)
	if (!m) svgCache.set(b, (m = new Map()))
	const hit = m.get(key)
	if (hit) return hit
	const v = key / 8
	const buckets = new Map<number, string[]>()
	const whole: string[] = []
	for (const { ring, code } of bandRings(b)) {
		const pts = parseRing(ring)
		const n = (pts.length - 2) / 4
		const taus = ringTaus(code, n)
		if (!taus) {
			whole.push("M" + ring)
			continue
		}
		const as = Array.from(taus, (t) => Math.round(thinAlpha(t, v) * 3) / 3)
		if (as.every((a) => a === 1)) {
			whole.push("M" + ring)
			continue
		}
		let s = 0
		while (s < n) {
			const a = as[s]
			let e = s
			while (e + 1 < n && as[e + 1] === a) e++
			if (a > 0) {
				const sx = s === 0 ? pts[0] : pts[4 * s]
				const sy = s === 0 ? pts[1] : pts[4 * s + 1]
				let d = `M${f2(sx)} ${f2(sy)}Q`
				for (let k = s; k <= e; k++) {
					const o = 2 + 4 * k
					d += `${k > s ? " " : ""}${f2(pts[o])} ${f2(pts[o + 1])} ${f2(pts[o + 2])} ${f2(
						pts[o + 3]
					)}`
				}
				const list = buckets.get(a) ?? []
				list.push(d)
				buckets.set(a, list)
			}
			s = e + 1
		}
	}
	const out: ThinPiece[] = []
	if (whole.length) out.push({ d: whole.join(""), a: 1 })
	for (const [a, list] of [...buckets].sort((x, y) => y[0] - x[0])) {
		if (a === 1 && out.length) out[0] = { d: out[0].d + list.join(""), a: 1 }
		else out.push({ d: list.join(""), a })
	}
	if (m.size > 6) m.delete(m.keys().next().value!)
	m.set(key, out)
	return out
}
