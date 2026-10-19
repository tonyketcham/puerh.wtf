"use client"

import { useId, useMemo } from "react"
import { motion, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react"
import {
	CENTER,
	RADIUS,
	VIEWBOX,
	axisAngle,
	formatAxisLabel,
	pathFor,
	pointsFor,
	seriesFor,
	valuesAtPhase,
} from "@/lib/components/dataviz/radar/geometry"
import { FLAVOR_AXES, type FlavorAxis, type SessionFlavorAxes } from "@/lib/types/session"

const EASE = [0.22, 1, 0.36, 1] as const
const CREAM = "#fff2ca"
const AXES = [...FLAVOR_AXES] as string[]
const PHASE_SPRING = { stiffness: 520, damping: 44, mass: 0.9 }

/**
 * What an entity tastes like, over what its parent tastes like (plan §3.2 "At a glance"):
 * the mean radar of its sessions in its liquor, the parent's ghosted underneath in a dashed
 * cream hairline. Where this one pushes past the ghost is the terroir (or the house style).
 *
 * Follows the shared flavor phase (the Properties scrubber blends start → finish). Draws on:
 * rings, spokes, the ghost, then the shape; reduced motion fades instead.
 */
export default function CentroidRadar({
	centroid,
	reference,
	color,
	phase,
	highlight = [],
	className,
	recordingKey,
}: {
	centroid: SessionFlavorAxes | null
	reference: SessionFlavorAxes | null
	color: string
	phase: MotionValue<number>
	/** axes to light up (the ones that differ most from the reference) */
	highlight?: FlavorAxis[]
	className?: string
	recordingKey?: string
}) {
	const reduce = useReducedMotion() ?? false
	const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
	const sprung = useSpring(phase, PHASE_SPRING)
	const p = reduce ? phase : sprung

	// Means sit low on a 0–10 scale (a mean of 2.5 is a strong lean), so the rim is fitted to
	// the larger of the two shapes and the rings say what it is.
	const { own, ref, domain } = useMemo(() => {
		const a = seriesFor(AXES, centroid)
		const b = seriesFor(AXES, reference)
		const peak = Math.max(0, ...a.s, ...a.f, ...b.s, ...b.f)
		const domain = Math.min(10, Math.max(3, Math.ceil(peak * 1.15)))
		const k = 10 / domain
		const scale = (x: { s: number[]; f: number[] }) => ({
			s: x.s.map((v) => v * k),
			f: x.f.map((v) => v * k),
		})
		return { own: scale(a), ref: scale(b), domain }
	}, [centroid, reference])
	const d = useTransform(p, (v) => pathFor(pointsFor(valuesAtPhase(own, v))))
	const refD = useTransform(p, (v) => pathFor(pointsFor(valuesAtPhase(ref, v))))

	const draw = (delay: number, duration = 0.6) =>
		reduce
			? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
			: {
					initial: { pathLength: 0, opacity: 0 },
					animate: { pathLength: 1, opacity: 1 },
					transition: { duration, ease: EASE, delay },
			  }

	return (
		<svg
			viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
			className={className}
			role="img"
			aria-label="Flavor centroid over its reference"
			data-recording-key={recordingKey}
		>
			<defs>
				<radialGradient id={`${uid}-fill`} cx="50%" cy="50%" r="50%">
					<stop offset="0%" stopColor={color} stopOpacity={0.05} />
					<stop offset="100%" stopColor={color} stopOpacity={0.26} />
				</radialGradient>
			</defs>

			{/* rings at quarters of the fitted rim, the rim labelled */}
			<text
				x={CENTER + 4}
				y={CENTER - RADIUS + 13}
				fontSize={12}
				className="font-fira-code"
				fill={CREAM}
				fillOpacity={0.3}
			>
				{domain}
			</text>
			{[0.25, 0.5, 0.75, 1].map((s, i) => (
				<motion.circle
					key={s}
					cx={CENTER}
					cy={CENTER}
					r={RADIUS * s}
					fill="none"
					stroke={CREAM}
					strokeOpacity={s === 1 ? 0.12 : 0.06}
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
					style={{
						rotate: -90,
						transformBox: "view-box",
						transformOrigin: `${CENTER}px ${CENTER}px`,
					}}
					{...draw(i * 0.05, 0.7)}
				/>
			))}

			{/* spokes + labels */}
			{AXES.map((axis, i) => {
				const a = axisAngle(i, AXES.length)
				const cos = Math.cos(a)
				const sin = Math.sin(a)
				const lit = highlight.includes(axis as FlavorAxis)
				const lx = CENTER + RADIUS * 1.2 * cos
				const ly = CENTER + RADIUS * 1.2 * sin
				return (
					<g key={axis}>
						<motion.line
							x1={CENTER}
							y1={CENTER}
							x2={CENTER + RADIUS * cos}
							y2={CENTER + RADIUS * sin}
							stroke={lit ? color : CREAM}
							strokeOpacity={lit ? 0.5 : 0.08}
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
							{...draw(0.15 + i * 0.03, 0.4)}
						/>
						<motion.text
							x={lx}
							y={ly}
							dy="0.35em"
							textAnchor={Math.abs(cos) < 0.3 ? "middle" : cos > 0 ? "start" : "end"}
							fontSize={lit ? 17 : 15}
							className="font-fira-code"
							fill={lit ? color : "#ffffff"}
							fillOpacity={lit ? 1 : 0.42}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.3, delay: reduce ? 0 : 0.4 + i * 0.025 }}
						>
							{formatAxisLabel(axis)}
						</motion.text>
					</g>
				)
			})}

			{/* the reference, ghosted */}
			{reference && (
				<motion.path
					d={refD}
					fill={CREAM}
					fillOpacity={0.035}
					stroke={CREAM}
					strokeOpacity={0.4}
					strokeWidth={1.25}
					strokeDasharray="2 5"
					strokeLinecap="round"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
					data-radar-ghost="reference"
					// a dashed stroke can't draw on (pathLength owns the dasharray): it settles in
					style={{ transformBox: "view-box", transformOrigin: `${CENTER}px ${CENTER}px` }}
					initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={reduce ? { duration: 0.2 } : { duration: 0.8, ease: EASE, delay: 0.35 }}
				/>
			)}

			{/* this entity */}
			{centroid && (
				<>
					<motion.path
						d={d}
						fill={`url(#${uid}-fill)`}
						stroke="none"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.5, delay: reduce ? 0 : 1.05 }}
					/>
					<motion.path
						d={d}
						fill="none"
						stroke={color}
						strokeWidth={2}
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
						data-radar-shape="centroid"
						{...draw(0.55, 0.9)}
					/>
				</>
			)}
		</svg>
	)
}
