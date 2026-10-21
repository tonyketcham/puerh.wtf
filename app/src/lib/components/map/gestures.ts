"use client"

/**
 * Pan and zoom for every map (plan §4.7.6), as native listeners on the map's root:
 *
 * - mouse / pen: drag pans, and a release keeps gliding (fling; not under reduced motion)
 * - ⌘/Ctrl + wheel, and trackpad pinch (which arrives as ctrl + wheel, or Safari's gesture
 *   events), zoom around the cursor
 * - plain wheel: on an embedded map the page keeps scrolling and a hint says how to zoom; in the
 *   full-screen overlay a mouse wheel zooms and a trackpad's two-finger scroll pans
 * - double-click zooms in around the point, shift + double-click zooms out
 * - touch: two fingers pan and pinch; one finger scrolls the page (with a hint) everywhere but
 *   the full-screen overlay, where it pans: on a phone even /origins is a long page to scroll past
 *
 * A drag that moved swallows the click that ends it, so marks under the pointer don't fire.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import type { Camera } from "./camera"
import type { Point } from "./geo"

/**
 * - embedded: a map inside a page (the Properties inset, an origin hero)
 * - page:     /origins, a map that is the page (plain wheel scrolls it: the ridge hero flattens)
 * - overlay:  the full-screen map
 * - none:     a preview (peek): no gestures at all
 */
export type GestureMode = "embedded" | "page" | "overlay" | "none"

export type MapHint = "wheel" | "touch"

type Opts = {
	mode: GestureMode
	reduce: boolean
	/** the reader moved the camera (any gesture) */
	onMove?: () => void
	onHint?: (hint: MapHint) => void
}

/** Pointer targets that keep their own clicks (controls, marks, links). */
const UI = "a, button, input, select, textarea, [data-map-ui]"

const clampF = (v: number) => Math.max(-0.5, Math.min(0.5, v))

export function useMapGestures(
	rootRef: RefObject<HTMLElement | null>,
	camera: Camera,
	{ mode, reduce, onMove, onHint }: Opts
) {
	// the latest callbacks without re-binding listeners
	const cb = useRef({ onMove, onHint, reduce })
	useLayoutEffect(() => {
		cb.current = { onMove, onHint, reduce }
	})

	useEffect(() => {
		const el = rootRef.current
		if (!el || mode === "none") return
		const moved = () => cb.current.onMove?.()
		const hint = (h: MapHint) => cb.current.onHint?.(h)
		const isUi = (t: EventTarget | null) => t instanceof Element && !!t.closest(UI)

		// ---------------------------------------------------------------- mouse / pen drag
		let drag: { id: number; x: number; y: number; moved: boolean } | null = null
		let samples: { t: number; x: number; y: number }[] = []
		let swallowClick = false

		const onPointerDown = (e: PointerEvent) => {
			if (e.pointerType === "touch" || e.button !== 0 || isUi(e.target)) return
			camera.stop()
			drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
			samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }]
		}
		const onPointerMove = (e: PointerEvent) => {
			if (!drag || drag.id !== e.pointerId) return
			const dx = e.clientX - drag.x
			const dy = e.clientY - drag.y
			if (!drag.moved) {
				if (Math.hypot(dx, dy) < 3) return
				drag.moved = true
				el.setPointerCapture(e.pointerId)
				el.dataset.mapDragging = ""
				moved()
			}
			const u = camera.upp()
			camera.panBy(-dx * u, -dy * u)
			drag.x = e.clientX
			drag.y = e.clientY
			samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY })
			if (samples.length > 8) samples.shift()
		}
		const endDrag = (e: PointerEvent) => {
			if (!drag || drag.id !== e.pointerId) return
			const d = drag
			drag = null
			delete el.dataset.mapDragging
			if (!d.moved) return
			swallowClick = true
			window.setTimeout(() => (swallowClick = false), 0)
			if (e.type === "pointercancel" || cb.current.reduce) return
			const v = velocity(samples, e.timeStamp)
			if (v && Math.hypot(v[0], v[1]) > 0.25) {
				const u = camera.upp()
				camera.fling(-v[0] * u, -v[1] * u)
			}
		}
		const onClickCapture = (e: MouseEvent) => {
			if (!swallowClick) return
			swallowClick = false
			e.preventDefault()
			e.stopPropagation()
		}

		// ---------------------------------------------------------------- wheel
		const onWheel = (e: WheelEvent) => {
			const zoomKey = e.ctrlKey || e.metaKey
			const lines = e.deltaMode === 1
			if (zoomKey) {
				e.preventDefault()
				moved()
				camera.stop()
				const dy = lines ? e.deltaY * 33 : e.deltaY
				camera.zoomAt(Math.exp(clampF(dy * 0.006)), camera.toMap(e.clientX, e.clientY))
				return
			}
			if (mode === "overlay") {
				e.preventDefault()
				moved()
				camera.stop()
				// a mouse wheel clicks in whole lines or big round steps; a trackpad scrolls finely
				const mouse = lines || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && e.deltaY % 1 === 0)
				if (mouse) {
					const dy = lines ? e.deltaY * 33 : e.deltaY
					camera.zoomAt(Math.exp(clampF(dy * 0.004)), camera.toMap(e.clientX, e.clientY))
				} else {
					const u = camera.upp()
					camera.panBy(e.deltaX * u, e.deltaY * u)
				}
				return
			}
			if (mode === "embedded" && Math.abs(e.deltaY) > Math.abs(e.deltaX)) hint("wheel")
		}

		// Safari's trackpad pinch
		let gestureScale = 1
		const onGestureStart = (e: Event) => {
			e.preventDefault()
			gestureScale = 1
		}
		const onGestureChange = (e: Event) => {
			e.preventDefault()
			const g = e as Event & { scale: number; clientX: number; clientY: number }
			moved()
			camera.stop()
			camera.zoomAt(gestureScale / g.scale, camera.toMap(g.clientX, g.clientY))
			gestureScale = g.scale
		}

		// ---------------------------------------------------------------- double-click
		const onDblClick = (e: MouseEvent) => {
			if (isUi(e.target)) return
			e.preventDefault()
			moved()
			camera.zoomAt(e.shiftKey ? 2 : 0.5, camera.toMap(e.clientX, e.clientY), {
				animate: true,
				reduce: cb.current.reduce,
			})
		}

		// ---------------------------------------------------------------- touch
		let touch: { c: Point; d: number; n: number; start: Point; moved: boolean } | null = null
		let tSamples: { t: number; x: number; y: number }[] = []
		const read = (list: TouchList) => {
			let x = 0
			let y = 0
			for (const t of Array.from(list)) {
				x += t.clientX
				y += t.clientY
			}
			const n = list.length
			const c: Point = [x / n, y / n]
			const d =
				n > 1 ? Math.hypot(list[0].clientX - list[1].clientX, list[0].clientY - list[1].clientY) : 0
			return { c, d, n }
		}
		const onTouchStart = (e: TouchEvent) => {
			if (isUi(e.target) && e.touches.length === 1) return
			const r = read(e.touches)
			if (r.n > 1) e.preventDefault()
			if (mode !== "overlay" && r.n === 1) {
				touch = { ...r, start: r.c, moved: false }
				return
			}
			camera.stop()
			touch = { ...r, start: r.c, moved: false }
			tSamples = [{ t: e.timeStamp, x: r.c[0], y: r.c[1] }]
		}
		const onTouchMove = (e: TouchEvent) => {
			if (!touch) return
			const r = read(e.touches)
			if (mode !== "overlay" && r.n === 1) {
				// one finger scrolls the page; say how to move the map instead
				if (Math.hypot(r.c[0] - touch.start[0], r.c[1] - touch.start[1]) > 12) hint("touch")
				return
			}
			e.preventDefault()
			if (r.n !== touch.n) {
				// a finger landed or lifted: restart from here, no jump
				touch = { ...r, start: r.c, moved: touch.moved }
				return
			}
			if (!touch.moved) {
				touch.moved = true
				moved()
			}
			const u = camera.upp()
			if (r.n > 1 && touch.d > 0 && r.d > 0)
				camera.zoomAt(touch.d / r.d, camera.toMap(r.c[0], r.c[1]))
			camera.panBy(-(r.c[0] - touch.c[0]) * u, -(r.c[1] - touch.c[1]) * u)
			touch.c = r.c
			touch.d = r.d
			tSamples.push({ t: e.timeStamp, x: r.c[0], y: r.c[1] })
			if (tSamples.length > 8) tSamples.shift()
		}
		const onTouchEnd = (e: TouchEvent) => {
			if (!touch) return
			if (e.touches.length) {
				const r = read(e.touches)
				touch = { ...r, start: r.c, moved: touch.moved }
				tSamples = []
				return
			}
			const t = touch
			touch = null
			if (!t.moved || cb.current.reduce || e.type === "touchcancel") return
			const v = velocity(tSamples, e.timeStamp)
			if (v && Math.hypot(v[0], v[1]) > 0.25) {
				const u = camera.upp()
				camera.fling(-v[0] * u, -v[1] * u)
			}
		}

		const opts = { passive: false } as const
		el.addEventListener("pointerdown", onPointerDown)
		el.addEventListener("pointermove", onPointerMove)
		el.addEventListener("pointerup", endDrag)
		el.addEventListener("pointercancel", endDrag)
		el.addEventListener("click", onClickCapture, true)
		el.addEventListener("wheel", onWheel, opts)
		el.addEventListener("gesturestart", onGestureStart, opts)
		el.addEventListener("gesturechange", onGestureChange, opts)
		el.addEventListener("dblclick", onDblClick)
		el.addEventListener("touchstart", onTouchStart, opts)
		el.addEventListener("touchmove", onTouchMove, opts)
		el.addEventListener("touchend", onTouchEnd)
		el.addEventListener("touchcancel", onTouchEnd)
		return () => {
			el.removeEventListener("pointerdown", onPointerDown)
			el.removeEventListener("pointermove", onPointerMove)
			el.removeEventListener("pointerup", endDrag)
			el.removeEventListener("pointercancel", endDrag)
			el.removeEventListener("click", onClickCapture, true)
			el.removeEventListener("wheel", onWheel)
			el.removeEventListener("gesturestart", onGestureStart)
			el.removeEventListener("gesturechange", onGestureChange)
			el.removeEventListener("dblclick", onDblClick)
			el.removeEventListener("touchstart", onTouchStart)
			el.removeEventListener("touchmove", onTouchMove)
			el.removeEventListener("touchend", onTouchEnd)
			el.removeEventListener("touchcancel", onTouchEnd)
		}
	}, [rootRef, camera, mode])
}

/** px per ms over the last ~90 ms of samples (null when the pointer had come to rest). */
function velocity(samples: { t: number; x: number; y: number }[], now: number): Point | null {
	const last = samples[samples.length - 1]
	if (!last || now - last.t > 60) return null
	const first = samples.find((s) => last.t - s.t <= 90) ?? samples[0]
	const dt = last.t - first.t
	if (dt < 8) return null
	return [(last.x - first.x) / dt, (last.y - first.y) / dt]
}
