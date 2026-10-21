"use client"

import { useMemo } from "react"
import { motion, useReducedMotion } from "motion/react"
import { sessionColor } from "@/lib/relations"
import type { ExplorerSession } from "@/lib/types/session"
import { cn } from "@/lib/utils/cn"
import { sessionTime } from "./brew"

const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const

/**
 * When a vessel was in rotation: one tick per session brewed in it, at the session's date, in
 * its liquor. Strips that share a `domain` line up (the /teaware index draws every vessel on
 * the log's whole span, so you can see the shiboridashi hand over to the cat gaiwan). Ticks
 * rise left to right.
 */
export default function UseStrip({
	sessions,
	domain,
	axis = false,
	className,
	recordingKey,
}: {
	sessions: readonly ExplorerSession[]
	/** [first, last] time (ms) of the axis */
	domain: [number, number]
	/** year marks under the strip */
	axis?: boolean
	className?: string
	recordingKey?: string
}) {
	const reduce = useReducedMotion() ?? false
	const [lo, hi] = domain
	const span = Math.max(1, hi - lo)
	const ticks = useMemo(
		() =>
			sessions
				.map((s) => ({ s, t: sessionTime(s) }))
				.filter((x): x is { s: ExplorerSession; t: number } => x.t != null)
				.sort((a, b) => a.t - b.t)
				.map(({ s, t }) => ({
					slug: s._slug,
					title: `${s.title} · ${new Date(t).toISOString().slice(0, 10)}`,
					x: Math.min(1, Math.max(0, (t - lo) / span)),
					color: sessionColor(s),
				})),
		[sessions, lo, span]
	)
	const years = useMemo(() => {
		const out: { y: number; x: number }[] = []
		for (let y = new Date(lo).getUTCFullYear() + 1; ; y++) {
			const t = Date.UTC(y, 0, 1)
			if (t > hi) break
			out.push({ y, x: (t - lo) / span })
		}
		return out
	}, [lo, hi, span])

	return (
		<div className={cn("relative", className)} data-recording-key={recordingKey}>
			<div className="relative h-5">
				{/* baseline and year boundaries */}
				<span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-[#fff2ca]/[0.1]" />
				{years.map(({ y, x }) => (
					<span
						key={y}
						aria-hidden
						className="absolute bottom-0 w-px h-2 bg-[#fff2ca]/[0.14]"
						style={{ left: `${x * 100}%` }}
					/>
				))}
				{ticks.map((tick, i) => (
					<motion.span
						key={tick.slug}
						title={tick.title}
						className="absolute bottom-0 w-[2px] h-full -ml-px origin-bottom rounded-t-[1px]"
						style={{ left: `${tick.x * 100}%`, backgroundColor: tick.color }}
						initial={reduce ? { opacity: 0 } : { scaleY: 0 }}
						animate={reduce ? { opacity: 0.9 } : { scaleY: 1, opacity: 0.9 }}
						transition={
							reduce ? { duration: 0.2 } : { ...SPRING, delay: 0.1 + Math.min(i, 30) * 0.018 }
						}
					/>
				))}
			</div>
			{axis && (
				<div aria-hidden className="relative h-4 text-[9.5px] tabular-nums text-white/30">
					{years.map(({ y, x }) => (
						<span
							key={y}
							className="absolute top-1 -translate-x-1/2"
							style={{ left: `${x * 100}%` }}
						>
							{y}
						</span>
					))}
				</div>
			)}
		</div>
	)
}
