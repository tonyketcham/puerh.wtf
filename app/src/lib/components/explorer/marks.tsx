"use client"

import { motion, useReducedMotion } from "motion/react"
import type { OriginKind } from "@/lib/types/origin"

/**
 * Small data marks for the Explorer's entity views. Each one is the miniature of how that
 * entity draws elsewhere: an origin is the map's marker (§4.1) with one liquor ring per
 * session; a vendor is its category mix bar (§3.3); a style is a strip of its cups.
 */

const EASE = [0.22, 1, 0.36, 1] as const
const CREAM = "#fff2ca"

/** Stagger for marks entering with their row (capped so a long list doesn't trail). */
const delayOf = (index: number) => Math.min(index, 18) * 0.022

// ---------------------------------------------------------------------------
// Origin: map marker + liquor rings
// ---------------------------------------------------------------------------

const RING_RADII = [3.6, 5.1, 6.6] as const

/**
 * The origin's map marker at 16px: the center says how precise the place is (village: a dot;
 * mountain area or township: a dashed circle; county and up: a dotted one; unknown: a "?").
 * Around it, one ring per session that names this place directly, in that session's liquor
 * color, drawn on from the inside out. Three rings at most; more show as a heavier outer ring.
 */
export function OriginMark({
	kind,
	colors,
	index = 0,
	dim = false,
}: {
	kind?: OriginKind | null
	/** liquor colors of the sessions at this origin itself (not its children) */
	colors: readonly string[]
	/** row position, for the draw-on stagger */
	index?: number
	dim?: boolean
}) {
	const reduce = useReducedMotion()
	const rings = colors.slice(0, RING_RADII.length)
	const extra = colors.length > RING_RADII.length
	const start = delayOf(index)
	const draw = (i: number) =>
		reduce
			? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.15 } }
			: {
					initial: { pathLength: 0, opacity: 0 },
					animate: { pathLength: 1, opacity: 1 },
					transition: {
						pathLength: { duration: 0.32, ease: EASE, delay: start + 0.06 + i * 0.05 },
						opacity: { duration: 0.1, delay: start + 0.06 + i * 0.05 },
					},
			  }

	return (
		<svg
			aria-hidden
			viewBox="0 0 16 16"
			className="size-4 shrink-0 overflow-visible"
			style={{ opacity: dim ? 0.45 : 1 }}
		>
			<Center kind={kind} />
			{rings.map((color, i) => (
				<motion.circle
					key={i}
					cx={8}
					cy={8}
					r={RING_RADII[i]}
					fill="none"
					stroke={color}
					strokeWidth={i === rings.length - 1 && extra ? 1.5 : 1}
					// rotate so the draw starts at 12 o'clock, like a clock hand
					transform="rotate(-90 8 8)"
					{...draw(i)}
				/>
			))}
		</svg>
	)
}

function Center({ kind }: { kind?: OriginKind | null }) {
	switch (kind) {
		case "village":
		case "forest":
			return <circle cx={8} cy={8} r={1.6} fill={CREAM} fillOpacity={0.85} />
		case "mountain-area":
		case "township":
			return (
				<circle
					cx={8}
					cy={8}
					r={2}
					fill="none"
					stroke={CREAM}
					strokeOpacity={0.7}
					strokeWidth={0.9}
					strokeDasharray="1.4 1.1"
				/>
			)
		case "unknown":
			return (
				<text
					x={8}
					y={10.6}
					textAnchor="middle"
					fontSize={7.5}
					fill={CREAM}
					fillOpacity={0.6}
					className="font-fira-code"
				>
					?
				</text>
			)
		case "country":
		case "province":
			// a graticule cross: a region, not a point
			return (
				<g stroke={CREAM} strokeOpacity={0.5} strokeWidth={0.9} strokeLinecap="round">
					<line x1={5.5} y1={8} x2={10.5} y2={8} />
					<line x1={8} y1={5.5} x2={8} y2={10.5} />
				</g>
			)
		default:
			// prefecture, county: a dotted circle
			return (
				<circle
					cx={8}
					cy={8}
					r={2.2}
					fill="none"
					stroke={CREAM}
					strokeOpacity={0.6}
					strokeWidth={0.9}
					strokeLinecap="round"
					strokeDasharray="0.01 1.6"
				/>
			)
	}
}

// ---------------------------------------------------------------------------
// Vendor: category mix bar
// ---------------------------------------------------------------------------

export type MixSegment = { key: string; color: string; count: number; label: string }

/**
 * How a vendor's sessions split across tea categories, as a 22px bar of category colors.
 * Segments grow in from the left one after another.
 */
export function MixBar({
	segments,
	index = 0,
	width = 22,
}: {
	segments: readonly MixSegment[]
	index?: number
	width?: number
}) {
	const reduce = useReducedMotion()
	const total = segments.reduce((n, s) => n + s.count, 0)
	if (!total) return <span aria-hidden className="shrink-0" style={{ width }} />
	const start = delayOf(index)
	return (
		<span
			aria-hidden
			className="flex items-center gap-px h-[3px] shrink-0 rounded-full overflow-hidden"
			style={{ width }}
			title={segments.map((s) => `${s.label} ${s.count}`).join(" · ")}
		>
			{segments.map((s, i) => (
				<motion.span
					key={s.key}
					className="h-full origin-left first:rounded-l-full last:rounded-r-full"
					style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
					initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
					animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
					transition={
						reduce
							? { duration: 0.15 }
							: { type: "spring", stiffness: 420, damping: 34, delay: start + 0.08 + i * 0.04 }
					}
				/>
			))}
		</span>
	)
}

// ---------------------------------------------------------------------------
// Style: a strip of cups
// ---------------------------------------------------------------------------

/** Up to four overlapping cups in the sessions' liquor colors; they pop in left to right. */
export function CupStrip({ colors, index = 0 }: { colors: readonly string[]; index?: number }) {
	const reduce = useReducedMotion()
	const cups = colors.slice(0, 4)
	const start = delayOf(index)
	return (
		<span aria-hidden className="flex items-center shrink-0 -space-x-[3px]">
			{cups.map((color, i) => (
				<motion.span
					key={i}
					className="block size-[7px] rounded-full ring-1 ring-[#171617]"
					style={{ background: color }}
					initial={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
					animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
					transition={
						reduce
							? { duration: 0.15 }
							: { type: "spring", stiffness: 600, damping: 26, delay: start + 0.08 + i * 0.035 }
					}
				/>
			))}
		</span>
	)
}
