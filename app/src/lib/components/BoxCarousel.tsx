"use client"

import ResponsiveImage from "@/lib/components/ResponsiveImage"
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
		still = false,
	}: {
		item?: CarouselItem
		className?: string
		debug?: boolean
		/** Show a video's poster instead of playing it (bevel slices of a video face) */
		still?: boolean
	}) => {
		if (!item) return null

		if (!debug) {
			if (item.type === "video" && !still) {
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
				<ResponsiveImage
				sizes="(min-width: 1024px) 480px, 90vw"
					src={item.type === "video" ? item.poster : item.src}
					alt={item.alt || ""}
					draggable={false}
					// a face swapping photos mid-turn must never block a frame on a decode
					decoding="async"
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

	/**
	 * Distance in px of a hollow wireframe box drawn outside the cube on every side, like an
	 * offset stroke. Omit to draw none.
	 */
	wireframeOffset?: number

	/**
	 * Radius in px of the cube's rounded edges and corners, built as real 3D bevels (the
	 * offset wireframe stays a hard box). 0 draws the plain cube.
	 * @default 0
	 */
	edgeRadius?: number

	/**
	 * Stroke color of the offset wireframe
	 * @default "rgb(255 255 255 / 0.5)"
	 */
	wireframeColor?: string
}

const mod = (a: number, n: number) => ((a % n) + n) % n

// --- Rounded box geometry ------------------------------------------------------------------
// CSS faces are flat, so the rounded cube is tiled: each of the 6 sides is a grid whose
// centre cell is the flat face and whose outer cells bend around the edges/corners. A cell
// is a plain div mapped onto its patch with matrix3d, showing its slice of the face photo,
// so the photo wraps continuously over the bevel.

type Vec3 = [number, number, number]
/** A side of the box: outward normal `n`; `u`/`v` are the photo's right/down on that side */
type Side = { n: Vec3; u: Vec3; v: Vec3 }

const X: Vec3 = [1, 0, 0]
const Y: Vec3 = [0, 1, 0] // CSS: +y is down
const Z: Vec3 = [0, 0, 1] // CSS: +z is toward the viewer
const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
]
const unit = (a: Vec3) => mul(a, 1 / Math.hypot(...a))

/** The 4 ring sides (matching the physical face order of each direction) + the 2 caps */
const SIDES: Record<RotationDirection, { ring: Side[]; caps: Side[] }> = {
	right: {
		ring: [
			{ n: X, u: neg(Z), v: Y },
			{ n: Z, u: X, v: Y },
			{ n: neg(X), u: Z, v: Y },
			{ n: neg(Z), u: neg(X), v: Y },
		],
		caps: [
			{ n: neg(Y), u: X, v: Z },
			{ n: Y, u: X, v: neg(Z) },
		],
	},
	left: {
		ring: [
			{ n: neg(X), u: Z, v: Y },
			{ n: Z, u: X, v: Y },
			{ n: X, u: neg(Z), v: Y },
			{ n: neg(Z), u: neg(X), v: Y },
		],
		caps: [
			{ n: neg(Y), u: X, v: Z },
			{ n: Y, u: X, v: neg(Z) },
		],
	},
	top: {
		ring: [
			{ n: neg(Y), u: X, v: Z },
			{ n: Z, u: X, v: Y },
			{ n: Y, u: X, v: neg(Z) },
			{ n: neg(Z), u: X, v: neg(Y) },
		],
		caps: [
			{ n: neg(X), u: Z, v: Y },
			{ n: X, u: neg(Z), v: Y },
		],
	},
	bottom: {
		ring: [
			{ n: Y, u: X, v: neg(Z) },
			{ n: Z, u: X, v: Y },
			{ n: neg(Y), u: X, v: Z },
			{ n: neg(Z), u: X, v: neg(Y) },
		],
		caps: [
			{ n: neg(X), u: Z, v: Y },
			{ n: X, u: neg(Z), v: Y },
		],
	},
}

/** Bevel segments per side per edge (a 90° edge is 2× this) */
const BEVEL_SEGMENTS = 3
/** Overlap (px) each cell draws past its far edges, hiding hairline seams between cells */
const SEAM = 0.75

/**
 * Cut positions across a side of half-size `a`: the flat middle plus, on each end, cuts at
 * even angles around the bevel (the side owns the first 45° of each edge it borders).
 */
const cutsFor = (a: number, r: number) => {
	if (r <= 0) return [-a, a]
	const inner = a - r
	const out: number[] = []
	for (let i = BEVEL_SEGMENTS; i >= 0; i--)
		out.push(-(inner + r * Math.tan((i * Math.PI) / (4 * BEVEL_SEGMENTS))))
	for (let i = 0; i <= BEVEL_SEGMENTS; i++)
		out.push(inner + r * Math.tan((i * Math.PI) / (4 * BEVEL_SEGMENTS)))
	return out
}

type Cell = {
	key: string
	/** Physical ring face index, or null for a cap */
	face: number | null
	/** Size and offset of the cell's slice of the side's photo */
	w: number
	h: number
	ox: number
	oy: number
	/** The flat middle of the side */
	flat: boolean
	/** How far the cell has turned off its side, 0 (flat) → 1 (halfway round an edge/corner) */
	turn: number
	transform: string
}

const buildRoundedBox = (
	direction: RotationDirection,
	width: number,
	height: number,
	depth: number,
	radius: number
): Cell[] => {
	const half: Vec3 = [width / 2, height / 2, depth / 2]
	const r = Math.max(0, Math.min(radius, ...half))
	const inner = half.map((h) => h - r) as Vec3
	const extent = (axis: Vec3) => Math.abs(dot(axis, half))

	/** Push a point on the hard box's surface onto the rounded box */
	const round = (q: Vec3): Vec3 => {
		const c = q.map((x, i) => Math.max(-inner[i], Math.min(inner[i], x))) as Vec3
		const d = sub(q, c)
		const len = Math.hypot(...d)
		return len > 1e-6 ? add(c, mul(d, r / len)) : q
	}
	/** Box space (centred) → the container's CSS space (origin at its top-left) */
	const css = (p: Vec3): Vec3 => [p[0] + width / 2, p[1] + height / 2, p[2]]
	const fmt = (x: number) => +x.toFixed(4)

	const { ring, caps } = SIDES[direction]
	const cells: Cell[] = []
	;[...ring, ...caps].forEach((side, s) => {
		const au = extent(side.u)
		const av = extent(side.v)
		const at = (su: number, sv: number) =>
			css(round(add(add(mul(side.n, extent(side.n)), mul(side.u, su)), mul(side.v, sv))))
		const us = cutsFor(au, r)
		const vs = cutsFor(av, r)
		for (let i = 0; i < us.length - 1; i++) {
			for (let j = 0; j < vs.length - 1; j++) {
				const w = us[i + 1] - us[i]
				const h = vs[j + 1] - vs[j]
				const p00 = at(us[i], vs[j])
				const ax = mul(sub(at(us[i + 1], vs[j]), p00), 1 / w)
				const ay = mul(sub(at(us[i], vs[j + 1]), p00), 1 / h)
				const az = unit(cross(ax, ay))
				cells.push({
					key: `${s}-${i}-${j}`,
					face: s < 4 ? s : null,
					w,
					h,
					ox: us[i] + au,
					oy: vs[j] + av,
					flat: i === us.length / 2 - 1 && j === vs.length / 2 - 1,
					// a corner's far tip turns ~54.7° off the side, an edge's 45°: both read as 1
					turn: Math.min(1, Math.acos(Math.min(1, dot(az, side.n))) / (Math.PI / 4)),
					transform: `matrix3d(${[...ax, 0, ...ay, 0, ...az, 0, ...p00, 1].map(fmt).join(",")})`,
				})
			}
		}
	})
	return cells
}

/**
 * One side of the rounded box: its cells, all showing slices of `item`. Memoized and keyed by
 * side, so a turn that changes which item a face shows re-renders only that face's cells (with
 * 4 photos, none at all), never the ~300 cells of the whole box.
 *
 * Returns the cells unwrapped: a wrapper element would flatten the 3D rendering context.
 */
const RoundedSide = memo(
	({
		cells,
		item,
		width,
		height,
		debug,
		debugColor,
	}: {
		cells: Cell[]
		item?: CarouselItem
		width: number
		height: number
		debug: boolean
		debugColor?: string
	}) => (
		<>
			{cells.map((cell) => (
				<div
					key={cell.key}
					className={cn(
						"absolute top-0 left-0 overflow-hidden origin-top-left backface-hidden",
						cell.face == null && "bg-heicha-800"
					)}
					style={{
						width: cell.w + SEAM,
						height: cell.h + SEAM,
						transform: cell.transform,
						boxShadow: "inset 0 0 0 0.5px rgb(255 255 255 / 0.3)",
						...(debug && debugColor && { backgroundColor: debugColor }),
					}}
				>
					{item && (
						<div className="absolute" style={{ left: -cell.ox, top: -cell.oy, width, height }}>
							<MediaRenderer
								item={item}
								debug={debug}
								still={!cell.flat}
								className="rounded-none"
							/>
						</div>
					)}
					{/* Baked falloff: the bevel darkens as it turns away, which is what reads as round */}
					{cell.turn > 0 && (
						<div className="absolute inset-0 bg-black" style={{ opacity: 0.6 * cell.turn ** 1.5 }} />
					)}
				</div>
			))}
		</>
	)
)

RoundedSide.displayName = "RoundedSide"

/** The cube is always shown tilted by this much on both axes (see `transform` below) */
const TILT_DEG = 6

// Stable defaults: inline object defaults would be new every render and churn every callback
// (and the memo) that depends on them
const DEFAULT_TRANSITION: ValueAnimationTransition = {
	type: "spring",
	stiffness: 150,
	damping: 21,
	mass: 1.1,
}
const DEFAULT_SNAP_TRANSITION: ValueAnimationTransition = {
	type: "spring",
	damping: 30,
	stiffness: 200,
}
const DEFAULT_DRAG_SPRING: SpringConfig = { stiffness: 300, damping: 30 }
/** How the cube chases wheel / page-scroll input: critically damped, ~50ms behind the scroll */
const SCROLL_FOLLOW: ValueAnimationTransition = { type: "spring", stiffness: 400, damping: 40 }
const FACE_COLORS = ["#ff9999", "#99ff99", "#9999ff", "#ffff99"]

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

const BoxCarouselImpl = forwardRef<BoxCarouselRef, BoxCarouselProps>(
	(
		{
			items,
			width,
			height,
			className,
			perspective = 600,
			debug = false,
			direction = "left",
			transition = DEFAULT_TRANSITION,
			snapTransition = DEFAULT_SNAP_TRANSITION,
			dragSpring = DEFAULT_DRAG_SPRING,
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
			wireframeOffset,
			edgeRadius = 0,
			wireframeColor = "rgb(255 255 255 / 0.5)",
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

		const contentAt = useCallback(
			(m: FaceModel, k: number) => (n ? m.overrides.get(k) ?? mod(k + m.base, n) : 0),
			[n]
		)

		const onIndexChangeRef = useRef(onIndexChange)
		onIndexChangeRef.current = onIndexChange
		/** last index reported to onIndexChange (the initial index is never reported) */
		const reportedIndexRef = useRef(contentAt(model, model.step))

		// Every model change goes through here. The index is reported right away, from the same
		// event as the turn, rather than from an effect after this component re-renders: the
		// listener's own update then batches with ours instead of costing a second render pass.
		const commit = useCallback(
			(next: FaceModel) => {
				modelRef.current = next
				setModel(next)
				const index = contentAt(next, next.step)
				if (index !== reportedIndexRef.current) {
					reportedIndexRef.current = index
					onIndexChangeRef.current?.(index)
				}
			},
			[contentAt]
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

		/** Where wheel / page-scroll input is steering the cube (null when it isn't) */
		const scrollTargetRef = useRef<number | null>(null)

		const stopTurning = useCallback(() => {
			animationRef.current?.stop()
			animationRef.current = null
			targetStepRef.current = null
			scrollTargetRef.current = null
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

		// A finger resting on the screen mid-swipe sends no scroll events, but the swipe isn't over:
		// the detent waits for the finger to lift, so the cube never snaps and then jumps away.
		const touchingRef = useRef(false)
		const settlePendingRef = useRef(false)

		const settleTimerRef = useRef<number | null>(null)
		const scheduleSettle = useCallback(() => {
			if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
			settleTimerRef.current = window.setTimeout(() => {
				settleTimerRef.current = null
				if (touchingRef.current) {
					settlePendingRef.current = true
					return
				}
				settlePendingRef.current = false
				if (dragRef.current || targetStepRef.current != null) return
				scrollTargetRef.current = null
				turnToStep(stepOf(rotation.get()), snapTransition)
			}, 180)
		}, [rotation, stepOf, turnToStep, snapTransition])
		useEffect(
			() => () => {
				if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
			},
			[]
		)

		// Scroll input arrives in uneven steps (and off the compositor's beat on a phone), so it
		// moves a target the cube springs after, rather than the cube itself: the turn stays
		// continuous between events, and a retarget inherits the spring's velocity.
		const nudge = useCallback(
			(deg: number) => {
				// the reader took over: drop any programmatic turn
				if (targetStepRef.current != null) stopTurning()
				const to = (scrollTargetRef.current ?? rotation.get()) + deg
				scrollTargetRef.current = to
				if (prefersReducedMotion) rotation.set(to)
				else animationRef.current = animate(rotation, to, SCROLL_FOLLOW)
				scheduleSettle()
			},
			[rotation, stopTurning, scheduleSettle, prefersReducedMotion]
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
				const delta = sideways ? e.deltaX || e.deltaY : e.deltaY
				nudge(delta * scrollSensitivity * 0.5 * spinSign)
			}
			el.addEventListener("wheel", onWheel, { passive: false })
			return () => el.removeEventListener("wheel", onWheel)
		}, [enableScrollControl, enablePageScrollControl, scrollSensitivity, spinSign, nudge])

		// --- Page scroll ----------------------------------------------------------------------

		useEffect(() => {
			const el = containerRef.current
			if (!enablePageScrollControl || !el) return
			// Whether the cube is in view comes from an IntersectionObserver, so a scroll event
			// never reads layout (getBoundingClientRect here forced a layout every scroll frame)
			const inView = (rect: DOMRectReadOnly) =>
				!(rect.top - scrollOffset > window.innerHeight || rect.bottom < 0)
			let visible = inView(el.getBoundingClientRect())
			const io = new IntersectionObserver(
				(entries) => {
					const entry = entries[entries.length - 1]
					if (entry) visible = entry.isIntersecting
				},
				// the cube counts as in view until its top is `scrollOffset` past the fold
				{ rootMargin: `0px 0px ${scrollOffset}px 0px` }
			)
			io.observe(el)

			let lastY = window.scrollY
			let lastH = window.innerHeight
			const onScroll = () => {
				const y = window.scrollY
				const h = window.innerHeight
				const delta = y - lastY
				lastY = y
				// a phone's toolbar showing or hiding resizes the viewport, and the page's reflow
				// can shift scrollY with it: that jump is layout, not the reader scrolling
				if (h !== lastH) {
					lastH = h
					return
				}
				if (!visible || Math.abs(delta) < 1 || dragRef.current) return
				nudge(delta * pageScrollSensitivity * 0.1 * spinSign)
			}
			const onTouchStart = () => {
				touchingRef.current = true
			}
			const onTouchEnd = (e: TouchEvent) => {
				if (e.touches.length) return
				touchingRef.current = false
				if (settlePendingRef.current) scheduleSettle()
			}
			window.addEventListener("scroll", onScroll, { passive: true })
			window.addEventListener("touchstart", onTouchStart, { passive: true })
			window.addEventListener("touchend", onTouchEnd, { passive: true })
			window.addEventListener("touchcancel", onTouchEnd, { passive: true })
			return () => {
				window.removeEventListener("scroll", onScroll)
				window.removeEventListener("touchstart", onTouchStart)
				window.removeEventListener("touchend", onTouchEnd)
				window.removeEventListener("touchcancel", onTouchEnd)
				io.disconnect()
			}
		}, [enablePageScrollControl, scrollOffset, pageScrollSensitivity, spinSign, nudge, scheduleSettle])

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
		// Determine face transforms based on the desired rotation axis; `grow` pushes every face
		// outward by that many px (the offset wireframe is the same box, grown)
		const faceTransformsFor = (grow: number) => {
			const h = height / 2 + grow
			const w = width / 2 + grow
			const d = depth / 2 + grow
			switch (direction) {
				case "top":
					return [
						`rotateX(90deg) translateZ(${h}px)`,
						`rotateY(0deg) translateZ(${d}px)`,
						`rotateX(-90deg) translateZ(${h}px)`,
						`rotateY(180deg) translateZ(${d}px) rotateZ(180deg)`,
					]
				case "right":
					return [
						`rotateY(90deg) translateZ(${w}px)`,
						`rotateY(0deg) translateZ(${d}px)`,
						`rotateY(-90deg) translateZ(${w}px)`,
						`rotateY(180deg) translateZ(${d}px)`,
					]
				case "bottom":
					return [
						`rotateX(-90deg) translateZ(${h}px)`,
						`rotateY(0deg) translateZ(${d}px)`,
						`rotateX(90deg) translateZ(${h}px)`,
						`rotateY(180deg) translateZ(${d}px) rotateZ(180deg)`,
					]
				case "left":
				default:
					return [
						`rotateY(-90deg) translateZ(${w}px)`,
						`rotateY(0deg) translateZ(${d}px)`,
						`rotateY(90deg) translateZ(${w}px)`,
						`rotateY(180deg) translateZ(${d}px)`,
					]
			}
		}
		const faceTransforms = faceTransformsFor(0)
		/** The rounded box's cells grouped by side: the 4 ring faces, then both caps */
		const roundedSides = useMemo(() => {
			if (edgeRadius <= 0) return null
			const faces: Cell[][] = [[], [], [], []]
			const caps: Cell[] = []
			for (const cell of buildRoundedBox(direction, width, height, depth, edgeRadius)) {
				if (cell.face == null) caps.push(cell)
				else faces[cell.face].push(cell)
			}
			return { faces, caps }
		}, [direction, width, height, depth, edgeRadius])

		// Which item each physical face shows
		const faceItems = useMemo(() => {
			const out: (number | undefined)[] = [undefined, undefined, undefined, undefined]
			if (!n) return out
			for (const k of windowOf(model)) out[mod(k + 1, 4)] = contentAt(model, k)
			return out
		}, [model, n, contentAt])

		const faceColors = FACE_COLORS

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
					{roundedSides ? (
						<>
							{roundedSides.faces.map((cells, face) => (
								<RoundedSide
									key={face}
									cells={cells}
									item={faceItems[face] != null ? items[faceItems[face]!] : undefined}
									width={width}
									height={height}
									debug={debug}
									debugColor={faceColors[face]}
								/>
							))}
							<RoundedSide
								cells={roundedSides.caps}
								width={width}
								height={height}
								debug={debug}
							/>
						</>
					) : (
						faceTransforms.map((faceTransform, i) => (
								<CubeFace
									key={i}
									transform={faceTransform}
									style={
										debug ? { width, height, backgroundColor: faceColors[i] } : { width, height }
									}
									debug={debug}
								>
									<MediaRenderer
										item={faceItems[i] != null ? items[faceItems[i]!] : undefined}
										debug={debug}
									/>
								</CubeFace>
							))
					)}

					{/* Same 3D space as the faces, so the photos hide the box's far edges */}
					{wireframeOffset != null &&
						faceTransformsFor(wireframeOffset).map((faceTransform, i) => (
							<div
								key={`wire-${i}`}
								className="absolute border pointer-events-none"
								style={{
									left: -wireframeOffset,
									top: -wireframeOffset,
									width: width + 2 * wireframeOffset,
									height: height + 2 * wireframeOffset,
									transform: faceTransform,
									borderColor: wireframeColor,
								}}
								aria-hidden
							/>
						))}
				</motion.div>
			</motion.div>
		)
	}
)

BoxCarouselImpl.displayName = "BoxCarousel"

/**
 * Memoized: a parent re-rendering (e.g. its caption following onIndexChange) must not re-render
 * the cube. Pass stable props (memoized items, useCallback handlers) to keep it that way.
 */
const BoxCarousel = memo(BoxCarouselImpl)

export default BoxCarousel
export type { CarouselItem, RotationDirection, SpringConfig }
