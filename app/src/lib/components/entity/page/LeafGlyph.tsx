"use client"

import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"
import { stripMarks } from "@/lib/utils/stripMarks"

export type LeafSize = "small" | "medium" | "large"

/**
 * Leaf size as the cultivar's own name states it (大叶 da ye, 中小叶 zhong xiao ye, 小叶 xiao
 * ye). Names that don't say aren't guessed at: null.
 */
export function leafSize(title: string): LeafSize | null {
	const t = stripMarks(title).toLowerCase()
	if (/\bzhong xiao ye\b/.test(t)) return "medium"
	if (/\bda ye\b/.test(t)) return "large"
	if (/\bxiao ye\b/.test(t)) return "small"
	return null
}

const LEAVES: { size: LeafSize; x: number; h: number; w: number }[] = [
	{ size: "small", x: 5, h: 9, w: 3 },
	{ size: "medium", x: 14, h: 14, w: 4.4 },
	{ size: "large", x: 26, h: 20, w: 6 },
]

/**
 * Three leaves, small to large, the cultivar's lit in its accent (plan §3.3 "leaf size"
 * glyph). Unknown sizes draw all three as dashed outlines rather than claim one.
 */
export default function LeafGlyph({
	size,
	color,
	className,
}: {
	size: LeafSize | null
	color: string
	className?: string
}) {
	const reduce = useReducedMotion() ?? false
	return (
		<svg
			viewBox="0 0 34 24"
			className={cn("block", className)}
			aria-label={size ? `${size} leaf` : "leaf size not stated"}
			role="img"
		>
			<line
				x1={0}
				x2={34}
				y1={23}
				y2={23}
				stroke="#fff2ca"
				strokeOpacity={0.12}
				strokeWidth={0.6}
			/>
			{LEAVES.map((leaf, i) => {
				const lit = leaf.size === size
				const top = 22.5 - leaf.h
				const mid = top + leaf.h * 0.55
				const d = `M${leaf.x} ${top} Q${leaf.x + leaf.w * 1.25} ${mid} ${leaf.x} 22.5 Q${
					leaf.x - leaf.w * 1.25
				} ${mid} ${leaf.x} ${top}Z`
				return (
					<g key={leaf.size}>
						<motion.path
							d={d}
							fill={lit ? color : "none"}
							fillOpacity={lit ? 0.28 : 0}
							stroke={lit ? color : "#ffffff"}
							strokeOpacity={lit ? 1 : size ? 0.18 : 0.3}
							strokeWidth={0.8}
							strokeDasharray={size ? undefined : "1.2 1.4"}
							strokeLinejoin="round"
							initial={reduce || !size ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
							animate={reduce || !size ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
							transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.08 }}
						/>
						{lit && (
							<line
								x1={leaf.x}
								x2={leaf.x}
								y1={top + 1.5}
								y2={22.5}
								stroke={color}
								strokeOpacity={0.7}
								strokeWidth={0.5}
							/>
						)}
					</g>
				)
			})}
		</svg>
	)
}
