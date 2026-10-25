"use client"

import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useAtom, useAtomValue } from "jotai"
import { cn } from "@/lib/utils/cn"
import BoxCarousel, {
	type BoxCarouselRef,
	type BoxCarouselSnapshot,
	type CarouselItem,
	type RotationDirection,
} from "@/lib/components/BoxCarousel"
import { currentLiquorAtom, hoveredNoteStageAtom } from "@/lib/store/sessionAtom"
import { liftLiquor, rgbCss, type LiquorColor } from "@/lib/liquor"
import { buildStageImageMap } from "@/lib/noteStages"
import CubeCaption, { createCubeCaptionStore } from "./CubeCaption"
import styles from "./SessionCarousel.module.css"

type ImageItem = {
	image: string
	alt: string
	caption?: string
	variants?: readonly import("@/lib/components/ResponsiveImage").ResponsiveVariant[]
}

/** How long the cube lingers on a note's photo after the pointer leaves the note */
const RETURN_DELAY_MS = 650

const navButton = cn(
	"flex items-center justify-center size-7 shrink-0 transition-colors duration-200 rounded-lg",
	"bg-white/5 shadow-key hover:bg-white/10 active:shadow-well text-white/60 hover:text-white",
	"focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--liquor-text,#8a8a8a)]"
)

// ---------------------------------------------------------------------------

interface SessionCarouselProps {
	/** Scale the visitor cube proportionally inside a boxed editorial preview. */
	fitToContainer?: boolean

	/** Boxed previews supply their own color and isolated note-stage store. */
	liquorColor?: LiquorColor

	images: ImageItem[]
	direction?: RotationDirection
	recordingKey?: string
	/**
	 * CSS rotation in degrees (e.g., 12 for "rotate-12", -8 for "-rotate-8")
	 * @default 12
	 */
	cssRotation?: number
	/**
	 * Enable continuous rotation (disabled by the cube while any scroll control is on)
	 * @default true
	 */
	continuousRotation?: boolean
	/** Degrees per second for continuous rotation */
	continuousSpeed?: number
	pauseOnHover?: boolean
	pauseOnDrag?: boolean
	turnSpeedMultiplier?: number
	/** Scale when hovered (1.05 = 5% larger) */
	hoverScale?: number
	/** Wheel over the cube turns it */
	enableScrollControl?: boolean
	scrollSensitivity?: number
	/** Page scroll turns the cube while it's in view */
	enablePageScrollControl?: boolean
	pageScrollSensitivity?: number
	scrollOffset?: number
	/** Resting pose of the cube in degrees */
	initialRotationOffset?: number
}

/**
 * Render budget: a face change while the page scrolls re-renders only the caption. The cube is
 * memoized with stable props, and the visible face lives in a tiny store only CubeCaption
 * subscribes to — this component holds no per-face state.
 */
export default function SessionCarousel({
	images,
	liquorColor,
	fitToContainer = false,
	direction = "right",
	recordingKey,
	cssRotation = 12,
	continuousRotation = true,
	continuousSpeed = 3,
	pauseOnHover = true,
	pauseOnDrag = true,
	turnSpeedMultiplier = 3,
	hoverScale = 1.05,
	enableScrollControl = true,
	scrollSensitivity = 1,
	enablePageScrollControl = true,
	pageScrollSensitivity = 5,
	scrollOffset = 0,
	initialRotationOffset = 10,
}: SessionCarouselProps) {
	const containerRef = useRef<HTMLDivElement | null>(null)
	const carouselRef = useRef<BoxCarouselRef>(null)
	const [containerWidth, setContainerWidth] = useState<number>(288) // w-72
	const [isLoaded, setIsLoaded] = useState<boolean>(false)
	const prefersReducedMotion = useReducedMotion()

	// Observe container size for responsive width/height
	useEffect(() => {
		const el = containerRef.current
		if (!el) return

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const w = Math.floor(entry.contentRect.width)
				setContainerWidth((prev) => (prev === w ? prev : w))
				setIsLoaded(true)
			}
		})
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	useEffect(() => {
		if (images && images.length > 0) setIsLoaded(true)
	}, [images])

	const width = containerWidth
	const height = useMemo(() => {
		// 16:9 ratio with bounds similar to previous hero height
		const computed = Math.round((width * 9) / 16)
		return fitToContainer ? Math.round((width * 320) / 288) : Math.max(320, Math.min(560, computed))
	}, [width, fitToContainer])

	const items: CarouselItem[] = useMemo(
		() =>
			(images || []).map((img, i) => ({
				id: `session-image-${i}`,
				type: "image",
				src: img.image,
				alt: img.alt,
				variants: img.variants,
			})),
		[images]
	)
	/** Remount the cube when the photo set changes (session navigation) */
	const itemsKey = useMemo(() => items.map((item) => item.src).join("|"), [items])
	const alts = useMemo(() => items.map((item) => item.alt), [items])
	const captions = useMemo(() => images.map((image) => image.caption), [images])

	const stageMap = useMemo(() => buildStageImageMap(images), [images])

	// -------------------------------------------------------------------------
	// Cube ↔ notes link (hoveredNoteStageAtom)
	// -------------------------------------------------------------------------

	const [hoveredStage, setHoveredStage] = useAtom(hoveredNoteStageAtom)
	const visibleIndexRef = useRef(0)
	const [captionStore] = useState(createCubeCaptionStore)

	/** true while the cube itself is hovered/dragged/focused: it drives the atom, not vice versa */
	const cubeActiveRef = useRef(false)
	/** where to return once the notes stop pointing at a photo */
	const snapshotRef = useRef<BoxCarouselSnapshot | null>(null)
	const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const clearReturnTimer = () => {
		if (returnTimerRef.current) clearTimeout(returnTimerRef.current)
		returnTimerRef.current = null
	}

	// Notes → cube
	useEffect(() => {
		if (cubeActiveRef.current) return
		const cube = carouselRef.current
		if (!cube) return
		clearReturnTimer()

		const target = hoveredStage ? stageMap.byStage[hoveredStage] : undefined
		if (target != null) {
			if (!snapshotRef.current) snapshotRef.current = cube.getSnapshot()
			cube.goTo(target)
			return
		}

		if (snapshotRef.current) {
			returnTimerRef.current = setTimeout(() => {
				const snapshot = snapshotRef.current
				snapshotRef.current = null
				if (snapshot && !cubeActiveRef.current) carouselRef.current?.restore(snapshot)
			}, RETURN_DELAY_MS)
		}
	}, [hoveredStage, stageMap])

	useEffect(() => clearReturnTimer, [])

	// Cube → caption + notes. Called from the cube's turn (often a page-scroll frame): the caption
	// store and the notes highlight both update as transitions, after the frame.
	const handleIndexChange = useCallback(
		(index: number) => {
			// shortest way round the cube, so last → first still counts as "next"
			const n = items.length || 1
			const delta = (((index - visibleIndexRef.current) % n) + n) % n
			visibleIndexRef.current = index
			captionStore.set({ index, direction: delta === 0 || delta <= n / 2 ? 1 : -1 })
			if (cubeActiveRef.current) {
				const stage = stageMap.stages[index] ?? null
				startTransition(() => setHoveredStage(stage))
			}
		},
		[captionStore, setHoveredStage, stageMap, items.length]
	)

	const handleInteractingChange = useCallback(
		(active: boolean) => {
			cubeActiveRef.current = active
			if (active) {
				// the reader grabbed the cube: it owns the view now
				clearReturnTimer()
				snapshotRef.current = null
				setHoveredStage(stageMap.stages[visibleIndexRef.current] ?? null)
			} else {
				setHoveredStage(null)
			}
		},
		[setHoveredStage, stageMap]
	)

	// Reset local link state when the photo set changes
	useEffect(() => {
		clearReturnTimer()
		snapshotRef.current = null
		cubeActiveRef.current = false
		visibleIndexRef.current = 0
		captionStore.set({ index: 0, direction: 1 })
	}, [itemsKey, captionStore])

	const liveLiquor = useAtomValue(currentLiquorAtom)
	const liquor = liquorColor ?? liveLiquor
	const accent = useMemo(() => rgbCss(liftLiquor(liquor.rgb)), [liquor])

	const handlePrevious = () => carouselRef.current?.prev()
	const handleNext = () => carouselRef.current?.next()

	return (
		<div className="relative" data-recording-key={recordingKey} data-photo-cube>
			<motion.div
				ref={containerRef}
				// the outline the notes flow around (FlowAroundArticle)
				data-flow-shape
				data-flow-rotate={cssRotation}
				className={cn(
					"relative p-2 drop-shadow-2xl drop-shadow-heicha-600/40 w-72",
					styles.dotField
				)}
				style={{
					rotate: cssRotation,
					width: fitToContainer ? "clamp(160px, 65cqi, 288px)" : undefined,
					minHeight: height + 16, // Reserve height (height + padding)
				}}
				initial={{ scale: 0.92, opacity: 0 }}
				animate={{
					scale: isLoaded ? 1 : 0.92,
					opacity: isLoaded ? 1 : 0,
				}}
				transition={
					prefersReducedMotion
						? { duration: 0 }
						: { type: "spring", stiffness: 220, damping: 26, opacity: { duration: 0.3 } }
				}
			>
				{items.length > 0 && (
					<BoxCarousel
						key={itemsKey}
						ref={carouselRef}
						items={items}
						width={width}
						height={height}
						direction={direction}
						enableDrag
						debug={false}
						autoPlay={!continuousRotation}
						continuousRotation={continuousRotation}
						continuousSpeed={continuousSpeed}
						turnSpeedMultiplier={turnSpeedMultiplier}
						hoverScale={hoverScale}
						enableScrollControl={enableScrollControl}
						scrollSensitivity={scrollSensitivity}
						enablePageScrollControl={enablePageScrollControl}
						pageScrollSensitivity={pageScrollSensitivity}
						scrollOffset={scrollOffset}
						pauseOnHover={pauseOnHover}
						pauseOnDrag={pauseOnDrag}
						initialRotationOffset={initialRotationOffset}
						wireframeOffset={8}
						edgeRadius={44}
						wireframeColor={accent}
						onIndexChange={handleIndexChange}
						onInteractingChange={handleInteractingChange}
					/>
				)}
			</motion.div>

			{/* Navigation + caption: which note this face belongs to */}
			{items.length > 0 && (
				<div className="flex justify-center mt-4">
					<div
						data-flow-shape
						className="flex items-center gap-1.5 px-1.5 py-1.5 surface-card rounded-xl"
					>
						<button onClick={handlePrevious} className={navButton} aria-label="Previous photo">
							<ChevronLeft className="size-4" />
						</button>

						<CubeCaption
							store={captionStore}
							stages={stageMap.stages}
							alts={alts}
							captions={captions}
							accent={accent}
						/>

						<button onClick={handleNext} className={navButton} aria-label="Next photo">
							<ChevronRight className="size-4" />
						</button>
					</div>
				</div>
			)}
		</div>
	)
}
