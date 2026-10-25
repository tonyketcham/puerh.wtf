"use client"

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useId,
	useState,
	type KeyboardEvent,
} from "react"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai"
import { useRouter, usePathname } from "next/navigation"
import { authoringBridgeAtom, requestAuthoringAtom } from "@/lib/authoring/bridge"
import { ChevronRight, Search as SearchIcon, SquareTerminal } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { buildLink } from "@/lib/utils/BuildLinkToGivenCollectionNode"
import { countActiveFilters, EMPTY_FACETS, toggleEntityFilter } from "@/lib/filters"
import { filtersAtom, replaceFilters } from "@/lib/store/filterState"
import {
	compareSlugAtom,
	descriptorAtom,
	sessionSlugAtom,
	steepsAtom,
	type CommandBarScope,
} from "@/lib/store/sessionAtom"
import { requestSteepAtom } from "@/lib/components/session/readingState"
import {
	facetOpens,
	parsePrefix,
	search,
	SCOPE_META,
	SCOPE_PREFIX,
	type CommandIndex,
	type FacetEntry,
	type Item,
	type Mode,
	type ScopeKind,
	type SearchContext,
	type TeaEntry,
} from "./items"
import { pushRecent, readRecents, type RecentEntry } from "./recents"
import { ResultRow } from "./ResultRow"
import { Kbd } from "./parts"
import { GaiwanIcon } from "@/lib/components/icons/TeaIcons"

export const SURFACE_LAYOUT_ID = "commandbar-surface"
export const ICON_LAYOUT_ID = "commandbar-icon"

export const MORPH_SPRING = { type: "spring", visualDuration: 0.34, bounce: 0.14 } as const
const HEIGHT_SPRING = { type: "spring", visualDuration: 0.24, bounce: 0 } as const
const CHIP_SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const

const STICKY_HEADER_PX = 28

function initialMode(
	query: string,
	scope: CommandBarScope,
	sessionSlug: string | null
): { mode: Mode; query: string } {
	if (scope === "compare" && sessionSlug)
		return { mode: { kind: "arg", command: "compare" }, query }
	if (scope === "sessions" || scope === "descriptors")
		return { mode: { kind: "scope", scope }, query }
	if (query.startsWith(">"))
		return { mode: { kind: "commands" }, query: query.slice(1).trimStart() }
	const prefixed = parsePrefix(query)
	if (prefixed) return { mode: { kind: "entity", scope: prefixed.scope }, query: prefixed.rest }
	return { mode: { kind: "all" }, query }
}

const PLACEHOLDER: Record<string, string> = {
	all: "Search teas, vendors, flavors…",
	commands: "Run a command…",
	brew: "Which tea are you brewing?",
	compare: "Compare with which tea?",
	sessions: "Search teas…",
	descriptors: "Find a flavor across every session…",
}

function placeholderFor(mode: Mode) {
	if (mode.kind === "arg") return PLACEHOLDER[mode.command]
	if (mode.kind === "scope") return PLACEHOLDER[mode.scope]
	if (mode.kind === "entity") return SCOPE_META[mode.scope].placeholder
	return PLACEHOLDER[mode.kind]
}

type Chip = {
	key: string
	label: string
	terminal?: boolean
	arrow?: boolean
	/** quick-open prefix shown in the chip (`^` Origins) */
	glyph?: string
	pop: Mode
}

function chipsFor(mode: Mode): Chip[] {
	switch (mode.kind) {
		case "all":
			return []
		case "commands":
			return [{ key: "commands", label: "Commands", terminal: true, pop: { kind: "all" } }]
		case "arg":
			return [
				{ key: "commands", label: "Commands", terminal: true, pop: { kind: "all" } },
				{
					key: `arg-${mode.command}`,
					label: mode.command === "brew" ? "Brew" : "Compare with",
					arrow: true,
					pop: { kind: "commands" },
				},
			]
		case "scope":
			return [
				{
					key: `scope-${mode.scope}`,
					label: mode.scope === "sessions" ? "Teas" : "Flavors",
					pop: { kind: "all" },
				},
			]
		case "entity":
			return [
				{
					key: `entity-${mode.scope}`,
					label: SCOPE_META[mode.scope].label,
					glyph: SCOPE_META[mode.scope].glyph,
					pop: { kind: "all" },
				},
			]
	}
}

export type PaletteProps = {
	index: CommandIndex | null
	initialQuery: string
	initialScope: CommandBarScope
	onClose: () => void
	reduceMotion: boolean
}

export default function Palette({
	index,
	initialQuery,
	initialScope,
	onClose,
	reduceMotion,
}: PaletteProps) {
	const router = useRouter()
	const sessionSlug = useAtomValue(sessionSlugAtom)
	const [descriptor, setDescriptor] = useAtom(descriptorAtom)
	const setCompareSlug = useSetAtom(compareSlugAtom)
	const requestSteep = useSetAtom(requestSteepAtom)
	const store = useStore()

	const [{ mode, query }, setState] = useState(() =>
		initialMode(initialQuery, initialScope, sessionSlug)
	)
	const [activeIndex, setActiveIndex] = useState(0)
	const [recents, setRecents] = useState<RecentEntry[]>(() => readRecents())
	const [rolling, setRolling] = useState<string | null>(null)

	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)
	const navSource = useRef<"keyboard" | "pointer">("keyboard")
	const timers = useRef<number[]>([])
	const pillGroup = useId()

	const authoring = useAtomValue(authoringBridgeAtom)
	const requestAuthoring = useSetAtom(requestAuthoringAtom)
	const authoringPathname = usePathname()
	const filters = useAtomValue(filtersAtom)
	const ctx: SearchContext = useMemo(
		() => ({
			authoringEnabled: authoring.enabled,
			sessionSlug,
			filters,
			activeFilterCount: countActiveFilters(filters),
			descriptor: descriptor?.term ?? null,
		}),
		[sessionSlug, filters, descriptor, authoring.enabled]
	)

	const groups = useMemo(
		() => (index ? search(index, query, mode, ctx, recents) : []),
		[index, query, mode, ctx, recents]
	)
	const { flat, groupOf, groupStarts } = useMemo(() => {
		const flat: Item[] = []
		const groupOf: number[] = []
		const groupStarts: number[] = []
		groups.forEach((g, gi) => {
			groupStarts.push(flat.length)
			for (const it of g.items) {
				flat.push(it)
				groupOf.push(gi)
			}
		})
		return { flat, groupOf, groupStarts }
	}, [groups])

	const active = flat.length ? Math.min(activeIndex, flat.length - 1) : -1

	// ------------------------------------------------------------------ focus

	// passive effect on purpose: CommandBar's layout effect records the previously focused
	// element first (effects from the opening keypress flush synchronously, so no keys are lost)
	useEffect(() => {
		const input = inputRef.current
		if (!input) return
		input.focus({ preventScroll: true })
		const len = input.value.length
		input.setSelectionRange(len, len)
	}, [])

	useEffect(() => {
		const pending = timers.current
		return () => pending.forEach((t) => window.clearTimeout(t))
	}, [])

	// --------------------------------------------------------- list height

	const [listHeight, setListHeight] = useState<number | null>(null)
	useLayoutEffect(() => {
		const el = listRef.current
		if (!el) return
		setListHeight(el.offsetHeight)
		const ro = new ResizeObserver(() => setListHeight(el.offsetHeight))
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	// -------------------------------------------------- keep active in view

	useLayoutEffect(() => {
		if (navSource.current !== "keyboard" || active < 0) return
		const list = listRef.current
		const el = list?.querySelector<HTMLElement>(`#cmd-opt-${active}`)
		if (!list || !el) return
		if (groupStarts[0] === active) {
			list.scrollTop = 0
			return
		}
		const lr = list.getBoundingClientRect()
		const er = el.getBoundingClientRect()
		const top = er.top - lr.top + list.scrollTop
		const bottom = top + er.height
		// first row of a group: also reveal its header
		const pad = groupStarts.includes(active) ? STICKY_HEADER_PX + 6 : STICKY_HEADER_PX + 4
		if (top - pad < list.scrollTop) list.scrollTop = Math.max(0, top - pad)
		else if (bottom + 6 > list.scrollTop + list.clientHeight)
			list.scrollTop = bottom + 6 - list.clientHeight
	}, [active, groupStarts])

	// ------------------------------------------------------------- state ops

	const setQueryAndMode = useCallback((nextQuery: string, nextMode?: Mode) => {
		navSource.current = "keyboard"
		setActiveIndex(0)
		setState((s) => ({ mode: nextMode ?? s.mode, query: nextQuery }))
		if (listRef.current) listRef.current.scrollTop = 0
	}, [])

	// someone called openCommandBarAtom while we're already open: adopt the new prefill/scope
	const lastInit = useRef({ initialQuery, initialScope })
	useEffect(() => {
		const prev = lastInit.current
		if (prev.initialQuery === initialQuery && prev.initialScope === initialScope) return
		lastInit.current = { initialQuery, initialScope }
		const next = initialMode(initialQuery, initialScope, sessionSlug)
		setQueryAndMode(next.query, next.mode)
		inputRef.current?.focus({ preventScroll: true })
	}, [initialQuery, initialScope, sessionSlug, setQueryAndMode])

	const onInput = (value: string) => {
		if (rolling) return
		let nextMode: Mode | undefined
		if (mode.kind === "all" && value.startsWith(">")) {
			// typed or pasted in one go ("> compare with dayi"): keep parsing the rest below
			value = value.slice(1)
			nextMode = { kind: "commands" }
		} else if (mode.kind === "all") {
			// quick-open prefix ("^yiwu", "@ white2tea"): the prefix becomes the scope chip
			const prefixed = parsePrefix(value)
			if (prefixed) {
				setQueryAndMode(prefixed.rest, { kind: "entity", scope: prefixed.scope })
				return
			}
		}
		if ((nextMode ?? mode).kind === "commands") {
			// the space typed after ">" lands here once the chip has replaced the ">": drop it
			value = value.trimStart()
			// "> brew yiwu" / "> compare with 2018" jump straight into the argument picker
			const m = /^(brew|compare\s+with)\s+(.*)$/i.exec(value)
			if (m) {
				const command = m[1].toLowerCase().startsWith("brew") ? "brew" : "compare"
				if (command === "brew" || sessionSlug) {
					setQueryAndMode(m[2], { kind: "arg", command })
					return
				}
			}
		}
		setQueryAndMode(value, nextMode)
	}

	const remember = useCallback((entry: RecentEntry) => setRecents(pushRecent(entry)), [])

	const navigate = useCallback(
		(href: string) => {
			onClose()
			router.push(href)
		},
		[onClose, router]
	)

	const openTea = useCallback(
		(tea: TeaEntry, hash = "") => {
			remember({ kind: "tea", id: tea.slug })
			navigate(buildLink(tea.session) + hash)
		},
		[navigate, remember]
	)

	const rollRandom = useCallback(() => {
		if (!index) return
		const pool = index.teas.filter((t) => t.slug !== sessionSlug)
		if (!pool.length) return
		const pick = pool[Math.floor(Math.random() * pool.length)]
		if (reduceMotion) {
			openTea(pick)
			return
		}
		const flash = () => setRolling(pool[Math.floor(Math.random() * pool.length)].title)
		flash()
		const steps = [60, 120, 185, 260, 350]
		for (const t of steps) timers.current.push(window.setTimeout(flash, t))
		timers.current.push(window.setTimeout(() => setRolling(pick.title), 460))
		timers.current.push(window.setTimeout(() => openTea(pick), 700))
	}, [index, sessionSlug, reduceMotion, openTea])

	const rememberFacet = useCallback(
		(facet: FacetEntry) => remember({ kind: facet.kind, id: facet.value }),
		[remember]
	)

	/**
	 * Run a row. `filter` (⇧↵, ⇧-click) asks an entity to filter the Explorer instead of
	 * opening its page; tags and vintages have no page, so they always filter.
	 */
	const run = useCallback(
		(item: Item | undefined, filter = false) => {
			if (!item || rolling) return
			switch (item.kind) {
				case "tea":
					if (mode.kind === "arg" && mode.command === "compare") {
						setCompareSlug(item.tea.slug)
						remember({ kind: "tea", id: item.tea.slug })
						onClose()
					} else if (mode.kind === "arg" && mode.command === "brew") {
						if (item.tea.slug === sessionSlug) {
							// already here: a hash-only push never re-runs the gutter's deep-link
							// settle, so ask it directly for the first real steep
							remember({ kind: "tea", id: item.tea.slug })
							const steeps = store.get(steepsAtom)
							const first = steeps.find((s) => s.n >= 1) ?? steeps[0]
							onClose()
							if (first) requestSteep({ kind: "goto", n: first.n })
						} else openTea(item.tea, "#steep-1")
					} else {
						openTea(item.tea)
					}
					return
				case "flavor": {
					const term = item.flavor.term
					remember({ kind: "flavor", id: term })
					if (item.active) {
						setDescriptor(null)
						replaceFilters((cur) => (cur.q === term ? { ...cur, q: "" } : cur))
					} else {
						setDescriptor({ term, pinned: true })
						replaceFilters((cur) => ({ ...cur, q: term }))
					}
					onClose()
					return
				}
				case "facet": {
					const { facet } = item
					rememberFacet(facet)
					if (!filter && facetOpens(facet) && facet.href) {
						navigate(facet.href)
						return
					}
					replaceFilters((cur) => toggleEntityFilter(cur, facet.kind, facet.value, facet.id))
					onClose()
					return
				}
				case "command": {
					const { command } = item
					if (command.id.startsWith("cms-")) {
						const action = command.id.slice(4) as "enable" | "disable" | "working" | "new" | "edit" | "session"
						requestAuthoring({ action, pathname: authoringPathname, ...(action === "new" ? { collection: "tastings" as const } : {}) })
						onClose()
						return
					}
					if (command.arg) {
						setQueryAndMode("", { kind: "arg", command: command.arg })
						return
					}
					if (command.id === "random") rollRandom()
					else if (command.id === "clear") {
						replaceFilters({ q: "", facets: EMPTY_FACETS })
						setDescriptor(null)
						onClose()
					} else if (command.id === "home") navigate("/")
					else if (command.href) navigate(command.href)
					return
				}
			}
		},
		[
			rolling,
			mode,
			setCompareSlug,
			remember,
			rememberFacet,
			onClose,
			openTea,
			setDescriptor,
			setQueryAndMode,
			rollRandom,
			navigate,
			sessionSlug,
			store,
			requestSteep,
			requestAuthoring,
			authoringPathname,
		]
	)

	// stable callbacks for memoized rows
	const runRef = useRef(run)
	const flatRef = useRef(flat)
	useLayoutEffect(() => {
		runRef.current = run
		flatRef.current = flat
	})
	const onRowRun = useCallback(
		(i: number, filter: boolean) => runRef.current(flatRef.current[i], filter),
		[]
	)
	const onRowHover = useCallback((i: number) => {
		navSource.current = "pointer"
		setActiveIndex(i)
	}, [])

	// ------------------------------------------------------------- keyboard

	const move = (delta: number) => {
		if (!flat.length) return
		navSource.current = "keyboard"
		setActiveIndex((active + delta + flat.length) % flat.length)
	}

	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.nativeEvent.isComposing) return
		if (rolling && e.key !== "Escape") {
			e.preventDefault()
			return
		}
		const ctrlOnly = e.ctrlKey && !e.metaKey && !e.altKey
		switch (true) {
			case e.key === "ArrowDown" || (ctrlOnly && e.key === "n"):
				e.preventDefault()
				move(1)
				break
			case e.key === "ArrowUp" || (ctrlOnly && e.key === "p"):
				e.preventDefault()
				move(-1)
				break
			case e.key === "PageDown":
				e.preventDefault()
				move(Math.min(5, flat.length - 1 - active) || 0)
				break
			case e.key === "PageUp":
				e.preventDefault()
				move(-Math.min(5, active) || 0)
				break
			case e.key === "Enter":
				e.preventDefault()
				run(flat[active], e.shiftKey)
				break
			case e.key === "Tab": {
				e.preventDefault()
				if (groups.length < 1 || active < 0) break
				const gi = groupOf[active]
				const dir = e.shiftKey ? -1 : 1
				// shift-tab inside a group first returns to that group's start
				const target =
					e.shiftKey && active !== groupStarts[gi]
						? groupStarts[gi]
						: groupStarts[(gi + dir + groups.length) % groups.length]
				navSource.current = "keyboard"
				setActiveIndex(target)
				break
			}
			case e.key === "Escape":
				e.preventDefault()
				e.stopPropagation()
				if (rolling) {
					timers.current.forEach((t) => window.clearTimeout(t))
					timers.current.length = 0
					setRolling(null)
					break
				}
				onClose()
				break
			case e.key === "Backspace" && query === "" && mode.kind !== "all": {
				e.preventDefault()
				const chips = chipsFor(mode)
				setQueryAndMode("", chips[chips.length - 1].pop)
				break
			}
		}
	}

	// ------------------------------------------------------------------ view

	const chips = chipsFor(mode)
	const argCommand = mode.kind === "arg" ? mode.command : null
	const activeItem = active >= 0 ? flat[active] : undefined
	let rowIndex = 0

	return (
		<>
			{/* header */}
			<div className="relative flex items-center gap-2 px-4 h-[52px] border-b border-white/[0.07]">
				<motion.span
					layoutId={ICON_LAYOUT_ID}
					transition={reduceMotion ? { duration: 0 } : MORPH_SPRING}
					className="flex items-center text-white/50 shrink-0"
				>
					<SearchIcon size={15} aria-hidden />
				</motion.span>
				<AnimatePresence mode="popLayout" initial={false}>
					{chips.map((chip) => (
						<motion.button
							key={chip.key}
							type="button"
							tabIndex={-1}
							layout
							initial={{ opacity: 0, scale: 0.85, x: -6 }}
							animate={{ opacity: 1, scale: 1, x: 0 }}
							exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.1 } }}
							transition={reduceMotion ? { duration: 0 } : CHIP_SPRING}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => setQueryAndMode("", chip.pop)}
							title="Backspace to go back"
							className={cn(
								"flex items-center gap-1 h-6 px-2 rounded-md text-[11px] shrink-0 border",
								chip.terminal
									? "border-[#edc446]/25 bg-[#edc446]/10 text-[#edc446]"
									: "border-white/10 bg-white/[0.06] text-white/80"
							)}
						>
							{chip.terminal && <SquareTerminal size={11} aria-hidden />}
							{chip.glyph && (
								<span aria-hidden className="text-[#edc446]">
									{chip.glyph}
								</span>
							)}
							{chip.label}
							{chip.arrow && <ChevronRight size={11} aria-hidden className="-mr-0.5 opacity-60" />}
						</motion.button>
					))}
				</AnimatePresence>
				<motion.input
					layout="position"
					transition={reduceMotion ? { duration: 0 } : CHIP_SPRING}
					ref={inputRef}
					value={query}
					onChange={(e) => onInput(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder={placeholderFor(mode)}
					role="combobox"
					aria-expanded
					aria-controls="commandbar-listbox"
					aria-autocomplete="list"
					aria-activedescendant={active >= 0 ? `cmd-opt-${active}` : undefined}
					aria-label="Search or run a command"
					autoComplete="off"
					autoCorrect="off"
					autoCapitalize="off"
					spellCheck={false}
					className="flex-1 min-w-0 h-full bg-transparent outline-none font-fira-code text-[14px] text-white placeholder:text-white/30 caret-[#edc446]"
				/>
				<Kbd className="shrink-0">esc</Kbd>
			</div>

			{/* results: height springs to the content; the inner list scrolls */}
			<motion.div
				initial={false}
				animate={{ height: listHeight ?? "auto" }}
				transition={reduceMotion ? { duration: 0 } : HEIGHT_SPRING}
				className="overflow-hidden"
			>
				<motion.div
					ref={listRef}
					layoutScroll
					id="commandbar-listbox"
					role="listbox"
					aria-label="Results"
					onMouseDown={(e) => e.preventDefault()}
					className="relative overflow-y-auto overscroll-contain max-h-[min(26rem,calc(100dvh-10rem))]"
				>
					{/* padding lives inside the scroller so sticky headers pin flush to its top edge */}
					<div className="py-1.5">
						{!index ? (
							<div className="px-5 py-6 text-[12px] text-white/40">Indexing the tea shelf…</div>
						) : flat.length === 0 ? (
							<EmptyResults query={query} mode={mode} />
						) : (
							// scoped so the active pill never flies in from a previous open
							<LayoutGroup id={pillGroup}>
								{groups.map((g) => (
									<div
										key={g.key}
										role="group"
										aria-labelledby={`cmd-grp-${g.key}`}
										className="pb-1"
									>
										<div
											id={`cmd-grp-${g.key}`}
											className="sticky top-0 z-20 flex items-center justify-between px-5 h-7 text-[10px] uppercase tracking-[0.18em] text-white/35 bg-[var(--surface-face)]"
										>
											<span className="flex items-center gap-2">
												{g.color && (
													<span
														aria-hidden
														className="size-1.5 rounded-full"
														style={{ backgroundColor: g.color }}
													/>
												)}
												{g.label}
											</span>
											<span className="tabular-nums tracking-normal text-white/20">
												{g.items.length}
											</span>
										</div>
										{g.items.map((item) => {
											const i = rowIndex++
											return (
												<ResultRow
													key={item.key}
													item={item}
													index={i}
													active={i === active}
													argCommand={argCommand}
													rolling={
														item.kind === "command" && item.command.id === "random" ? rolling : null
													}
													reduceMotion={reduceMotion}
													onHover={onRowHover}
													onRun={onRowRun}
												/>
											)
										})}
									</div>
								))}
							</LayoutGroup>
						)}
					</div>
				</motion.div>
			</motion.div>

			{/* footer: keyboard legend */}
			<div className="flex items-center justify-between gap-3 px-4 h-9 border-t border-white/[0.07] text-[10px] text-white/40">
				<div className="flex items-center gap-3 whitespace-nowrap">
					<span className="flex items-center gap-1">
						<Kbd>↑</Kbd>
						<Kbd>↓</Kbd>
						navigate
					</span>
					<span className="flex items-center gap-1">
						<Kbd>↵</Kbd>
						{argCommand === "compare"
							? "compare"
							: argCommand === "brew"
							? "brew"
							: activeItem?.kind === "facet" && !facetOpens(activeItem.facet)
							? "filter"
							: "open"}
					</span>
					<AnimatePresence initial={false}>
						{activeItem?.kind === "facet" && facetOpens(activeItem.facet) && (
							<motion.span
								key="filter-hint"
								className="flex items-center gap-1"
								initial={{ opacity: 0, x: -4 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -4, transition: { duration: 0.08 } }}
								transition={reduceMotion ? { duration: 0 } : CHIP_SPRING}
							>
								<Kbd>⇧↵</Kbd>
								filter
							</motion.span>
						)}
					</AnimatePresence>
					<span className="flex items-center gap-1">
						<Kbd>tab</Kbd>
						groups
					</span>
					<span className="flex items-center gap-1">
						<Kbd>esc</Kbd>
						close
					</span>
				</div>
				<div className="flex items-center gap-1 whitespace-nowrap">
					{mode.kind === "all" ? (
						<>
							<span
								className="flex items-center gap-0.5 mr-1.5"
								title="Search one kind: @ vendor, # tag, ^ origin, ~ style, % cultivar, : vintage"
							>
								{Object.keys(SCOPE_PREFIX).map((p) => (
									<Kbd key={p}>{p}</Kbd>
								))}
							</span>
							<Kbd>&gt;</Kbd>
							commands
						</>
					) : (
						<>
							<Kbd>⌫</Kbd>
							back
						</>
					)}
				</div>
			</div>
		</>
	)
}

const ENTITY_HINT: Record<ScopeKind, string> = {
	vendor: "Try white2tea, Yunnan Sourcing or Mei Leaf.",
	tag: "Tags are moods: try gushu or transformer.",
	origin: "Try a village, a mountain or a province: Yiwu, Jingmai, Fujian. Hanzi work too.",
	style: "Try a category like Sheng or a style like Dian Hong.",
	cultivar: "Try Da Ye Zhong or Zi Juan.",
	year: "Try a vintage like 2018.",
}

function EmptyResults({ query, mode }: { query: string; mode: Mode }) {
	const q = query.trim()
	let hint: React.ReactNode
	if (mode.kind === "commands") hint = "Try brew, compare, random, home, or an index like lexicon."
	else if (mode.kind === "arg") hint = "Try a vintage like 2018, a vendor, or part of the name."
	else if (mode.kind === "scope" && mode.scope === "descriptors")
		hint = "Flavors come from tasting notes. Try apricot, camphor, or petrichor."
	else if (mode.kind === "entity") hint = ENTITY_HINT[mode.scope]
	else
		hint = (
			<>
				Try a vintage like <span className="text-white/70">2018</span>, a vendor, or a flavor like{" "}
				<span className="text-white/70">apricot</span>. Start with{" "}
				<span className="text-[#edc446]">@ # ^ ~ % :</span> to search one kind, or{" "}
				<span className="text-[#edc446]">&gt;</span> for commands.
			</>
		)
	return (
		<div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
			<GaiwanIcon className="size-6 text-white/40" />
			<p className="text-[12px] text-white/70">
				{q ? (
					<>
						Nothing steeped for <span className="text-white">“{q}”</span>
					</>
				) : (
					"Nothing here yet"
				)}
			</p>
			<p className="max-w-[24rem] text-[11px] leading-relaxed text-white/40">{hint}</p>
		</div>
	)
}
