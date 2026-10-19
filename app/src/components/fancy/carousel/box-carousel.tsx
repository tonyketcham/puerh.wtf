"use client"

import React, {
	forwardRef,
	memo,
	ReactNode,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react"
import {
	animate,
	motion,
	useAnimationFrame,
	useMotionValue,
	useMotionValueEvent,
	useReducedMotion,
	useSpring,
	useTransform,
	ValueAnimationTransition,
} from "motion/react"

import { cn } from "@/lib/utils/cn"

interface CarouselItem {
	/**
	 * Unique identifier for the carousel item
	 */
	id: string
	/**
	 * The type of media: "image" or "video"
	 */
	type: "image" | "video"
	/**
	 * Source URL for the image or video
	 */
	src: string
	/**
	 * (Optional) Alternative text for images
	 */
	alt?: string
	/**
	 * (Optional) Poster image for videos (displayed before playback)
	 */
	poster?: string
}

/**
 * Props for a single face of the cube in the BoxCarousel.
 */
interface FaceProps {
	/**
	 * The CSS transform string to position and rotate the face in 3D space.
	 */
	transform: string
	/**
	 * Optional additional CSS class names for the face.
	 */
	className?: string
	/**
	 * Optional React children to render inside the face.
	 */
	children?: ReactNode
	/**
	 * Optional inline styles for the face.
	 */
	style?: React.CSSProperties
	/**
	 * If true, enables debug mode (e.g., shows backface and opacity).
	 */
	debug?: boolean
}

const CubeFace = memo(({ transform, className, children, style, debug }: FaceProps) => (
	<div
		className={cn(
			"absolute overflow-hidden border-1 border-white",
			"before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none before:z-10",
			"before:[box-shadow:inset_0_0_32px_8px_rgba(255,255,255,0.25)]",
			debug && "backface-visible opacity-50",
			className
		)}
		style={{ transform, ...style }}
	>
		{children}
	</div>
))

CubeFace.displayName = "CubeFace"

const MediaRenderer = memo(
	({
		item,
		className,
		debug = false,
	}: {
		item?: CarouselItem
		className?: string
		debug?: boolean
	}) => {
		if (!item) return null

		if (!debug) {
			if (item.type === "video") {
				return (
					<video
						src={item.src}
						poster={item.poster}
						className={cn("object-cover w-full h-full rounded", className)}
						muted
						loop
						autoPlay
					/>
				)
			}

			return (
				<img
					src={item.src}
					alt={item.alt || ""}
					draggable={false}
					className={cn("object-cover w-full h-full rounded", className)}
				/>
			)
		}

		return (
			<div
				className={cn("flex items-center justify-center w-full h-full text-2xl border", className)}
			>
				{item.id}
			</div>
		)
	}
)

MediaRenderer.displayName = "MediaRenderer"

/** Opaque view snapshot: pass back to `restore()` to return to exactly this view. */
export type BoxCarouselSnapshot = {
	rotation: number
	index: number
}

export interface BoxCarouselRef {
	/**
	 * Advance to the next item in the carousel.
	 */
	next: () => void

	/**
	 * Go back to the previous item in the carousel.
	 */
	prev: () => void

	/**
	 * Rotate to an arbitrary item. Takes the shortest path: a single 90° turn whose incoming
	 * face is loaded with the target (no multi-face spins). Spring-driven and interruption-safe:
	 * calling it again mid-turn retargets from the current velocity.
	 */
	goTo: (index: number) => void

	/**
	 * Get the index of the currently visible item.
	 */
	getCurrentItemIndex: () => number

	/** Capture the current view (exact rotation + visible item). */
	getSnapshot: () => BoxCarouselSnapshot

	/** Return to a snapshot: the exact rotation if that face still shows the item, else goTo(index). */
	restore: (snapshot: BoxCarouselSnapshot) => void
}

type RotationDirection = "top" | "bottom" | "left" | "right"

interface SpringConfig {
	stiffness?: number
	damping?: number
	mass?: number
}

/**
 * Props for the BoxCarousel component
 */
interface BoxCarouselProps
	extends Omit<
		React.HTMLProps<HTMLDivElement>,
		"onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd"
	> {
	/**
	 * Array of items to display in the carousel
	 */
	items: CarouselItem[]

	/**
	 * Width of the carousel in pixels
	 */
	width: number

	/**
	 * Height of the carousel in pixels
	 */
	height: number

	/**
	 * Additional CSS classes for the container
	 */
	className?: string

	/**
	 * Enable debug mode (shows extra info/overlays)
	 */
	debug?: boolean

	/**
	 * Perspective value for 3D effect (in px)
	 * @default 600
	 */
	perspective?: number

	/**
	 * The axis and direction of rotation
	 * "top" | "bottom" | "left" | "right"
	 * @default "left"
	 */
	direction?: RotationDirection

	/**
	 * Transition for next / prev / goTo turns
	 * @default { type: "spring", stiffness: 150, damping: 21, mass: 1.1 }
	 */
	transition?: ValueAnimationTransition

	/**
	 * Transition for snapping after drag
	 * @default { type: "spring", damping: 30, stiffness: 200 }
	 */
	snapTransition?: ValueAnimationTransition

	/**
	 * Spring physics for the hover scale
	 * @default { stiffness: 300, damping: 30 }
	 */
	dragSpring?: SpringConfig

	/**
	 * Enable auto-play mode
	 * @default false
	 */
	autoPlay?: boolean

	/**
	 * Interval (ms) between auto-play transitions
	 * @default 3000
	 */
	autoPlayInterval?: number

	/**
	 * Enable continuous rotation (smooth, infinite rotation)
	 * Takes precedence over autoPlay if both are enabled. Disabled when any scroll control is on.
	 * @default false
	 */
	continuousRotation?: boolean

	/**
	 * Speed of continuous rotation in degrees per second
	 * @default 30
	 */
	continuousSpeed?: number

	/**
	 * Speed multiplier during turns (near 90-degree boundaries) in continuous mode
	 * @default 3
	 */
	turnSpeedMultiplier?: number

	/**
	 * Scale factor when hovered (e.g., 1.05 = 5% larger)
	 * @default 1.05
	 */
	hoverScale?: number

	/**
	 * Enable scroll wheel control for rotation (wheel over the cube rotates it)
	 * @default false
	 */
	enableScrollControl?: boolean

	/**
	 * Sensitivity of scroll wheel control
	 * @default 1
	 */
	scrollSensitivity?: number

	/**
	 * Tie rotation to page scroll while the cube is in the viewport
	 * @default false
	 */
	enablePageScrollControl?: boolean

	/**
	 * Sensitivity of page scroll control
	 * @default 0.5
	 */
	pageScrollSensitivity?: number

	/**
	 * Offset from top of viewport where scroll control starts (in pixels)
	 * @default 0
	 */
	scrollOffset?: number

	/**
	 * Pause continuous rotation on hover
	 * @default true
	 */
	pauseOnHover?: boolean

	/**
	 * Pause continuous rotation during drag interaction
	 * @default true
	 */
	pauseOnDrag?: boolean

	/**
	 * Callback when the visible item index changes
	 */
	onIndexChange?: (index: number) => void

	/**
	 * Called when the user starts/stops interacting with the cube
	 * (pointer over it, dragging it, or keyboard focus).
	 */
	onInteractingChange?: (interacting: boolean) => void

	/**
	 * Enable drag interaction
	 * @default true
	 */
	enableDrag?: boolean

	/**
	 * Sensitivity of drag (higher = more rotation per pixel)
	 * @default 0.5
	 */
	dragSensitivity?: number

	/**
	 * Resting rotation offset in degrees (the cube's "pose"; kept by every snap)
	 * @default 0
	 */
	initialRotationOffset?: number
}

const mod = (a: number, n: number) => ((a % n) + n) % n

/** The cube is always shown tilted by this much on both axes (see `transform` below) */
const TILT_DEG = 6

/**
 * Face content model.
 *
 * The cube is treated as an infinite strip of virtual faces k ∈ ℤ (k = 0 at rest, +1 per
 * "next"). Virtual face k is drawn on physical face mod(k + 1, 4) and shows
 * `overrides.get(k) ?? items[mod(k + base, n)]`. Only the 4 faces in the window around the
 * current step are rendered, so content only ever changes on the face that is hidden at the
 * back — every item is reachable however the cube is turned (drag, wheel, page scroll).
 *
 * goTo() re-bases the strip so the adjacent face holds the target, freezing the currently
 * visible faces as overrides so nothing on screen changes content.
 */
type FaceModel = {
	base: number
	overrides: Map<number, number>
	step: number
	/** last direction of travel (decides which side the back face is loaded for) */
	dir: 1 | -1
}

const windowOf = (m: FaceModel) => [m.step - 1, m.step, m.step + 1, m.step + 2 * m.dir]

const BoxCarousel = forwardRef<BoxCarouselRef, BoxCarouselProps>(
	(
		{
			items,
			width,
			height,
			className,
			perspective = 600,
			debug = false,
			direction = "left",
			transition = { type: "spring", stiffness: 150, damping: 21, mass: 1.1 },
			snapTransition = { type: "spring", damping: 30, stiffness: 200 },
			dragSpring = { stiffness: 300, damping: 30 },
			autoPlay = false,
			autoPlayInterval = 3000,
			continuousRotation = false,
			continuousSpeed = 30,
			turnSpeedMultiplier = 3,
			hoverScale = 1.05,
			enableScrollControl = false,
			scrollSensitivity = 1,
			enablePageScrollControl = false,
			pageScrollSensitivity = 0.5,
			scrollOffset = 0,
			pauseOnHover = true,
			pauseOnDrag = true,
			onIndexChange,
			onInteractingChange,
			enableDrag = true,
			dragSensitivity = 0.5,
			initialRotationOffset = 0,
			...props
		},
		ref
	) => {
		const n = items.length
		const prefersReducedMotion = useReducedMotion()

		// +1: "next" increases the rotation angle; -1: "next" decreases it
		const dirSign = direction === "top" || direction === "right" ? 1 : -1
		// legacy wheel / page-scroll / auto-spin sense (kept from the original component)
		const spinSign = direction === "top" || direction === "left" ? -1 : 1
		const isVertical = direction === "top" || direction === "bottom"
		const restOffset = initialRotationOffset

		/** Single source of truth for rotation (degrees about the direction's axis) */
		const rotation = useMotionValue(initialRotationOffset)

		const stepOf = useCallback((deg: number) => Math.round((dirSign * deg) / 90) + 0, [dirSign])
		const angleOf = useCallback(
			(step: number) => dirSign * step * 90 + restOffset,
			[dirSign, restOffset]
		)

		const [model, setModel] = useState<FaceModel>(() => ({
			base: 0,
			overrides: new Map(),
			step: stepOf(initialRotationOffset),
			dir: 1,
		}))
		const modelRef = useRef(model)
		const commit = useCallback((next: FaceModel) => {
			modelRef.current = next
			setModel(next)
		}, [])

		const contentAt = useCallback(
			(m: FaceModel, k: number) => (n ? m.overrides.get(k) ?? mod(k + m.base, n) : 0),
			[n]
		)

		// Discrete step tracking: React state only changes when the front face changes
		useMotionValueEvent(rotation, "change", (deg) => {
			const step = stepOf(deg)
			const m = modelRef.current
			if (step === m.step) return
			const next: FaceModel = { ...m, step, dir: step > m.step ? 1 : -1 }
			const keep = new Set(windowOf(next))
			const overrides = new Map<number, number>()
			m.overrides.forEach((v, k) => keep.has(k) && overrides.set(k, v))
			commit({ ...next, overrides })
		})

		const currentItemIndex = contentAt(model, model.step)

		const onIndexChangeRef = useRef(onIndexChange)
		onIndexChangeRef.current = onIndexChange
		const firstIndexRef = useRef(true)
		useEffect(() => {
			if (firstIndexRef.current) {
				firstIndexRef.current = false
				return
			}
			onIndexChangeRef.current?.(currentItemIndex)
		}, [currentItemIndex])

		// --- Turning -------------------------------------------------------------------------

		/** Step the cube is heading to while a turn animation runs (null when at rest/dragging) */
		const targetStepRef = useRef<number | null>(null)
		const animationRef = useRef<{ stop: () => void } | null>(null)

		const restingStep = useCallback(
			() => targetStepRef.current ?? stepOf(rotation.get()),
			[rotation, stepOf]
		)

		const turnTo = useCallback(
			(deg: number, options: ValueAnimationTransition = transition) => {
				const step = stepOf(deg)
				targetStepRef.current = step
				// animate() on the same MotionValue stops the previous animation and inherits its
				// velocity, so rapid retargeting stays smooth
				animationRef.current = animate(rotation, deg, {
					...(prefersReducedMotion ? { duration: 0 } : options),
					onComplete: () => {
						if (targetStepRef.current === step) targetStepRef.current = null
					},
				})
			},
			[rotation, stepOf, transition, prefersReducedMotion]
		)

		const turnToStep = useCallback(
			(step: number, options?: ValueAnimationTransition) => turnTo(angleOf(step), options),
			[turnTo, angleOf]
		)

		const stopTurning = useCallback(() => {
			animationRef.current?.stop()
			animationRef.current = null
			targetStepRef.current = null
			rotation.stop()
		}, [rotation])

		const next = useCallback(() => {
			if (!n) return
			turnToStep(restingStep() + 1)
		}, [n, restingStep, turnToStep])

		const prev = useCallback(() => {
			if (!n) return
			turnToStep(restingStep() - 1)
		}, [n, restingStep, turnToStep])

		const goTo = useCallback(
			(index: number) => {
				if (!n) return
				const target = mod(Math.round(index), n)
				const m = modelRef.current
				const from = restingStep()

				// already there, or an adjacent face already holds it
				for (const k of [from, from + 1, from - 1]) {
					if (contentAt(m, k) === target) return turnToStep(k)
				}

				// Swapping a face's photo is always a single 90° turn, so item-space distance doesn't
				// matter — what matters is that the incoming face isn't already on screen:
				// - mid-turn: keep travelling (reversing would land on the face in view)
				// - at rest: turn toward the side hidden by the tilt (+6°) and resting pose
				let s: 1 | -1
				if (from !== m.step) {
					s = from > m.step ? 1 : -1
				} else {
					const position = (dirSign * (rotation.get() + TILT_DEG)) / 90
					s = position - m.step > 0 ? -1 : 1
				}
				const k = from + s

				// freeze everything that might be on screen (around both the visual step and
				// the step we were heading to), then re-base so face k shows the target
				const overrides = new Map(m.overrides)
				for (const kk of new Set([...windowOf(m), from - 1, from, from + 1])) {
					if (kk !== k) overrides.set(kk, contentAt(m, kk))
				}
				overrides.delete(k)
				overrides.delete(k + s)
				commit({ ...m, base: mod(target - k, n), overrides })
				turnToStep(k)
			},
			[n, restingStep, contentAt, turnToStep, commit, dirSign, rotation]
		)

		const getSnapshot = useCallback(
			(): BoxCarouselSnapshot => ({
				rotation: targetStepRef.current != null ? angleOf(targetStepRef.current) : rotation.get(),
				index: contentAt(modelRef.current, restingStep()),
			}),
			[angleOf, rotation, contentAt, restingStep]
		)

		const restore = useCallback(
			(snapshot: BoxCarouselSnapshot) => {
				if (contentAt(modelRef.current, stepOf(snapshot.rotation)) === snapshot.index) {
					turnTo(snapshot.rotation)
				} else {
					goTo(snapshot.index)
				}
			},
			[contentAt, stepOf, turnTo, goTo]
		)

		useImperativeHandle(
			ref,
			() => ({
				next,
				prev,
				goTo,
				getCurrentItemIndex: () => contentAt(modelRef.current, modelRef.current.step),
				getSnapshot,
				restore,
			}),
			[next, prev, goTo, contentAt, getSnapshot, restore]
		)

		// --- Interaction state ---------------------------------------------------------------

		const [isHovered, setIsHovered] = useState(false)
		const [isDragging, setIsDragging] = useState(false)
		const [isFocusVisible, setIsFocusVisible] = useState(false)
		const interacting = isHovered || isDragging || isFocusVisible

		const onInteractingChangeRef = useRef(onInteractingChange)
		onInteractingChangeRef.current = onInteractingChange
		const firstInteractRef = useRef(true)
		useEffect(() => {
			if (firstInteractRef.current) {
				firstInteractRef.current = false
				return
			}
			onInteractingChangeRef.current?.(interacting)
		}, [interacting])

		// --- Drag (pointer events; vertical page panning stays native on touch) --------------

		const dragRef = useRef<{ pointerId: number; x: number; y: number; start: number } | null>(null)

		const handlePointerDown = useCallback(
			(e: React.PointerEvent<HTMLDivElement>) => {
				if (!enableDrag || !n || e.button !== 0) return
				stopTurning()
				dragRef.current = {
					pointerId: e.pointerId,
					x: e.clientX,
					y: e.clientY,
					start: rotation.get(),
				}
				e.currentTarget.setPointerCapture(e.pointerId)
				setIsDragging(true)
			},
			[enableDrag, n, stopTurning, rotation]
		)

		const handlePointerMove = useCallback(
			(e: React.PointerEvent<HTMLDivElement>) => {
				const drag = dragRef.current
				if (!drag || drag.pointerId !== e.pointerId) return
				const delta = isVertical ? e.clientY - drag.y : e.clientX - drag.x
				const sign = direction === "top" || direction === "right" ? 1 : -1
				rotation.set(drag.start + (sign * delta * dragSensitivity) / 2)
			},
			[isVertical, direction, rotation, dragSensitivity]
		)

		const handlePointerUp = useCallback(
			(e: React.PointerEvent<HTMLDivElement>) => {
				const drag = dragRef.current
				if (!drag || drag.pointerId !== e.pointerId) return
				dragRef.current = null
				setIsDragging(false)
				// project a little with the release velocity, then settle on a face
				const projected = rotation.get() + rotation.getVelocity() * 0.12
				const startStep = stepOf(drag.start)
				const step = Math.max(startStep - 2, Math.min(startStep + 2, stepOf(projected)))
				turnToStep(step, snapTransition)
			},
			[rotation, stepOf, turnToStep, snapTransition]
		)

		// --- Detent: wheel / page-scroll turns come to rest on a face ----------------------------
		// Scroll-driven rotation is continuous while input flows; once it stops, the cube springs
		// to the nearest face like a detent, so it never rests half-turned between two photos.

		const settleTimerRef = useRef<number | null>(null)
		const scheduleSettle = useCallback(() => {
			if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
			settleTimerRef.current = window.setTimeout(() => {
				settleTimerRef.current = null
				if (dragRef.current || targetStepRef.current != null) return
				turnToStep(stepOf(rotation.get()), snapTransition)
			}, 180)
		}, [rotation, stepOf, turnToStep, snapTransition])
		useEffect(
			() => () => {
				if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
			},
			[]
		)

		// --- Wheel over the cube --------------------------------------------------------------

		const containerRef = useRef<HTMLDivElement | null>(null)

		useEffect(() => {
			const el = containerRef.current
			if (!enableScrollControl || !el) return
			const onWheel = (e: WheelEvent) => {
				// Never trap the reader: a vertical wheel over the cube scrolls the page (page-scroll
				// control turns the cube anyway). Sideways swipes / shift+wheel turn it directly, and
				// so does a vertical wheel the page can't use (already at the top/bottom).
				const sideways = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)
				const doc = document.documentElement
				const atEdge =
					(e.deltaY > 0 && window.scrollY + window.innerHeight >= doc.scrollHeight - 1) ||
					(e.deltaY < 0 && window.scrollY <= 0)
				if (!sideways && !(enablePageScrollControl ? atEdge : true)) return
				e.preventDefault()
				stopTurning()
				const delta = sideways ? e.deltaX || e.deltaY : e.deltaY
				rotation.set(rotation.get() + delta * scrollSensitivity * 0.5 * spinSign)
				scheduleSettle()
			}
			el.addEventListener("wheel", onWheel, { passive: false })
			return () => el.removeEventListener("wheel", onWheel)
		}, [
			enableScrollControl,
			enablePageScrollControl,
			scrollSensitivity,
			rotation,
			spinSign,
			stopTurning,
			scheduleSettle,
		])

		// --- Page scroll ----------------------------------------------------------------------

		useEffect(() => {
			if (!enablePageScrollControl) return
			let lastY = window.scrollY
			const onScroll = () => {
				const y = window.scrollY
				const delta = y - lastY
				lastY = y
				const el = containerRef.current
				if (!el || Math.abs(delta) < 1 || dragRef.current) return
				const rect = el.getBoundingClientRect()
				if (rect.top - scrollOffset > window.innerHeight || rect.bottom < 0) return
				// the reader took over: drop any programmatic turn
				if (targetStepRef.current != null) stopTurning()
				rotation.set(rotation.get() + delta * pageScrollSensitivity * 0.1 * spinSign)
				scheduleSettle()
			}
			window.addEventListener("scroll", onScroll, { passive: true })
			return () => window.removeEventListener("scroll", onScroll)
		}, [
			enablePageScrollControl,
			scrollOffset,
			pageScrollSensitivity,
			rotation,
			spinSign,
			stopTurning,
			scheduleSettle,
		])

		// --- Continuous rotation --------------------------------------------------------------

		const continuousEnabled =
			continuousRotation && !enableScrollControl && !enablePageScrollControl && n > 0

		useAnimationFrame((_, delta) => {
			if (!continuousEnabled || prefersReducedMotion) return
			if ((pauseOnHover && isHovered) || (pauseOnDrag && isDragging) || isFocusVisible) return
			if (targetStepRef.current != null) return
			const current = rotation.get()
			const inQuarter = mod(current, 90)
			const distanceFromBoundary = Math.min(inQuarter, 90 - inQuarter)
			const curve = 1 + (turnSpeedMultiplier - 1) * (1 - distanceFromBoundary / 45)
			rotation.set(current + spinSign * continuousSpeed * curve * (Math.min(delta, 64) / 1000))
		})

		// --- Auto play ------------------------------------------------------------------------

		useEffect(() => {
			if (!autoPlay || continuousRotation || enableScrollControl || enablePageScrollControl || !n)
				return
			if (interacting) return
			const interval = setInterval(next, autoPlayInterval)
			return () => clearInterval(interval)
		}, [
			autoPlay,
			continuousRotation,
			enableScrollControl,
			enablePageScrollControl,
			n,
			next,
			autoPlayInterval,
			interacting,
		])

		// --- Keyboard -------------------------------------------------------------------------

		const handleKeyDown = useCallback(
			(e: React.KeyboardEvent) => {
				const back = isVertical ? "ArrowUp" : "ArrowLeft"
				const fwd = isVertical ? "ArrowDown" : "ArrowRight"
				if (e.key === back) {
					e.preventDefault()
					prev()
				} else if (e.key === fwd) {
					e.preventDefault()
					next()
				}
			},
			[isVertical, next, prev]
		)

		// --- Rendering ------------------------------------------------------------------------

		const depth = useMemo(
			() => (direction === "top" || direction === "bottom" ? height : width),
			[direction, width, height]
		)
		const depthMotion = useMotionValue(depth)
		useEffect(() => depthMotion.set(depth), [depth, depthMotion])

		const scaleTarget = useMotionValue(1)
		const scale = useSpring(scaleTarget, dragSpring)
		useEffect(() => {
			scaleTarget.set(isHovered && !prefersReducedMotion ? hoverScale : 1)
		}, [isHovered, hoverScale, scaleTarget, prefersReducedMotion])

		const transform = useTransform([rotation, depthMotion], ([deg, d]: number[]) => {
			const x = isVertical ? deg : 0
			const y = isVertical ? 0 : deg
			return `translateZ(-${d / 2 - 12}px) rotateX(${x + TILT_DEG}deg) rotateY(${y + TILT_DEG}deg)`
		})

		// Determine face transforms based on the desired rotation axis
		const faceTransforms = (() => {
			switch (direction) {
				case "top":
					return [
						`rotateX(90deg) translateZ(${height / 2}px)`,
						`rotateY(0deg) translateZ(${depth / 2}px)`,
						`rotateX(-90deg) translateZ(${height / 2}px)`,
						`rotateY(180deg) translateZ(${depth / 2}px) rotateZ(180deg)`,
					]
				case "right":
					return [
						`rotateY(90deg) translateZ(${width / 2}px)`,
						`rotateY(0deg) translateZ(${depth / 2}px)`,
						`rotateY(-90deg) translateZ(${width / 2}px)`,
						`rotateY(180deg) translateZ(${depth / 2}px)`,
					]
				case "bottom":
					return [
						`rotateX(-90deg) translateZ(${height / 2}px)`,
						`rotateY(0deg) translateZ(${depth / 2}px)`,
						`rotateX(90deg) translateZ(${height / 2}px)`,
						`rotateY(180deg) translateZ(${depth / 2}px) rotateZ(180deg)`,
					]
				case "left":
				default:
					return [
						`rotateY(-90deg) translateZ(${width / 2}px)`,
						`rotateY(0deg) translateZ(${depth / 2}px)`,
						`rotateY(90deg) translateZ(${width / 2}px)`,
						`rotateY(180deg) translateZ(${depth / 2}px)`,
					]
			}
		})()

		// Which item each physical face shows
		const faceItems = useMemo(() => {
			const out: (number | undefined)[] = [undefined, undefined, undefined, undefined]
			if (!n) return out
			for (const k of windowOf(model)) out[mod(k + 1, 4)] = contentAt(model, k)
			return out
		}, [model, n, contentAt])

		const faceColors = ["#ff9999", "#99ff99", "#9999ff", "#ffff99"]

		return (
			<motion.div
				{...props}
				ref={containerRef}
				className={cn(
					"relative focus:outline-0 select-none",
					enableDrag && "cursor-grab active:cursor-grabbing",
					isVertical ? "touch-pan-x" : "touch-pan-y",
					className
				)}
				style={{
					width,
					height,
					perspective: `${perspective}px`,
					scale,
				}}
				onKeyDown={handleKeyDown}
				onPointerEnter={(e) => e.pointerType === "mouse" && setIsHovered(true)}
				onPointerLeave={(e) => e.pointerType === "mouse" && setIsHovered(false)}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				onFocus={(e) => {
					if (e.target === e.currentTarget && e.currentTarget.matches(":focus-visible"))
						setIsFocusVisible(true)
				}}
				onBlur={(e) => e.target === e.currentTarget && setIsFocusVisible(false)}
				tabIndex={0}
				role="group"
				aria-roledescription="carousel"
				aria-label={`3D photo cube with ${n} photos. Use arrow keys to turn.`}
			>
				<div className="sr-only" aria-live="polite" aria-atomic="true">
					Showing photo {currentItemIndex + 1} of {n}:{" "}
					{items[currentItemIndex]?.alt || `Photo ${currentItemIndex + 1}`}
				</div>

				<motion.div
					className="relative w-full h-full [transform-style:preserve-3d]"
					style={{ transform }}
				>
					{faceTransforms.map((faceTransform, i) => (
						<CubeFace
							key={i}
							transform={faceTransform}
							style={debug ? { width, height, backgroundColor: faceColors[i] } : { width, height }}
							debug={debug}
						>
							<MediaRenderer
								item={faceItems[i] != null ? items[faceItems[i]!] : undefined}
								debug={debug}
							/>
						</CubeFace>
					))}
				</motion.div>
			</motion.div>
		)
	}
)

BoxCarousel.displayName = "BoxCarousel"

export default BoxCarousel
export type { CarouselItem, RotationDirection, SpringConfig }
