"use client"

import {
	animate,
	motion,
	useReducedMotion,
	useSpring,
	useTransform,
	type MotionValue,
} from "motion/react"
import { useRef, type KeyboardEvent, type PointerEvent } from "react"
import { cn } from "@/lib/utils/cn"
import { clamp, withAlpha } from "./geometry"

interface PhaseScrubberProps {
	/** Live phase, 0 = start, 1 = finish. Written directly while dragging, sprung otherwise. */
	phase: MotionValue<number>
	/** Quantized mirror of the phase, for aria-valuenow / valuetext. */
	value: number
	color: string
	/** Pointer down / key press: the scrubber is now driving the phase. */
	onScrubStart?: () => void
	/** Pointer released. */
	onScrubEnd?: () => void
	className?: string
}

// Geometry (px). The thumb is half the track, like a segmented control, but it can rest
// anywhere in between — a blend of start and finish.
const W = 100
const PAD = 2
const THUMB = (W - PAD * 2) / 2
const TRAVEL = W - PAD * 2 - THUMB
const SNAP_ZONE = 0.12
const DRAG_SLOP = 3
const GLIDE = { type: "spring", stiffness: 480, damping: 36, mass: 0.7 } as const

function valueText(v: number) {
	if (v <= 0.02) return "start"
	if (v >= 0.98) return "finish"
	return `${Math.round(v * 100)}% toward finish`
}

/**
 * Compact segmented "start ⇄ finish" scrubber.
 * - tap a side → glide there; drag anywhere → continuous blend (soft-snaps near the ends)
 * - double-click the thumb → flip ends
 * - keyboard: ←/→ (Shift = bigger steps), Home/End, Enter/Space to flip
 */
export default function PhaseScrubber({
	phase,
	value,
	color,
	onScrubStart,
	onScrubEnd,
	className,
}: PhaseScrubberProps) {
	const reduce = useReducedMotion() ?? false
	const trackRef = useRef<HTMLDivElement>(null)
	const drag = useRef<{
		id: number
		offset: number
		x0: number
		vDown: number
		moved: boolean
		onThumb: boolean
	} | null>(null)
	const lastPressOnThumb = useRef(false)
	const target = useRef<number | null>(null)

	// a very tight spring: attached to the finger while dragging, smooth on external jumps
	const sprung = useSpring(phase, { stiffness: 900, damping: 60, mass: 0.5 })
	const shown = reduce ? phase : sprung
	const thumbX = useTransform(shown, (v) => clamp(v, 0, 1) * TRAVEL)
	const fill = useTransform(shown, (v) => clamp(v, 0, 1))
	const startInk = useTransform(shown, [0, 1], [1, 0.4])
	const finishInk = useTransform(shown, [0, 1], [0.4, 1])

	const glide = (to: number) => {
		const v = clamp(to, 0, 1)
		target.current = v
		if (reduce) {
			phase.stop()
			phase.set(v)
			return
		}
		animate(phase, v, GLIDE)
	}

	const valueAt = (clientX: number) => {
		const el = trackRef.current
		if (!el) return phase.get()
		const rect = el.getBoundingClientRect()
		const scale = rect.width / W || 1
		return (clientX - rect.left - (PAD + THUMB / 2) * scale) / (TRAVEL * scale)
	}

	const base = () => (phase.isAnimating() && target.current !== null ? target.current : phase.get())

	const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return
		e.preventDefault()
		const el = e.currentTarget
		el.focus({ preventScroll: true })
		el.setPointerCapture(e.pointerId)
		onScrubStart?.()
		const v = valueAt(e.clientX)
		const cur = phase.get()
		// thumb spans ±0.5 in value space (it's half the track)
		const onThumb = Math.abs(v - cur) <= 0.5
		drag.current = {
			id: e.pointerId,
			offset: v - cur,
			x0: e.clientX,
			vDown: v,
			moved: false,
			onThumb,
		}
		lastPressOnThumb.current = onThumb
	}

	const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
		const d = drag.current
		if (!d || d.id !== e.pointerId) return
		if (!d.moved) {
			if (Math.abs(e.clientX - d.x0) < DRAG_SLOP) return
			d.moved = true
			e.currentTarget.dataset.dragging = "true"
		}
		phase.stop()
		const v = clamp(valueAt(e.clientX) - d.offset, 0, 1)
		target.current = v
		phase.set(v)
	}

	const endDrag = (e: PointerEvent<HTMLDivElement>) => {
		const d = drag.current
		if (!d || d.id !== e.pointerId) return
		drag.current = null
		delete e.currentTarget.dataset.dragging
		if (e.currentTarget.hasPointerCapture(e.pointerId))
			e.currentTarget.releasePointerCapture(e.pointerId)
		if (d.moved) {
			const v = phase.get()
			if (v < SNAP_ZONE) glide(0)
			else if (v > 1 - SNAP_ZONE) glide(1)
		} else if (!d.onThumb && e.type === "pointerup") {
			glide(d.vDown < 0.5 ? 0 : 1)
		}
		onScrubEnd?.()
	}

	const onDoubleClick = () => {
		// a double-tap on the far side already glided there on the first tap
		if (!lastPressOnThumb.current) return
		onScrubStart?.()
		glide(base() < 0.5 ? 1 : 0)
	}

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		const step = e.shiftKey ? 0.25 : 0.1
		const b = base()
		let next: number | null = null
		switch (e.key) {
			case "ArrowRight":
			case "ArrowUp":
				next = b + step
				break
			case "ArrowLeft":
			case "ArrowDown":
				next = b - step
				break
			case "PageUp":
				next = b + 0.25
				break
			case "PageDown":
				next = b - 0.25
				break
			case "Home":
				next = 0
				break
			case "End":
				next = 1
				break
			case "Enter":
			case " ":
				next = b < 0.5 ? 1 : 0
				break
		}
		if (next === null) return
		e.preventDefault()
		onScrubStart?.()
		// land exactly on the ends when stepping close to them
		const n = clamp(next, 0, 1)
		glide(n < 0.04 ? 0 : n > 0.96 ? 1 : n)
	}

	return (
		<motion.div
			ref={trackRef}
			role="slider"
			tabIndex={0}
			aria-label="Flavor phase, start to finish"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(value * 100)}
			aria-valuetext={valueText(value)}
			aria-orientation="horizontal"
			title="start ⇄ finish · drag, ←/→, double-click to flip"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
			onDoubleClick={onDoubleClick}
			onKeyDown={onKeyDown}
			initial="rest"
			animate="rest"
			whileHover="hover"
			whileTap="press"
			className={cn(
				"group/scrub relative grid shrink-0 grid-cols-2 h-[22px] rounded-[7px] border border-white/10 bg-black/35",
				"text-[10px] leading-none select-none touch-none cursor-grab outline-none",
				"transition-colors duration-150 hover:border-white/20 data-[dragging=true]:cursor-grabbing",
				"focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#171617]",
				className
			)}
			style={{ width: W }}
		>
			<motion.div
				aria-hidden
				className="absolute rounded-[5px] pointer-events-none"
				variants={{
					rest: { scaleY: 1, scaleX: 1 },
					hover: { scaleY: 1, scaleX: 1 },
					press: { scaleY: 0.92, scaleX: 0.97 },
				}}
				transition={{ type: "spring", stiffness: 600, damping: 30 }}
				style={{
					top: PAD,
					bottom: PAD,
					left: PAD,
					width: THUMB,
					x: thumbX,
					background: withAlpha(color, 22),
					boxShadow: `inset 0 0 0 1px ${withAlpha(color, 60)}, 0 0 14px -3px ${withAlpha(
						color,
						55
					)}`,
				}}
			/>
			<motion.span
				aria-hidden
				className="relative grid place-items-center text-white pointer-events-none"
				style={{ opacity: startInk }}
			>
				start
			</motion.span>
			<motion.span
				aria-hidden
				className="relative grid place-items-center text-white pointer-events-none"
				style={{ opacity: finishInk }}
			>
				finish
			</motion.span>
			{/* liquor fill: how far toward finish */}
			<span
				aria-hidden
				className="absolute left-[7px] right-[7px] -bottom-px h-px overflow-hidden bg-white/5 pointer-events-none"
			>
				<motion.span
					className="block h-full origin-left"
					style={{ scaleX: fill, background: color }}
				/>
			</span>
		</motion.div>
	)
}
