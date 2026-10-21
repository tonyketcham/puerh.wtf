"use client"

/**
 * Origin markers (plan §4.1), coded by what the point actually means:
 *
 *   village                    solid dot + one liquor ring per session
 *   mountain-area · township   dashed circle at radius_km
 *   county · prefecture        faint hatched disc at radius_km
 *   province · unknown         dotted ellipse + "?"
 *
 * Areas are geographic (user units, they grow as you zoom); dots and rings are screen-constant
 * (drawn in px inside a .map-px group, which undoes the camera's scale).
 */
import { createContext, memo, useContext, useId, type ReactNode } from "react"
import { motion } from "motion/react"
import { CREAM, EASE, ringInk } from "./geo"

const NS = "non-scaling-stroke" as const

export type Precision =
	| "village"
	| "mountain-area"
	| "township"
	| "forest"
	| "county"
	| "prefecture"
	| "province"
	| "country"
	| "unknown"
	| string

export const isArea = (p: Precision) => p !== "village"

/** Children are in screen px, centered on (x, y). */
export function PxGroup({
	x,
	y,
	children,
	className,
}: {
	x: number
	y: number
	children: ReactNode
	className?: string
}) {
	return (
		<g transform={`translate(${x} ${y})`} className={className}>
			<g className="map-px">{children}</g>
		</g>
	)
}

/** The uncertainty area of a point, in user units. */
export const AreaMark = memo(function AreaMark({
	x,
	y,
	r,
	precision,
	alpha = 1,
	lit = false,
}: {
	x: number
	y: number
	/** radius in user units */
	r: number
	precision: Precision
	alpha?: number
	lit?: boolean
}) {
	const id = useId()
	if (!(r > 0) || precision === "village") return null
	const a = alpha * (lit ? 1.6 : 1)
	if (precision === "county" || precision === "prefecture") {
		const s = Math.max(r / 7, 0.5)
		return (
			<g>
				<defs>
					<pattern
						id={id}
						width={s}
						height={s}
						patternUnits="userSpaceOnUse"
						patternTransform={`rotate(45 ${x} ${y})`}
					>
						<line
							x1={0}
							y1={0}
							x2={0}
							y2={s}
							stroke={CREAM}
							strokeOpacity={0.12 * a}
							strokeWidth={1}
							vectorEffect={NS}
						/>
					</pattern>
				</defs>
				<circle cx={x} cy={y} r={r} fill={`url(#${id})`} />
				<circle
					cx={x}
					cy={y}
					r={r}
					fill="none"
					stroke={CREAM}
					strokeOpacity={0.14 * a}
					strokeWidth={0.75}
					vectorEffect={NS}
				/>
			</g>
		)
	}
	if (precision === "province" || precision === "country" || precision === "unknown") {
		return (
			<ellipse
				cx={x}
				cy={y}
				rx={r}
				ry={r * 0.72}
				fill="none"
				stroke={CREAM}
				strokeOpacity={0.3 * a}
				strokeWidth={1}
				strokeDasharray="1 3"
				strokeLinecap="round"
				vectorEffect={NS}
			/>
		)
	}
	return (
		<circle
			cx={x}
			cy={y}
			r={r}
			fill={CREAM}
			fillOpacity={0.018 * a}
			stroke={CREAM}
			strokeOpacity={0.3 * a}
			strokeWidth={0.9}
			strokeDasharray="3 3"
			vectorEffect={NS}
		/>
	)
})

/**
 * How present ring i of n is: 1 at the center, falling on an ease-out curve ((1 − t)², steep
 * near the middle, flattening into a faint tail) so the rings read as a zone whose edge
 * dissolves into the contours.
 */
const ringFall = (i: number, n: number) => (n > 1 ? (1 - i / (n - 1)) ** 2 : 1)

/**
 * The marks are drawn already: a map opening out of another (the full-screen view) shows its rings
 * as they were, rather than drawing them on again (a pathLength animation, a frame of main-thread
 * work each, as the grow ends)
 */
export const MarksDrawn = createContext(false)

/**
 * Concentric liquor rings, one per session, inner = first. Px units; place inside PxGroup.
 * They draw on in order (oldest vintage first when the caller sorts that way), and fade
 * outward (ringFall); a lit ring keeps the ramp on a higher floor.
 */
export const Rings = memo(function Rings({
	colors,
	base = 5,
	step = 2.4,
	delay = 0,
	stagger = 0.04,
	reduce = false,
	dimmed,
	width = 1.1,
	drawKey,
	delays,
	lit,
}: {
	colors: string[]
	base?: number
	step?: number
	/** s */
	delay?: number
	/** s between rings */
	stagger?: number
	reduce?: boolean
	/** per ring: true → faded (outside the Explorer filters) */
	dimmed?: boolean[]
	width?: number
	drawKey?: unknown
	/** per ring start (s), overriding delay + i × stagger (e.g. by vintage) */
	delays?: number[]
	/** per ring: true → brighter and a touch heavier (hovered elsewhere) */
	lit?: boolean[]
}) {
	const drawn = useContext(MarksDrawn)
	return (
		<g>
			{colors.map((c, i) => {
				const at = delays?.[i] ?? delay + i * stagger
				const fall = ringFall(i, colors.length)
				const opacity = dimmed?.[i]
					? 0.16 * (0.4 + 0.6 * fall)
					: lit?.[i]
					? 0.4 + 0.6 * fall
					: 0.12 + 0.8 * fall
				return (
					<motion.circle
						key={`${String(drawKey)}-${i}`}
						cx={0}
						cy={0}
						r={base + i * step}
						fill="none"
						stroke={ringInk(c)}
						strokeWidth={lit?.[i] ? width + 0.6 : width}
						vectorEffect={NS}
						style={{ rotate: -90 }}
						initial={drawn ? false : reduce ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
						animate={{
							pathLength: 1,
							opacity,
						}}
						transition={{
							pathLength: { duration: 0.45, ease: EASE, delay: reduce ? 0 : at },
							// no delay: a ring with no length yet shows nothing, and filter dims land at once
							opacity: { duration: 0.25 },
						}}
					/>
				)
			})}
		</g>
	)
})

/** The village dot (or a small center tick for areas). Px units. */
export function CenterDot({ precision, color = CREAM }: { precision: Precision; color?: string }) {
	return precision === "village" ? (
		<circle r={1.75} fill={color} fillOpacity={0.9} />
	) : (
		<circle r={1.25} fill={color} fillOpacity={0.65} />
	)
}

/** "?" for points that only say "somewhere in the province". Px units. */
export function UnknownGlyph() {
	return (
		<text
			y={4}
			textAnchor="middle"
			fontSize={11}
			className="font-fira-code"
			fill={CREAM}
			fillOpacity={0.55}
		>
			?
		</text>
	)
}
