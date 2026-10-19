"use client"

/**
 * The map camera: a spring-driven viewBox over pre-projected SVG (plan §4.5 "spring-animated
 * viewBox"). Three motion values (center x, center y, log width) drive the <svg> viewBox and
 * a handful of CSS variables on the map's root element, so nothing re-renders while it moves:
 *
 *   --upp      user units per screen px          (screen-constant marks: .map-px)
 *   --tanaka   ~0.6 px in user units             (Tanaka offsets: .map-tanaka-*)
 *   --k        screen px per user unit           ┐ HTML overlays place a point (X, Y) at
 *   --ox --oy  screen px of user-space origin    ┘ X·k + ox, Y·k + oy
 *
 * Width springs in log space, so a zoom feels even whether it doubles or halves; a long
 * flight rises over the map and comes down again instead of sliding across it.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react"
import {
	animate,
	useMotionValue,
	type AnimationPlaybackControls,
	type MotionValue,
} from "motion/react"
import { CAMERA_SPRING, fitAspect, type Box } from "./geo"

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
	set: (box: Box, pad?: number) => void
	/** travel to show `box`; resolves when it lands */
	fly: (box: Box, opts?: { pad?: number; reduce?: boolean }) => Promise<void>
	/** stop any flight where it is */
	stop: () => void
	/** the [x, y, w, h] a box would be shown at (aspect-fitted, padded) */
	frame: (box: Box, pad?: number) => Box
}

/** Same-scale hops shorter than this many view widths spring; longer ones fly an arc. */
const HOP = 1.6

export function useCamera(
	rootRef: RefObject<HTMLElement | null>,
	svgRef: RefObject<SVGSVGElement | null>,
	{ tanakaPx = 0.6 }: { tanakaPx?: number } = {}
): Camera {
	const cx = useMotionValue(0)
	const cy = useMotionValue(0)
	const lw = useMotionValue(Math.log(1000))
	const width = useMotionValue(0)
	const height = useMotionValue(0)
	const flight = useRef<AnimationPlaybackControls[]>([])

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

	// write the view to the DOM on any change
	useEffect(() => {
		const apply = () => {
			const svg = svgRef.current
			const root = rootRef.current
			const [x, y, w, h] = view()
			if (!(w > 0) || !(h > 0)) return
			svg?.setAttribute("viewBox", `${x} ${y} ${w} ${h}`)
			if (root) {
				const W = width.get() || 1
				const k = W / w
				const u = 1 / k
				root.style.setProperty("--upp", `${u}`)
				root.style.setProperty("--tanaka", `${u * tanakaPx}`)
				root.style.setProperty("--k", `${k}`)
				root.style.setProperty("--ox", `${-x * k}`)
				root.style.setProperty("--oy", `${-y * k}`)
			}
		}
		apply()
		const offs = [cx, cy, lw, width, height].map((mv) => mv.on("change", apply))
		return () => offs.forEach((off) => off())
	}, [cx, cy, lw, width, height, view, rootRef, svgRef, tanakaPx])

	// track the viewport size (in a layout effect: callers framing a box in their own layout
	// effects, which run after this one, need the real aspect)
	useLayoutEffect(() => {
		const el = svgRef.current
		if (!el) return
		const measure = () => {
			const r = el.getBoundingClientRect()
			if (r.width > 0 && r.height > 0) {
				width.set(r.width)
				height.set(r.height)
			}
		}
		measure()
		const ro = new ResizeObserver(measure)
		ro.observe(el)
		return () => ro.disconnect()
	}, [svgRef, width, height])

	const stop = useCallback(() => {
		flight.current.forEach((c) => c.stop())
		flight.current = []
	}, [])

	const frame = useCallback(
		(box: Box, pad = 0): Box => {
			const [x, y, w, h] = box
			const padded: Box = [x - w * pad, y - h * pad, w * (1 + 2 * pad), h * (1 + 2 * pad)]
			return fitAspect(padded, aspect())
		},
		[aspect]
	)

	const set = useCallback(
		(box: Box, pad = 0) => {
			stop()
			const [x, y, w, h] = frame(box, pad)
			cx.set(x + w / 2)
			cy.set(y + h / 2)
			lw.set(Math.log(w))
		},
		[stop, frame, cx, cy, lw]
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

	useEffect(() => stop, [stop])

	return useMemo(
		() => ({ cx, cy, lw, width, height, view, upp, set, fly, stop, frame }),
		[cx, cy, lw, width, height, view, upp, set, fly, stop, frame]
	)
}
