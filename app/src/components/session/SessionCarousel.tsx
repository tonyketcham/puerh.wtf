"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useAtom, useAtomValue } from "jotai"
import { cn } from "@/lib/utils/cn"
import BoxCarousel, {
	type BoxCarouselRef,
	type BoxCarouselSnapshot,
	type CarouselItem,
	type RotationDirection,
} from "@/components/fancy/carousel/box-carousel"
import { currentLiquorAtom, hoveredNoteStageAtom } from "@/lib/store/sessionAtom"
import { liftLiquor, rgbCss } from "@/lib/liquor"
import { NOTE_STAGE_META, buildStageImageMap } from "@/lib/noteStages"
import type { NoteStage } from "@/lib/types/session"

type ImageItem = {
	image: string
	alt: string
}

/** How long the cube lingers on a note's photo after the pointer leaves the note */
const RETURN_DELAY_MS = 650

// ---------------------------------------------------------------------------

interface SessionCarouselProps {
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

export default function SessionCarousel({
	images,
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
		return Math.max(320, Math.min(560, computed))
	}, [width])

	const items: CarouselItem[] = useMemo(
		() =>
			(images || []).map((img, i) => ({
				id: `session-image-${i}`,
				type: "image",
				src: img.image,
				alt: img.alt,
			})),
		[images]
	)
	/** Remount the cube when the photo set changes (session navigation) */
	const itemsKey = useMemo(() => items.map((item) => item.src).join("|"), [items])

	const stageMap = useMemo(() => buildStageImageMap(images), [images])

	// -------------------------------------------------------------------------
	// Cube ↔ notes link (hoveredNoteStageAtom)
	// -------------------------------------------------------------------------

	const [hoveredStage, setHoveredStage] = useAtom(hoveredNoteStageAtom)
	const [visibleIndex, setVisibleIndex] = useState(0)
	const visibleIndexRef = useRef(0)

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

	// Cube → notes
	const handleIndexChange = useCallback(
		(index: number) => {
			visibleIndexRef.current = index
			setVisibleIndex(index)
			if (cubeActiveRef.current) setHoveredStage(stageMap.stages[index] ?? null)
		},
		[setHoveredStage, stageMap]
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
		setVisibleIndex(0)
	}, [itemsKey])

	const liquor = useAtomValue(currentLiquorAtom)
	const accent = useMemo(() => rgbCss(liftLiquor(liquor.rgb)), [liquor])

	const visibleStage = stageMap.stages[visibleIndex] ?? null
	const linked = visibleStage != null && hoveredStage === visibleStage
	const caption = visibleStage
		? NOTE_STAGE_META[visibleStage].title
		: items[visibleIndex]?.alt || `Photo ${visibleIndex + 1}`

	const handlePrevious = () => carouselRef.current?.prev()
	const handleNext = () => carouselRef.current?.next()

	const navButton = cn(
		"flex items-center justify-center size-7 shrink-0 transition-colors duration-200 rounded-lg",
		"bg-white/5 hover:bg-white/10 text-white/60 hover:text-white",
		"focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--liquor-text,#8a8a8a)]"
	)

	return (
		<div className="relative" data-recording-key={recordingKey} data-photo-cube>
			<motion.div
				ref={containerRef}
				className={cn(
					"p-2 drop-shadow-2xl drop-shadow-heicha-600/40 w-72",
					"bg-[radial-gradient(circle_1.5px_at_1.5px_1.5px,_rgba(255,255,255,0.2)_1.5px,_transparent_0)]",
					"bg-[size:16px_16px]"
				)}
				style={{
					rotate: cssRotation,
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
						onIndexChange={handleIndexChange}
						onInteractingChange={handleInteractingChange}
					/>
				)}
			</motion.div>

			{/* Navigation + caption: which note this face belongs to */}
			{items.length > 0 && (
				<div className="flex justify-center mt-4">
					<div className="flex items-center gap-1.5 px-1.5 py-1.5 border bg-heicha-700/80 backdrop-blur-xl border-heicha-500/50 rounded-xl">
						<button onClick={handlePrevious} className={navButton} aria-label="Previous photo">
							<ChevronLeft className="size-4" />
						</button>

						<div
							className="relative flex items-center justify-center h-7 overflow-hidden w-36 font-fira-code text-[11px]"
							aria-hidden
						>
							<AnimatePresence mode="popLayout" initial={false}>
								<motion.span
									key={`${visibleIndex}-${caption}`}
									className="absolute inset-0 flex items-center justify-center gap-1.5 px-1 whitespace-nowrap"
									initial={
										prefersReducedMotion
											? { opacity: 0 }
											: { opacity: 0, y: 8, filter: "blur(2px)" }
									}
									animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
									exit={
										prefersReducedMotion
											? { opacity: 0 }
											: { opacity: 0, y: -8, filter: "blur(2px)" }
									}
									transition={{ type: "spring", stiffness: 420, damping: 34 }}
								>
									{visibleStage && (
										<span className="text-[10px] leading-none">
											{NOTE_STAGE_META[visibleStage].icon}
										</span>
									)}
									<span
										className="truncate transition-colors duration-300"
										style={{ color: linked ? accent : "rgb(255 255 255 / 0.6)" }}
									>
										{caption}
									</span>
									<span className="tabular-nums text-white/30">
										{visibleIndex + 1}/{items.length}
									</span>
								</motion.span>
							</AnimatePresence>
						</div>

						<button onClick={handleNext} className={navButton} aria-label="Next photo">
							<ChevronRight className="size-4" />
						</button>
					</div>
				</div>
			)}
		</div>
	)
}
