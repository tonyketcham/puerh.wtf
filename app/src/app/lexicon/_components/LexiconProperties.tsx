"use client"

import Link from "next/link"
import { useCallback, useMemo, type ReactNode } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { motion, useReducedMotion, type Variants } from "motion/react"
import PanelSection from "@/lib/components/containers/PanelSection"
import PhaseScrubber from "@/lib/components/dataviz/radar/PhaseScrubber"
import RadarChart, { type RadarCompare } from "@/lib/components/dataviz/radar/RadarChart"
import { withAlpha } from "@/lib/components/dataviz/radar/geometry"
import {
	LEXICON_GROUP_META,
	lexiconCompanions,
	lexiconGroupHref,
	type LexiconEntry,
} from "@/lib/lexicon"
import { flavorPhaseAtom, flavorPhaseMotion, flavorPhaseSourceAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils"
import LexiconWord from "./LexiconWord"
import type { WordModel } from "./model"
import { useLexiconWord } from "./useLexiconWord"

const EASE = [0.22, 1, 0.36, 1] as const
const REF_COLOR = "oklch(0.9 0.05 90)"

/** How a word was placed in its group, for the Metadata row. */
const VIA: Record<LexiconEntry["via"], string> = {
	map: "lexiconAxes.ts",
	word: "by one of its words",
	stage: "by where it's said",
	none: "not mapped yet",
}

/**
 * The Properties panel on a word's page, like EntityProperties for the entity kinds:
 * - Flavor centroid: the mean radar of the sessions that mention it, against the whole log,
 *   with the start ⇄ finish scrubber (what "honey" teas taste like, not what honey tastes like)
 * - Metadata: group, how it got there, spellings, listed vs mentioned
 * - Said with: the words that share its sessions, each a link to its own page
 *
 * Lives in the lexicon layout, so the radar morphs from one word to the next.
 */
export default function LexiconProperties({ slug }: { slug: string }) {
	const { lexicon, entry, model } = useLexiconWord(slug)
	const reduce = useReducedMotion() ?? false
	const company = useMemo(
		() => (entry ? lexiconCompanions(lexicon, entry, 8) : []),
		[lexicon, entry]
	)

	const row: Variants = useMemo(
		() =>
			reduce
				? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
				: {
						hidden: { opacity: 0, y: 6 },
						show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
				  },
		[reduce]
	)

	if (!entry || !model) return null
	const meta = LEXICON_GROUP_META[entry.group]

	return (
		<div data-recording-key="lexicon-properties">
			<CentroidPanel model={model} />
			<motion.div
				key={slug}
				initial="hidden"
				animate="show"
				variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.03 } } }}
			>
				<PanelSection title="Metadata">
					<dl className="space-y-1.5">
						<Prop label="kind" row={row}>
							<span style={{ color: model.accentText }}>descriptor</span>
						</Prop>
						<Prop label="group" row={row}>
							<Link
								href={lexiconGroupHref(entry.group)}
								className="inline-flex items-center gap-1.5 rounded-sm outline-none text-white/80 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
							>
								<span aria-hidden className="font-rock-3d text-[13px] leading-none text-white/60">
									{meta.symbol}
								</span>
								{meta.label}
							</Link>
						</Prop>
						<Prop label="placed" row={row} title="How the word got its group">
							<span className="text-white/55">{VIA[entry.via]}</span>
						</Prop>
						{entry.spellings.length > 1 && (
							<Prop label="spellings" row={row} title={entry.spellings.join(", ")}>
								{entry.spellings.join(", ")}
							</Prop>
						)}
						<Prop label="listed" row={row} title="Sessions whose notes list it">
							{entry.listed.length} {entry.listed.length === 1 ? "session" : "sessions"}
						</Prop>
						<Prop
							label="refs"
							row={row}
							title="Sessions that mention it anywhere (find all references)"
						>
							{model.stats.count}
							{model.stats.count > entry.listed.length && (
								<span className="text-white/40">
									{" "}
									· {model.stats.count - entry.listed.length} in passing
								</span>
							)}
						</Prop>
					</dl>
				</PanelSection>

				{company.length > 0 && (
					<PanelSection
						title="Said with"
						rightSlot={<span className="text-[10px] text-white/30">of {entry.listed.length}</span>}
					>
						<ul className="space-y-0.5">
							{company.map(({ entry: e, shared }, i) => (
								<motion.li key={e.slug} variants={row}>
									<LexiconWord
										entry={e}
										className="group/word grid w-full grid-cols-[minmax(0,1fr)_3.5rem_1.5rem] items-center gap-2 h-6 px-1.5 -mx-1.5 text-xs rounded-[4px] text-white/75 hover:bg-white/[0.05] hover:text-white"
									>
										<span className="truncate">{e.term}</span>
										<span
											aria-hidden
											className="relative h-1 rounded-full bg-white/[0.05] overflow-hidden"
										>
											<motion.span
												className="absolute inset-y-0 left-0 origin-left rounded-full"
												style={{
													width: `${(shared / Math.max(1, entry.listed.length)) * 100}%`,
													backgroundColor: withAlpha(model.accentText, 80),
												}}
												initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
												animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
												transition={
													reduce
														? { duration: 0.2 }
														: { type: "spring", stiffness: 520, damping: 38, delay: 0.2 + i * 0.03 }
												}
											/>
										</span>
										<span className="text-[11px] text-right tabular-nums text-white/35">
											{shared}
										</span>
									</LexiconWord>
								</motion.li>
							))}
						</ul>
					</PanelSection>
				)}
			</motion.div>
		</div>
	)
}

/** The mean radar of the word's sessions, diffed against the whole log, with the scrubber. */
function CentroidPanel({ model }: { model: WordModel }) {
	const phase = useAtomValue(flavorPhaseAtom)
	const setSource = useSetAtom(flavorPhaseSourceAtom)
	const onScrubStart = useCallback(() => setSource("scrub"), [setSource])
	const accent = model.accentText

	const compare: RadarCompare | null = useMemo(() => {
		const ref = model.reference.stats.centroid
		if (!ref || !model.stats.centroid) return null
		return { key: "ref:log", data: ref, color: REF_COLOR }
	}, [model.reference, model.stats.centroid])

	return (
		<PanelSection
			title="Flavor centroid"
			rightSlot={
				model.stats.centroid ? (
					<PhaseScrubber
						phase={flavorPhaseMotion}
						value={phase}
						color={accent}
						onScrubStart={onScrubStart}
					/>
				) : undefined
			}
		>
			{model.stats.centroid ? (
				<div className="relative">
					<RadarChart
						data={model.stats.centroid}
						phase={flavorPhaseMotion}
						color={accent}
						compare={compare}
					/>
					<div
						aria-hidden
						className="absolute inset-x-3 bottom-1 flex items-center justify-between text-[10px] leading-none text-white/45 pointer-events-none"
					>
						<Swatch color={accent} label={`mean of ${model.stats.count}`} />
						{compare && <Swatch color={REF_COLOR} label={`vs ${model.reference.label}`} dashed />}
					</div>
				</div>
			) : (
				<p className="py-6 text-xs text-center text-white/35">{"// no flavor profiles yet"}</p>
			)}
		</PanelSection>
	)
}

function Prop({
	label,
	row,
	title,
	children,
}: {
	label: string
	row: Variants
	title?: string
	children: ReactNode
}) {
	return (
		<motion.div
			variants={row}
			className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-x-3"
			title={title}
		>
			<dt className="text-[11px] leading-6 text-white/35">{label}</dt>
			<dd className="min-w-0 text-xs leading-6 truncate text-white/80">{children}</dd>
		</motion.div>
	)
}

function Swatch({
	color,
	label,
	dashed = false,
}: {
	color: string
	label: string
	dashed?: boolean
}) {
	return (
		<span className={cn("inline-flex items-center gap-1 min-w-0")}>
			<span
				className="size-2 rounded-[2px] shrink-0"
				style={{
					background: withAlpha(color, 40),
					outline: `1px ${dashed ? "dashed" : "solid"} ${withAlpha(color, 85)}`,
					outlineOffset: -1,
				}}
			/>
			<span className="truncate">{label}</span>
		</span>
	)
}
