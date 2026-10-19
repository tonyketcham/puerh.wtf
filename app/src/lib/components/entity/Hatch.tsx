"use client"

import { useId, type SVGProps } from "react"
import { cn } from "@/lib/utils/cn"

/**
 * Cartographic hatching: the map-maker's mark for "terra incognita" (no surveyed origin).
 * A real SVG <pattern> of hairlines at 45°, so it stays crisp at any size and reads as a map
 * convention rather than a texture. Fills its box; size it with className.
 */
export default function Hatch({
	spacing = 5,
	stroke = "rgb(255 242 202 / 0.16)",
	className,
	...rest
}: { spacing?: number; stroke?: string } & Omit<SVGProps<SVGSVGElement>, "stroke">) {
	const id = useId()
	return (
		<svg aria-hidden className={cn("block", className)} {...rest}>
			<defs>
				<pattern
					id={id}
					width={spacing}
					height={spacing}
					patternUnits="userSpaceOnUse"
					patternTransform="rotate(45)"
				>
					<line
						x1={0}
						y1={0}
						x2={0}
						y2={spacing}
						stroke={stroke}
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill={`url(#${id})`} />
		</svg>
	)
}
