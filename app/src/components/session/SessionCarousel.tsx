"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import BoxCarousel, {
	type CarouselItem,
	type RotationDirection,
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
	continuousRotation = true,
	continuousSpeed = 3,
	pauseOnHover = true,
	pauseOnDrag = true,
	turnSpeedMultiplier = 3,
	hoverScale = 1.05,
	enableScrollControl = false,
	scrollSensitivity = 1,
	enablePageScrollControl = true,
	pageScrollSensitivity = 1.5,
	scrollOffset = 0,
	initialRotationOffset = 10,
}: SessionCarouselProps) {
	const containerRef = useRef<HTMLDivElement | null>(null)
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

	return (
		<div
			ref={containerRef}
			className="w-72 aspect-square rotate-12"
			data-recording-key={recordingKey}
		>
			{width > 0 && items.length > 0 && (
				<BoxCarousel
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
	)
}
