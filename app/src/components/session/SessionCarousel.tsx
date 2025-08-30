"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import BoxCarousel, {
	type CarouselItem,
	type RotationDirection,
	type BoxCarouselRef,
} from "@/components/fancy/carousel/box-carousel"

type ImageItem = {
	image: string
	alt: string
}

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
	 * Enable continuous rotation (smooth, infinite rotation)
	 * Takes precedence over autoPlay if both are enabled
	 * @default false
	 */
	continuousRotation?: boolean
	/**
	 * Speed of continuous rotation in degrees per second
	 * Positive values rotate in the direction specified by `direction`
	 * Negative values rotate in the opposite direction
	 * @default 30
	 */
	continuousSpeed?: number
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
	 * Speed multiplier during turns (90-degree transitions)
	 * Higher values make turns faster, creating a dynamic rotation effect
	 * @default 3
	 */
	turnSpeedMultiplier?: number
	/**
	 * Scale factor when hovered (as percentage, e.g., 1.05 = 5% larger)
	 * @default 1.05
	 */
	hoverScale?: number
	/**
	 * Enable scroll wheel control for rotation
	 * When enabled, scroll wheel will control rotation instead of continuous rotation
	 * @default false
	 */
	enableScrollControl?: boolean
	/**
	 * Sensitivity of scroll wheel control (higher = more rotation per scroll)
	 * @default 1
	 */
	scrollSensitivity?: number
	/**
	 * Enable page scroll control for rotation
	 * When enabled, carousel rotation is tied to page scroll position
	 * @default false
	 */
	enablePageScrollControl?: boolean
	/**
	 * Sensitivity of page scroll control (higher = more rotation per scroll pixel)
	 * @default 0.5
	 */
	pageScrollSensitivity?: number
	/**
	 * Offset from top of viewport where scroll control starts (in pixels)
	 * @default 0
	 */
	scrollOffset?: number
	/**
	 * Initial rotation offset in degrees
	 * @default 0
	 */
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
	const [containerWidth, setContainerWidth] = useState<number>(0)

	// Observe container size for responsive width/height
	useEffect(() => {
		const el = containerRef.current
		if (!el) return

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const w = Math.floor(entry.contentRect.width)
				if (w !== containerWidth) setContainerWidth(w)
			}
		})
		ro.observe(el)
		return () => ro.disconnect()
	}, [containerWidth])

	const width = containerWidth || 0
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

	const handlePrevious = () => {
		carouselRef.current?.prev()
	}

	const handleNext = () => {
		carouselRef.current?.next()
	}

	return (
		<div className="relative" data-recording-key={recordingKey}>
			<div
				ref={containerRef}
				className="p-2 border-2 rounded-full border-heicha-400 drop-shadow-2xl drop-shadow-heicha-600/40 w-72"
				style={{ transform: `rotate(${cssRotation}deg)` }}
			>
				{width > 0 && items.length > 0 && (
					<BoxCarousel
						ref={carouselRef}
						items={items}
						width={width}
						height={height}
						direction={direction}
						enableDrag
						debug={false}
						autoPlay={!continuousRotation} // Disable autoPlay when continuous rotation is enabled
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
					/>
				)}
			</div>

			{/* Navigation buttons */}
			<div className="flex justify-center mt-4">
				<div className="flex items-center space-x-2 px-2 py-1.5 border bg-heicha-700/80 backdrop-blur-xl border-heicha-500/50 rounded-xl">
					<button
						onClick={handlePrevious}
						className={cn(
							"flex items-center justify-center w-8 h-8 transition-all duration-200 rounded-lg",
							"bg-white/5 hover:bg-white/10 text-white/60 hover:text-white",
							"focus:outline-none focus:ring-1 focus:ring-tea-soup-500/50",
							"disabled:opacity-50 disabled:cursor-not-allowed"
						)}
						aria-label="Previous image"
					>
						<ChevronLeft className="w-4 h-4" />
					</button>
					<button
						onClick={handleNext}
						className={cn(
							"flex items-center justify-center w-8 h-8 transition-all duration-200 rounded-lg",
							"bg-white/5 hover:bg-white/10 text-white/60 hover:text-white",
							"focus:outline-none focus:ring-1 focus:ring-tea-soup-500/50",
							"disabled:opacity-50 disabled:cursor-not-allowed"
						)}
						aria-label="Next image"
					>
						<ChevronRight className="w-4 h-4" />
					</button>
				</div>
			</div>
		</div>
	)
}
