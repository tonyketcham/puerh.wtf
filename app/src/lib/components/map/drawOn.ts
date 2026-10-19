"use client"

/**
 * Draw-on for hairlines that carry `vector-effect: non-scaling-stroke`.
 *
 * motion's `pathLength` can't be used on those: Chrome sizes pathLength-normalized dashes in
 * user units but lays them along the screen-space stroke, so a path drawn at 3× zoom stops a
 * third of the way. Here the dash is measured in screen pixels instead (total length × the
 * element's screen scale), animated with WAAPI, and removed when it lands, so the line ends
 * as a plain stroke whatever the camera does in the meantime.
 */
import { useLayoutEffect, type RefObject } from "react"

export const DRAW_EASING = "cubic-bezier(0.22, 1, 0.36, 1)"

export type DrawOptions = {
	/** ms */
	delay?: number
	/** ms */
	duration?: number
	/** reduced motion: fade in instead of drawing */
	reduce?: boolean
	/** false skips the animation (the line is simply there) */
	play?: boolean
}

/** Screen pixels per user unit at the element (uniform scale assumed). */
function screenScale(el: SVGGraphicsElement): number {
	const m = el.getScreenCTM()
	if (!m) return 0
	return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
}

/** Draw a stroke on once. Returns a cancel function. */
export function drawOn(
	el: SVGGeometryElement,
	{ delay = 0, duration = 400, reduce = false }: DrawOptions = {}
): () => void {
	if (reduce) {
		const a = el.animate([{ opacity: 0 }, { opacity: 1 }], {
			duration: 200,
			delay: delay * 0.25,
			fill: "backwards",
		})
		return () => a.cancel()
	}
	const scale = screenScale(el)
	let len = 0
	try {
		len = el.getTotalLength() * scale
	} catch {
		len = 0
	}
	if (!(len > 0) || !Number.isFinite(len)) return () => {}
	const dash = Math.ceil(len) + 2
	el.style.strokeDasharray = `${dash} ${dash}`
	const a = el.animate([{ strokeDashoffset: `${dash}` }, { strokeDashoffset: "0" }], {
		duration,
		delay,
		easing: DRAW_EASING,
		fill: "backwards",
	})
	const clear = () => {
		el.style.removeProperty("stroke-dasharray")
	}
	a.onfinish = clear
	return () => {
		a.cancel()
		clear()
	}
}

/**
 * Draw the referenced stroke on whenever `key` changes (and on mount). `play: false` leaves the
 * line drawn without animating.
 */
export function useDrawOn(
	ref: RefObject<SVGGeometryElement | null>,
	key: unknown,
	{ delay = 0, duration = 400, reduce = false, play = true }: DrawOptions = {}
) {
	useLayoutEffect(() => {
		const el = ref.current
		if (!el || !play) return
		return drawOn(el, { delay, duration, reduce })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, play])
}
