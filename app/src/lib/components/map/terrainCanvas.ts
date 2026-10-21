/**
 * The terrain's line work on a <canvas> (plan §4.4 "Canvas", §4.7.7): the same pre-projected
 * `d` strings as the SVG, as Path2D, drawn once per camera rebase into one surface.
 *
 * Why: the SVG version rasterizes in 256 px tiles, and every tile tessellates every contour band
 * again (the bands span the whole sheet), so panning onto new ground stalled for 60–200 ms a
 * frame even on a fast GPU. A canvas draws each path once for the whole area, and the camera then
 * only moves the bitmap (see camera.ts).
 *
 * The look is the SVG's, stroke for stroke: Tanaka's illuminated contours (a dark stroke nudged
 * SE, a cream one NW, the band filled with the ground, a hairline on top) or plain hairlines;
 * the land veil that lets contours recede as the camera pulls back; borders over a dark casing,
 * dashed provinces, coast, rivers and lakes; elevations on the index contours up close.
 *
 * A layer is one or more parts, each clipped to its own rect: a frame is one part, a detail
 * region is its cells (neighbours share their edge exactly and carry the same lines past it, so
 * the clip leaves no seam). A layer that gives way to the one beneath is composited through its
 * edge: an organic mask (a PNG scaled over the layer with smoothing, destination-in), or for a
 * plain frame its feathered box (two gradient passes, a horizontal times a vertical ramp).
 */
import { parseRing, ringBoxOf, ringCodes, ringTaus, thinAlpha } from "./contourThin"
import type { Band, Box, CellJson, ContourLabel, FrameJson, MapContext } from "./geo"

type LayerData = FrameJson | CellJson

/** A 2D context on the page or in a worker (terrain.worker.ts draws there, off the main thread) */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Surface = HTMLCanvasElement | OffscreenCanvas

type Paths = {
	land: Path2D
	coast: Path2D | null
	borders: Path2D | null
	admin: Path2D | null
	rivers: Path2D | null
	lakes: Path2D | null
	bands: { elev: number; index: boolean; p: Path2D; cells: Cell[] }[]
}

/**
 * Some of a band's rings, near one another, and the box around them (shared units). `p` is all of
 * them (a lit line, never thinned); `fixed` the rings that never thin and `parts` the rest, cut
 * where their stretches' tiers change, one path per tier τ (contourThin.ts).
 */
type Cell = { box: Box; p: Path2D; fixed: Path2D | null; parts: { tau: number; p: Path2D }[] }

/**
 * A band split into spatial cells for stroking. A canvas tessellates a whole path whatever the
 * clip, so a sheet the size of east China costs as much for a strip of it as for all of it;
 * stroked cell by cell, only the rings near what is drawn cost anything. (Fills stay whole: a
 * valley's ring has to be filled with the ring around it, and fills are cheap.)
 *
 * Bands are written as rings `M x y q cx cy ex ey t ex ey … z` (relative; a smooth quadratic
 * B-spline, each `t` reflecting the previous control point), so a ring's box comes from walking
 * its control points, which hold the curve.
 */
function cellsOf(b: Band, [lx, ly, lw, lh]: Box, n = 8): Cell[] {
	const cw = lw / n
	const ch = lh / n
	type Ring = { d: string; pts: Float64Array; taus: Float32Array | null }
	const groups = new Map<number, { box: Box; rings: Ring[] }>()
	const codeOf = ringCodes(b)
	let r = 0
	for (const ring of b.d.split("M")) {
		if (!ring) continue
		const code = codeOf(r++)
		const pts = parseRing(ring)
		const taus = code ? ringTaus(code, (pts.length - 2) / 4) : null
		const box = ringBoxOf(pts)
		const big = box[2] > cw * 1.5 || box[3] > ch * 1.5
		const ix = Math.max(0, Math.min(n - 1, Math.floor((box[0] + box[2] / 2 - lx) / cw)))
		const iy = Math.max(0, Math.min(n - 1, Math.floor((box[1] + box[3] / 2 - ly) / ch)))
		// a ring spanning several cells gets its own
		const key = big ? -1 - groups.size : iy * n + ix
		const g = groups.get(key)
		const item = { d: ring, pts, taus }
		if (g) {
			const [x0, y0, w0, h0] = g.box
			const x = Math.min(x0, box[0])
			const y = Math.min(y0, box[1])
			g.box = [x, y, Math.max(x0 + w0, box[0] + box[2]) - x, Math.max(y0 + h0, box[1] + box[3]) - y]
			g.rings.push(item)
		} else groups.set(key, { box, rings: [item] })
	}
	return [...groups.values()].map((g) => {
		const p = new Path2D("M" + g.rings.map((x) => x.d).join("M"))
		const plain = g.rings.filter((x) => !x.taus)
		if (plain.length === g.rings.length) return { box: g.box, p, fixed: p, parts: [] }
		const fixed = plain.length ? new Path2D("M" + plain.map((x) => x.d).join("M")) : null
		const byTau = new Map<number, Path2D>()
		for (const { pts, taus } of g.rings) {
			if (!taus) continue
			const segs = taus.length
			let s = 0
			while (s < segs) {
				const t = taus[s]
				let e = s
				while (e + 1 < segs && taus[e + 1] === t) e++
				let path = byTau.get(t)
				if (!path) byTau.set(t, (path = new Path2D()))
				// segment k runs from the end of k − 1 (the start point for k = 0)
				path.moveTo(pts[4 * s], pts[4 * s + 1])
				for (let k = s; k <= e; k++) {
					const o = 2 + 4 * k
					path.quadraticCurveTo(pts[o], pts[o + 1], pts[o + 2], pts[o + 3])
				}
				s = e + 1
			}
		}
		return { box: g.box, p, fixed, parts: [...byTau].map(([tau, path]) => ({ tau, p: path })) }
	})
}

const meets = ([ax, ay, aw, ah]: Box, [bx, by, bw, bh]: Box) =>
	ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah

const cache = new WeakMap<LayerData, Paths>()

const joined = (list: { d: string }[]) =>
	list.length ? new Path2D(list.map((l) => l.d).join("")) : null
const maybe = (d: string) => (d ? new Path2D(d) : null)

function pathsOf(data: LayerData): Paths {
	let p = cache.get(data)
	if (!p) {
		const c: MapContext = data.context
		p = {
			land: new Path2D(c.land),
			coast: maybe(c.coast),
			borders: maybe(c.borders),
			admin: maybe(c.admin),
			rivers: joined(c.rivers),
			lakes: joined(c.lakes),
			bands: data.bands.map((b) => ({
				elev: b.elev,
				index: b.index,
				p: new Path2D(b.d),
				cells: cellsOf(b, data.viewBox),
			})),
		}
		cache.set(data, p)
	}
	return p
}

/** One piece of a layer: a sheet (a frame, a detail cell) drawn clipped to `clip` */
export type CanvasPart = {
	data: LayerData
	clip: Box
	/** only seen in the pan margin: no elevations */
	cheap?: boolean
}

export type CanvasLayer = {
	parts: CanvasPart[]
	/** the layer's extent (a frame's box; a region's cells' bounds) */
	viewBox: Box
	/** feather as a fraction of the shorter side (0: a hard edge, or the mask's) */
	feather: number
	/** an organic edge: alpha over `rect` (shared units) */
	mask?: { image: CanvasImageSource; rect: Box } | null
	/** LOD presence, 0..1 */
	opacity: number
	/** re-stroke bands by elevation (a session's line, a garden range) within `reach` */
	highlight?: Highlight
	reach?: Reach
}

/** Style for a band of `elev` in a layer contoured every `interval` m, or null to leave it */
export type Highlight = (elev: number, interval: number) => HighlightStyle | null

/** `keep`: never thinned (the session's own line); other lit lines thin as their band does */
export type HighlightStyle = { color: string; width?: number; opacity?: number; keep?: boolean }

/** Where a highlight shows: full within `inner` of the point, gone by `outer` (shared units) */
export type Reach = { x: number; y: number; inner: number; outer: number }

export type DrawStyle = {
	ink: "tanaka" | "hairline"
	contours: boolean
	rivers: boolean
	/** 1 up close → ~0.4 zoomed out */
	contourA: number
	/** ~0.85 up close → ~1.65 zoomed out */
	refA: number
	/** elevations on index contours */
	fine: boolean
	/** the origin hero fades its plain contours as it scrolls away (--minor-contours) */
	minorA: number
	font: string
	/** device px per CSS px (widths are CSS px, as the SVG's non-scaling strokes) */
	dpr: number
}

/**
 * Contour alphas (cream; Tanaka's dark edge in black). The index contours carry the structure; the
 * intermediates sit back (and thin where they bunch). Contours.tsx draws the SVG copy with these.
 */
export const TONE = {
	tanaka: { dark: 0.5, light: 0.11, line: 0.075 },
	tanakaIndex: { dark: 0.8, light: 0.3, line: 0.28 },
	hair: 0.075,
	hairIndex: 0.24,
}

const SEA = "#0b0b0e"
const LAND = "#121012"
const CREAM = [255, 242, 202] as const
const WATER = [160, 188, 214] as const
const rgba = ([r, g, b]: readonly number[], a: number) =>
	`rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`

/**
 * Draw `layers` (coarse → fine) into `ctx`, whose canvas covers `area` (shared units) at `s`
 * device px per unit. `scratch` is a same-sized canvas for layers that need compositing.
 *
 * `reuse`: the area the canvas last held, at the same scale, with the same layers and style (a
 * pan). What it already shows is moved over and only the strips the pan exposed are drawn.
 */
export function drawTerrain(
	ctx: Ctx2D,
	scratch: Surface,
	layers: CanvasLayer[],
	area: Box,
	s: number,
	style: DrawStyle,
	reuse?: Box | null,
	grid?: Graticule | null
) {
	const { width, height } = ctx.canvas
	const sctx = scratch.getContext("2d") as Ctx2D
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	// the region to draw, in device px: everything, or the strips a pan exposed
	let strips: [number, number, number, number][] = [[0, 0, width, height]]
	if (reuse) {
		const dx = Math.round((reuse[0] - area[0]) * s)
		const dy = Math.round((reuse[1] - area[1]) * s)
		if (Math.abs(dx) < width && Math.abs(dy) < height) {
			ctx.globalCompositeOperation = "copy"
			ctx.drawImage(ctx.canvas, dx, dy)
			ctx.globalCompositeOperation = "source-over"
			strips = []
			if (dx > 0) strips.push([0, 0, dx, height])
			if (dx < 0) strips.push([width + dx, 0, -dx, height])
			if (dy > 0) strips.push([0, 0, width, dy])
			if (dy < 0) strips.push([0, height + dy, width, -dy])
			if (!strips.length) return
		}
	}
	const clipTo = (c: Ctx2D, within?: [number, number, number, number]) => {
		c.setTransform(1, 0, 0, 1, 0, 0)
		c.beginPath()
		for (const r of within ? strips.map((st) => cut(st, within)) : strips)
			if (r[2] > 0 && r[3] > 0) c.rect(...r)
		c.clip()
	}
	// the same, in shared units, to cull rings by
	const pad = 4 / s
	const regions: Box[] = strips.map(([x, y, w, h]) => [
		area[0] + x / s - pad,
		area[1] + y / s - pad,
		w / s + 2 * pad,
		h / s + 2 * pad,
	])
	ctx.save()
	clipTo(ctx)
	for (const [x, y, w, h] of strips) ctx.clearRect(x, y, w, h)
	for (const layer of layers) {
		if (layer.opacity < 0.005 || !layer.parts.length) continue
		const [fx, fy, fw, fh] = layer.viewBox
		const f = Math.min(fw, fh) * layer.feather
		// a group only where it shows: a fade, a mask, or a feathered edge inside the drawn area
		const edge =
			f > 0 &&
			(area[0] < fx + f ||
				area[1] < fy + f ||
				area[0] + area[2] > fx + fw - f ||
				area[1] + area[3] > fy + fh - f)
		const group = layer.opacity < 0.999 || edge || !!layer.mask
		const target = group ? sctx : ctx
		// a group works only over the layer's own box (a region is a small part of the canvas):
		// clearing, masking and compositing the whole surface each cost as much as drawing it
		const box = cut(
			[
				Math.floor((fx - area[0]) * s) - 2,
				Math.floor((fy - area[1]) * s) - 2,
				Math.ceil(fw * s) + 4,
				Math.ceil(fh * s) + 4,
			],
			[0, 0, width, height]
		)
		if (box[2] <= 0 || box[3] <= 0) continue
		const dirty = strips.map((st) => cut(st, box)).filter((r) => r[2] > 0 && r[3] > 0)
		if (!dirty.length) continue
		if (group) {
			sctx.save()
			clipTo(sctx, box)
			for (const [x, y, w, h] of dirty) sctx.clearRect(x, y, w, h)
		}
		target.setTransform(s, 0, 0, s, -area[0] * s, -area[1] * s)
		for (const part of layer.parts) {
			const [cx, cy, cw, ch] = part.clip
			target.save()
			target.beginPath()
			target.rect(cx, cy, cw, ch)
			target.clip()
			drawLayer(
				target,
				part.data,
				1 / s,
				// in its own ink (a pan brings the margin into view, and the look mustn't change when
				// the full render lands), only without elevations
				part.cheap ? { ...style, fine: false } : style,
				regions,
				layer.highlight,
				layer.reach
			)
			target.restore()
		}
		if (!group) continue
		if (layer.mask) {
			// the organic edge: the mask's gray, scaled up smoothly, is what's left of the layer
			const [mx, my, mw, mh] = layer.mask.rect
			sctx.save()
			sctx.globalCompositeOperation = "destination-in"
			sctx.imageSmoothingEnabled = true
			sctx.imageSmoothingQuality = "high"
			sctx.drawImage(layer.mask.image, mx, my, mw, mh)
			sctx.restore()
		} else if (f > 0) feather(sctx, layer.viewBox, f)
		sctx.restore()
		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.globalAlpha = layer.opacity
		for (const [x, y, w, h] of dirty) ctx.drawImage(scratch, x, y, w, h, x, y, w, h)
		ctx.globalAlpha = 1
	}
	if (grid) graticule(ctx, grid, area, s, style.dpr)
	ctx.restore()
	ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** Graticule lines over the area: meridians at `xs`, parallels at `ys` (shared units) */
export type Graticule = { step: number; xs: number[]; ys: number[] }

/**
 * The degree lines, a dotted cream hairline (1 px on, 3 off) over everything. Drawn here, not in
 * the SVG: a dashed SVG path the size of the pane cost the GPU process ~3 s of raster over a
 * minute of panning (every rebase re-rasterizes it). Dashes start on a fixed device-px phase, so
 * strips drawn after a pan line up with what was moved over.
 */
function graticule(ctx: Ctx2D, { xs, ys }: Graticule, area: Box, s: number, dpr: number) {
	const { width, height } = ctx.canvas
	const period = 4 * dpr
	const ox = area[0] * s
	const oy = area[1] * s
	ctx.save()
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.strokeStyle = rgba(CREAM, 0.075)
	ctx.lineWidth = dpr
	ctx.lineCap = "butt"
	ctx.setLineDash([dpr, 3 * dpr])
	ctx.beginPath()
	const y0 = Math.floor(oy / period) * period - oy
	const x0 = Math.floor(ox / period) * period - ox
	for (const x of xs) {
		const px = Math.round(x * s - ox) + 0.5 * (dpr % 2)
		if (px < -1 || px > width + 1) continue
		ctx.moveTo(px, y0)
		ctx.lineTo(px, height)
	}
	for (const y of ys) {
		const py = Math.round(y * s - oy) + 0.5 * (dpr % 2)
		if (py < -1 || py > height + 1) continue
		ctx.moveTo(x0, py)
		ctx.lineTo(width, py)
	}
	ctx.stroke()
	ctx.restore()
}

/** The overlap of two px rects [x, y, w, h] (w or h ≤ 0 when they miss) */
function cut(
	[ax, ay, aw, ah]: [number, number, number, number],
	[bx, by, bw, bh]: [number, number, number, number]
): [number, number, number, number] {
	const x = Math.max(ax, bx)
	const y = Math.max(ay, by)
	return [x, y, Math.min(ax + aw, bx + bw) - x, Math.min(ay + ah, by + bh) - y]
}

/** Cream at `a`, or a highlight ink (a color or a gradient) at `a` through globalAlpha. */
function tint(ctx: Ctx2D, ink: string | CanvasGradient | undefined, a: number) {
	if (ink) {
		ctx.strokeStyle = ink
		ctx.globalAlpha = Math.max(0, Math.min(1, a))
	} else {
		ctx.strokeStyle = rgba(CREAM, a)
		ctx.globalAlpha = 1
	}
}

/** Any CSS color with its alpha set to 0 (a gradient's far end), normalized by the canvas once */
const clearOf = new Map<string, string>()
function transparent(ctx: Ctx2D, color: string) {
	let out = clearOf.get(color)
	if (!out) {
		ctx.save()
		ctx.fillStyle = "#000"
		ctx.fillStyle = color
		const n = String(ctx.fillStyle)
		ctx.restore()
		const hex = /^#([0-9a-f]{6})$/i.exec(n)
		const fn = /^rgba?\(([^)]+)\)$/.exec(n)
		if (hex) {
			const v = parseInt(hex[1], 16)
			out = `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},0)`
		} else if (fn) {
			const [r, g, b] = fn[1].split(/[ ,/]+/)
			out = `rgba(${r},${g},${b},0)`
		} else out = "rgba(0,0,0,0)"
		clearOf.set(color, out)
	}
	return out
}

/** A highlight's ink: its color within `reach`, fading to nothing by the outer radius */
function reachInk(ctx: Ctx2D, color: string, reach: Reach | undefined) {
	if (!reach) return color
	const g = ctx.createRadialGradient(reach.x, reach.y, 0, reach.x, reach.y, reach.outer)
	g.addColorStop(0, color)
	g.addColorStop(Math.min(0.999, reach.inner / reach.outer), color)
	g.addColorStop(1, transparent(ctx, color))
	return g
}

/** Cut a layer's feathered edge into what's drawn (transform: shared units). */
function feather(ctx: Ctx2D, [x, y, w, h]: Box, f: number) {
	const ramp = (g: CanvasGradient, len: number) => {
		const t = f / len
		const at = [0, 0.25, 0.5, 0.75, 1]
		const a = [0, 0.08, 0.5, 0.92, 1]
		at.forEach((u, i) => g.addColorStop(u * t, `rgba(0,0,0,${a[i]})`))
		at.forEach((u, i) => g.addColorStop(1 - t + u * t, `rgba(0,0,0,${a[4 - i]})`))
		return g
	}
	ctx.save()
	ctx.globalCompositeOperation = "destination-in"
	ctx.fillStyle = ramp(ctx.createLinearGradient(x, 0, x + w, 0), w)
	ctx.fillRect(x - 1e4, y - 1e4, w + 2e4, h + 2e4)
	ctx.fillStyle = ramp(ctx.createLinearGradient(0, y, 0, y + h), h)
	ctx.fillRect(x - 1e4, y - 1e4, w + 2e4, h + 2e4)
	ctx.restore()
}

/** One sheet: ground, contours, veil, reference lines, elevations. `u` = units per device px. */
function drawLayer(
	ctx: Ctx2D,
	data: LayerData,
	u: number,
	st: DrawStyle,
	regions: Box[],
	highlight?: Highlight,
	reach?: Reach
) {
	const p = pathsOf(data)
	const near = (box: Box) => regions.some((r) => meets(box, r))
	// the bands a highlight lights, where its reach meets what's drawn
	const lit = new Map<number, Omit<HighlightStyle, "color"> & { ink: string | CanvasGradient }>()
	const reached =
		!reach || near([reach.x - reach.outer, reach.y - reach.outer, reach.outer * 2, reach.outer * 2])
	if (highlight && reached)
		for (const b of p.bands) {
			const h = highlight(b.elev, data.interval)
			if (h) lit.set(b.elev, { ...h, ink: reachInk(ctx, h.color, reach) })
		}
	const [x, y, w, h] = data.viewBox
	// widths are CSS px (as the SVG's non-scaling strokes): units per CSS px
	const px = u * st.dpr
	const v = Math.log2(px)
	/**
	 * Stroke only the band's rings near what's being drawn, thinned where its contours bunch at
	 * this zoom (contourThin.ts): each stretch at its own alpha, over what's already set. `keep`
	 * strokes every ring whole (the session's line).
	 */
	const stroke = (b: Paths["bands"][number], keep = false) => {
		const ga = ctx.globalAlpha
		for (const cell of b.cells) {
			if (!near(cell.box)) continue
			if (keep) {
				ctx.stroke(cell.p)
				continue
			}
			if (cell.fixed) ctx.stroke(cell.fixed)
			for (const part of cell.parts) {
				const a = thinAlpha(part.tau, v)
				if (a <= 0.01) continue
				ctx.globalAlpha = ga * a
				ctx.stroke(part.p)
			}
			ctx.globalAlpha = ga
		}
	}
	ctx.fillStyle = SEA
	ctx.fillRect(x - w, y - h, w * 3, h * 3)
	ctx.fillStyle = LAND
	ctx.fill(p.land, "evenodd")

	if (st.contours) {
		// miter, as the SVG strokes: round joins multiply the tessellation on curvy bands
		ctx.lineJoin = "miter"
		if (st.ink === "tanaka") {
			const t = 0.6 * px
			for (const b of p.bands) {
				const h = lit.get(b.elev) ?? null
				// a plain band's strokes can fade (the hero scrolling away); never its fill
				const minor = b.index || h ? 1 : st.minorA
				// the session's line is stroked whole; every other intermediate thins where bunched
				const keep = !!h?.keep
				const ink = b.index ? TONE.tanakaIndex : TONE.tanaka
				ctx.lineWidth = (b.index ? 1.4 : 1.1) * px
				ctx.strokeStyle = `rgba(0,0,0,${ink.dark * minor})`
				ctx.translate(t, t)
				stroke(b, keep)
				ctx.translate(-2 * t, -2 * t)
				ctx.lineWidth = (b.index ? 1.1 : 0.85) * px
				tint(ctx, undefined, ink.light * minor)
				stroke(b, keep)
				// a lit band's light edge in its ink (fading out past its reach)
				if (h) {
					tint(ctx, h.ink, 0.5)
					stroke(b, keep)
				}
				ctx.translate(t, t)
				ctx.globalAlpha = 1
				ctx.fillStyle = LAND
				if (b.cells.some((cell) => near(cell.box))) ctx.fill(b.p, "evenodd")
				ctx.lineWidth = (b.index ? 0.8 : 0.5) * px
				tint(ctx, undefined, ink.line * minor)
				stroke(b, keep)
				if (h) {
					ctx.lineWidth = (h.width ?? 1.2) * px
					tint(ctx, h.ink, h.opacity ?? 0.95)
					stroke(b, keep)
				}
				ctx.globalAlpha = 1
			}
		} else {
			for (const b of p.bands) {
				ctx.lineWidth = (b.index ? 0.8 : 0.5) * px
				ctx.strokeStyle = rgba(
					CREAM,
					(b.index ? TONE.hairIndex : TONE.hair) * 0.9 * (b.index ? 1 : st.minorA)
				)
				stroke(b)
			}
			// the lit lines, over the rest
			for (const b of p.bands) {
				const h = lit.get(b.elev)
				if (!h) continue
				ctx.lineWidth = (h.width ?? 1.2) * px
				tint(ctx, h.ink, h.opacity ?? 1)
				stroke(b, !!h.keep)
				ctx.globalAlpha = 1
			}
		}
		// zoomed out, the contours give way to the reference layers: a veil of land
		if (st.contourA < 0.999) {
			ctx.fillStyle = `rgba(18,16,18,${1 - st.contourA})`
			ctx.fill(p.land, "evenodd")
		}
	}

	ctx.lineCap = "butt"
	if (p.admin) {
		ctx.setLineDash([5 * px, 4 * px])
		ctx.lineWidth = 0.75 * px
		ctx.strokeStyle = rgba(CREAM, 0.13 * st.refA)
		ctx.stroke(p.admin)
		ctx.setLineDash([])
	}
	if (p.coast) {
		ctx.lineWidth = 0.8 * px
		ctx.strokeStyle = rgba(WATER, 0.38 * st.refA)
		ctx.stroke(p.coast)
	}
	if (p.borders) {
		ctx.lineJoin = "round"
		ctx.lineWidth = 3.2 * px
		ctx.strokeStyle = "rgba(18,16,18,0.85)"
		ctx.stroke(p.borders)
		ctx.lineWidth = 0.9 * px
		ctx.strokeStyle = rgba(CREAM, 0.28 * st.refA)
		ctx.stroke(p.borders)
	}
	if (st.rivers) {
		if (p.lakes) {
			ctx.fillStyle = rgba(WATER, 0.05)
			ctx.fill(p.lakes)
			ctx.lineWidth = 0.7 * px
			ctx.strokeStyle = rgba(WATER, 0.34 * st.refA)
			ctx.stroke(p.lakes)
		}
		if (p.rivers) {
			ctx.lineJoin = "round"
			ctx.lineCap = "round"
			ctx.lineWidth = 0.85 * px
			ctx.strokeStyle = rgba(WATER, 0.36 * st.refA)
			ctx.stroke(p.rivers)
		}
	}

	if (st.contours && st.fine) contourLabels(ctx, data.contourLabels, px, st.font)
}

/** Elevations along the index contours, cut out of the line by a halo of ground. */
function contourLabels(ctx: Ctx2D, labels: ContourLabel[], px: number, font: string) {
	if (!labels.length) return
	ctx.save()
	ctx.font = `8px ${font}`
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.lineJoin = "round"
	ctx.lineWidth = 3
	ctx.strokeStyle = LAND
	ctx.fillStyle = rgba(CREAM, 0.5)
	for (const l of labels) {
		ctx.save()
		ctx.translate(l.x, l.y)
		ctx.rotate((l.angle * Math.PI) / 180)
		ctx.scale(px, px)
		const text = String(l.elev)
		ctx.strokeText(text, 0, 0.5)
		ctx.fillText(text, 0, 0.5)
		ctx.restore()
	}
	ctx.restore()
}
