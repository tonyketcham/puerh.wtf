"use client"

import Link from "next/link"
import { useMemo, useState, type CSSProperties } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { Search, X as Clear } from "lucide-react"
import EntityTitle from "@/lib/components/entity/page/EntityTitle"
import { liquorStops } from "@/lib/components/entity/page/model"
import {
	LEXICON_GROUP_META,
	LEXICON_GROUPS,
	lexiconOf,
	type LexiconEntry,
	type LexiconGroup,
} from "@/lib/lexicon"
import { descriptorAtom, relationIndexAtom } from "@/lib/store/sessionAtom"
import { buildLink } from "@/lib/utils/BuildLinkToGivenCollectionNode"
import { cn } from "@/lib/utils"
import LexiconWord from "./LexiconWord"
import { wordColor } from "./model"

const EASE = [0.22, 1, 0.36, 1] as const
const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const
const CREAM = "#fff2ca"

type Sort = "count" | "az"

type Band = {
	group: LexiconGroup
	words: LexiconEntry[]
	/** words listed in one session only (no page) */
	once: LexiconEntry[]
	/** listings across its words */
	listings: number
}

/**
 * /lexicon (plan §3.3): every word the notes use twice or more, sized by how many sessions
 * list it (not by passing mentions: "chocolate" inside every "dark chocolate" would swamp the
 * field), set in bands for the radar's ten flavor axes (plus texture and qi) like the
 * groups of a periodic table. Each word is tinted with the blended liquor of the teas it
 * describes.
 *
 * - hover or focus a word: its company (words listed in the same sessions) stays lit, the rest
 *   recedes, and the inspector line names who it keeps company with; the peek card opens too
 * - click: the word grows into its page (find all references)
 * - find narrows the field (words glide closed), sort re-flows it by frequency or a–z, and
 *   "said once" adds the long tail, each linking to its one session
 */
export default function LexiconIndex() {
	const index = useAtomValue(relationIndexAtom)
	const reduce = useReducedMotion() ?? false
	const lexicon = lexiconOf(index.sessions)

	const [q, setQ] = useState("")
	const [sort, setSort] = useState<Sort>("count")
	const [once, setOnce] = useState(false)
	const [hot, setHot] = useState<LexiconEntry | null>(null)
	const [hotGroup, setHotGroup] = useState<LexiconGroup | null>(null)

	const maxCount = useMemo(
		() => Math.max(3, ...lexicon.paged.map((e) => e.listed.length)),
		[lexicon]
	)
	const colors = useMemo(
		() => new Map(lexicon.paged.map((e) => [e.slug, wordColor(index, e)] as const)),
		[lexicon, index]
	)

	const bands = useMemo(() => {
		const out = new Map<LexiconGroup, Band>(
			LEXICON_GROUPS.map((group) => [group, { group, words: [], once: [], listings: 0 }])
		)
		for (const e of lexicon.entries) {
			const band = out.get(e.group)!
			if (e.listed.length >= 2) {
				band.words.push(e)
				band.listings += e.listed.length
			} else band.once.push(e)
		}
		return LEXICON_GROUPS.map((g) => out.get(g)!)
	}, [lexicon])
	const maxListings = Math.max(1, ...bands.map((b) => b.listings))

	// find + sort
	const query = q.trim().toLowerCase()
	const matches = (e: LexiconEntry) => !query || e.spellings.some((sp) => sp.includes(query))
	const order = (list: LexiconEntry[]) =>
		sort === "az"
			? [...list].sort((a, b) => a.term.localeCompare(b.term))
			: [...list].sort((a, b) => b.listed.length - a.listed.length || a.term.localeCompare(b.term))
	const shown = bands
		.map((b) => ({
			...b,
			words: order(b.words.filter(matches)),
			once:
				once || query ? b.once.filter(matches).sort((a, z) => a.term.localeCompare(z.term)) : [],
		}))
		.filter((b) => b.words.length || b.once.length)

	// the hovered word's company: shared sessions per paged word
	const company = useMemo(() => {
		if (!hot) return null
		const mine = new Set(hot.listed)
		const shared = new Map<string, number>()
		for (const e of lexicon.paged) {
			if (e === hot) continue
			let n = 0
			for (const s of e.listed) if (mine.has(s)) n++
			if (n) shared.set(e.slug, n)
		}
		return shared
	}, [hot, lexicon])

	const onceCount = lexicon.entries.length - lexicon.paged.length

	return (
		<div className="space-y-8" data-recording-key="lexicon-index">
			<header className="space-y-3">
				<IndexTitle />
				<p className="text-sm text-white/45">
					{`// ${lexicon.size.toLocaleString("en-US")} words across ${
						index.sessions.length
					} sessions · ${
						lexicon.paged.length
					} said twice or more · sized by the sessions that list them`}
				</p>
			</header>

			<Legend
				bands={bands}
				maxListings={maxListings}
				hot={hotGroup}
				onHot={setHotGroup}
				reduce={reduce}
			/>

			<div className="sticky top-[var(--commandbar-h)] z-10 -mx-2 px-2 py-2 space-y-2 bg-background/90 backdrop-blur-md">
				<div className="flex flex-wrap items-center gap-2">
					<label className="relative flex items-center flex-1 min-w-[14rem] max-w-md">
						<Search
							aria-hidden
							size={13}
							strokeWidth={2}
							className="absolute left-2.5 text-white/35 pointer-events-none"
						/>
						<input
							type="search"
							value={q}
							onChange={(e) => setQ(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Escape" && q) {
									e.preventDefault()
									setQ("")
								}
							}}
							placeholder="find a word"
							aria-label="Find a word"
							spellCheck={false}
							data-recording-key="lexicon-search"
							className={cn(
								"w-full h-8 pl-8 pr-8 text-xs rounded-md outline-none font-fira-code text-white placeholder:text-white/30",
								"bg-white/[0.03] ring-1 ring-inset ring-white/[0.08] focus:ring-white/30 [&::-webkit-search-cancel-button]:hidden"
							)}
						/>
						{q && (
							<button
								type="button"
								aria-label="Clear"
								onClick={() => setQ("")}
								className="absolute grid rounded right-1.5 size-5 place-items-center text-white/40 hover:text-white outline-none focus-visible:ring-1 focus-visible:ring-white/40"
							>
								<Clear size={12} strokeWidth={2} />
							</button>
						)}
					</label>
					<Segmented
						label="Sort"
						value={sort}
						onChange={setSort}
						options={[
							{ value: "count", label: "by sessions" },
							{ value: "az", label: "a–z" },
						]}
						reduce={reduce}
					/>
					<button
						type="button"
						aria-pressed={once}
						onClick={() => setOnce((v) => !v)}
						title="Also show the words only one session uses"
						className={cn(
							"inline-flex items-center h-8 gap-1.5 px-2.5 text-[11px] rounded-md outline-none ring-1 ring-inset transition-colors",
							"focus-visible:ring-white/50",
							once
								? "text-white ring-white/25 bg-white/[0.07]"
								: "text-white/45 ring-white/[0.08] hover:text-white hover:bg-white/[0.04]"
						)}
					>
						<span
							aria-hidden
							className={cn(
								"size-2 rounded-[2px] ring-1 ring-inset transition-colors",
								once ? "bg-[#fff2ca]/70 ring-[#fff2ca]/70" : "ring-white/30"
							)}
						/>
						said once
						<span className="tabular-nums text-white/30">{onceCount}</span>
					</button>
				</div>
				<Inspector hot={hot} company={company} lexicon={lexicon.paged} reduce={reduce} />
			</div>

			{shown.length === 0 ? (
				<p className="text-sm text-white/45">
					{"// no word matches "}
					<span className="text-white/75">‘{q.trim()}’</span>
				</p>
			) : (
				<LayoutGroup id="lexicon">
					<div className="gap-4 columns-1 lg:columns-2 2xl:columns-3">
						{shown.map((band, bi) => (
							<BandPanel
								key={band.group}
								band={band}
								order={LEXICON_GROUPS.indexOf(band.group)}
								delay={bi}
								dim={!!hotGroup && hotGroup !== band.group}
								maxCount={maxCount}
								colors={colors}
								hot={hot}
								company={company}
								onHot={setHot}
								reduce={reduce}
							/>
						))}
					</div>
				</LayoutGroup>
			)}
		</div>
	)
}

/** LEXICON in Rock 3D, poured with every session's liquor, oldest vintage left. */
function IndexTitle() {
	const index = useAtomValue(relationIndexAtom)
	const stops = useMemo(() => liquorStops(index.sessions), [index.sessions])
	return (
		<EntityTitle
			kind="descriptor"
			slug="_index"
			title="Lexicon"
			stops={stops}
			recordingKey="lexicon-index-title"
		/>
	)
}

// ---------------------------------------------------------------------------
// Legend: the periodic strip
// ---------------------------------------------------------------------------

function Legend({
	bands,
	maxListings,
	hot,
	onHot,
	reduce,
}: {
	bands: Band[]
	maxListings: number
	hot: LexiconGroup | null
	onHot: (g: LexiconGroup | null) => void
	reduce: boolean
}) {
	return (
		<nav aria-label="Flavor groups" data-recording-key="lexicon-legend">
			<ol className="grid gap-1.5 grid-cols-[repeat(auto-fit,minmax(4.25rem,1fr))]">
				{bands.map((b, i) => {
					const meta = LEXICON_GROUP_META[b.group]
					return (
						<motion.li
							key={b.group}
							initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={reduce ? { duration: 0.2 } : { ...SPRING, delay: 0.15 + i * 0.03 }}
						>
							<a
								href={`#${b.group}`}
								onPointerEnter={() => onHot(b.group)}
								onPointerLeave={() => onHot(null)}
								onFocus={() => onHot(b.group)}
								onBlur={() => onHot(null)}
								onClick={(e) => {
									const el = document.getElementById(b.group)
									if (!el) return
									e.preventDefault()
									el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
									history.replaceState(history.state, "", `#${b.group}`)
								}}
								title={`${meta.label}: ${meta.blurb}`}
								className={cn(
									"relative flex flex-col h-[4.25rem] p-1.5 overflow-hidden rounded-[5px] outline-none",
									"ring-1 ring-inset transition-[background-color,box-shadow,opacity] duration-200",
									"focus-visible:ring-white/50",
									hot === b.group
										? "bg-white/[0.06] ring-white/20"
										: "bg-white/[0.015] ring-white/[0.07] hover:bg-white/[0.04]",
									!b.words.length && "opacity-45"
								)}
							>
								<span className="flex items-center justify-between text-[9px] leading-none tabular-nums text-white/35">
									<span>{String(i + 1).padStart(2, "0")}</span>
									<span>{b.words.length}</span>
								</span>
								<span className="flex-1 grid place-items-center font-rock-3d text-xl leading-none text-white/90">
									{meta.symbol}
								</span>
								<span className="text-[9px] leading-none text-center truncate text-white/45">
									{meta.label}
								</span>
								{/* the group's share of every reference, as a hairline */}
								<motion.span
									aria-hidden
									className="absolute bottom-0 left-0 h-px origin-left"
									style={{
										width: `${(b.listings / maxListings) * 100}%`,
										backgroundColor: `${CREAM}66`,
									}}
									initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
									animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
									transition={
										reduce
											? { duration: 0.2 }
											: { duration: 0.6, ease: EASE, delay: 0.3 + i * 0.03 }
									}
								/>
							</a>
						</motion.li>
					)
				})}
			</ol>
		</nav>
	)
}

// ---------------------------------------------------------------------------
// A band: one group of the table
// ---------------------------------------------------------------------------

function BandPanel({
	band,
	order,
	delay,
	dim,
	maxCount,
	colors,
	hot,
	company,
	onHot,
	reduce,
}: {
	band: Band
	order: number
	delay: number
	dim: boolean
	maxCount: number
	colors: ReadonlyMap<string, string>
	hot: LexiconEntry | null
	company: ReadonlyMap<string, number> | null
	onHot: (e: LexiconEntry | null) => void
	reduce: boolean
}) {
	const meta = LEXICON_GROUP_META[band.group]
	const index = useAtomValue(relationIndexAtom)
	const setDescriptor = useSetAtom(descriptorAtom)
	const lo = Math.sqrt(2)
	const hi = Math.sqrt(maxCount)

	return (
		<motion.section
			id={band.group}
			aria-labelledby={`${band.group}-h`}
			layout={reduce ? false : "position"}
			transition={SPRING}
			className={cn(
				"mb-4 break-inside-avoid scroll-mt-40 rounded-lg ring-1 ring-inset ring-white/[0.07] bg-white/[0.012]",
				"transition-opacity duration-300",
				dim && "opacity-30"
			)}
			initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			data-band={band.group}
		>
			<header className="flex items-center gap-3 px-4 pt-4 pb-3">
				<span
					aria-hidden
					className="relative grid shrink-0 size-12 place-items-center rounded-[5px] ring-1 ring-inset ring-[#fff2ca]/15 bg-[#fff2ca]/[0.03]"
				>
					<span className="absolute left-1 top-1 text-[8.5px] leading-none tabular-nums text-white/35">
						{order + 1}
					</span>
					<span className="font-rock-3d text-[22px] leading-none text-white">{meta.symbol}</span>
				</span>
				<div className="min-w-0 flex-1">
					<h2 id={`${band.group}-h`} className="text-sm leading-tight text-tea-soup-400">
						{meta.label}
					</h2>
					<p className="text-[11px] truncate text-white/35">{meta.blurb}</p>
				</div>
				<p className="flex flex-col items-end shrink-0 text-[10px] leading-tight text-white/35 tabular-nums">
					<span>
						<span className="text-white/70">{band.words.length}</span> words
					</span>
					<span>{band.listings} listings</span>
				</p>
			</header>

			<ul className="flex flex-wrap items-baseline px-4 pb-4 gap-x-3 gap-y-0.5">
				<AnimatePresence initial={true} mode="popLayout">
					{band.words.map((e, i) => {
						const r = e.listed.length
						const t = hi > lo ? (Math.sqrt(r) - lo) / (hi - lo) : 0
						const lit = !company || e === hot || company.has(e.slug)
						const style: CSSProperties = {
							fontSize: `${12.5 + Math.max(0, t) * 21.5}px`,
							fontWeight: Math.round(380 + Math.max(0, t) * 260),
							letterSpacing: `${(-0.015 * t).toFixed(3)}em`,
							color: colors.get(e.slug) ?? CREAM,
							opacity: e === hot ? 1 : lit ? 0.62 + 0.38 * Math.max(0, t) : 0.14,
						}
						return (
							<motion.li
								key={e.slug}
								layout={reduce ? false : "position"}
								initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
								transition={{
									layout: SPRING,
									opacity: {
										duration: 0.3,
										delay: reduce ? 0 : delay * 0.05 + Math.min(i, 40) * 0.012,
									},
									y: { ...SPRING, delay: reduce ? 0 : delay * 0.05 + Math.min(i, 40) * 0.012 },
								}}
								className="leading-[1.15]"
							>
								<LexiconWord
									entry={e}
									onHover={(on) => onHot(on ? e : null)}
									style={style}
									className={cn(
										"inline-flex items-baseline gap-px transition-opacity duration-200",
										"underline decoration-1 underline-offset-[5px] decoration-transparent hover:decoration-current",
										e === hot && "decoration-current"
									)}
								>
									<span>{e.term}</span>
									<sup className="text-[9px] font-normal tracking-normal tabular-nums text-white/35 -translate-y-[0.1em]">
										{company && e !== hot && company.has(e.slug)
											? `${company.get(e.slug)}/${hot!.listed.length}`
											: r}
									</sup>
								</LexiconWord>
							</motion.li>
						)
					})}
				</AnimatePresence>
			</ul>

			{band.once.length > 0 && (
				<motion.div
					layout={reduce ? false : "position"}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.3 }}
					className="px-4 pt-2.5 pb-4 border-t border-white/[0.05]"
				>
					<p className="mb-1.5 text-[10px] text-white/30">
						{"// said once "}
						<span className="tabular-nums">{band.once.length}</span>
					</p>
					<ul className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] leading-5">
						{band.once.map((e) => {
							const s = index.bySlug.get(e.listed[0])
							if (!s) return null
							return (
								<li key={e.slug}>
									<Link
										href={buildLink(s)}
										prefetch={false}
										onClick={() => setDescriptor({ term: e.term, pinned: true })}
										title={`‘${e.term}’ · ${s.title}`}
										className="rounded-sm outline-none text-white/40 transition-colors hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
									>
										{e.term}
									</Link>
								</li>
							)
						})}
					</ul>
				</motion.div>
			)}
		</motion.section>
	)
}

// ---------------------------------------------------------------------------
// Inspector line: the hovered word's company
// ---------------------------------------------------------------------------

function Inspector({
	hot,
	company,
	lexicon,
	reduce,
}: {
	hot: LexiconEntry | null
	company: ReadonlyMap<string, number> | null
	lexicon: LexiconEntry[]
	reduce: boolean
}) {
	const top = useMemo(() => {
		if (!hot || !company) return []
		return lexicon
			.filter((e) => company.has(e.slug))
			.sort((a, b) => company.get(b.slug)! - company.get(a.slug)! || a.term.localeCompare(b.term))
			.slice(0, 5)
	}, [hot, company, lexicon])

	return (
		<div className="relative h-5 overflow-hidden text-[11px] leading-5" aria-live="polite">
			<AnimatePresence initial={false} mode="popLayout">
				<motion.p
					key={hot?.slug ?? "_hint"}
					className="absolute inset-0 truncate text-white/40"
					initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
					transition={{ duration: 0.18, ease: EASE }}
				>
					{hot ? (
						<>
							<span className="text-white/85">‘{hot.term}’</span>{" "}
							<span className="tabular-nums">listed in {hot.listed.length}</span>
							<span className="text-white/20"> · </span>
							{LEXICON_GROUP_META[hot.group].label}
							{top.length > 0 && (
								<>
									<span className="text-white/20"> · </span>
									often with{" "}
									{top.map((e, i) => (
										<span key={e.slug}>
											{i > 0 && ", "}
											<span className="text-white/70">{e.term}</span>
											<span className="tabular-nums text-white/30"> {company!.get(e.slug)}</span>
										</span>
									))}
								</>
							)}
						</>
					) : (
						"// hover a word for the company it keeps · click to find all references"
					)}
				</motion.p>
			</AnimatePresence>
		</div>
	)
}

// ---------------------------------------------------------------------------

function Segmented<T extends string>({
	label,
	value,
	onChange,
	options,
	reduce,
}: {
	label: string
	value: T
	onChange: (v: T) => void
	options: { value: T; label: string }[]
	reduce: boolean
}) {
	return (
		<div
			role="radiogroup"
			aria-label={label}
			className="relative flex items-center h-8 p-0.5 rounded-md ring-1 ring-inset ring-white/[0.08]"
		>
			{options.map((o) => {
				const on = o.value === value
				return (
					<button
						key={o.value}
						type="button"
						role="radio"
						aria-checked={on}
						onClick={() => onChange(o.value)}
						className={cn(
							"relative h-full px-2.5 text-[11px] rounded-[4px] outline-none transition-colors",
							"focus-visible:ring-1 focus-visible:ring-white/40",
							on ? "text-white" : "text-white/45 hover:text-white/80"
						)}
					>
						{on && (
							<motion.span
								layoutId="lexicon-sort"
								className="absolute inset-0 rounded-[4px] bg-white/[0.08]"
								transition={reduce ? { duration: 0 } : SPRING}
							/>
						)}
						<span className="relative">{o.label}</span>
					</button>
				)
			})}
		</div>
	)
}
