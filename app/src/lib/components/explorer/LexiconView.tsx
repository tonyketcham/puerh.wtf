"use client"

import VirtualList, { type VirtualListNavigation } from "./VirtualList"

import { memo, useCallback, useMemo, type KeyboardEvent } from "react"
import { motion } from "motion/react"
import { useAtom } from "jotai"
import { ListTree } from "lucide-react"
import LexiconWord from "@/lib/components/lexicon/LexiconWord"
import { wordColor } from "@/lib/components/lexicon/model"
import {
	LEXICON_GROUP_META,
	LEXICON_GROUPS,
	lexiconHref,
	lexiconOf,
	type LexiconEntry,
	type LexiconGroup,
} from "@/lib/lexicon"
import { cn } from "@/lib/utils"
import { lexiconGroupsOpenAtom } from "./state"
import ViewHeader, { IndexLink } from "./ViewHeader"
import { stripSlash, type EntityViewProps } from "./views"

type Word = { entry: LexiconEntry; count: number; color: string }
type Row =
	| { kind: "group"; group: LexiconGroup; words: number; listings: number; open: boolean }
	| { kind: "word"; group: LexiconGroup; word: Word; order: number }

/**
 * The flavor lexicon as an Explorer view (plan §2.1 activity bar): the words the notes use
 * twice or more, folded into the radar's ten axes plus texture and qi, like the bands of the
 * /lexicon periodic table. Groups start closed (thirteen rows to scan) and open in place;
 * each word counts the sessions passing the filters that list it.
 *
 * A word peeks on hover and opens its page on click; ⇧↵ filters by it, like every Explorer
 * row (the peek owns that key). ⇧F12, as in an IDE, or the tree icon pins it as the
 * Explorer's "find all references" and switches to Sessions to show them.
 */
function LexiconView({
	index,
	pool,
	narrowed,
	pathname,
	onFindReferences,
}: EntityViewProps & { onFindReferences: (term: string) => void }) {
	const [openGroups, setOpenGroups] = useAtom(lexiconGroupsOpenAtom)
	const lexicon = lexiconOf(index.sessions)

	const inPool = useMemo(() => new Set(pool.map((s) => s._slug)), [pool])
	const colors = useMemo(
		() => new Map(lexicon.paged.map((e) => [e.slug, wordColor(index, e)] as const)),
		[lexicon, index]
	)

	const { rows, wordCount } = useMemo(() => {
		const byGroup = new Map<LexiconGroup, Word[]>(LEXICON_GROUPS.map((g) => [g, []]))
		for (const entry of lexicon.paged) {
			const count = entry.listed.reduce((n, slug) => n + (inPool.has(slug) ? 1 : 0), 0)
			if (narrowed && count === 0) continue
			byGroup.get(entry.group)!.push({ entry, count, color: colors.get(entry.slug) ?? "#d9a441" })
		}
		const rows: Row[] = []
		let wordCount = 0
		for (const group of LEXICON_GROUPS) {
			const words = byGroup
				.get(group)!
				.sort((a, b) => b.count - a.count || a.entry.term.localeCompare(b.entry.term))
			if (!words.length) continue
			wordCount += words.length
			const open = openGroups.has(group)
			rows.push({
				kind: "group",
				group,
				words: words.length,
				listings: words.reduce((n, w) => n + w.count, 0),
				open,
			})
			if (open) words.forEach((word, order) => rows.push({ kind: "word", group, word, order }))
		}
		return { rows, wordCount }
	}, [lexicon, inPool, narrowed, colors, openGroups])

	const toggle = useCallback(
		(group: LexiconGroup, open?: boolean) =>
			setOpenGroups((s) => {
				const next = new Set(s)
				if (open ?? !next.has(group)) next.add(group)
				else next.delete(group)
				return next
			}),
		[setOpenGroups]
	)

	// ↑/↓ walk every row, → / ← open and close a group (← on a word steps out to its group)
	const onKeyDown = (e: KeyboardEvent<HTMLUListElement>, navigation: VirtualListNavigation) => {
		if (e.altKey || e.ctrlKey || e.metaKey) return
		const el = e.target as HTMLElement
		const all = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-lexicon-row]")]
		const i = all.indexOf(el)
		if (i < 0) return
		const focus = (to: HTMLElement | undefined) => {
			if (!to) return
			e.preventDefault()
			to.focus()
			to.scrollIntoView({ block: "nearest" })
		}
		const group = el.dataset.group as LexiconGroup | undefined
		const isGroup = el.dataset.lexiconRow === "group"
		if (e.shiftKey) {
			// ⇧↵ is the peek's (filter); ⇧F12 finds all references
			if (e.key === "F12" && !isGroup && el.dataset.term) {
				e.preventDefault()
				onFindReferences(el.dataset.term)
			}
			return
		}
		switch (e.key) {
			case "ArrowDown":
				return focus(all[i + 1])
			case "ArrowUp":
				return focus(all[i - 1])
			case "Home":
				return focus(all[0])
			case "End":
				return focus(all[all.length - 1])
			case "ArrowRight":
				if (isGroup && group && !openGroups.has(group)) {
					e.preventDefault()
					toggle(group, true)
				} else if (isGroup) {
					if (navigation.focusNext(el)) e.preventDefault()
					else focus(all[i + 1])
				}
				return
			case "ArrowLeft":
				if (isGroup && group && openGroups.has(group)) {
					e.preventDefault()
					toggle(group, false)
				} else if (!isGroup) {
					if (navigation.focusKey(`group:${group}`)) e.preventDefault()
					else focus(all.find((r) => r.dataset.lexiconRow === "group" && r.dataset.group === group))
				}
				return
		}
	}

	return (
		<div data-explorer-view="lexicon">
			<ViewHeader label="Lexicon" count={wordCount} noun={wordCount === 1 ? "word" : "words"}>
				<IndexLink href="/lexicon/" pathname={pathname} recordingKey="explorer-lexicon-index" />
			</ViewHeader>
			<VirtualList
				items={rows}
				getKey={(row) =>
					row.kind === "group" ? `group:${row.group}` : `word:${row.word.entry.slug}`
				}
				rowHeight={(row) => (row.kind === "group" && row !== rows[0] ? 29 : 28)}
				label="Flavor words by group"
				rowClassName={(row) => (row.kind === "group" && row !== rows[0] ? "pt-px" : undefined)}
				onKeyDown={onKeyDown}
				renderRow={(row) => (
					<>
						{row.kind === "group" ? (
							<GroupRow
								group={row.group}
								words={row.words}
								listings={row.listings}
								open={row.open}
								onToggle={toggle}
							/>
						) : (
							<WordRow
								word={row.word}
								narrowed={narrowed}
								current={pathname === stripSlash(lexiconHref(row.word.entry.slug))}
								onFindReferences={onFindReferences}
							/>
						)}
					</>
				)}
			/>
			{rows.length === 0 && <p className="px-2 py-1.5 text-xs text-white/35">nothing matches</p>}
		</div>
	)
}

/** A flavor group: its periodic-table symbol, name and word count; opens in place. */
function GroupRow({
	group,
	words,
	listings,
	open,
	onToggle,
}: {
	group: LexiconGroup
	words: number
	listings: number
	open: boolean
	onToggle: (group: LexiconGroup) => void
}) {
	const meta = LEXICON_GROUP_META[group]
	return (
		<button
			type="button"
			onClick={() => onToggle(group)}
			aria-expanded={open}
			aria-label={`${meta.label}, ${words} ${words === 1 ? "word" : "words"}`}
			title={meta.blurb}
			data-lexicon-row="group"
			data-group={group}
			data-recording-key={`explorer-lexicon-group-${group}`}
			className={cn(
				"group/row flex items-center w-full gap-2 py-1.5 pl-2 pr-0 rounded-md text-left outline-none",
				"text-[13px] leading-4 transition-colors duration-200",
				"hover:bg-white/[0.04] focus-visible:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-white/25"
			)}
		>
			<motion.svg
				width="6"
				height="6"
				viewBox="0 0 6 6"
				fill="none"
				aria-hidden
				className="shrink-0 mx-[5px] text-white/40 group-hover/row:text-white"
				initial={false}
				animate={{ rotate: open ? 90 : 0 }}
				transition={{ type: "spring", stiffness: 500, damping: 32 }}
			>
				<path d="M2 1L4 3L2 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
			</motion.svg>
			{/* the element tile of the /lexicon table */}
			<span
				aria-hidden
				className={cn(
					"grid place-items-center w-[22px] h-4 shrink-0 rounded-[3px] border text-[9px] leading-none tracking-tight",
					"transition-colors duration-200",
					open
						? "border-brand/40 text-brand/90 bg-brand/[0.07]"
						: "border-white/12 text-white/45 group-hover/row:text-white/75"
				)}
			>
				{meta.symbol}
			</span>
			<span
				className={cn(
					"flex-1 min-w-0 truncate transition-colors",
					open ? "text-white/85" : "text-white/60 group-hover/row:text-white"
				)}
			>
				{meta.label}
			</span>
			<span
				className="w-10 pr-2 text-right text-[11px] tabular-nums shrink-0 text-white/40 group-hover/row:text-white/70"
				title={`${listings} listings`}
			>
				{words}
			</span>
		</button>
	)
}

/** One word: a dot in the blended liquor of the teas it describes, its page link and its count. */
function WordRow({
	word,
	narrowed,
	current,
	onFindReferences,
}: {
	word: Word
	narrowed: boolean
	current: boolean
	onFindReferences: (term: string) => void
}) {
	const { entry, count, color } = word
	const total = entry.listed.length
	return (
		<div
			className={cn(
				"group/row relative flex items-center rounded-md",
				"transition-colors duration-200 hover:bg-white/[0.04] focus-within:bg-white/[0.05]",
				current && "bg-white/[0.06]"
			)}
		>
			{/* the group's indent guide */}
			<span aria-hidden className="absolute top-0 bottom-0 left-[15px] w-px bg-white/[0.06]" />
			{current && (
				<motion.span
					layoutId="explorer-current-row"
					aria-hidden
					className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-brand"
					transition={{ type: "spring", stiffness: 500, damping: 40 }}
				/>
			)}
			<LexiconWord
				entry={entry}
				recordingKey={`explorer-lexicon-word-${entry.slug}`}
				className="flex flex-1 min-w-0 items-center gap-2 py-1.5 pl-[38px] rounded-md pr-1 text-[13px] leading-4 focus-visible:ring-offset-0 focus-visible:ring-white/25"
				dataAttributes={{
					"data-lexicon-row": "word",
					"data-group": entry.group,
					"data-term": entry.term,
					"data-peek-placement": "right-start",
				}}
			>
				<span
					aria-hidden
					className="size-[7px] shrink-0 rounded-full"
					style={{ background: color, boxShadow: `0 0 6px -1px ${color}` }}
				/>
				<span
					className={cn(
						"min-w-0 truncate transition-colors",
						current ? "text-white" : "text-white/60 group-hover/row:text-white"
					)}
				>
					{entry.term}
				</span>
			</LexiconWord>
			<button
				type="button"
				tabIndex={-1}
				onClick={() => onFindReferences(entry.term)}
				aria-label={`Find every session that lists ${entry.term}`}
				title="Find all references (⇧F12)"
				className={cn(
					"absolute right-[45px] top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded",
					"text-white/40 opacity-0 transition-[opacity,color,background-color] duration-150",
					"hover:bg-white/10 hover:text-white group-hover/row:opacity-100 group-focus-within/row:opacity-100"
				)}
			>
				<ListTree size={11} strokeWidth={2.25} />
			</button>
			<span className="w-10 pr-2 text-right text-[11px] tabular-nums shrink-0 text-white/40 group-hover/row:text-white/70">
				{count}
				{narrowed && count !== total && <span className="text-white/20">/{total}</span>}
			</span>
		</div>
	)
}

export default memo(LexiconView)
