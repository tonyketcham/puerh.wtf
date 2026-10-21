"use client"

/**
 * The map camera (plan §4.5, §4.7.6). Three motion values (center x, center y, log width) drive
 * the map's pane (a canvas of terrain and an <svg> of marks over it), the HTML pinned over it and
 * two values in the svg, so nothing re-renders while it moves:
 *
 *   in the svg    upp        user units per screen px          (screen-constant marks: .map-px)
 *                 tanaka     ~0.6 px in user units             (Tanaka offsets: .map-tanaka-*)
 *
 * (written on each rebase as the transforms of the elements that use them: `setSvgView`)
 *
 * HTML over the map (labels, degree ticks, rings) is pinned to a shared-space point (X, Y): with k
 * screen px per user unit and (ox, oy) the screen px of the user-space origin, it sits at
 * X·k + ox, Y·k + oy. A pin's own transform is written in px (`pin`) only when k changes, a zoom;
 * a pan moves the box holding the pins instead (`mover`), one compositor transform, and the pins
 * are written again once it stops. Placed through inherited CSS variables, every pinned element
 * was restyled, its variables resolved again and repainted every frame: the largest source of
 * garbage on the map. The DOM is written once per animation frame (motion's frame loop), however
 * many values changed; `subscribe` hands the same tick to the furniture (labels, scale bar,
 * readout, locator).
 *
 * Panning never redraws the terrain: the pane is rendered over the view plus a margin, then only
 * moved (and, mid-zoom, scaled) by a compositor transform. It is rendered again (a "rebase") when
 * the view nears the margin's edge, the zoom drifts by about 16% (REBASE_ZOOM), or a zoom
 * comes to rest; mid-zoom rebases are drafts, the full render follows at rest (each picture
 * crossfades over the last, TerrainLayers.tsx). `subscribeBase` announces each
 * rebase: the terrain layers and the zoom emphasis follow it, so they too change only then.
 * Measured at 1440×900 over the six-mountains sheet (plan §7): redrawing the SVG every frame
 * panned at 31–42 fps; this pans at the display rate, with an occasional rebase frame.
 *
 * Width springs in log space, so a zoom feels even whether it doubles or halves; a long
 * flight rises over the map and comes down again instead of sliding across it. Every target is
 * clamped to the camera's limits: about a 3 km view at the closest, the East Asia locator at the
 * farthest, and the view kept over the data.
 */
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	type RefObject,
} from "react"
import {
	animate,
	cancelFrame,
	frame as frameLoop,
	useMotionValue,
	type AnimationPlaybackControls,
	type MotionValue,
} from "motion/react"
import { CAMERA_SPRING, fitAspect, FRAMES, SHARED, type Box, type Point } from "./geo"

export type ViewTick = {
	/** [x, y, w, h] in shared units */
	view: Box
	/** viewport px */
	W: number
	H: number
	/** shared units per CSS px */
	upp: number
}

/**
 * What the <svg> was last rendered at (see `apply`): the view then, and the larger area the svg
 * actually covers (the view plus a margin on every side), in shared units.
 */
export type BaseTick = ViewTick & {
	area: Box
	/**
	 * rendered mid-zoom: the picture is being scaled anyway, so a renderer may draw a quick draft;
	 * a full render follows when the zoom comes to rest
	 */
	draft: boolean
	/**
	 * ln of how far the zoom moved since the previous base (> 0 out, < 0 in; 0 at rest or a pan):
	 * a draft zooming out is drawn over a wider area, so the edges stay covered until the next
	 */
	zoom: number
}

/** Sets a pinned element's style for its point's screen position (px, from the map's corner). */
export type PinWrite = (s: CSSStyleDeclaration, sx: number, sy: number) => void

/** The default pin: the element's corner on the point. */
export const pinAt: PinWrite = (s, sx, sy) => {
	s.transform = `translate3d(${sx}px, ${sy}px, 0)`
}

export type CameraLimits = {
	/** the closest view: its shorter side spans at least this many km */
	minKm: number
	/** the farthest view must fit inside this box (grown by `slack`), and the center stays in it */
	bounds: Box
	slack: number
}

const LOCATOR = FRAMES[0].viewBox
export const DEFAULT_LIMITS: CameraLimits = { minKm: 3, bounds: LOCATOR, slack: 0.12 }

export type Camera = {
	cx: MotionValue<number>
	cy: MotionValue<number>
	/** ln(view width in user units) */
	lw: MotionValue<number>
	/** viewport size in px (kept by a ResizeObserver) */
	width: MotionValue<number>
	height: MotionValue<number>
	/** the current view as [x, y, w, h] */
	view: () => Box
	/** user units per screen px */
	upp: () => number
	/** jump to show `box` (grown to the viewport's aspect, padded by `pad` × its size) */
	set: (box: Box, pad?: number, opts?: { draft?: boolean }) => void
	/** travel to show `box`; resolves when it lands */
	fly: (box: Box, opts?: { pad?: number; reduce?: boolean }) => Promise<void>
	/** stop any flight or fling where it is */
	stop: () => void
	/** the [x, y, w, h] a box would be shown at (aspect-fitted, padded, clamped) */
	frame: (box: Box, pad?: number) => Box
	/** zoom by `f` (< 1 in) keeping `at` (shared units; default the center) under the same pixel */
	zoomAt: (f: number, at?: Point, opts?: { animate?: boolean; reduce?: boolean }) => void
	/** move the view by shared units (immediate) */
	panBy: (dx: number, dy: number) => void
	/** glide on after a drag: velocity in shared units per ms, decaying */
	fling: (vx: number, vy: number) => void
	/** client px → shared units */
	toMap: (clientX: number, clientY: number) => Point
	/** called once per frame after the DOM is written (and once on subscribe) */
	subscribe: (fn: (tick: ViewTick) => void) => () => void
	/** called whenever the svg is rendered at a new base (and once on subscribe) */
	subscribeBase: (fn: (tick: BaseTick) => void) => () => void
	/** the latest tick */
	tick: () => ViewTick
	/**
	 * Keep `el` at the shared-space point (x, y): `write` (default `pinAt`) gets its screen position.
	 * Inside a `mover`, it is written only when the zoom changes and after a pan; `live` (an element
	 * outside one, or a size that tracks the view) writes it every frame. Returns the unpin.
	 */
	pin: (el: HTMLElement, x: number, y: number, write?: PinWrite, live?: boolean) => () => void
	/** a ref for the box holding pins: a pan moves it, not them */
	mover: (el: HTMLElement | null) => (() => void) | undefined
}

/** The camera of the map an overlay is in (TerrainMap provides it), for `usePin`. */
export const MapCamera = createContext<Camera | null>(null)

/**
 * A ref pinning its element to (x, y) on the map's camera (see `Camera.pin`). It unpins on a null
 * rather than returning a cleanup: a motion component hands its ref the element, then null.
 */
export function usePin(x: number, y: number, write?: PinWrite, live = false) {
	const camera = useContext(MapCamera)
	const unpin = useRef<(() => void) | null>(null)
	return useCallback(
		(el: HTMLElement | null) => {
			unpin.current?.()
			unpin.current = el && camera ? camera.pin(el, x, y, write, live) : null
		},
		[camera, x, y, write, live]
	)
}

/** A ref for a box holding pins (see `Camera.mover`). */
export function useMover(camera: Camera) {
	return useCallback((el: HTMLElement | null) => camera.mover(el), [camera])
}

type Pin = { el: HTMLElement; x: number; y: number; write: PinWrite }

/** The element the camera sizes and moves: the svg's wrapper (or the svg, standing alone). */
const paneOf = (svg: SVGSVGElement): HTMLElement | SVGSVGElement =>
	svg.parentElement?.hasAttribute("data-map-pane") ? svg.parentElement : svg

/**
 * The svg's view values, each written on the elements that use it (its transform, or a variable
 * map.css reads) rather than set once on the svg as an inherited CSS variable: a variable changed
 * on the svg restyles every element under it, ~3,000 in an origin hero, 15–20 ms on each rebase
 * (and again when a covered panel is shown, see TerrainMap's ExpandedMap). Written on the ~600
 * users, a change restyles them alone, ~4 ms: a transform isn't inherited, so their children
 * aren't touched. (The Tanaka strokes are grouped per band and side for this, Contours.tsx.)
 */
const SVG_VIEW = {
	/** user units per screen px: screen-constant marks undo the camera's scale */
	upp: [".map-px", (el: SVGElement, u: number) => (el.style.transform = `scale(${u})`)],
	/** ~0.6 screen px in user units: the Tanaka strokes' offset, light up-left, dark down-right */
	tanaka: [
		".map-tanaka-light, .map-tanaka-dark",
		(el: SVGElement, t: number) => {
			const d = el.classList.contains("map-tanaka-light") ? -t : t
			el.style.transform = `translate(${d}px, ${d}px)`
		},
	],
	/** the zoom emphasis (TerrainMap.tsx), read by map.css */
	contourA: [".map-contour-veil", (el: SVGElement, a: number) => el.style.setProperty("--contour-a", `${a}`)],
	refA: [
		".map-ref-admin, .map-ref-coast, .map-ref-border, .map-ref-lake, .map-ref-river",
		(el: SVGElement, a: number) => el.style.setProperty("--ref-a", `${a}`),
	],
} satisfies Record<string, [selector: string, write: (el: SVGElement, v: number) => void]>
export type SvgView = keyof typeof SVG_VIEW
const svgViews = new WeakMap<SVGSVGElement, Map<SvgView, number>>()

/**
 * Write one of the svg's view values (SVG_VIEW) on every element that uses it. Elements React
 * mounts later get the current values as they're inserted (a mutation observer, before they paint).
 */
export function setSvgView(svg: SVGSVGElement, key: SvgView, value: number) {
	let vals = svgViews.get(svg)
	if (!vals) {
		const own = new Map<SvgView, number>()
		svgViews.set(svg, own)
		new MutationObserver((records) => {
			for (const r of records)
				for (const n of r.addedNodes) {
					if (!(n instanceof SVGElement)) continue
					for (const [k, v] of own) {
						const [sel, write] = SVG_VIEW[k]
						if (n.matches(sel)) write(n, v)
						if (n.firstElementChild) for (const el of n.querySelectorAll<SVGElement>(sel)) write(el, v)
					}
				}
		}).observe(svg, { childList: true, subtree: true })
		vals = own
	}
	if (vals.get(key) === value) return
	vals.set(key, value)
	const [sel, write] = SVG_VIEW[key]
	for (const el of svg.querySelectorAll<SVGElement>(sel)) write(el, value)
}

/**
 * The margin (px) rendered past each side of the view: room to pan before the next rebase. A
 * rebase costs about in proportion to the area drawn, so it is a quarter of the longer side,
 * shrunk until the canvas stays under ~8 M device pixels.
 */
function marginFor(W: number, H: number) {
	const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1)
	let M = Math.max(96, Math.min(480, Math.max(W, H) * 0.25))
	while (M > 96 && (W + 2 * M) * (H + 2 * M) * dpr * dpr > 8e6) M *= 0.85
	return Math.round(M)
}

/**
 * A view center along one axis, kept so the view (size `v`) stays on the data ([b, b + len]):
 * past the edge there is nothing to draw. A view wider than the data is centered on it.
 */
function keepIn(c: number, v: number, b: number, len: number) {
	if (v >= len) return b + len / 2
	return Math.max(b + v / 2, Math.min(b + len - v / 2, c))
}

/** Same-scale hops shorter than this many view widths spring; longer ones fly an arc. */
const HOP = 1.6
/** Fling decay (ms): how long a released drag keeps gliding */
const FLING_TAU = 325
/**
 * Render again once the zoom has drifted this far (ln of the scale) from its base. Each render
 * crossfades over the last (TerrainLayers.tsx), so the smaller the step, the less any one changes:
 * the LOD mixes, thinning and zoom emphasis it bakes in move in steps of about a fifth of an
 * octave, each faded over the one before. A request while one is in flight only replaces the
 * queued one, so a faster zoom doesn't queue more work.
 */
const REBASE_ZOOM = 0.15
/** ms after the last move to render a scaled svg crisp again */
const SETTLE_MS = 150

export function useCamera(
	rootRef: RefObject<HTMLElement | null>,
	svgRef: RefObject<SVGSVGElement | null>,
	{ tanakaPx = 0.6, limits = DEFAULT_LIMITS }: { tanakaPx?: number; limits?: CameraLimits } = {}
): Camera {
	const cx = useMotionValue(0)
	const cy = useMotionValue(0)
	const lw = useMotionValue(Math.log(1000))
	const width = useMotionValue(0)
	const height = useMotionValue(0)
	const flight = useRef<{ stop: () => void }[]>([])
	const listeners = useRef(new Set<(t: ViewTick) => void>())
	const baseListeners = useRef(new Set<(t: BaseTick) => void>())
	const lastTick = useRef<ViewTick>({ view: [0, 0, 1000, 625], W: 0, H: 0, upp: 1 })
	const base = useRef<(BaseTick & { M: number }) | null>(null)
	const settle = useRef(0)
	/** the next rebase is a draft (a jump that has to show at once, e.g. opening full screen) */
	const draftNext = useRef(false)
	/** the root's client rect, cached (see rootRect) */
	const rect = useRef<DOMRect | null>(null)
	/** pins in a mover, pins written every frame, and the movers */
	const pins = useRef(new Set<Pin>())
	const livePins = useRef(new Set<Pin>())
	const movers = useRef(new Set<HTMLElement>())
	/**
	 * Where the overlay is placed now (k, ox, oy) and what the pins in movers were last written at
	 * (bk, box, boy): the movers carry the difference
	 */
	const ov = useRef({ k: 0, ox: 0, oy: 0, bk: 0, box: 0, boy: 0, baked: false })
	const ovSettle = useRef(0)

	const aspect = useCallback(() => {
		const W = width.get()
		const H = height.get()
		return W > 0 && H > 0 ? W / H : 16 / 10
	}, [width, height])

	const view = useCallback((): Box => {
		const w = Math.exp(lw.get())
		const h = w / aspect()
		return [cx.get() - w / 2, cy.get() - h / 2, w, h]
	}, [cx, cy, lw, aspect])

	const upp = useCallback(() => {
		const W = width.get()
		return W > 0 ? Math.exp(lw.get()) / W : 1
	}, [lw, width])

	/**
	 * Render the svg at this view: a viewBox over the view plus a margin on every side, the svg
	 * element as large, with its own --upp / --tanaka. This is the expensive frame (every stroke
	 * is rasterized again); `apply` avoids it while it can.
	 */
	const rebase = useCallback(
		(t: ViewTick, draft = false, zoom = 0) => {
			const svg = svgRef.current
			const [x, y] = t.view
			const { W, H, upp: u } = t
			if (!(W > 0) || !(H > 0)) return
			const M = marginFor(W, H)
			let ax = x - M * u
			let ay = y - M * u
			// a pan at the same scale: keep the new area on the old one's device-pixel grid, so a
			// renderer can move what it drew by whole pixels and draw only the strips exposed
			const prev = base.current
			if (prev && prev.upp === u && prev.W === W && prev.H === H) {
				const g = u / Math.min(2, window.devicePixelRatio || 1)
				ax = prev.area[0] + Math.round((ax - prev.area[0]) / g) * g
				ay = prev.area[1] + Math.round((ay - prev.area[1]) / g) * g
			}
			const area: Box = [ax, ay, (W + 2 * M) * u, (H + 2 * M) * u]
			if (svg) {
				svg.setAttribute("viewBox", area.join(" "))
				setSvgView(svg, "upp", u)
				setSvgView(svg, "tanaka", u * tanakaPx)
				// the pane (the svg's parent) carries the size and the moves: a transform on the svg
				// itself would repaint every non-scaling stroke, whose width depends on it
				const s = paneOf(svg).style
				s.left = `${(ax - x) / u}px`
				s.top = `${(ay - y) / u}px`
				s.width = `${W + 2 * M}px`
				s.height = `${H + 2 * M}px`
				s.transformOrigin = `${(x - ax) / u}px ${(y - ay) / u}px`
				s.transform = "none"
				s.willChange = "transform"
			}
			const b = { ...t, area, draft, zoom, M }
			base.current = b
			baseListeners.current.forEach((fn) => fn(b))
		},
		[svgRef, tanakaPx]
	)

	/**
	 * Write every pin at the current placement and bring the movers home. Each pin's transform is
	 * its own px: no inherited variable to resolve, nothing else restyled.
	 */
	const bake = useCallback(() => {
		window.clearTimeout(ovSettle.current)
		const o = ov.current
		o.bk = o.k
		o.box = o.ox
		o.boy = o.oy
		o.baked = true
		for (const p of pins.current) p.write(p.el.style, p.x * o.k + o.ox, p.y * o.k + o.oy)
		for (const p of livePins.current) p.write(p.el.style, p.x * o.k + o.ox, p.y * o.k + o.oy)
		for (const m of movers.current) m.style.transform = "none"
	}, [])

	/** A pan at the same zoom: move the movers by what the view moved since the pins were written. */
	const shift = useCallback(() => {
		const o = ov.current
		const t = `translate3d(${o.ox - o.box}px, ${o.oy - o.boy}px, 0)`
		for (const m of movers.current) m.style.transform = t
		for (const p of livePins.current) p.write(p.el.style, p.x * o.k + o.ox, p.y * o.k + o.oy)
	}, [])

	/**
	 * Write the view to the DOM, once per frame however many values moved. The HTML pinned over the
	 * map follows exactly (`bake`, `shift`). The svg only moves: a compositor transform of what it last
	 * rendered (a pan costs no raster at all) until the view nears the edge of its margin or the
	 * zoom drifts too far; a zoom that comes to rest is rendered again, crisp.
	 */
	const apply = useCallback(
		/** force: render now (a jump), whatever the margin */
		(force = false) => {
			const svg = svgRef.current
			const v = view()
			const [x, y, w, h] = v
			const W = width.get()
			const H = height.get()
			if (!(w > 0) || !(h > 0) || !(W > 0)) return
			const k = W / w
			const u = 1 / k
			// the HTML over the map: a zoom writes every pin, a pan moves the movers (and writes the
			// pins once it stops)
			const o = ov.current
			o.k = k
			o.ox = -x * k
			o.oy = -y * k
			if (!o.baked || o.bk !== k) bake()
			else if (o.ox !== o.box || o.oy !== o.boy) {
				shift()
				window.clearTimeout(ovSettle.current)
				ovSettle.current = window.setTimeout(bake, SETTLE_MS)
			}
			const t: ViewTick = { view: v, W, H, upp: u }
			lastTick.current = t
			const b = base.current
			const scale = b ? b.upp / u : 1
			const dx = b ? (b.view[0] - x) / u : 0
			const dy = b ? (b.view[1] - y) / u : 0
			// the rendered area spans [dx − s·M, dx + s·(W + M)] on screen: how much is left past each edge
			const slack = b
				? Math.min(
						scale * b.M - dx,
						dx + scale * (W + b.M) - W,
						scale * b.M - dy,
						dy + scale * (H + b.M) - H
				  )
				: 0
			if (
				force ||
				!b ||
				b.W !== W ||
				b.H !== H ||
				Math.abs(Math.log(scale)) > REBASE_ZOOM ||
				slack < scale * b.M * 0.12
			) {
				// mid-zoom, a draft (the picture is scaled anyway); a pan, a jump or a resize, the real thing
				rebase(
					t,
					draftNext.current ||
						(!!b &&
							b.W === W &&
							b.H === H &&
							moving.current &&
							// while drafting (a zoom, or an opening that asked for it), keep drafting
							(Math.abs(scale - 1) > 1e-6 || b.draft)),
					b && b.W === W && b.H === H ? Math.log(u / b.upp) : 0
				)
				draftNext.current = false
			} else if (svg) {
				paneOf(svg).style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`
			}
			window.clearTimeout(settle.current)
			const now = base.current
			if (now && (now.draft || Math.abs(now.upp / u - 1) > 1e-6))
				settle.current = window.setTimeout(() => rebase(lastTick.current), SETTLE_MS)
			listeners.current.forEach((fn) => fn(t))
		},
		[svgRef, view, width, height, rebase, bake, shift]
	)

	/** the camera is gliding (a frame-loop update), not jumping (`set`) */
	const moving = useRef(false)
	const applyMoving = useCallback(() => {
		moving.current = true
		apply()
		moving.current = false
	}, [apply])

	useEffect(() => {
		const schedule = () => frameLoop.render(applyMoving)
		apply()
		const offs = [cx, cy, lw, width, height].map((mv) => mv.on("change", schedule))
		return () => {
			offs.forEach((off) => off())
			cancelFrame(applyMoving)
			window.clearTimeout(settle.current)
			window.clearTimeout(ovSettle.current)
		}
	}, [cx, cy, lw, width, height, apply, applyMoving])

	// track the viewport size (in a layout effect: callers framing a box in their own layout
	// effects, which run after this one, need the real aspect). The root's layout box: the svg is
	// larger than the view on purpose, and a tilted hero mustn't skew the measure.
	useLayoutEffect(() => {
		const el = rootRef.current
		if (!el) return
		const measure = () => {
			rect.current = null
			const w = el.clientWidth
			const h = el.clientHeight
			if (w > 0 && h > 0) {
				width.set(w)
				height.set(h)
			}
		}
		measure()
		const ro = new ResizeObserver(measure)
		ro.observe(el)
		return () => ro.disconnect()
	}, [rootRef, width, height])

	const stop = useCallback(() => {
		flight.current.forEach((c) => c.stop())
		flight.current = []
	}, [])

	/** Clamp a view box (already at the viewport's aspect) to the limits. */
	const clamp = useCallback(
		([x, y, w, h]: Box): Box => {
			const [bx, by, bw, bh] = limits.bounds
			let ccx = x + w / 2
			let ccy = y + h / 2
			// farthest: the whole box fits in the (slightly grown) bounds
			const maxScale = Math.min((bw * (1 + limits.slack)) / w, (bh * (1 + limits.slack)) / h)
			// closest: the shorter side spans minKm at the view's latitude
			const minSide = limits.minKm * SHARED.unitsPerKmAtY(ccy)
			const minScale = minSide / Math.min(w, h)
			const s = Math.max(Math.min(1, maxScale), minScale)
			const nw = w * s
			const nh = h * s
			ccx = keepIn(ccx, nw, bx, bw)
			ccy = keepIn(ccy, nh, by, bh)
			return [ccx - nw / 2, ccy - nh / 2, nw, nh]
		},
		[limits]
	)

	const frame = useCallback(
		(box: Box, pad = 0): Box => {
			const [x, y, w, h] = box
			const padded: Box = [x - w * pad, y - h * pad, w * (1 + 2 * pad), h * (1 + 2 * pad)]
			return clamp(fitAspect(padded, aspect()))
		},
		[aspect, clamp]
	)

	const set = useCallback(
		(box: Box, pad = 0, { draft = false }: { draft?: boolean } = {}) => {
			stop()
			const [x, y, w] = frame(box, pad)
			const h = w / aspect()
			cx.set(x + w / 2)
			cy.set(y + h / 2)
			lw.set(Math.log(w))
			// paint the new view now, not next frame (a layout effect framing before first paint)
			cancelFrame(applyMoving)
			draftNext.current = draft
			apply(true)
		},
		[stop, frame, aspect, cx, cy, lw, apply, applyMoving]
	)

	const fly = useCallback(
		(box: Box, { pad = 0, reduce = false }: { pad?: number; reduce?: boolean } = {}) => {
			if (reduce) {
				set(box, pad)
				return Promise.resolve()
			}
			stop()
			const [x, y, w, h] = frame(box, pad)
			const tx = x + w / 2
			const ty = y + h / 2
			const tw = Math.log(w)
			const w0 = Math.exp(lw.get())
			const dist = Math.hypot(tx - cx.get(), ty - cy.get())
			const far = dist > Math.max(w0, w) * HOP
			let controls: AnimationPlaybackControls[]
			if (far) {
				// rise until both ends are in view, then come down on the target
				const peak = Math.log(Math.max(w0, w, dist * 1.25))
				const duration = Math.min(1.6, 0.8 + Math.abs(peak - tw) * 0.12)
				const ease = [0.65, 0, 0.35, 1] as const
				controls = [
					animate(cx, tx, { duration, ease }),
					animate(cy, ty, { duration, ease }),
					animate(lw, [lw.get(), peak, tw], { duration, ease: [ease, ease], times: [0, 0.5, 1] }),
				]
			} else {
				controls = [
					animate(cx, tx, CAMERA_SPRING),
					animate(cy, ty, CAMERA_SPRING),
					animate(lw, tw, CAMERA_SPRING),
				]
			}
			flight.current = controls
			return Promise.all(controls.map((c) => c.finished)).then(
				() => undefined,
				() => undefined
			)
		},
		[set, stop, frame, cx, cy, lw]
	)

	const zoomAt = useCallback(
		(f: number, at?: Point, { animate: anim = false, reduce = false } = {}) => {
			const [vx, vy, vw, vh] = view()
			const [ax, ay] = at ?? [vx + vw / 2, vy + vh / 2]
			// clamp the scale first, so the anchor stays put at the limits too
			const [, , cw] = clamp([vx, vy, vw * f, vh * f])
			const g = cw / vw
			const w = vw * g
			const h = vh * g
			const box: Box = [ax - ((ax - vx) / vw) * w, ay - ((ay - vy) / vh) * h, w, h]
			if (anim && !reduce) {
				void fly(box)
				return
			}
			stop()
			const [nx, ny, nw, nh] = clamp(box)
			// held at a limit: leave the camera be (rounding would otherwise nudge it on every event,
			// and a camera that never rests is never drawn sharp)
			if (
				Math.abs(nw / vw - 1) < 1e-9 &&
				Math.abs(nx + nw / 2 - (vx + vw / 2)) < vw * 1e-9 &&
				Math.abs(ny + nh / 2 - (vy + vh / 2)) < vh * 1e-9
			)
				return
			cx.set(nx + nw / 2)
			cy.set(ny + nh / 2)
			lw.set(Math.log(nw))
		},
		[view, clamp, fly, stop, cx, cy, lw]
	)

	const panBy = useCallback(
		(dx: number, dy: number) => {
			const [bx, by, bw, bh] = limits.bounds
			const [, , vw, vh] = view()
			cx.set(keepIn(cx.get() + dx, vw, bx, bw))
			cy.set(keepIn(cy.get() + dy, vh, by, bh))
		},
		[cx, cy, limits, view]
	)

	const fling = useCallback(
		(vx: number, vy: number) => {
			stop()
			let raf = 0
			let last = performance.now()
			let ux = vx
			let uy = vy
			const step = (now: number) => {
				const dt = Math.min(48, now - last)
				last = now
				const decay = Math.exp(-dt / FLING_TAU)
				panBy(ux * dt, uy * dt)
				ux *= decay
				uy *= decay
				// stop once it moves less than ~a twentieth of a px per ms
				if (Math.hypot(ux, uy) / upp() < 0.02) return
				raf = requestAnimationFrame(step)
			}
			raf = requestAnimationFrame(step)
			flight.current = [{ stop: () => cancelAnimationFrame(raf) }]
		},
		[stop, panBy, upp]
	)

	// The root's client rect, kept between reads: every wheel event, pointer move and camera tick
	// (the cursor readout) asks for it, and measured each time it forced a style and layout pass
	// mid-frame (the camera had just written its variables), 2–3 s of a minute's gestures. It is
	// measured again after a scroll, a resize (window or root), or when the pointer comes back in.
	useEffect(() => {
		const drop = () => (rect.current = null)
		const root = rootRef.current
		window.addEventListener("scroll", drop, { capture: true, passive: true })
		window.addEventListener("resize", drop)
		root?.addEventListener("pointerenter", drop)
		return () => {
			window.removeEventListener("scroll", drop, { capture: true })
			window.removeEventListener("resize", drop)
			root?.removeEventListener("pointerenter", drop)
		}
	}, [rootRef])
	const rootRect = useCallback(() => {
		if (rect.current) return rect.current
		const r = rootRef.current?.getBoundingClientRect()
		rect.current = r ?? null
		return r
	}, [rootRef])

	const toMap = useCallback(
		(clientX: number, clientY: number): Point => {
			const r = rootRect()
			const [vx, vy] = view()
			const u = upp()
			return r ? [vx + (clientX - r.left) * u, vy + (clientY - r.top) * u] : [vx, vy]
		},
		[rootRect, view, upp]
	)

	const subscribe = useCallback((fn: (t: ViewTick) => void) => {
		listeners.current.add(fn)
		if (lastTick.current.W) fn(lastTick.current)
		return () => {
			listeners.current.delete(fn)
		}
	}, [])

	const subscribeBase = useCallback((fn: (t: BaseTick) => void) => {
		baseListeners.current.add(fn)
		if (base.current) fn(base.current)
		return () => {
			baseListeners.current.delete(fn)
		}
	}, [])

	const tick = useCallback(() => lastTick.current, [])

	const pin = useCallback(
		(el: HTMLElement, x: number, y: number, write: PinWrite = pinAt, live = false) => {
			const p: Pin = { el, x, y, write }
			const set = (live ? livePins : pins).current
			set.add(p)
			// in a mover, at the placement the pins there were written at (the mover adds the rest)
			const o = ov.current
			if (o.baked) {
				if (live) write(el.style, x * o.k + o.ox, y * o.k + o.oy)
				else write(el.style, x * o.bk + o.box, y * o.bk + o.boy)
			}
			return () => {
				set.delete(p)
			}
		},
		[]
	)

	const mover = useCallback((el: HTMLElement | null) => {
		if (!el) return
		const o = ov.current
		// its own layer: moving it is a compositor transform, not a repaint
		el.style.willChange = "transform"
		el.style.transform =
			o.baked && (o.ox !== o.box || o.oy !== o.boy)
				? `translate3d(${o.ox - o.box}px, ${o.oy - o.boy}px, 0)`
				: "none"
		movers.current.add(el)
		return () => {
			movers.current.delete(el)
		}
	}, [])

	useEffect(() => stop, [stop])

	return useMemo(
		() => ({
			cx,
			cy,
			lw,
			width,
			height,
			view,
			upp,
			set,
			fly,
			stop,
			frame,
			zoomAt,
			panBy,
			fling,
			toMap,
			subscribe,
			subscribeBase,
			tick,
			pin,
			mover,
		}),
		[
			cx,
			cy,
			lw,
			width,
			height,
			view,
			upp,
			set,
			fly,
			stop,
			frame,
			zoomAt,
			panBy,
			fling,
			toMap,
			subscribe,
			subscribeBase,
			tick,
			pin,
			mover,
		]
	)
}
