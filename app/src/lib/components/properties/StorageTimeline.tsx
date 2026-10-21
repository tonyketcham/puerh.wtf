"use client"

import { Fragment, type CSSProperties } from "react"
import { motion, useReducedMotion } from "motion/react"
import EntityRef from "@/lib/components/entity/EntityRef"
import { HUMIDITY, stintLength, storageTimeline, type StorageSegment } from "@/lib/storage"
import type { StorageStint } from "@/lib/types/session"
import { cn } from "@/lib/utils/cn"

const EASE = [0.22, 1, 0.36, 1] as const
const CREAM = "#fff2ca"

/**
 * Where a tea aged (plan §3.4, §3.5), on a track from its vintage to the day it was tasted:
 *
 *   ▕████ Menghai ████▕████ Guangzhou ████▏ ▾ tasted
 *   2007            2014                 2021 (the tasting: the tick above)
 *   ● Menghai 7 yrs  →  ● dry Guangzhou 7 yrs
 *   // "Menghai for 7.5 years, Guangzhou for 7 years"
 *
 * Segments are tinted by humidity (dry sand, natural amber, wet moss; cream when the text
 * doesn't say) and travel left to right as they draw on. Years the text doesn't give are
 * inferred from the vintage or the tasting and fade in from (or out to) that end; hedged
 * readings ("~20 years", "perhaps Taiwan?") are drawn as outlines. The raw text stays beneath.
 */
export default function StorageTimeline({
	stints,
	vintage,
	tasted,
	raw,
	recordingKey,
}: {
	stints: readonly StorageStint[] | null | undefined
	vintage: number | null | undefined
	/** session date */
	tasted: string | null | undefined
	/** aging_conditions, as written */
	raw?: string | null
	recordingKey?: string
}) {
	const reduce = useReducedMotion() ?? false
	const timeline = storageTimeline(stints, vintage, tasted)
	if (!timeline) return raw ? <span className="text-white/70">{raw}</span> : null

	const [lo, hi] = timeline.domain
	const span = hi - lo
	const at = (y: number) => ((y - lo) / span) * 100
	const marks = [
		...new Set(
			[timeline.vintage, ...timeline.segments.map((s) => s.start), timeline.tasted]
				.filter((y): y is number => y != null && Number.isInteger(y))
				.filter((y) => y >= lo && y <= hi)
		),
	].sort((a, b) => a - b)
	// keep year labels from colliding on short spans: the tasting (last) wins, then right to left
	const labels: number[] = []
	for (const y of [...marks].reverse())
		if (!labels.length || at(labels[0]) - at(y) >= 20) labels.unshift(y)

	return (
		<div className="pt-1 space-y-2" data-recording-key={recordingKey}>
			<div className="relative">
				<div className="relative h-2.5 rounded-[2px] bg-white/[0.04]">
					{timeline.segments.map((seg, i) => (
						<Segment
							key={`${seg.place.key}-${i}`}
							seg={seg}
							left={at(seg.start)}
							width={Math.max(1.5, at(seg.end) - at(seg.start))}
							delay={0.1 + i * 0.22}
							reduce={reduce}
						/>
					))}
					{timeline.tasted != null && (
						<motion.span
							aria-hidden
							title={`Tasted ${timeline.tasted}`}
							className="absolute -top-[5px] -bottom-[5px] w-px bg-[var(--liquor-text,#edc446)]"
							style={{ left: `${at(Math.min(timeline.tasted, hi))}%` }}
							initial={reduce ? { opacity: 0 } : { scaleY: 0, opacity: 0 }}
							animate={{ scaleY: 1, opacity: 1 }}
							transition={{
								duration: 0.35,
								ease: EASE,
								delay: 0.15 + timeline.segments.length * 0.22,
							}}
						/>
					)}
				</div>
				<div aria-hidden className="relative h-4 text-[9.5px] tabular-nums text-white/30">
					{labels.map((y) => {
						const x = at(y)
						return (
							<span
								key={y}
								className={cn(
									"absolute top-1 whitespace-nowrap",
									x > 80 ? "-translate-x-full" : x > 6 && "-translate-x-1/2"
								)}
								style={{ left: `${x}%` }}
							>
								{y}
							</span>
						)
					})}
				</div>
			</div>

			<p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-5">
				{timeline.segments.map((seg, i) => (
					<Fragment key={`${seg.place.key}-${i}`}>
						{i > 0 && (
							<span aria-hidden className="text-white/20">
								→
							</span>
						)}
						<Stint seg={seg} />
					</Fragment>
				))}
			</p>

			{raw && (
				<p className="text-[10.5px] leading-snug text-white/30 break-words">{`// "${raw}"`}</p>
			)}
		</div>
	)
}

function inkOf(seg: StorageSegment) {
	return seg.stint.humidity ? HUMIDITY[seg.stint.humidity].color : CREAM
}

function Segment({
	seg,
	left,
	width,
	delay,
	reduce,
}: {
	seg: StorageSegment
	left: number
	width: number
	delay: number
	reduce: boolean
}) {
	const ink = inkOf(seg)
	const alpha = seg.stint.humidity ? 0.85 : 0.4
	// inferred ends fade toward the vintage / the tasting they were borrowed from
	const fill = `color-mix(in oklab, ${ink} ${alpha * 100}%, transparent)`
	const background =
		seg.openStart || seg.openEnd
			? `linear-gradient(90deg, ${seg.openStart ? "transparent" : fill}, ${fill} ${
					seg.openStart ? 45 : 0
			  }%, ${fill} ${seg.openEnd ? 55 : 100}%, ${seg.openEnd ? "transparent" : fill})`
			: fill
	const title = [
		seg.stint.humidity ? HUMIDITY[seg.stint.humidity].title : "Storage",
		`in ${seg.place.title}`,
		seg.openStart && seg.openEnd ? "(years not recorded)" : null,
		seg.stint.approx ? "(approximate)" : null,
	]
		.filter(Boolean)
		.join(" ")
	return (
		<motion.span
			title={title}
			className={cn(
				"absolute inset-y-0 origin-left rounded-[2px]",
				seg.stint.approx && "ring-1 ring-inset ring-[var(--ink)]"
			)}
			style={
				{
					left: `${left}%`,
					width: `calc(${width}% - 1px)`,
					background: seg.stint.approx ? undefined : background,
					"--ink": `color-mix(in oklab, ${ink} 70%, transparent)`,
				} as CSSProperties
			}
			initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
			animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
			transition={reduce ? { duration: 0.2 } : { duration: 0.5, ease: EASE, delay }}
		>
			{seg.stint.approx && (
				<span
					aria-hidden
					className="absolute inset-[3px] rounded-[1px]"
					style={{ background, opacity: 0.45 }}
				/>
			)}
		</motion.span>
	)
}

/** ● dry Guangzhou 7 yrs: humidity dot, the place (a link when it's an origin or a vendor), length. */
function Stint({ seg }: { seg: StorageSegment }) {
	const { place, stint } = seg
	const len = stintLength(seg)
	const name = place.origin ? (
		<EntityRef
			kind="origin"
			slug={place.origin}
			label={place.title}
			variant="crumb"
			glyph={false}
		/>
	) : place.vendor ? (
		<EntityRef
			kind="vendor"
			slug={place.vendor}
			label={place.title}
			variant="crumb"
			glyph={false}
		/>
	) : (
		<span className={place.lon == null ? "text-white/45" : "text-white/75"} title={place.hanzi}>
			{place.title}
		</span>
	)
	return (
		<span className="inline-flex items-center gap-1.5 min-w-0">
			<span
				aria-hidden
				className="size-1.5 rounded-full shrink-0"
				style={{
					backgroundColor: stint.humidity ? HUMIDITY[stint.humidity].color : "transparent",
					boxShadow: stint.humidity ? undefined : `inset 0 0 0 1px ${CREAM}55`,
				}}
			/>
			{stint.humidity && <span className="text-white/40">{HUMIDITY[stint.humidity].label}</span>}
			{name}
			{len && <span className="tabular-nums text-white/35">{len}</span>}
			{stint.approx && !len && <span className="text-white/30">?</span>}
		</span>
	)
}
