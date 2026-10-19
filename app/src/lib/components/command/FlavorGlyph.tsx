"use client"

import { motion, useReducedMotion } from "motion/react"
import { FLAVOR_AXES, type SessionFlavorAxes } from "@/lib/types/session"

const SIZE = 22
const C = SIZE / 2
const R = 9

function point(i: number, value: number) {
	const a = (i / FLAVOR_AXES.length) * Math.PI * 2 - Math.PI / 2
	const r = (Math.max(0, Math.min(10, value)) / 10) * R
	return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const
}

function shape(axes: SessionFlavorAxes, key: "start" | "finish") {
	// constant command structure so motion can interpolate the path string
	return (
		FLAVOR_AXES.map((axis, i) => {
			const [x, y] = point(i, axes[axis]?.[key] ?? 0)
			return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`
		}).join(" ") + " Z"
	)
}

const RING = shape(
	Object.fromEntries(FLAVOR_AXES.map((a) => [a, { start: 10, finish: 10 }])) as SessionFlavorAxes,
	"start"
)

/**
 * A 22px, 10-axis sparkline radar of a tea's flavor profile. At rest it shows the opening
 * (start) shape over a faint finish ghost; when its row is active it breathes into the finish.
 */
export default function FlavorGlyph({
	axes,
	color,
	active,
}: {
	axes: SessionFlavorAxes | null | undefined
	color: string
	active: boolean
}) {
	const reduce = useReducedMotion()
	if (!axes) {
		return (
			<svg
				width={SIZE}
				height={SIZE}
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				aria-hidden
				className="shrink-0"
			>
				<path
					d={RING}
					fill="none"
					stroke="currentColor"
					strokeOpacity={0.12}
					strokeDasharray="1.5 2"
				/>
			</svg>
		)
	}
	const start = shape(axes, "start")
	const finish = shape(axes, "finish")
	return (
		<svg
			width={SIZE}
			height={SIZE}
			viewBox={`0 0 ${SIZE} ${SIZE}`}
			aria-hidden
			className="shrink-0"
		>
			<path d={RING} fill="none" stroke="currentColor" strokeOpacity={0.1} />
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
