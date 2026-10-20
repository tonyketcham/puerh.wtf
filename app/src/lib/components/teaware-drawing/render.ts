/**
 * Inks a VesselModel onto a 2D canvas as a technical wireframe: one parallel camera (yaw about
 * the vessel's axis, pitch above the table), a software depth buffer for hidden-line removal,
 * and three line roles. Silhouettes are true contours (where the surface turns away from the
 * eye, found per quad), features are rims, feet and grooves, and the wireframe is a light lattice
 * of rings and meridians. Hidden silhouettes and features go dashed; hidden lattice is dropped.
 */
import type { Part, Vec3, VesselModel } from "./geometry"

export interface ViewState {
	yaw: number
	pitch: number
	/** 0 seated … 1 lids lifted */
	explode: number
	/** draw-on front, 0 … 1 (bottom to top) */
	reveal: number
	/** whole-drawing opacity, for crossfades */
	alpha: number
}

export interface Ink {
	/** silhouette */
	accent: string
	/** rgb triplet for the cream ink, "255 242 202" */
	cream: string
	font: string
}

/** pitch the view is fitted at, and the range a drag may take it through */
export const DEFAULT_PITCH = 0.42
/** the pose each drawing enters in: spout to the right, turned a little toward the eye */
export const DEFAULT_YAW = -0.42
export const PITCH_MIN = 0.02
export const PITCH_MAX = 1.15

const LANE = 104
const LANE_GAP = 14

interface Projected {
	x: Float32Array
	y: Float32Array
	d: Float32Array
	f: Float32Array
	/** normalised height, for the draw-on */
	zn: Float32Array
}

/** a callout's label: which lane it's in, how far it has faded in, where it sits */
interface Tag {
	side: "left" | "right"
	a: number
	y: number
}

export class Renderer {
	private ctx: CanvasRenderingContext2D
	private w = 0
	private h = 0
	private dpr = 1
	private zbuf = new Float32Array(0)
	private model: VesselModel | null = null
	private scale = 1
	private zMid = 0
	/** the stage left for the drawing once the label lanes are taken */
	private avail = { w: 1, h: 1 }
	/** each part's top when seated, and how far it lifts */
	private tops: { top: number; lift: number }[] = []
	private zLo = 0
	private zSpan = 1
	private lanes = true
	private tags: Tag[] = []
	private proj = new Map<string, Projected>()

	constructor(private canvas: HTMLCanvasElement, private ink: Ink) {
		const ctx = canvas.getContext("2d")
		if (!ctx) throw new Error("no 2d context")
		this.ctx = ctx
	}

	/** screen px per model mm: the view's fitted scale, for a scale bar */
	get pxPerMm() {
		return this.scale
	}

	setInk(ink: Ink) {
		this.ink = ink
	}

	setModel(model: VesselModel) {
		this.model = model
		this.proj.clear()
		for (const p of model.parts) {
			const n = p.nu * p.nv
			this.proj.set(p.id, {
				x: new Float32Array(n),
				y: new Float32Array(n),
				d: new Float32Array(n),
				f: new Float32Array(n),
				zn: new Float32Array(n),
			})
		}
		this.tags = model.callouts.map((c) => ({ side: c.side, a: 0, y: NaN }))
		this.fit()
	}

	resize(w: number, h: number, dpr: number) {
		this.w = Math.max(1, Math.round(w))
		this.h = Math.max(1, Math.round(h))
		this.dpr = dpr
		this.canvas.width = Math.round(this.w * dpr)
		this.canvas.height = Math.round(this.h * dpr)
		this.zbuf = new Float32Array(this.w * this.h)
		this.fit()
	}

	/** Measures the model and the stage; the scale itself follows the pose (see frame). */
	private fit() {
		const m = this.model
		if (!m || !this.w) return
		let zMin = Infinity
		let zMax = -Infinity
		this.tops = m.parts.map((p) => {
			const lift = m.lift[p.id] ?? 0
			let top = -Infinity
			for (let k = 2; k < p.pos.length; k += 3) {
				zMin = Math.min(zMin, p.pos[k])
				top = Math.max(top, p.pos[k])
			}
			zMax = Math.max(zMax, top + lift)
			return { top, lift }
		})
		this.zLo = zMin
		this.zSpan = zMax - zMin || 1
		this.lanes = this.w >= 440
		const padX = this.lanes ? LANE + LANE_GAP : 16
		this.avail = { w: this.w - padX * 2, h: this.h - 36 }
		this.frame({ yaw: 0, pitch: m.pitch ?? DEFAULT_PITCH, explode: 0, reveal: 1, alpha: 1 })
	}

	/**
	 * Fits the drawing to the stage for this pose: a plan view or a lifted lid needs more height,
	 * so the scale (and the centre) move with the camera, smoothly, as it does.
	 */
	private frame(v: ViewState) {
		const m = this.model
		if (!m) return
		let zMax = -Infinity
		for (const t of this.tops) zMax = Math.max(zMax, t.top + t.lift * v.explode)
		const tall = (zMax - this.zLo) * Math.cos(v.pitch) + 2 * m.radius * Math.sin(v.pitch)
		this.scale = Math.max(0.1, Math.min(this.avail.w / (2 * m.radius), this.avail.h / tall))
		this.zMid = (this.zLo + zMax) / 2
	}

	private project(p: Vec3, v: ViewState, lift: number): [number, number, number] {
		const cy = Math.cos(v.yaw)
		const sy = Math.sin(v.yaw)
		const cp = Math.cos(v.pitch)
		const sp = Math.sin(v.pitch)
		const x1 = p[0] * cy - p[1] * sy
		const y1 = p[0] * sy + p[1] * cy
		const z1 = p[2] + lift - this.zMid
		return [
			this.w / 2 + this.scale * x1,
			this.h / 2 - this.scale * (y1 * sp + z1 * cp),
			y1 * cp - z1 * sp,
		]
	}

	/** Inks one frame; returns true while labels are still easing into place. */
	draw(v: ViewState, smooth = true): boolean {
		const m = this.model
		const ctx = this.ctx
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
		ctx.clearRect(0, 0, this.w, this.h)
		if (!m || v.alpha <= 0) return false
		this.frame(v)

		const cy = Math.cos(v.yaw)
		const sy = Math.sin(v.yaw)
		const cp = Math.cos(v.pitch)
		const sp = Math.sin(v.pitch)
		const cx0 = this.w / 2
		const cy0 = this.h / 2
		const s = this.scale

		// 1. project every vertex, with its facing (n · view, < 0 faces the eye)
		for (const part of m.parts) {
			const pr = this.proj.get(part.id)!
			const lift = (m.lift[part.id] ?? 0) * v.explode
			const { pos, nrm } = part
			const n = part.nu * part.nv
			for (let i = 0; i < n; i++) {
				const k = i * 3
				const x1 = pos[k] * cy - pos[k + 1] * sy
				const y1 = pos[k] * sy + pos[k + 1] * cy
				const z = pos[k + 2] + lift
				const z1 = z - this.zMid
				pr.x[i] = cx0 + s * x1
				pr.y[i] = cy0 - s * (y1 * sp + z1 * cp)
				pr.d[i] = y1 * cp - z1 * sp
				const ny = nrm[k] * sy + nrm[k + 1] * cy
				pr.f[i] = ny * cp - nrm[k + 2] * sp
				pr.zn[i] = (z - this.zLo) / this.zSpan
			}
		}

		// 2. depth buffer
		const zb = this.zbuf
		zb.fill(Infinity)
		for (const part of m.parts) this.raster(part, this.proj.get(part.id)!)

		// 3. collect segments by role
		const tol = 1.4 / s
		const paths = {
			wire: [] as number[],
			feature: [] as number[],
			contour: [] as number[],
			hidden: [] as number[],
		}
		const reveal = v.reveal
		const push = (bucket: number[], ax: number, ay: number, bx: number, by: number) => {
			bucket.push(ax, ay, bx, by)
		}
		const visible = (x: number, y: number, d: number) => this.visible(x, y, d, tol)

		for (const part of m.parts) {
			const pr = this.proj.get(part.id)!
			const { nu, nv } = part
			// open sheets stop at their last column instead of wrapping to the first
			const cols = part.open ? nv - 1 : nv
			const idx = (i: number, j: number) => i * nv + (j % nv)
			const seg = (a: number, b: number, role: "wire" | "feature") => {
				if ((pr.zn[a] + pr.zn[b]) / 2 > reveal) return
				const mx = (pr.x[a] + pr.x[b]) / 2
				const my = (pr.y[a] + pr.y[b]) / 2
				const md = (pr.d[a] + pr.d[b]) / 2
				if (visible(mx, my, md)) push(paths[role], pr.x[a], pr.y[a], pr.x[b], pr.y[b])
				else if (role === "feature" && part.axis)
					push(paths.hidden, pr.x[a], pr.y[a], pr.x[b], pr.y[b])
			}
			for (const ring of part.rings)
				for (let j = 0; j < cols; j++)
					seg(idx(ring.i, j), idx(ring.i, j + 1), ring.feature ? "feature" : "wire")
			const columns = [
				...part.meridians.map((j) => [j, "wire"] as const),
				...(part.featureMeridians ?? []).map((j) => [j, "feature"] as const),
			]
			for (const [j, role] of columns)
				for (let i = 0; i < nu - 1; i++) {
					if (part.creaseRows?.has(i) || (role === "wire" && part.clearRows?.has(i))) continue
					seg(idx(i, j), idx(i + 1, j), role)
				}

			// contours: zero crossings of the facing across each quad
			const cross = (a: number, b: number, out: number[]) => {
				const fa = pr.f[a]
				const fb = pr.f[b]
				if (fa < 0 === fb < 0) return
				const t = fa / (fa - fb)
				out.push(
					pr.x[a] + (pr.x[b] - pr.x[a]) * t,
					pr.y[a] + (pr.y[b] - pr.y[a]) * t,
					pr.d[a] + (pr.d[b] - pr.d[a]) * t,
					pr.zn[a] + (pr.zn[b] - pr.zn[a]) * t
				)
			}
			const hits: number[] = []
			for (let i = 0; i < nu - 1; i++) {
				for (let j = 0; j < cols; j++) {
					const a = idx(i, j)
					const b = idx(i, j + 1)
					const c = idx(i + 1, j + 1)
					const d = idx(i + 1, j)
					hits.length = 0
					cross(a, b, hits)
					cross(b, c, hits)
					cross(c, d, hits)
					cross(d, a, hits)
					for (let h = 0; h + 7 < hits.length; h += 8) {
						const zn = (hits[h + 3] + hits[h + 7]) / 2
						if (zn > reveal) continue
						const mx = (hits[h] + hits[h + 4]) / 2
						const my = (hits[h + 1] + hits[h + 5]) / 2
						const md = (hits[h + 2] + hits[h + 6]) / 2
						if (this.visible(mx, my, md, tol * 2.2))
							push(paths.contour, hits[h], hits[h + 1], hits[h + 4], hits[h + 5])
						else if (part.axis) push(paths.hidden, hits[h], hits[h + 1], hits[h + 4], hits[h + 5])
					}
				}
			}
		}

		// 4. ink: centrelines under everything, then lattice, hidden, features, silhouettes
		ctx.globalAlpha = v.alpha
		ctx.lineCap = "round"
		ctx.lineJoin = "round"
		const cream = (a: number) => `rgb(${this.ink.cream} / ${a})`
		this.centrelines(v, cream(0.22))
		stroke(ctx, paths.wire, cream(0.16), 0.7)
		stroke(ctx, paths.hidden, cream(0.12), 0.7, [2.5, 3])
		stroke(ctx, paths.feature, cream(0.62), 0.9)
		stroke(ctx, paths.contour, this.ink.accent, 1.35)
		this.decals(v, tol)
		const settling = this.lanes ? this.callouts(v, cream, tol, smooth) : false
		ctx.globalAlpha = 1
		return settling
	}

	/** Print rides on its part: depth-tested like any line, dropped where something covers it. */
	private decals(v: ViewState, tol: number) {
		const m = this.model!
		if (!m.decals.length) return
		const byColor = new Map<string, number[]>()
		for (const decal of m.decals) {
			const lift = (m.lift[decal.part] ?? 0) * v.explode
			const segs = byColor.get(decal.color) ?? []
			byColor.set(decal.color, segs)
			let prev: [number, number, number] | null = null
			for (const p of decal.pts) {
				const q = this.project(p, v, lift)
				const zn = (p[2] + lift - this.zLo) / this.zSpan
				const mid =
					prev &&
					this.visible((prev[0] + q[0]) / 2, (prev[1] + q[1]) / 2, (prev[2] + q[2]) / 2, tol)
				if (prev && mid && zn <= v.reveal) segs.push(prev[0], prev[1], q[0], q[1])
				prev = q
			}
		}
		for (const [color, segs] of byColor) stroke(this.ctx, segs, color, 1.1)
	}

	private visible(x: number, y: number, d: number, tol: number) {
		const w = this.w
		const h = this.h
		const px = Math.floor(x)
		const py = Math.floor(y)
		const threshold = d - tol
		for (let dy = -1; dy <= 1; dy++) {
			const yy = py + dy
			if (yy < 0 || yy >= h) return true
			for (let dx = -1; dx <= 1; dx++) {
				const xx = px + dx
				if (xx < 0 || xx >= w) return true
				// The test is existential: one sample behind this point is enough. Most
				// visible lines can stop here instead of reading all nine neighbours.
				if (this.zbuf[yy * w + xx] >= threshold) return true
			}
		}
		return false
	}

	private raster(part: Part, pr: Projected) {
		const { nu, nv } = part
		const cols = part.open ? nv - 1 : nv
		for (let i = 0; i < nu - 1; i++) {
			if (part.creaseRows?.has(i)) continue
			for (let j = 0; j < cols; j++) {
				const a = i * nv + j
				const b = i * nv + ((j + 1) % nv)
				const c = (i + 1) * nv + ((j + 1) % nv)
				const d = (i + 1) * nv + j
				this.tri(pr, a, b, c)
				this.tri(pr, a, c, d)
			}
		}
	}

	private tri(pr: Projected, a: number, b: number, c: number) {
		const ax = pr.x[a]
		const ay = pr.y[a]
		const bx = pr.x[b]
		const by = pr.y[b]
		const cx = pr.x[c]
		const cy = pr.y[c]
		const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
		if (Math.abs(area) < 1e-6) return
		const w = this.w
		const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
		const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)))
		const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)))
		const y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by, cy)))
		if (x0 > x1 || y0 > y1) return
		const ad = pr.d[a]
		const bd = pr.d[b]
		const cd = pr.d[c]
		const inv = 1 / area
		const zb = this.zbuf
		// Barycentric coordinates and depth are affine across the triangle. Compute
		// their x steps once, rather than repeating the cross products per pixel.
		const step0 = (by - cy) * inv
		const step1 = (cy - ay) * inv
		const step2 = -step0 - step1
		const stepZ = step0 * (ad - cd) + step1 * (bd - cd)
		for (let y = y0; y <= y1; y++) {
			const py = y + 0.5
			const px = x0 + 0.5
			let w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv
			let w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv
			const w2 = 1 - w0 - w1
			// Clip the scanline to the three half-planes before visiting pixels. A
			// nearly edge-on quad has a large bounding box but only a thin inked span.
			let first = 0
			let last = x1 - x0
			if (step0 > 0) first = Math.max(first, Math.ceil((-1e-4 - w0) / step0))
			else if (step0 < 0) last = Math.min(last, Math.floor((-1e-4 - w0) / step0))
			else if (w0 < -1e-4) continue
			if (step1 > 0) first = Math.max(first, Math.ceil((-1e-4 - w1) / step1))
			else if (step1 < 0) last = Math.min(last, Math.floor((-1e-4 - w1) / step1))
			else if (w1 < -1e-4) continue
			if (step2 > 0) first = Math.max(first, Math.ceil((-1e-4 - w2) / step2))
			else if (step2 < 0) last = Math.min(last, Math.floor((-1e-4 - w2) / step2))
			else if (w2 < -1e-4) continue
			let z = w0 * ad + w1 * bd + w2 * cd + first * stepZ
			let k = y * w + x0 + first
			for (let x = first; x <= last; x++, k++, z += stepZ) {
				if (z < zb[k]) zb[k] = z
			}
		}
	}

	/** Each lathe's axis (dash-dot) and two crossed lines on the table plane, turning with it. */
	private centrelines(v: ViewState, color: string) {
		const m = this.model!
		const ctx = this.ctx
		const axes = new Map<string, [number, number]>()
		for (const p of m.parts) if (p.axis) axes.set(p.axis.map((n) => n.toFixed(1)).join(","), p.axis)
		const reach = m.radius * 1.12
		const pts: number[] = []
		for (const [ax, ay] of axes.values()) {
			const top = this.zLo + this.zSpan + 6
			const a = this.project([ax, ay, this.zLo - 5], v, 0)
			const b = this.project([ax, ay, top], v, 0)
			pts.push(a[0], a[1], b[0], b[1])
		}
		const [ox, oy] = axes.size === 1 ? [...axes.values()][0] : [0, 0]
		for (const [dx, dy] of [
			[1, 0],
			[0, 1],
		]) {
			const a = this.project([ox - dx * reach, oy - dy * reach, this.zLo], v, 0)
			const b = this.project([ox + dx * reach, oy + dy * reach, this.zLo], v, 0)
			pts.push(a[0], a[1], b[0], b[1])
		}
		ctx.save()
		ctx.globalAlpha *= Math.min(1, v.reveal * 1.6)
		stroke(ctx, pts, color, 0.6, [12, 3, 2, 3])
		ctx.restore()
	}

	/**
	 * Each label lives in the lane on its anchor's side of the axis, sorted and spaced by its
	 * anchor's height. When the vessel turns an anchor across the axis, its label fades out and
	 * comes back in the other lane, so no leader ever has to cross the drawing.
	 */
	private callouts(
		v: ViewState,
		cream: (a: number) => string,
		tol: number,
		smooth: boolean
	): boolean {
		const m = this.model!
		const ctx = this.ctx
		const reveal = Math.min(1, Math.max(0, (v.reveal - 0.85) / 0.25))
		if (reveal <= 0) return false
		const cx = this.w / 2
		const hyst = m.radius * this.scale * 0.12
		const anchors = m.callouts.map((c, i) => {
			const lift = (m.lift[c.part] ?? 0) * v.explode
			const [x, y, d] = this.project(c.at, v, lift)
			const tag = this.tags[i]
			const want = x < cx - hyst ? "left" : x > cx + hyst ? "right" : tag.side
			if (!smooth) {
				tag.side = want
				tag.a = 1
			} else if (want !== tag.side) {
				tag.a -= 0.1
				if (tag.a <= 0) {
					tag.side = want
					tag.a = 0
					tag.y = NaN
				}
			} else tag.a = Math.min(1, tag.a + 0.07)
			return { i, x, y, seen: this.visible(x, y, d, tol * 3) }
		})

		let settling = false
		const gap = 20
		for (const side of ["left", "right"] as const) {
			const col = anchors.filter((a) => this.tags[a.i].side === side).sort((a, b) => a.y - b.y)
			const ys = col.map((a) => a.y)
			for (let k = 0; k < ys.length; k++) ys[k] = Math.max(ys[k], k ? ys[k - 1] + gap : 14)
			for (let k = ys.length - 1; k >= 0; k--)
				ys[k] = Math.min(ys[k], k < ys.length - 1 ? ys[k + 1] - gap : this.h - 14)
			col.forEach((a, k) => {
				const tag = this.tags[a.i]
				if (!smooth || Number.isNaN(tag.y)) tag.y = ys[k]
				else tag.y += (ys[k] - tag.y) * 0.22
				if (Math.abs(ys[k] - tag.y) > 0.3) settling = true
			})
		}

		ctx.save()
		ctx.font = this.ink.font
		ctx.textBaseline = "middle"
		const reach = m.radius * this.scale + LANE_GAP
		for (const a of anchors) {
			const tag = this.tags[a.i]
			if (tag.a < 1) settling = true
			if (tag.a <= 0) continue
			const label = m.callouts[a.i].label
			const isLeft = tag.side === "left"
			const textW = ctx.measureText(label).width
			const lx = isLeft ? Math.max(4 + textW, cx - reach) : Math.min(this.w - 4 - textW, cx + reach)
			const stub = isLeft ? lx + 8 : lx - 8
			ctx.globalAlpha = v.alpha * reveal * tag.a * (a.seen ? 1 : 0.55)
			// leader: label, a short stub, then straight to the anchor
			ctx.beginPath()
			ctx.moveTo(isLeft ? lx + 3 : lx - 3, tag.y)
			ctx.lineTo(stub, tag.y)
			ctx.lineTo(a.x, a.y)
			ctx.setLineDash(a.seen ? [] : [2, 3])
			ctx.strokeStyle = cream(0.4)
			ctx.lineWidth = 0.7
			ctx.stroke()
			ctx.setLineDash([])
			ctx.beginPath()
			ctx.arc(a.x, a.y, a.seen ? 2 : 1.6, 0, Math.PI * 2)
			if (a.seen) {
				ctx.fillStyle = this.ink.accent
				ctx.fill()
			} else {
				ctx.strokeStyle = cream(0.5)
				ctx.stroke()
			}
			ctx.fillStyle = "rgb(255 255 255 / 0.6)"
			ctx.textAlign = isLeft ? "right" : "left"
			ctx.fillText(label, lx, tag.y)
		}
		ctx.restore()
		return settling
	}
}

function stroke(
	ctx: CanvasRenderingContext2D,
	segs: number[],
	color: string,
	width: number,
	dash: number[] = []
) {
	if (!segs.length) return
	ctx.beginPath()
	// Infinity, not NaN: a NaN comparison is always false, which once left every batch's first
	// segment without its moveTo, and so undrawn
	let lx = Infinity
	let ly = Infinity
	for (let i = 0; i < segs.length; i += 4) {
		const ax = segs[i]
		const ay = segs[i + 1]
		// continue the subpath when segments chain, so dashes and joins run unbroken
		if (Math.abs(ax - lx) > 0.01 || Math.abs(ay - ly) > 0.01) ctx.moveTo(ax, ay)
		ctx.lineTo(segs[i + 2], segs[i + 3])
		lx = segs[i + 2]
		ly = segs[i + 3]
	}
	ctx.setLineDash(dash)
	ctx.strokeStyle = color
	ctx.lineWidth = width
	ctx.stroke()
	ctx.setLineDash([])
}
