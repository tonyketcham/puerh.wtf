"use client"

import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Line silhouettes of the brewing vessels, drawn like the map's contours: hairlines that draw
 * on stroke by stroke (saucer, body, then lid). One per shape; a shipiao (stone ladle) gets its
 * own squat profile among the teapots.
 */
const SHAPES: Record<string, string[]> = {
	gaiwan: [
		// saucer
		"M8 34.5C18 37.5 46 37.5 56 34.5",
		// flared bowl and foot
		"M13.5 16C15.5 27 22 32 32 32C42 32 48.5 27 50.5 16",
		"M27 32L27.8 34.6M37 32L36.2 34.6",
		// rim, lid and knob
		"M12.5 16H51.5",
		"M17 15.2C20.5 9.4 43.5 9.4 47 15.2",
		"M28.8 10.2C28.8 6.8 35.2 6.8 35.2 10.2",
	],
	teapot: [
		// round (xishi) body
		"M18.5 23C18.5 14.5 45.5 14.5 45.5 23C45.5 31.5 40 35 32 35C24 35 18.5 31.5 18.5 23Z",
		// spout and handle
		"M45.2 25.5C50.5 24.5 52.5 19.5 56 14.5",
		"M18.8 19.5C9.5 18.5 9.5 31 19.6 28.8",
		// lid seam and knob
		"M23.2 16.6H40.8",
		"M29.4 16.4C29.4 12.6 34.6 12.6 34.6 16.4",
	],
	shipiao: [
		// squat stone-ladle body, wide at the foot
		"M21 21.5C17 25 16.5 31 18.5 34.5H45.5C47.5 31 47 25 43 21.5Z",
		"M44.8 26C50 25.2 52.5 21.5 55.5 18",
		"M20.2 24.5C11.5 23.5 11.5 33.5 19 32.5",
		// flat lid and conical knob
		"M19.5 21.5H44.5",
		"M28.5 21.4L30.2 16.6H33.8L35.5 21.4",
	],
	shiboridashi: [
		// wide, shallow pouring bowl on a low foot
		"M11.5 20C12.5 29.5 20 33 32 33C44 33 51.5 29.5 52.5 20",
		"M26 33L26.6 35.4H37.4L38 33",
		// rim and the combed strainer by the spout
		"M10.5 20H53.5",
		"M47.5 22.6L50.4 21.6M46.8 25.2L49.6 24.2M45.6 27.6L48.4 26.6",
		// flat lid and knob
		"M15 19.2C20 14.2 44 14.2 49 19.2",
		"M30 15.1V12.6H34V15.1",
	],
	chawan: [
		// deep tea bowl
		"M12 12C12 27.5 20 33 32 33C44 33 52 27.5 52 12",
		"M12 12C20 14.2 44 14.2 52 12",
		"M25 33L26 36.2H38L39 33",
	],
}

export function vesselShape(kind: string | null | undefined, title?: string | null): string {
	if (/shi\s*piao|shipiao/i.test(title || "")) return "shipiao"
	return kind && SHAPES[kind] ? kind : "gaiwan"
}

export default function VesselGlyph({
	kind,
	title,
	color = "currentColor",
	draw = true,
	delay = 0,
	className,
}: {
	kind: string | null | undefined
	/** names a shape the kind doesn't (a shipiao among the teapots) */
	title?: string | null
	color?: string
	/** draw the strokes on (else they're simply there) */
	draw?: boolean
	delay?: number
	className?: string
}) {
	const reduce = useReducedMotion() ?? false
	const paths = SHAPES[vesselShape(kind, title)]
	return (
		<svg
			viewBox="0 0 64 40"
			fill="none"
			aria-hidden
			className={cn("block", className)}
			stroke={color}
			strokeWidth={1.25}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{paths.map((d, i) => (
				<motion.path
					key={`${d}`}
					d={d}
					vectorEffect="non-scaling-stroke"
					initial={draw ? (reduce ? { opacity: 0 } : { pathLength: 0, opacity: 0 }) : false}
					animate={reduce ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
					transition={
						reduce
							? { duration: 0.2, delay }
							: { duration: 0.55, ease: EASE, delay: delay + i * 0.07 }
					}
				/>
			))}
		</svg>
	)
}
