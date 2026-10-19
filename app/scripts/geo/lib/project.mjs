/**
 * Step 6: projections and SVG path strings.
 *
 * Paths are written in tenths of a unit (0.1 px) with relative `l` segments, which
 * keeps them small and, after rounding, byte-identical on every OS.
 */
import { geoAzimuthalEqualArea, geoConicEqualArea } from "d3-geo"

const EARTH_KM = 6371.0088

/** Build a d3 projection from a plain, serializable description */
export function makeProjection(p) {
	if (p.type === "conicEqualArea") {
		return geoConicEqualArea()
			.parallels(p.parallels)
			.rotate(p.rotate)
			.center(p.center)
			.scale(p.scale)
			.translate(p.translate)
	}
	if (p.type === "azimuthalEqualArea") {
		return geoAzimuthalEqualArea().rotate(p.rotate).scale(p.scale).translate(p.translate)
	}
	throw new Error(`unknown projection ${p.type}`)
}

/** North-up local projection for an inset of `sideKm`, mapped to [-size/2, size/2] */
export function insetProjection(lon, lat, sideKm, size) {
	return {
		type: "azimuthalEqualArea",
		rotate: [-lon, -lat],
		scale: round4(size / (sideKm / EARTH_KM)),
		translate: [0, 0],
	}
}

const round4 = (v) => Math.round(v * 1e4) / 1e4

/** Integer tenths → shortest decimal string ("12.3", "-0.4" → "-.4", "5") */
function fmt(t) {
	const neg = t < 0
	const a = neg ? -t : t
	const i = Math.floor(a / 10)
	const f = a % 10
	const s = f ? `${i || ""}.${f}` : `${i}`
	return neg ? `-${s}` : s
}

/** Join numbers, eliding the space before a minus sign */
function joinNums(nums) {
	let out = ""
	for (let i = 0; i < nums.length; i++) {
		const s = nums[i]
		out += i === 0 || s[0] === "-" ? s : ` ${s}`
	}
	return out
}

/**
 * Quantize projected points [x, y, hard?] to integer tenths, dropping repeats.
 * `hard` marks vertices created by clipping; splines pass through them exactly.
 */
function quantizeProjected(points) {
	const out = []
	for (const p of points) {
		const x = Math.round(p[0] * 10)
		const y = Math.round(p[1] * 10)
		const last = out[out.length - 1]
		if (last && last[0] === x && last[1] === y) {
			if (p[2]) last[2] = true
			continue
		}
		out.push(p[2] ? [x, y, true] : [x, y])
	}
	return out
}

/** Project and quantize a ring/line of [lon, lat] to integer tenths, dropping repeats */
export function quantize(points, project) {
	return quantizeProjected(points.map((pt) => project(pt)).filter(Boolean))
}

/**
 * Sutherland–Hodgman clip of a closed ring (no repeated end point) to [x0, y0, x1, y1].
 * Clip-made vertices are flagged hard. Rings already inside come back untouched.
 */
export function clipRing(ring, [x0, y0, x1, y1]) {
	let inside = true
	for (const p of ring) {
		if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) {
			inside = false
			break
		}
	}
	if (inside) return ring
	const edges = [
		[(p) => p[0] >= x0, (a, b) => (x0 - a[0]) / (b[0] - a[0])],
		[(p) => p[0] <= x1, (a, b) => (x1 - a[0]) / (b[0] - a[0])],
		[(p) => p[1] >= y0, (a, b) => (y0 - a[1]) / (b[1] - a[1])],
		[(p) => p[1] <= y1, (a, b) => (y1 - a[1]) / (b[1] - a[1])],
	]
	let out = ring
	for (const [isIn, at] of edges) {
		const input = out
		out = []
		if (!input.length) break
		let prev = input[input.length - 1]
		for (const cur of input) {
			const curIn = isIn(cur)
			const prevIn = isIn(prev)
			if (curIn !== prevIn) {
				const t = at(prev, cur)
				out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t, true])
			}
			if (curIn) out.push(cur)
			prev = cur
		}
	}
	return out
}

/** Split a polyline into the pieces inside [x0, y0, x1, y1] (Liang–Barsky per segment) */
export function clipLine(line, [x0, y0, x1, y1]) {
	const pieces = []
	let cur = null
	for (let i = 1; i < line.length; i++) {
		const a = line[i - 1]
		const b = line[i]
		const dx = b[0] - a[0]
		const dy = b[1] - a[1]
		let t0 = 0
		let t1 = 1
		let visible = true
		for (const [p, q] of [
			[-dx, a[0] - x0],
			[dx, x1 - a[0]],
			[-dy, a[1] - y0],
			[dy, y1 - a[1]],
		]) {
			if (p === 0) {
				if (q < 0) visible = false
			} else {
				const r = q / p
				if (p < 0) t0 = Math.max(t0, r)
				else t1 = Math.min(t1, r)
			}
		}
		if (!visible || t0 > t1) {
			cur = null
			continue
		}
		const pa = t0 === 0 ? a : [a[0] + dx * t0, a[1] + dy * t0]
		const pb = t1 === 1 ? b : [a[0] + dx * t1, a[1] + dy * t1]
		if (!cur || t0 > 0) {
			cur = [pa]
			pieces.push(cur)
		}
		cur.push(pb)
		if (t1 < 1) cur = null
	}
	return pieces
}

/** Shoelace area in (tenths)², absolute */
export function ringArea(q) {
	let a = 0
	for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
		a += (q[j][0] + q[i][0]) * (q[j][1] - q[i][1])
	}
	return Math.abs(a / 2)
}

/** One subpath: M x y l dx dy … [z] */
export function subpath(q, close) {
	const nums = [fmt(q[0][0]), fmt(q[0][1])]
	const rel = []
	for (let i = 1; i < q.length; i++) {
		rel.push(fmt(q[i][0] - q[i - 1][0]), fmt(q[i][1] - q[i - 1][1]))
	}
	return `M${joinNums(nums)}${rel.length ? `l${joinNums(rel)}` : ""}${close ? "z" : ""}`
}

/**
 * Closed quadratic B-spline through the ring's edge midpoints, with the ring's
 * vertices as control points: M m₀ q c₁ m₁ … z. Corners left by simplification
 * become curves without adding vertices, and the curve never leaves the hull.
 * Hard (clip) vertices are doubled, which pins the curve to them, so edges along
 * the clip rectangle stay straight and outside the visible frame.
 */
export function splineSubpath(ring) {
	const q = ring.flatMap((p) => (p[2] ? [p, p] : [p]))
	const n = q.length
	const mid = (a, b) => [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)]
	const start = mid(q[n - 1], q[0])
	let cur = start
	const nums = []
	for (let i = 0; i < n; i++) {
		const c = q[i]
		const m = i === n - 1 ? start : mid(c, q[i + 1])
		nums.push(fmt(c[0] - cur[0]), fmt(c[1] - cur[1]), fmt(m[0] - cur[0]), fmt(m[1] - cur[1]))
		cur = m
	}
	return `M${joinNums([fmt(start[0]), fmt(start[1])])}q${joinNums(nums)}z`
}

/** [x, y, w, h] viewBox grown by `pad` on every side → [x0, y0, x1, y1] */
export function clipRect([x, y, w, h], pad) {
	return [x - pad, y - pad, x + w + pad, y + h + pad]
}

/**
 * Polygons → path. `minArea` is in units² (rings smaller than that are speckle).
 * `clip` ([x0, y0, x1, y1], projected units) drops what falls outside the frame.
 * `curve` writes each ring as a closed quadratic B-spline instead of a polyline.
 * @param {number[][][][]} polygons MultiPolygon coordinates in lon/lat
 */
export function polygonsPath(polygons, project, { minArea = 0, clip = null, curve = false } = {}) {
	const minTenths = minArea * 100
	let d = ""
	for (const polygon of polygons) {
		for (const ring of polygon) {
			let pts = ring.map((pt) => project(pt)).filter(Boolean)
			if (pts.length > 1) {
				const a = pts[0]
				const b = pts[pts.length - 1]
				if (a[0] === b[0] && a[1] === b[1]) pts = pts.slice(0, -1)
			}
			if (clip) pts = clipRing(pts, clip)
			const q = quantizeProjected(pts)
			if (q.length > 1 && q[0][0] === q[q.length - 1][0] && q[0][1] === q[q.length - 1][1]) q.pop()
			if (q.length < 3 || ringArea(q) < minTenths) continue
			d += curve ? splineSubpath(q) : subpath(q, true)
		}
	}
	return d
}

/** Lines → path; clips to `clip` and drops pieces shorter than `minLength` units */
export function linesPath(lines, project, { minLength = 0, clip = null } = {}) {
	let d = ""
	for (const line of lines) {
		const pts = line.map((pt) => project(pt)).filter(Boolean)
		for (const piece of clip ? clipLine(pts, clip) : [pts]) {
			const q = quantizeProjected(piece)
			if (q.length < 2) continue
			let len = 0
			for (let i = 1; i < q.length; i++)
				len += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1])
			if (len / 10 < minLength) continue
			d += subpath(q, false)
		}
	}
	return d
}

/** Projected bounding box of a lon/lat bbox (edges sampled) → [x, y, w, h] in tenths-rounded units */
export function projectBBox([w, s, e, n], project) {
	let x0 = Infinity
	let y0 = Infinity
	let x1 = -Infinity
	let y1 = -Infinity
	const steps = 16
	for (let i = 0; i <= steps; i++) {
		const t = i / steps
		for (const pt of [
			[w + (e - w) * t, s],
			[w + (e - w) * t, n],
			[w, s + (n - s) * t],
			[e, s + (n - s) * t],
		]) {
			const [x, y] = project(pt)
			x0 = Math.min(x0, x)
			y0 = Math.min(y0, y)
			x1 = Math.max(x1, x)
			y1 = Math.max(y1, y)
		}
	}
	const r = (v) => Math.round(v * 10) / 10
	return [r(x0), r(y0), r(x1 - x0), r(y1 - y0)]
}
