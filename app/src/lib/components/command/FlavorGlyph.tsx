"use client"

import { motion, useReducedMotion } from "motion/react"
import { FLAVOR_AXES, type SessionFlavorAxes } from "@/lib/types/session"

const SIZE = 22
/** rim radius as a share of the glyph (9px of 22 at the default size) */
const RIM = 9 / 22

function point(i: number, value: number, size: number) {
	const a = (i / FLAVOR_AXES.length) * Math.PI * 2 - Math.PI / 2
	const r = (Math.max(0, Math.min(10, value)) / 10) * size * RIM
	return [size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r] as const
}

function shape(axes: SessionFlavorAxes, key: "start" | "finish", size = SIZE) {
	// constant command structure so motion can interpolate the path string
	return (
		FLAVOR_AXES.map((axis, i) => {
			const [x, y] = point(i, axes[axis]?.[key] ?? 0, size)
			return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`
		}).join(" ") + " Z"
	)
}

const even = (v: number) =>
	Object.fromEntries(FLAVOR_AXES.map((a) => [a, { start: v, finish: v }])) as SessionFlavorAxes
const FULL = even(10)
const HALF = even(5)
const RING = shape(FULL, "start")

/**
 * A 22px, 10-axis sparkline radar of a tea's flavor profile. At rest it shows the opening
 * (start) shape over a faint finish ghost; when its row is active it breathes into the finish.
 * At 40px and up (EntityPeek's flavor centroid) it also draws the spokes and a mid ring.
 */
export default function FlavorGlyph({
	axes,
	color,
	active,
	size = SIZE,
}: {
	axes: SessionFlavorAxes | null | undefined
	color: string
	active: boolean
	/** px; default 22 */
	size?: number
}) {
	const reduce = useReducedMotion()
	const ring = size === SIZE ? RING : shape(FULL, "start", size)
	if (!axes) {
		return (
			<svg
				width={size}
				height={size}
				viewBox={`0 0 ${size} ${size}`}
				aria-hidden
				className="shrink-0"
			>
				<path
					d={ring}
					fill="none"
					stroke="currentColor"
					strokeOpacity={0.12}
					strokeDasharray="1.5 2"
				/>
			</svg>
		)
	}
	const start = shape(axes, "start", size)
	const finish = shape(axes, "finish", size)
	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			aria-hidden
			className="shrink-0"
		>
			<path d={ring} fill="none" stroke="currentColor" strokeOpacity={0.1} />
			{size >= 40 && (
				<>
					<path
						d={shape(HALF, "start", size)}
						fill="none"
						stroke="currentColor"
						strokeOpacity={0.07}
					/>
					<path
						d={FLAVOR_AXES.map((_, i) => {
							const [x, y] = point(i, 10, size)
							return `M${size / 2} ${size / 2}L${x.toFixed(2)} ${y.toFixed(2)}`
						}).join("")}
						stroke="currentColor"
						strokeOpacity={0.06}
					/>
				</>
			)}
			<path
				d={active ? start : finish}
				fill="none"
				stroke="currentColor"
				strokeOpacity={0.22}
				strokeWidth={0.75}
			/>
			<motion.path
				initial={false}
				animate={{ d: active ? finish : start }}
				transition={
					reduce ? { duration: 0 } : { type: "spring", stiffness: 170, damping: 22, mass: 0.8 }
				}
				fill={color}
				fillOpacity={0.35}
				stroke={color}
				strokeWidth={1}
				strokeLinejoin="round"
			/>
		</svg>
	)
}
