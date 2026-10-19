"use client"

import { useLayoutEffect, useMemo, type CSSProperties } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"
import { TITLE_CLASS, titleMounted, titleTransitionName, type MorphKind } from "./viewTransition"

/** Masks and clips stop at the border box, but Rock 3D and its hard shadow paint past it. */
const BLEED = "0.2em"
const POUR = { type: "spring", stiffness: 70, damping: 18, mass: 1 } as const

/**
 * The entity's name in Rock 3D, filled with its sessions' liquors: one stop per session,
 * oldest vintage on the left, so the title doubles as a color timeline of everything tasted
 * from here. It pours in from the bottom on arrival.
 *
 * Two copies share one grid cell (like SessionTitle): the white original keeps the hard
 * shadow, the liquor copy sits on top with the gradient clipped to the glyphs (a shadow on a
 * clipped-text layer would paint over its own fill).
 *
 * Carries a view-transition-name, so the chip, crumb or peek header that led here morphs into
 * it (see viewTransition.ts).
 */
export default function EntityTitle({
	kind,
	slug,
	title,
	stops,
	className,
	recordingKey,
}: {
	kind: MorphKind
	slug: string
	title: string
	/** liquor colors, oldest first; empty → the white title alone */
	stops: string[]
	className?: string
	recordingKey?: string
}) {
	const reduce = useReducedMotion() ?? false
	// Rock 3D has no combining marks (Dà Yè Zhòng): set it bare, keep the toned name for readers
	const display = useMemo(() => stripMarks(title), [title])

	// in the DOM: release the borrowed source name and let the morph take its new snapshot
	useLayoutEffect(() => {
		titleMounted(kind, slug)
	}, [kind, slug])

	const gradient = useMemo(() => {
		if (!stops.length) return null
		if (stops.length === 1) return `linear-gradient(${stops[0]}, ${stops[0]})`
		// slightly overlapping bands: each tea holds its color, neighbours blend at the seams
		const n = stops.length
		const list = stops.map((c, i) => {
			const mid = ((i + 0.5) / n) * 100
			const half = (0.5 / n) * 100 * 0.45
			return `${c} ${(mid - half).toFixed(2)}% ${(mid + half).toFixed(2)}%`
		})
		return `linear-gradient(100deg, ${list.join(", ")})`
	}, [stops])

	const stacked: CSSProperties = { gridArea: "1 / 1", padding: BLEED, margin: `-${BLEED}` }

	return (
		<h1
			className={cn(
				"grid font-rock-3d leading-[1.02] text-shadow-2xl break-words",
				// sized by the editor column (cqi), which tracks the docked panels; the viewport does not
				"text-[clamp(44px,8.5cqi,104px)]",
				className
			)}
			data-entity-title
			data-recording-key={recordingKey}
			style={
				{
					viewTransitionName: titleTransitionName(kind, slug),
					viewTransitionClass: TITLE_CLASS,
				} as CSSProperties
			}
			title={
				stops.length > 1 ? `${title} · liquor of ${stops.length} sessions, oldest → newest` : title
			}
		>
			<span className="block" style={stacked}>
				{display}
				{display !== title && <span className="sr-only"> ({title})</span>}
			</span>
			{gradient && (
				<motion.span
					aria-hidden
					className="block pointer-events-none select-none [text-shadow:none] text-transparent bg-clip-text"
					style={{ ...stacked, backgroundImage: gradient }}
					initial={reduce ? { opacity: 0 } : { clipPath: "inset(100% 0% 0% 0%)" }}
					animate={reduce ? { opacity: 1 } : { clipPath: "inset(0% 0% 0% 0%)" }}
					transition={reduce ? { duration: 0.2 } : { ...POUR, delay: 0.22 }}
				>
					{display}
				</motion.span>
			)}
		</h1>
	)
}

/** "Dà Yè Zhòng" → "Da Ye Zhong" */
export function stripMarks(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{M}+/gu, "")
		.normalize("NFC")
}
