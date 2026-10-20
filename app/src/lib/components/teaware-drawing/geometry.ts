/**
 * Geometry for the teaware drawings: every vessel is built once, in model millimetres (z up),
 * from lathe profiles (bodies, lids, cups) and swept tubes (spouts, handles). Each part is a
 * u × v grid of vertices with normals, plus the grid rows and columns worth inking. Views never
 * redraw the object; they only project this. Pure module, no DOM.
 */

export type Vec3 = [number, number, number]

/** One profile sample in the r–z half plane. */
export interface ProfileSample {
	r: number
	z: number
	/** an inked ring: a rim, a foot, a groove */
	feature?: boolean
	/** a light wireframe ring */
	wire?: boolean
	/** cavity wall, counted toward capacity */
	inner?: boolean
}

/**
 * A profile control point: [r, z] or [r, z, flags]. "s" makes a crease (a corner the spline
 * doesn't round, inked as a feature ring); "i" marks the cavity wall.
 */
export type ProfilePoint = [number, number] | [number, number, string]

export interface Part {
	id: string
	/** rows (profile samples / along the tube) */
	nu: number
	/** columns (around); closed unless `open` */
	nv: number
	/** a sheet whose columns don't wrap (a neifei), its edges inked */
	open?: boolean
	/** columns inked as features (a sheet's side edges) */
	featureMeridians?: number[]
	pos: Float32Array
	nrm: Float32Array
	/** rows to ink */
	rings: { i: number; feature: boolean }[]
	/** columns to ink */
	meridians: number[]
	/** a lathe's axis of revolution (x, y), for its centreline */
	axis?: [number, number]
	/** rows kept clear of lattice (a field left open for print) */
	clearRows?: Set<number>
	/** rows whose column segments are creases: don't ink columns across a zero-length quad */
	creaseRows?: Set<number>
}

export interface Callout {
	label: string
	/** model point the leader lands on */
	at: Vec3
	part: string
	side: "left" | "right"
}

/** Print on a surface: a polyline in model space, riding on its part. */
export interface Decal {
	part: string
	color: string
	pts: Vec3[]
}

export interface VesselModel {
	parts: Part[]
	/** printed marks (a wrapper's logo), inked in their own colours */
	decals: Decal[]
	/** the pitch this piece is fitted and first shown at, when not the default */
	pitch?: number
	/** parts that lift off when the drawing is "exploded", with their lift in mm */
	lift: Record<string, number>
	callouts: Callout[]
	/** overall extents, for fitting the view */
	radius: number
	height: number
	/** body Ø and height overall (lid on), mm */
	dims: { diameter: number; height: number }
	/** cavity volume in ml at the brim, after scaling */
	capacity: number | null
}

const TAU = Math.PI * 2

/* ---------------------------------------------------------------- profiles */

/**
 * Samples a profile through its control points: creases split it into runs and each run is a
 * centripetal Catmull-Rom spline, sampled every `step` mm. Crease points are emitted twice (once
 * per run) so each side keeps its own normal.
 */
export function sampleProfile(points: ProfilePoint[], step = 1.1, wireEvery = 7): ProfileSample[] {
	const pts = points.map(([r, z, f]) => ({
		r,
		z,
		crease: !!f?.includes("s"),
		inner: !!f?.includes("i"),
	}))
	pts[0].crease = true
	pts[pts.length - 1].crease = true

	const runs: (typeof pts)[] = []
	let run: typeof pts = []
	pts.forEach((p, i) => {
		run.push(p)
		if (p.crease && i > 0) {
			runs.push(run)
			run = [p]
		}
	})

	const out: ProfileSample[] = []
	for (const run of runs) {
		const curve = catmullRom(run.map((p) => [p.r, p.z] as [number, number]))
		const length = curve.length
		const n = Math.max(1, Math.ceil(length / step))
		const nextWire = { at: wireEvery }
		for (let k = 0; k <= n; k++) {
			const s = (k / n) * length
			const [r, z, seg] = curve.at(s)
			const inner = run[seg].inner && run[Math.min(seg + 1, run.length - 1)].inner
			const edge = k === 0 || k === n
			let wire = false
			if (!edge && s >= nextWire.at && length - s > wireEvery * 0.45) {
				wire = true
				nextWire.at = s + wireEvery
			}
			out.push({ r: Math.max(0, r), z, feature: edge, wire, inner })
		}
	}
	return out
}

/** Arc-length parameterised centripetal Catmull-Rom through 2D points. */
function catmullRom(p: [number, number][]) {
	if (p.length === 2) {
		const [a, b] = p
		const len = Math.hypot(b[0] - a[0], b[1] - a[1])
		return {
			length: len,
			at: (s: number): [number, number, number] => {
				const t = len ? s / len : 0
				return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]
			},
		}
	}
	// phantom end points mirror the neighbours so the ends leave along their chords
	const ext = [
		[2 * p[0][0] - p[1][0], 2 * p[0][1] - p[1][1]],
		...p,
		[2 * p[p.length - 1][0] - p[p.length - 2][0], 2 * p[p.length - 1][1] - p[p.length - 2][1]],
	] as [number, number][]
	const seg = (i: number, t: number): [number, number] => {
		const [p0, p1, p2, p3] = [ext[i], ext[i + 1], ext[i + 2], ext[i + 3]]
		const d = (a: number[], b: number[]) => Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5)
		const t0 = 0
		const t1 = t0 + d(p0, p1)
		const t2 = t1 + d(p1, p2)
		const t3 = t2 + d(p2, p3)
		const u = t1 + (t2 - t1) * t
		const lerp = (a: number[], b: number[], ta: number, tb: number) =>
			[0, 1].map((k) => ((tb - u) / (tb - ta)) * a[k] + ((u - ta) / (tb - ta)) * b[k])
		const a1 = lerp(p0, p1, t0, t1)
		const a2 = lerp(p1, p2, t1, t2)
		const a3 = lerp(p2, p3, t2, t3)
		const b1 = lerp(a1, a2, t0, t2)
		const b2 = lerp(a2, a3, t1, t3)
		const c = lerp(b1, b2, t1, t2)
		return [c[0], c[1]]
	}
	// tabulate arc length
	const table: { s: number; i: number; t: number; x: number; y: number }[] = []
	let s = 0
	let prev = p[0]
	for (let i = 0; i < p.length - 1; i++) {
		for (let k = i === 0 ? 0 : 1; k <= 24; k++) {
			const t = k / 24
			const q = seg(i, t)
			s += Math.hypot(q[0] - prev[0], q[1] - prev[1])
			table.push({ s, i, t, x: q[0], y: q[1] })
			prev = q
		}
	}
	return {
		length: s,
		at: (target: number): [number, number, number] => {
			let lo = 0
			let hi = table.length - 1
			while (lo < hi) {
				const mid = (lo + hi) >> 1
				if (table[mid].s < target) lo = mid + 1
				else hi = mid
			}
			const b = table[lo]
			const a = table[Math.max(0, lo - 1)]
			const f = b.s - a.s > 1e-9 ? (target - a.s) / (b.s - a.s) : 0
			return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, b.i]
		},
	}
}

/**
 * Offsets a run of samples along its outward normal by a ridge function: `count` rounded crowns
 * with crisp grooves between them, each groove inked. The thousand lines.
 */
export function ridge(samples: ProfileSample[], count: number, amp: number, perRidge = 10): ProfileSample[] {
	// re-sample the run by arc length so every groove lands on a sample
	const acc = [0]
	for (let i = 1; i < samples.length; i++)
		acc.push(acc[i - 1] + Math.hypot(samples[i].r - samples[i - 1].r, samples[i].z - samples[i - 1].z))
	const total = acc[acc.length - 1]
	const at = (s: number) => {
		let i = 1
		while (i < acc.length - 1 && acc[i] < s) i++
		const f = (s - acc[i - 1]) / Math.max(1e-9, acc[i] - acc[i - 1])
		const a = samples[i - 1]
		const b = samples[i]
		return { r: a.r + (b.r - a.r) * f, z: a.z + (b.z - a.z) * f, tr: b.r - a.r, tz: b.z - a.z }
	}
	const out: ProfileSample[] = []
	for (let k = 0; k < count; k++) {
		for (let j = 0; j <= perRidge; j++) {
			const frac = j / perRidge
			const s = ((k + frac) / count) * total
			const p = at(s)
			const len = Math.hypot(p.tr, p.tz) || 1
			// outward normal for a profile travelling with material on its left
			const nr = p.tz / len
			const nz = -p.tr / len
			// grooves exactly on the envelope, so neighbouring ridges share the crease sample
			const bump = j === 0 || j === perRidge ? 0 : amp * Math.sin(Math.PI * frac) ** 0.6
			out.push({ r: p.r + nr * bump, z: p.z + nz * bump, feature: j === 0 || j === perRidge })
		}
	}
	return out
}

/* ------------------------------------------------------------------- parts */

/** Spins a profile about the z axis into a part. */
export function lathe(
	id: string,
	samples: ProfileSample[],
	{ nv = 96, meridians = 24, offset = [0, 0, 0] as Vec3, clearR = 0 } = {}
): Part {
	const nu = samples.length
	const pos = new Float32Array(nu * nv * 3)
	const nrm = new Float32Array(nu * nv * 3)
	// profile normals: right-hand side of the direction of travel (material on the left)
	const pn = samples.map((s, i) => {
		const a = samples[Math.max(0, i - 1)]
		const b = samples[Math.min(nu - 1, i + 1)]
		// at a crease (duplicated sample) take the tangent from the side this sample belongs to
		let dr = b.r - a.r
		let dz = b.z - a.z
		const dupPrev = i > 0 && samples[i - 1].r === s.r && samples[i - 1].z === s.z
		const dupNext = i < nu - 1 && samples[i + 1].r === s.r && samples[i + 1].z === s.z
		if (dupPrev) {
			const c = samples[Math.min(nu - 1, i + 1)]
			dr = c.r - s.r
			dz = c.z - s.z
		} else if (dupNext) {
			const c = samples[Math.max(0, i - 1)]
			dr = s.r - c.r
			dz = s.z - c.z
		}
		const len = Math.hypot(dr, dz) || 1
		return [dz / len, -dr / len]
	})
	for (let i = 0; i < nu; i++) {
		const { r, z } = samples[i]
		const [nr, nz] = pn[i]
		for (let j = 0; j < nv; j++) {
			const a = (j / nv) * TAU
			const c = Math.cos(a)
			const s = Math.sin(a)
			const k = (i * nv + j) * 3
			pos[k] = r * c + offset[0]
			pos[k + 1] = r * s + offset[1]
			pos[k + 2] = z + offset[2]
			nrm[k] = nr * c
			nrm[k + 1] = nr * s
			nrm[k + 2] = nz
		}
	}
	const rings: Part["rings"] = []
	const seen = new Set<string>()
	samples.forEach((s, i) => {
		if (s.r < 0.6) return
		if (!s.feature && !s.wire) return
		if (!s.feature && s.r < clearR) return
		const key = `${s.r.toFixed(2)},${s.z.toFixed(2)}`
		if (seen.has(key)) return // a crease's twin
		seen.add(key)
		rings.push({ i, feature: !!s.feature })
	})
	const creaseRows = new Set<number>()
	for (let i = 0; i < nu - 1; i++)
		if (samples[i].r === samples[i + 1].r && samples[i].z === samples[i + 1].z) creaseRows.add(i)
	const clearRows = new Set<number>()
	for (let i = 0; i < nu - 1; i++) if (Math.max(samples[i].r, samples[i + 1].r) < clearR) clearRows.add(i)
	const step = nv / meridians
	return {
		id,
		nu,
		nv,
		pos,
		nrm,
		rings,
		clearRows,
		meridians: Array.from({ length: meridians }, (_, k) => Math.round(k * step)),
		creaseRows,
		axis: [offset[0], offset[1]],
	}
}

/**
 * Sweeps a circle of radius `radius(t)` along `curve(t)`, t in [0, 1], with rotation-minimising
 * frames. Rings at `featureAt` are inked; `longitudinals` lines run its length.
 */
export function tube(
	id: string,
	curve: (t: number) => Vec3,
	radius: (t: number) => number,
	{
		nu = 48,
		nv = 32,
		featureAt = [] as number[],
		wireRings = 6,
		longitudinals = 8,
		wireFrom = 0,
	} = {}
): Part {
	const pts = Array.from({ length: nu }, (_, i) => curve(i / (nu - 1)))
	const tan = pts.map((_, i) => {
		const a = pts[Math.max(0, i - 1)]
		const b = pts[Math.min(nu - 1, i + 1)]
		return norm(sub(b, a))
	})
	// initial normal: any vector perpendicular to the first tangent, then parallel transport
	let n = norm(cross(tan[0], Math.abs(tan[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]))
	const frames: [Vec3, Vec3][] = []
	for (let i = 0; i < nu; i++) {
		if (i > 0) {
			const t = tan[i]
			n = norm(sub(n, scale(t, dot(n, t))))
		}
		frames.push([n, cross(tan[i], n)])
	}
	const pos = new Float32Array(nu * nv * 3)
	const nrm = new Float32Array(nu * nv * 3)
	for (let i = 0; i < nu; i++) {
		const rad = radius(i / (nu - 1))
		const [N, B] = frames[i]
		for (let j = 0; j < nv; j++) {
			const a = (j / nv) * TAU
			const d: Vec3 = [
				N[0] * Math.cos(a) + B[0] * Math.sin(a),
				N[1] * Math.cos(a) + B[1] * Math.sin(a),
				N[2] * Math.cos(a) + B[2] * Math.sin(a),
			]
			const k = (i * nv + j) * 3
			pos[k] = pts[i][0] + d[0] * rad
			pos[k + 1] = pts[i][1] + d[1] * rad
			pos[k + 2] = pts[i][2] + d[2] * rad
			nrm[k] = d[0]
			nrm[k + 1] = d[1]
			nrm[k + 2] = d[2]
		}
	}
	const rings: Part["rings"] = featureAt.map((t) => ({ i: Math.round(t * (nu - 1)), feature: true }))
	for (let k = 1; k <= wireRings; k++) {
		const t = wireFrom + ((1 - wireFrom) * k) / (wireRings + 1)
		rings.push({ i: Math.round(t * (nu - 1)), feature: false })
	}
	const step = nv / longitudinals
	return {
		id,
		nu,
		nv,
		pos,
		nrm,
		rings,
		meridians: Array.from({ length: longitudinals }, (_, k) => Math.round(k * step)),
	}
}

/**
 * A flat sheet draped over a surface: `at(u, v)` maps the unit square into model space. Its four
 * edges are inked; `wire` interior lines run each way.
 */
export function sheet(id: string, at: (u: number, v: number) => Vec3, { nu = 16, nv = 20, wire = 3 } = {}): Part {
	const pos = new Float32Array(nu * nv * 3)
	const nrm = new Float32Array(nu * nv * 3)
	const p = (i: number, j: number) => at(j / (nv - 1), i / (nu - 1))
	for (let i = 0; i < nu; i++)
		for (let j = 0; j < nv; j++) {
			const du = sub(p(i, Math.min(nv - 1, j + 1)), p(i, Math.max(0, j - 1)))
			const dv = sub(p(Math.min(nu - 1, i + 1), j), p(Math.max(0, i - 1), j))
			let n = norm(cross(du, dv))
			if (n[2] < 0) n = scale(n, -1)
			const k = (i * nv + j) * 3
			pos.set(p(i, j), k)
			nrm.set(n, k)
		}
	const rows = Array.from({ length: wire }, (_, k) => Math.round(((k + 1) / (wire + 1)) * (nu - 1)))
	const cols = Array.from({ length: wire }, (_, k) => Math.round(((k + 1) / (wire + 1)) * (nv - 1)))
	return {
		id,
		nu,
		nv,
		pos,
		nrm,
		open: true,
		rings: [{ i: 0, feature: true }, { i: nu - 1, feature: true }, ...rows.map((i) => ({ i, feature: false }))],
		meridians: cols,
		featureMeridians: [0, nv - 1],
	}
}

/**
 * Lays 2D print (mm, y up) onto a surface of revolution: `at` and `turn` place the print's
 * origin and turn it, `height(r)` is the surface under it. Strokes are subdivided so they follow
 * the dome.
 */
export function drape(
	strokes: [number, number][][],
	height: (r: number) => number,
	{ at = [0, 0] as [number, number], turn = 0, lift = 0.25, step = 1.2 } = {}
): Vec3[][] {
	const c = Math.cos(turn)
	const s = Math.sin(turn)
	return strokes.map((stroke) => {
		const out: Vec3[] = []
		for (let k = 0; k < stroke.length; k++) {
			const [ax, ay] = stroke[k]
			const [bx, by] = stroke[Math.min(stroke.length - 1, k + 1)]
			const n = k === stroke.length - 1 ? 1 : Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step))
			for (let t = 0; t < n; t++) {
				const x0 = ax + ((bx - ax) * t) / n
				const y0 = ay + ((by - ay) * t) / n
				const x = at[0] + x0 * c - y0 * s
				const y = at[1] + x0 * s + y0 * c
				out.push([x, y, height(Math.hypot(x, y)) + lift])
			}
		}
		return out
	})
}

/**
 * Wraps 2D print (mm, x along the surface, y = height z) around a body of revolution, as a
 * painter's brush follows a bowl: x becomes arc length at that height, starting from azimuth
 * `at` and running counter-clockwise (to the right, seen from outside).
 */
export function wrap(
	strokes: [number, number][][],
	radius: (z: number) => number,
	{ at = 0, lift = 0.3, step = 0.8 } = {}
): Vec3[][] {
	const point = (x: number, z: number): Vec3 => {
		const r = radius(z)
		const a = at + x / r
		return [(r + lift) * Math.cos(a), (r + lift) * Math.sin(a), z]
	}
	return strokes.map((stroke) => {
		const out: Vec3[] = []
		for (let k = 0; k < stroke.length - 1; k++) {
			const [ax, ay] = stroke[k]
			const [bx, by] = stroke[k + 1]
			const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step))
			for (let t = 0; t < n; t++) out.push(point(ax + ((bx - ax) * t) / n, ay + ((by - ay) * t) / n))
		}
		const [lx, ly] = stroke[stroke.length - 1]
		out.push(point(lx, ly))
		return out
	})
}

/** Outer radius of a lathe profile at height z (its outer wall between `zFrom` and `zTo`). */
export function sideRadius(samples: ProfileSample[], zFrom: number, zTo: number) {
	const wall = samples.filter((s) => !s.inner && s.z >= zFrom && s.z <= zTo).sort((a, b) => a.z - b.z)
	return (z: number) => {
		if (z <= wall[0].z) return wall[0].r
		for (let i = 1; i < wall.length; i++)
			if (wall[i].z >= z) {
				const a = wall[i - 1]
				const b = wall[i]
				return a.r + ((b.r - a.r) * (z - a.z)) / Math.max(1e-9, b.z - a.z)
			}
		return wall[wall.length - 1].r
	}
}

/** Height of a lathe profile's upper surface at radius r (its samples above `zAbove`). */
export function topHeight(samples: ProfileSample[], zAbove: number) {
	const top = samples.filter((s) => s.z > zAbove).sort((a, b) => a.r - b.r)
	return (r: number) => {
		if (r <= top[0].r) return top[0].z
		for (let i = 1; i < top.length; i++)
			if (top[i].r >= r) {
				const a = top[i - 1]
				const b = top[i]
				return a.z + ((b.z - a.z) * (r - a.r)) / Math.max(1e-9, b.r - a.r)
			}
		return top[top.length - 1].z
	}
}

/** An arc (by default a full circle) of radius r as a 2D stroke. */
export function arc(r: number, from = 0, to = Math.PI * 2): [number, number][] {
	const count = Math.max(6, Math.ceil((Math.abs(to - from) * r) / 1.5))
	return Array.from({ length: count + 1 }, (_, k) => {
		const a = from + ((to - from) * k) / count
		return [r * Math.cos(a), r * Math.sin(a)] as [number, number]
	})
}

/** A cubic Bézier through four model points. */
export function bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3) {
	return (t: number): Vec3 => {
		const u = 1 - t
		const a = u * u * u
		const b = 3 * u * u * t
		const c = 3 * u * t * t
		const d = t * t * t
		return [0, 1, 2].map((k) => a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k]) as Vec3
	}
}

export function line(a: Vec3, b: Vec3) {
	return (t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/* ---------------------------------------------------------------- measures */

/** Cavity volume (mm³) of the samples marked `inner`, filled to `brim`. */
export function cavityVolume(samples: ProfileSample[], brim: number): number {
	const wall = samples.filter((s) => s.inner).sort((a, b) => a.z - b.z)
	let v = 0
	for (let i = 1; i < wall.length; i++) {
		const a = wall[i - 1]
		const b = wall[i]
		const z0 = a.z
		const z1 = Math.min(b.z, brim)
		if (z1 <= z0) continue
		const f = (z1 - z0) / Math.max(1e-9, b.z - a.z)
		const rb = a.r + (b.r - a.r) * f
		// frustum slice
		v += (Math.PI * (z1 - z0) * (a.r * a.r + a.r * rb + rb * rb)) / 3
	}
	return v
}

export function scaleSamples(samples: ProfileSample[], k: number): ProfileSample[] {
	return samples.map((s) => ({ ...s, r: s.r * k, z: s.z * k }))
}

/** Overall radius from the z axis and height of a set of parts (lids seated). */
export function extents(parts: Part[]) {
	let radius = 0
	let zMin = Infinity
	let zMax = -Infinity
	for (const p of parts) {
		for (let k = 0; k < p.pos.length; k += 3) {
			radius = Math.max(radius, Math.hypot(p.pos[k], p.pos[k + 1]))
			zMin = Math.min(zMin, p.pos[k + 2])
			zMax = Math.max(zMax, p.pos[k + 2])
		}
	}
	return { radius, zMin, zMax }
}

/* ------------------------------------------------------------------ vector */

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
]
export const norm = (a: Vec3): Vec3 => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1
	return [a[0] / l, a[1] / l, a[2] / l]
}
