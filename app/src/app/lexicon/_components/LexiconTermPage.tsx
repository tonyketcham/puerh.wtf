"use client"

import Link from "next/link"
import { Suspense, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { useAtom, useSetAtom } from "jotai"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronRight, Crosshair, Filter } from "lucide-react"
import EntityRef from "@/lib/components/entity/EntityRef"
import Hatch from "@/lib/components/entity/Hatch"
import AtAGlance from "@/lib/components/entity/page/AtAGlance"
import DotMap, { type DotMapPoint } from "@/lib/components/entity/page/DotMap"
import EntityTitle from "@/lib/components/entity/page/EntityTitle"
import { liquorStops } from "@/lib/sessionAnalysis"
import Section from "@/lib/components/entity/page/Section"
import RelatedGroup, { type RelatedGroupData } from "@/lib/components/entity/page/RelatedGroup"
import SessionsList from "@/lib/components/entity/page/SessionsList"
import { useMorphClick } from "@/lib/components/entity/page/viewTransition"
import { NoteStageIcon } from "@/lib/components/icons/TeaIcons"
import { ENTITY_META, type EntityKind } from "@/lib/entities"
import { replaceFilters } from "@/lib/store/filterState"
import { useFilterActive } from "@/lib/store/useFilterActive"
import {
	LEXICON_GROUP_META,
	lexiconCompanions,
	lexiconGroupHref,
	lexiconMatches,
	peakStage,
	type Lexicon,
	type LexiconEntry,
} from "@/lib/lexicon"
import { NOTE_STAGES, NOTE_STAGE_META } from "@/lib/noteStages"
import { peekFilter } from "@/lib/peek"
import { entityKeys, sessionColor, type RelationIndex } from "@/lib/relations"
import { formatRating } from "@/lib/sessionSort"
import { descriptorAtom } from "@/lib/store/sessionAtom"
import type { NoteStage } from "@/lib/types/session"
import { buildLink } from "@/lib/utils/BuildLinkToGivenCollectionNode"
import { cn } from "@/lib/utils"
import LexiconWord from "@/lib/components/lexicon/LexiconWord"
import type { WordModel } from "@/lib/components/lexicon/model"
import { useLexiconWord } from "./useLexiconWord"

const EASE = [0.22, 1, 0.36, 1] as const
const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const

/**
 * A word's page, /lexicon/[term] (plan §2.2 "Flavor descriptor" (c)), on the entity page
 * template (§3.2), "Go to Definition" for a tasting-note word:
 *
 *   lexicon › Cr cream › honey .................... [‘ honey.descriptor] [refs] [filter]
 *   HONEY (Rock 3D, poured with the liquors of every session that says it)
 *   cream · 13 sessions list it · mostly the taste
 *   [ element tile | where in the session it's said | where it's tasted ]
 *   ── At a glance ──      counts, vintages, rating, liquor; centroid over the whole log
 *   ── In their words ──   every mention in context (IDE search results)
 *   ── Sessions ──         find all references, sortable
 *   ── Related ──          the words it's said with, origins, styles, vendors
 */
export default function LexiconTermPage({
	slug,
	cards,
	points,
}: {
	slug: string
	/** server-rendered SessionCards by session slug */
	cards: Record<string, ReactNode>
	/** origins of its sessions, as dots */
	points: DotMapPoint[]
}) {
	const { index, lexicon, entry, model } = useLexiconWord(slug)
	const stops = useMemo(() => (model ? liquorStops(model.sessions) : []), [model])

	if (!entry || !model) return <p className="text-sm text-white/45">{"// no such word"}</p>
	const title = `‘${entry.term}’`

	return (
		<div
			className="space-y-10"
			data-entity-root
			data-entity-kind="descriptor"
			data-entity-slug={entry.slug}
			style={{ "--entity-accent": model.accentText } as CSSProperties}
		>
			<header className="space-y-4">
				<Crumbs entry={entry} model={model} />

				<EntityTitle
					kind="descriptor"
					slug={entry.slug}
					title={entry.term}
					stops={stops}
					recordingKey="entity-title"
				/>

				<Subtitle entry={entry} />
			</header>

			<div className="space-y-14">
				<WordHero entry={entry} model={model} lexicon={lexicon} points={points} />

				<Section id="glance" label="At a glance" recordingKey="entity-at-a-glance">
					<AtAGlance model={model} index={index} title={title} />
				</Section>

				<Section
					id="mentions"
					label="In their words"
					count={model.sessions.length || undefined}
					aside={<span className="text-[11px] text-white/25">every mention, in context</span>}
					recordingKey="lexicon-mentions"
				>
					<Mentions model={model} entry={entry} />
				</Section>

				<Section
					id="sessions"
					label="Sessions"
					count={model.sessions.length || undefined}
					aside={<span className="text-[11px] text-white/25">find all references</span>}
					recordingKey="entity-sessions"
				>
					<SessionsList sessions={model.sessions} index={index} title={title} cards={cards} />
				</Section>

				<Section id="related" label="Related" recordingKey="entity-related">
					<WordRelated model={model} entry={entry} index={index} lexicon={lexicon} />
				</Section>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/** `lexicon › Cr cream › honey` ............... `‘ honey.descriptor` [refs] [filter] */
function Crumbs({ entry, model }: { entry: LexiconEntry; model: WordModel }) {
	const rootMorph = useMorphClick("descriptor", "_index", "/lexicon/")
	const meta = LEXICON_GROUP_META[entry.group]
	const sep = (
		<ChevronRight aria-hidden size={12} strokeWidth={1.5} className="shrink-0 text-white/20" />
	)
	return (
		<div className="flex items-center min-w-0 gap-4">
			<nav aria-label="Breadcrumb" className="min-w-0 flex-1">
				<ol className="flex items-center min-w-0 gap-1 overflow-hidden text-xs leading-6 whitespace-nowrap">
					<li className="shrink-0">
						<Link
							href="/lexicon/"
							// the crumb grows into the index's title
							onClick={rootMorph}
							className="rounded-sm outline-none text-white/40 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
						>
							lexicon
						</Link>
					</li>
					<li className="flex items-center gap-1 shrink-0">
						{sep}
						<Link
							href={lexiconGroupHref(entry.group)}
							className="inline-flex items-center gap-1.5 rounded-sm outline-none text-white/55 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
						>
							<span aria-hidden className="font-rock-3d text-[13px] leading-none text-white/70">
								{meta.symbol}
							</span>
							{meta.label}
						</Link>
					</li>
					<li className="flex items-center gap-1 min-w-0" aria-current="page">
						{sep}
						<span className="truncate text-white/90">{entry.term}</span>
					</li>
				</ol>
			</nav>
			<FileTab entry={entry} model={model} />
		</div>
	)
}

/** The editor tab, `‘ honey.descriptor`, with find references and the Explorer filter. */
function FileTab({ entry, model }: { entry: LexiconEntry; model: WordModel }) {
	const [descriptor, setDescriptor] = useAtom(descriptorAtom)
	const target = { kind: "descriptor" as const, key: entry.term }
	const filter = peekFilter(target)
	const filtered = useFilterActive(target)
	const pinned = !!descriptor?.pinned && entry.spellings.includes(descriptor.term)
	return (
		<div className="flex items-center gap-1.5 shrink-0">
			<span
				className="inline-flex items-center h-6 gap-1.5 px-2 text-[11px] rounded-t-[5px] border-b-2 bg-white/[0.03] text-white/70"
				style={{ borderBottomColor: model.accentText }}
				title="This page, named like a file"
			>
				<span aria-hidden style={{ color: model.accentText }}>
					‘
				</span>
				{entry.slug}.descriptor
			</span>
			<button
				type="button"
				aria-pressed={pinned}
				onClick={() => setDescriptor(pinned ? null : { term: entry.term, pinned: true })}
				title={
					pinned
						? "Stop highlighting it"
						: "Highlight it in the Explorer and in every session you open"
				}
				className={tabButton(pinned)}
			>
				<Crosshair size={11} strokeWidth={2} aria-hidden />
				refs
			</button>
			{filter && (
				<button
					type="button"
					aria-pressed={filtered}
					onClick={() => replaceFilters((s) => filter.toggle(s))}
					title={
						filtered ? "Remove the Explorer filter" : `Show only sessions that say ‘${entry.term}’`
					}
					className={tabButton(filtered)}
				>
					<Filter size={11} strokeWidth={2} aria-hidden />
					{filtered ? "filtered" : "filter"}
				</button>
			)}
		</div>
	)
}

const tabButton = (active: boolean) =>
	cn(
		"inline-flex items-center h-6 gap-1 px-1.5 text-[11px] rounded-[5px] outline-none ring-1 ring-inset transition-colors",
		"focus-visible:ring-white/50",
		active
			? "text-white ring-white/30 bg-white/[0.08]"
			: "text-white/45 ring-white/[0.08] hover:text-white hover:bg-white/[0.05]"
	)

/** `cream · 13 sessions list it · mostly the taste · also ‘plums’` */
function Subtitle({ entry }: { entry: LexiconEntry }) {
	const peak = peakStage(entry)
	const parts: ReactNode[] = [
		LEXICON_GROUP_META[entry.group].label,
		`${entry.listed.length} sessions list it`,
	]
	if (peak) parts.push(`mostly the ${NOTE_STAGE_META[peak].title.toLowerCase()}`)
	if (entry.spellings.length > 1)
		parts.push(
			<span>
				also{" "}
				{entry.spellings
					.filter((sp) => sp !== entry.term)
					.map((sp) => `‘${sp}’`)
					.join(", ")}
			</span>
		)
	return (
		<p className="flex flex-wrap items-center text-sm gap-x-2 gap-y-1 text-white/45">
			{parts.map((p, i) => (
				<span key={i} className="inline-flex items-center gap-2">
					{i > 0 && (
						<span aria-hidden className="text-white/20">
							·
						</span>
					)}
					{p}
				</span>
			))}
		</p>
	)
}

// ---------------------------------------------------------------------------
// Hero: element tile · stages · map
// ---------------------------------------------------------------------------

function WordHero({
	entry,
	model,
	lexicon,
	points,
}: {
	entry: LexiconEntry
	model: WordModel
	lexicon: Lexicon
	points: DotMapPoint[]
}) {
	const reduce = useReducedMotion() ?? false
	const meta = LEXICON_GROUP_META[entry.group]
	const rank = lexicon.paged.indexOf(entry) + 1
	const accent = model.accentText
	const peak = peakStage(entry)
	const max = Math.max(1, ...NOTE_STAGES.map((s) => entry.stages[s]))

	return (
		<div className="grid overflow-hidden rounded-lg ring-1 ring-inset ring-white/[0.07] sm:grid-cols-[9rem_minmax(0,1fr)] xl:grid-cols-[9rem_minmax(0,1.25fr)_minmax(0,1fr)]">
			{/* the word as an element of its group */}
			<div className="relative p-3 border-b sm:border-b-0 sm:border-r border-white/[0.06]">
				<motion.div
					className="relative flex flex-col h-full min-h-36 p-2.5 rounded-[6px]"
					style={{
						boxShadow: `inset 0 0 0 1px ${accent}55`,
						background: `linear-gradient(160deg, ${accent}1f, transparent 70%)`,
					}}
					initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={reduce ? { duration: 0.2 } : { ...SPRING, delay: 0.15 }}
					title={`№ ${rank} of ${lexicon.paged.length} by sessions · ${meta.label}`}
				>
					<span className="flex items-start justify-between text-[10px] leading-none tabular-nums text-white/45">
						<span>{rank}</span>
						<span>{model.stats.count}</span>
					</span>
					<span className="flex-1 grid place-items-center font-rock-3d text-[44px] leading-none text-white">
						{meta.symbol}
					</span>
					<span
						className="text-[10px] leading-tight text-center truncate"
						style={{ color: accent }}
					>
						{entry.term}
					</span>
					<span className="text-[9px] leading-tight text-center text-white/35">{meta.label}</span>
				</motion.div>
			</div>

			{/* where in the session it's said */}
			<div className="px-5 pt-4 pb-3 space-y-3">
				<p className="text-[10.5px] text-white/40">
					{"// where in the session it's said"}
					{peak && (
						<span className="text-white/25">
							{" · mostly "}
							{NOTE_STAGE_META[peak].title.toLowerCase()}
						</span>
					)}
				</p>
				<ol className="grid grid-cols-7 gap-1.5" aria-label="Sessions listing it, by stage">
					{NOTE_STAGES.map((stage, i) => {
						const n = entry.stages[stage]
						return (
							<li
								key={stage}
								className="flex flex-col items-center gap-1.5"
								title={`${NOTE_STAGE_META[stage].title}: ${n} ${n === 1 ? "session" : "sessions"}`}
							>
								<span className="text-[10px] leading-none tabular-nums text-white/45">
									{n || ""}
								</span>
								<div className="relative w-full h-20 rounded-[3px] bg-white/[0.035] overflow-hidden">
									{n > 0 && (
										<motion.div
											className="absolute inset-x-0 bottom-0 origin-bottom rounded-[3px]"
											style={{
												height: `${(n / max) * 100}%`,
												backgroundColor: accent,
												opacity: stage === peak ? 0.9 : 0.45,
											}}
											initial={reduce ? { opacity: 0 } : { scaleY: 0 }}
											animate={reduce ? { opacity: stage === peak ? 0.9 : 0.45 } : { scaleY: 1 }}
											transition={
												reduce ? { duration: 0.2 } : { ...SPRING, delay: 0.25 + i * 0.04 }
											}
										/>
									)}
								</div>
								<NoteStageIcon
									stage={stage}
									className={cn("size-3.5", n > 0 ? "text-white/60" : "text-white/20")}
								/>
								<span
									aria-hidden
									className="text-[9px] leading-none text-center text-white/35 truncate max-w-full"
								>
									{STAGE_SHORT[stage]}
								</span>
								<span className="sr-only">{NOTE_STAGE_META[stage].title}</span>
							</li>
						)
					})}
				</ol>
			</div>

			{/* where it's tasted */}
			<div className="relative border-t xl:border-t-0 xl:border-l border-white/[0.06] min-h-40 sm:col-span-2 xl:col-span-1">
				{points.length ? (
					<>
						<DotMap points={points} width={300} height={170} labels={3} accent={accent} />
						<p className="absolute left-4 top-3 text-[10.5px] text-white/40">{"// tasted in"}</p>
					</>
				) : (
					<>
						<Hatch className="absolute inset-0 w-full h-full" spacing={7} />
						<p className="absolute left-4 top-3 text-[10.5px] text-white/45">
							{"// no surveyed gardens"}
						</p>
					</>
				)}
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// In their words: every mention, like IDE search results
// ---------------------------------------------------------------------------

/** Stage names that fit under a 7-column chart. */
const STAGE_SHORT: Record<NoteStage, string> = {
	dry_leaf_nose: "dry",
	wet_leaf_nose: "wet",
	mouthfeel: "mouth",
	taste: "taste",
	finish: "finish",
	empty_cup: "cup",
	cha_qi: "qi",
}

const COLLAPSED_SESSIONS = 6
/** characters of context either side of a mention */
const CONTEXT = 42

function Mentions({ model, entry }: { model: WordModel; entry: LexiconEntry }) {
	const reduce = useReducedMotion() ?? false
	const setDescriptor = useSetAtom(descriptorAtom)
	const [open, setOpen] = useState(false)
	const rows = useMemo(
		() =>
			model.sessions
				.map((s) => ({ s, matches: lexiconMatches(s, entry) }))
				.filter((r) => r.matches.length > 0),
		[model.sessions, entry]
	)
	if (!rows.length) return <p className="text-sm text-white/40">{"// no mentions"}</p>
	const shown = open ? rows : rows.slice(0, COLLAPSED_SESSIONS)
	const more = rows.length - COLLAPSED_SESSIONS

	return (
		<div className="space-y-2">
			<motion.ul layout={reduce ? false : "size"} transition={SPRING} className="space-y-1">
				<AnimatePresence initial={false}>
					{shown.map(({ s, matches }, i) => {
						const year = s.production_year ? Math.trunc(Number(s.production_year)) : null
						return (
							<motion.li
								key={s._slug}
								layout={reduce ? false : "position"}
								initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, margin: "0px 0px -5% 0px" }}
								exit={{ opacity: 0, transition: { duration: 0.12 } }}
								transition={{
									duration: 0.35,
									ease: EASE,
									delay: reduce ? 0 : (i < COLLAPSED_SESSIONS ? i : i - COLLAPSED_SESSIONS) * 0.04,
								}}
							>
								<Link
									href={buildLink(s)}
									// open it with the word lit
									onClick={() => setDescriptor({ term: entry.term, pinned: true })}
									className="group/m block py-1.5 pl-2 pr-3 -mx-2 rounded-[5px] outline-none hover:bg-white/[0.03] focus-visible:ring-1 focus-visible:ring-white/40"
								>
									<span className="flex items-center gap-2 text-xs">
										<span
											aria-hidden
											className="w-1.5 h-3.5 rounded-[2px] shrink-0 ring-1 ring-inset ring-black/20"
											style={{ backgroundColor: sessionColor(s) }}
										/>
										<span className="w-8 tabular-nums shrink-0 text-white/35">{year ?? "—"}</span>
										<span className="min-w-0 truncate text-white/80 group-hover/m:text-white">
											{s.title}
										</span>
										<span className="tabular-nums text-white/25">{matches.length}</span>
										<span aria-hidden className="flex-1 h-px bg-white/[0.04]" />
										{typeof s.rating === "number" && (
											<span className="tabular-nums shrink-0 text-white/35">
												{formatRating(Math.round(s.rating * 10) / 10)}
											</span>
										)}
									</span>
									<span className="block mt-1 space-y-0.5">
										{matches.map((m) => (
											<span
												key={`${m.field}:${m.index}`}
												className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-2 pl-[3.25rem] text-[11.5px] leading-5"
											>
												<span className="inline-flex items-center gap-1.5 text-white/35 truncate">
													{m.field === "excerpt" ? (
														<span aria-hidden className="w-3 text-center">
															¶
														</span>
													) : (
														<NoteStageIcon
															stage={m.field as NoteStage}
															className="size-3 shrink-0"
														/>
													)}
													{m.field === "excerpt"
														? "excerpt"
														: NOTE_STAGE_META[m.field as NoteStage].title.toLowerCase()}
												</span>
												<Snippet text={m.text} index={m.index} length={m.length} />
											</span>
										))}
									</span>
								</Link>
							</motion.li>
						)
					})}
				</AnimatePresence>
			</motion.ul>
			{more > 0 && (
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					aria-expanded={open}
					className="h-6 px-1 -ml-1 text-[10px] rounded-[4px] outline-none text-white/35 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
				>
					{open ? "show fewer" : `+${more} more sessions`}
				</button>
			)}
		</div>
	)
}

/** `…rounded malty roast, nutmeg, walnut, caramelized…` with the mention lit. */
function Snippet({ text, index, length }: { text: string; index: number; length: number }) {
	let start = Math.max(0, index - CONTEXT)
	let end = Math.min(text.length, index + length + CONTEXT)
	// cut at word boundaries
	if (start > 0) {
		const sp = text.indexOf(" ", start)
		if (sp !== -1 && sp < index) start = sp + 1
	}
	if (end < text.length) {
		const sp = text.lastIndexOf(" ", end)
		if (sp > index + length) end = sp
	}
	return (
		<span className="min-w-0 truncate text-white/55">
			{start > 0 && "…"}
			{text.slice(start, index)}
			<mark
				className="px-0.5 -mx-0.5 rounded-[2px] bg-transparent underline decoration-1 underline-offset-[3px]"
				style={{ color: "var(--entity-accent)", textDecorationColor: "var(--entity-accent)" }}
			>
				{text.slice(index, index + length)}
			</mark>
			{text.slice(index + length, end)}
			{end < text.length && "…"}
		</span>
	)
}

// ---------------------------------------------------------------------------
// Related: what it's said with, where, in what, from whom
// ---------------------------------------------------------------------------

function WordRelated({
	model,
	entry,
	index,
	lexicon,
}: {
	model: WordModel
	entry: LexiconEntry
	index: RelationIndex
	lexicon: Lexicon
}) {
	const groups = useMemo(() => {
		const out: RelatedGroupData[] = []
		const company = lexiconCompanions(lexicon, entry, 12)
		if (company.length)
			out.push({
				key: "words",
				label: "said with",
				glyph: "‘",
				hint: `of ${entry.listed.length} sessions`,
				total: entry.listed.length,
				rows: company.map(({ entry: e, shared }) => ({
					key: e.slug,
					count: shared,
					render: (
						<LexiconWord entry={e} className="text-xs text-white/75 hover:text-white truncate">
							{e.term}
						</LexiconWord>
					),
				})),
			})
		const kinds: { kind: EntityKind; label: string }[] = [
			{ kind: "origin", label: "origins" },
			{ kind: "style", label: "styles" },
			{ kind: "vendor", label: "vendors" },
		]
		for (const { kind, label } of kinds) {
			const counts = new Map<string, number>()
			for (const s of model.sessions) {
				for (const k of entityKeys(s, kind, { rollup: false }))
					counts.set(k, (counts.get(k) ?? 0) + 1)
			}
			const rows = [...counts]
				.map(([slug, count]) => ({ node: index.nodes[kind].get(slug), count }))
				.filter((r) => !!r.node)
				.sort((a, b) => b.count - a.count || a.node!.title.localeCompare(b.node!.title))
				.map(({ node, count }) => ({
					key: node!.slug,
					count,
					color: node!.color,
					render: (
						<Suspense fallback={<span className="text-xs text-white/70">{node!.title}</span>}>
							<EntityRef kind={kind} slug={node!.slug} label={node!.title} color={node!.color} />
						</Suspense>
					),
				}))
			if (rows.length)
				out.push({
					key: kind,
					label,
					glyph: ENTITY_META[kind].glyph,
					total: model.stats.count,
					rows,
				})
		}
		return out
	}, [model, entry, index, lexicon])

	if (!groups.length) return <p className="text-sm text-white/40">{"// nothing linked yet"}</p>
	return (
		<div className="grid gap-x-8 gap-y-7 md:grid-cols-2">
			{groups.map((g, i) => (
				<RelatedGroup key={g.key} group={g} order={i} accent={model.accentText} />
			))}
		</div>
	)
}
