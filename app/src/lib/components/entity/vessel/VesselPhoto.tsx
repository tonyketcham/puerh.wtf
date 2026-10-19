"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"
import VesselGlyph from "./VesselGlyph"

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * A vessel's photo (a session photo that shows it), settling in from a slight zoom. Vessels
 * with no photo, or a dead one, get their line silhouette on the ground instead.
 */
export default function VesselPhoto({
	src,
	kind,
	title,
	color,
	glyphClassName,
	className,
}: {
	src: string | null | undefined
	kind: string | null | undefined
	title: string
	/** the silhouette's stroke */
	color?: string
	glyphClassName?: string
	className?: string
}) {
	const reduce = useReducedMotion() ?? false
	const [failed, setFailed] = useState<string | null>(null)
	const show = !!src && failed !== src
	return (
		<div
			className={cn(
				"relative overflow-hidden bg-[#161416] ring-1 ring-inset ring-white/[0.07]",
				className
			)}
		>
			{show ? (
				<motion.img
					src={src}
					alt={`${title}, in use`}
					loading="lazy"
					onError={() => setFailed(src)}
					className="absolute inset-0 object-cover w-full h-full"
					initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.06 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: reduce ? 0.2 : 0.8, ease: EASE }}
				/>
			) : (
				<div className="absolute inset-0 grid place-items-center">
					<VesselGlyph
						kind={kind}
						title={title}
						color={color ?? "rgb(255 242 202 / 0.55)"}
						className={cn("w-1/2 max-w-40", glyphClassName)}
					/>
				</div>
			)}
		</div>
	)
}
