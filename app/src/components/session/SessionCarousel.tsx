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
}

export default function SessionCarousel({
	images,
	direction = "right",
	recordingKey,
	continuousRotation = true,
	continuousSpeed = 17,
	pauseOnHover = true,
	pauseOnDrag = true,
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
		<div ref={containerRef} className="w-full" data-recording-key={recordingKey}>
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
					pauseOnHover={pauseOnHover}
					pauseOnDrag={pauseOnDrag}
				/>
			)}
		</div>
	)
}
