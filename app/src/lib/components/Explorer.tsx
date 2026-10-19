"use client"

import SiteHeader from "./SiteHeader"
import FileTree from "./filetree/FileTree"
import type { ExplorerSession } from "../types/session"
import type { Vendor } from "../types/vendor"
import type { Category } from "../types/category"
import Panel from "./containers/Panel"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Search as SearchIcon } from "lucide-react"
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react"
import { useAtom, useSetAtom } from "jotai"
import "simplebar-react/dist/simplebar.min.css"
import {
	EMPTY_FACETS,
	hasAnyFilter,
	matchesFilters,
	readFilters,
	replaceFilters,
	toggleEntityFilter,
	type FacetKey,
	type FacetState,
	type FilterState,
} from "@/lib/filters"
import { sessionMatchesDescriptor } from "@/lib/descriptors"
import { LEGACY_ORIGIN_SLUGS, originChain } from "@/lib/origins"
import { buildRelationIndex, sessionsOf } from "@/lib/relations"
import type { PageKind } from "@/lib/peek"
import { descriptorAtom, explorerSortAtom, openCommandBarAtom } from "@/lib/store/sessionAtom"
import { sortSessions } from "@/lib/sessionSort"
import SessionSortToggle from "@/lib/components/explorer/SessionSortToggle"
import YearRuler from "@/lib/components/explorer/YearRuler"
import FilterTokens, { type FilterToken } from "@/lib/components/explorer/FilterTokens"
import DescriptorReferences from "@/lib/components/explorer/DescriptorReferences"
import ActivityRail, {
	EXPLORER_PANEL_ID,
	explorerTabId,
} from "@/lib/components/explorer/ActivityRail"
import OriginsView from "@/lib/components/explorer/OriginsView"
import VendorsView from "@/lib/components/explorer/VendorsView"
import StylesView from "@/lib/components/explorer/StylesView"
import {
	EXPLORER_VIEWS,
	explorerHoverAtom,
	explorerViewAtom,
	type ExplorerView,
} from "@/lib/components/explorer/state"
import { stripSlash } from "@/lib/components/explorer/views"

export interface ExplorerProps {
	sessions: ExplorerSession[]
	vendors: Vendor[]
	categories: Category[]
	recordingKey?: string
}

/**
 * URL search params are the source of truth for filters (shared with the command bar).
 * - Reacts to any external URL change (command bar, back/forward).
 * - Writes via history.replaceState (no server round-trip, no scroll).
 * - Plain <Link> navigations drop the query string; filters are carried over to the new pathname
 *   (to clear them, replace on the same pathname, e.g. replaceFilters({ q: "", facets: EMPTY_FACETS })).
 */
function useUrlSync() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const urlState = useMemo(() => readFilters(searchParams), [searchParams])

	// Carry filters across navigations that dropped them
	const lastRef = useRef<{ pathname: string; state: FilterState }>({ pathname, state: urlState })
	useEffect(() => {
		const last = lastRef.current
		if (last.pathname !== pathname && !hasAnyFilter(urlState) && hasAnyFilter(last.state)) {
			replaceFilters(last.state)
			lastRef.current = { pathname, state: last.state }
			return
		}
		lastRef.current = { pathname, state: urlState }
	}, [pathname, urlState])

	const setFacets = useCallback((next: FacetState | ((current: FacetState) => FacetState)) => {
		replaceFilters((current) => ({
			...current,
			facets: typeof next === "function" ? next(current.facets) : next,
		}))
	}, [])

	const setQ = useCallback((q: string) => replaceFilters((current) => ({ ...current, q })), [])

	return { q: urlState.q, setQ, facets: urlState.facets, setFacets, urlState, pathname }
}

const yearOf = (s: ExplorerSession) =>
	s.production_year ? String(Math.trunc(Number(s.production_year))) : ""

const FACET_KIND: Record<FacetKey, string> = {
	styles: "style",
	origins: "origin",
	years: "vintage",
	vendors: "vendor",
	cultivars: "cultivar",
	tags: "tag",
}

/** The facet an entity view leaves out of its own counts, so its list keeps every option. */
const VIEW_FACET: Record<ExplorerView, FacetKey | null> = {
	sessions: null,
	origins: "origins",
	vendors: "vendors",
	styles: "styles",
}

const VIEW_SPRING = { type: "spring", stiffness: 520, damping: 38 } as const

// ⌘ on Apple platforms, Ctrl elsewhere. Server snapshot is "Ctrl" so hydration matches.
const subscribeNoop = () => () => {}
const getModKey = () =>
	/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"
const getServerModKey = () => "Ctrl"

/**
 * The left sidebar: site header plus the Explorer panel. An activity rail switches the panel
 * between Sessions (the file tree) and the entity views, Origins (a tree), Vendors and Styles
 * (plan §2.5). The vintage ruler and the filter tokens sit above every view: filters narrow
 * the entity views' counts too, each view ignoring its own facet.
 */
export default function Explorer({ sessions, vendors, categories, recordingKey }: ExplorerProps) {
	const { q, setQ, facets, setFacets, urlState, pathname } = useUrlSync()
	const [descriptor, setDescriptor] = useAtom(descriptorAtom)
	const [sort, setSort] = useAtom(explorerSortAtom)
	const [view, setView] = useAtom(explorerViewAtom)
	const [hover, setHover] = useAtom(explorerHoverAtom)
	const openCommandBar = useSetAtom(openCommandBarAtom)
	const modKey = useSyncExternalStore(subscribeNoop, getModKey, getServerModKey)
	const reduce = useReducedMotion()

	const query = q.toLowerCase().trim()
	const index = useMemo(() => buildRelationIndex(sessions), [sessions])

	// Filtering
	const filteredSessions = useMemo(
		() => sessions.filter((s) => matchesFilters(s, facets, query)),
		[sessions, facets, query]
	)
	// Everything but the year facet: the ruler's density, so it stays informative mid-selection
	const sessionsExceptYears = useMemo(
		() =>
			facets.years.length
				? sessions.filter((s) => matchesFilters(s, facets, query, { ignore: ["years"] }))
				: filteredSessions,
		[sessions, facets, query, filteredSessions]
	)
	// The open entity view counts sessions passing every filter but its own
	const viewFacet = VIEW_FACET[view]
	const viewPool = useMemo(
		() =>
			viewFacet && facets[viewFacet].length
				? sessions.filter((s) => matchesFilters(s, facets, query, { ignore: [viewFacet] }))
				: filteredSessions,
		[viewFacet, sessions, facets, query, filteredSessions]
	)
	// display order (sessions arrive newest first, so date needs no sort)
	const sortedSessions = useMemo(
		() => (sort === "date" ? filteredSessions : sortSessions(filteredSessions, sort)),
		[filteredSessions, sort]
	)

	// Descriptor "find references"
	const descriptorTerm = descriptor?.term ?? null
	const references = useMemo(() => {
		if (!descriptorTerm) return null
		const all = new Set(
			sessions.filter((s) => sessionMatchesDescriptor(s, descriptorTerm)).map((s) => s._slug)
		)
		const visible = sortedSessions.filter((s) => all.has(s._slug)).map((s) => s._slug)
		return { total: all.size, visible }
	}, [descriptorTerm, sessions, sortedSessions])

	// The entity row under the pointer previews its vintages on the ruler
	const previewYears = useMemo(() => {
		if (!hover) return null
		const years = sessionsOf(index, hover.kind, hover.slug)
			.map((s) => Math.trunc(Number(s.production_year)))
			.filter((y) => Number.isFinite(y) && y > 0)
		return years.length ? new Set(years) : null
	}, [hover, index])

	// Active filter tokens (labels resolved from the data, so command-bar filters read nicely)
	const labels = useMemo(() => {
		const map = {
			styles: new Map<string, { label: string; color?: string }>(),
			vendors: new Map<string, { label: string }>(),
			origins: new Map<string, { label: string }>(),
			cultivars: new Map<string, { label: string }>(),
			tags: new Map<string, { label: string }>(),
		}
		for (const c of categories) map.styles.set(c._slug, { label: c.title, color: c.color })
		for (const st of index.nodes.style.values())
			map.styles.set(st.slug, { label: st.title, color: st.color ?? undefined })
		for (const v of vendors) map.vendors.set(v._slug, { label: v.title })
		for (const s of sessions) {
			// label every node of the chain, so a filter on a parent (e.g. ?origins=yunnan) reads nicely
			for (const o of (s.origin || []).flatMap(originChain)) {
				const label = { label: o.title || o._slug }
				map.origins.set(o._slug, label)
				map.origins.set(o.id, label)
			}
			for (const c of s.cultivar || []) map.cultivars.set(c._slug, { label: c.title })
			for (const t of s.tags || []) if (t?._slug) map.tags.set(t._slug, { label: t.title })
		}
		for (const [legacy, slug] of Object.entries(LEGACY_ORIGIN_SLUGS)) {
			const label = map.origins.get(slug)
			if (label) map.origins.set(legacy, label)
		}
		return map
	}, [categories, vendors, sessions, index])

	const vintages = useMemo(
		() => [...new Set(sessions.map(yearOf).filter(Boolean).map(Number))].sort((a, b) => a - b),
		[sessions]
	)

	const tokens = useMemo(() => {
		const out: FilterToken[] = []
		if (q) {
			out.push({ id: "q", kind: "find", label: `“${q}”`, onRemove: () => setQ("") })
		}
		for (const key of ["styles", "vendors", "origins", "cultivars", "tags"] as const) {
			for (const value of facets[key]) {
				const meta = labels[key].get(value) as { label: string; color?: string } | undefined
				out.push({
					id: `${key}:${value}`,
					kind: FACET_KIND[key],
					label: meta?.label ?? value,
					color: meta?.color,
					onRemove: () => setFacets((f) => ({ ...f, [key]: f[key].filter((v) => v !== value) })),
				})
			}
		}
		// years: collapse consecutive vintages into one range token ("2005–2015")
		const years = [...new Set(facets.years.map(Number))]
			.filter(Number.isFinite)
			.sort((a, b) => a - b)
		const runs: number[][] = []
		for (const y of years) {
			const last = runs[runs.length - 1]
			const prev = last?.[last.length - 1]
			const iy = vintages.indexOf(y)
			const ip = prev === undefined ? -1 : vintages.indexOf(prev)
			// adjacent on the calendar, or adjacent vintages with no sessions in between
			const contiguous =
				prev !== undefined && (y === prev + 1 || (iy > -1 && ip > -1 && iy === ip + 1))
			if (last && contiguous) last.push(y)
			else runs.push([y])
		}
		for (const run of runs) {
			const label = run.length === 1 ? String(run[0]) : `${run[0]}–${run[run.length - 1]}`
			const remove = new Set(run.map(String))
			out.push({
				id: `years:${run[0]}`,
				kind: FACET_KIND.years,
				label,
				onRemove: () =>
					setFacets((f) => ({
						...f,
						years: f.years.filter((y) => !remove.has(String(Math.trunc(Number(y))))),
					})),
			})
		}
		return out
	}, [q, facets, labels, vintages, setFacets, setQ])

	const clearAll = useCallback(() => replaceFilters({ q: "", facets: EMPTY_FACETS }), [])

	const onToggleFilter = useCallback(
		(kind: PageKind, slug: string) => {
			const id = kind === "origin" ? index.nodes.origin.get(slug)?.id : undefined
			replaceFilters((current) => toggleEntityFilter(current, kind, slug, id))
		},
		[index]
	)

	const filtered = hasAnyFilter({ q, facets })

	// views slide toward the side of the rail they were picked from
	const [direction, setDirection] = useState(0)
	const changeView = useCallback(
		(next: ExplorerView) => {
			setDirection(Math.sign(EXPLORER_VIEWS.indexOf(next) - EXPLORER_VIEWS.indexOf(view)))
			setView(next)
			// the hovered row is about to unmount without a pointerleave
			setHover(null)
		},
		[view, setView, setHover]
	)

	const viewProps = {
		index,
		pool: viewPool,
		filters: urlState,
		narrowed: filtered,
		pathname: stripSlash(pathname ?? ""),
		onToggleFilter,
	}

	const searchButton = (
		<button
			type="button"
			onClick={() => openCommandBar({ query: q, scope: "sessions" })}
			aria-label="Search sessions"
			aria-keyshortcuts="Meta+K Control+K"
			className="flex items-center h-7 gap-1.5 px-2 shrink-0 text-white/55 border rounded-md border-heicha-500 bg-white/[0.02] hover:text-white hover:border-white/15 hover:bg-white/[0.05] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40"
		>
			<SearchIcon size={13} strokeWidth={2.25} />
			<kbd className="font-fira-code text-[10px] leading-none text-white/40 tracking-tight">
				{modKey === "⌘" ? "⌘K" : "Ctrl K"}
			</kbd>
		</button>
	)

	return (
		<MotionConfig reducedMotion="user">
			<div
				className="fixed top-0 left-0 bottom-[var(--statusbar-h)] z-20 flex flex-col w-[var(--explorer-w)] p-8 space-y-10 pointer-events-none font-fira-code"
				data-recording-key={recordingKey}
			>
				<SiteHeader />

				{/* The actual sidebar panel. Make this interactive. */}
				<Panel className="flex-1 contain-size" backdropClassName="bg-[rgba(45,40,45,0.35)]">
					<div className="relative">
						{/* header: the activity rail (a tablist) and search */}
						<div className="sticky top-0 z-10 p-0 border-b border-heicha-500">
							<div className="flex items-center gap-2 py-2.5 pl-2.5 pr-4 overflow-hidden backdrop-blur-xl bg-panel-header-bg ring-1 ring-heicha-500/10">
								<h2 className="sr-only">Explorer</h2>
								<div className="flex-1 min-w-0">
									<ActivityRail value={view} onChange={changeView} recordingKey="explorer-rail" />
								</div>
								{searchButton}
							</div>
						</div>
						<div className="p-4">
							<YearRuler
								sessions={sessions}
								filteredSessions={sessionsExceptYears}
								activeYears={facets.years}
								onYearsChange={(years) => setFacets((f) => ({ ...f, years }))}
								previewYears={view === "sessions" ? null : previewYears}
							/>
							<FilterTokens tokens={tokens} onClearAll={clearAll} />
							{/* only a pinned descriptor earns the bar (it shifts the tree); a hover preview
							    just dims rows and drops in dots, which costs no layout */}
							<DescriptorReferences
								descriptor={descriptor?.pinned ? descriptor : null}
								total={references?.total ?? 0}
								hidden={references ? references.total - references.visible.length : 0}
								onTogglePin={() => setDescriptor((d) => (d ? { ...d, pinned: !d.pinned } : d))}
								onClear={() => setDescriptor(null)}
							/>
							<div
								id={EXPLORER_PANEL_ID}
								role="tabpanel"
								aria-labelledby={explorerTabId(view)}
								className="relative"
							>
								<AnimatePresence mode="popLayout" initial={false} custom={direction}>
									<motion.div
										key={view}
										custom={direction}
										variants={{
											enter: (d: number) =>
												reduce ? { opacity: 0 } : { opacity: 0, x: d * 14, filter: "blur(2px)" },
											center: { opacity: 1, x: 0, filter: "blur(0px)" },
											exit: (d: number) =>
												reduce ? { opacity: 0 } : { opacity: 0, x: d * -14, filter: "blur(2px)" },
										}}
										initial="enter"
										animate="center"
										exit="exit"
										transition={
											// direction 0: the remembered view arriving after hydration, not a pick
											direction === 0
												? { duration: 0 }
												: reduce
												? { duration: 0.12 }
												: {
														...VIEW_SPRING,
														opacity: { duration: 0.16 },
														filter: { duration: 0.16 },
												  }
										}
									>
										{view === "sessions" && (
											<FileTree
												referenceSlugs={references?.visible ?? null}
												order={sort}
												data={[
													{
														id: "sessions",
														title: "Sessions",
														children: sortedSessions,
														total: filtered ? sessions.length : undefined,
														actions: (
															<SessionSortToggle
																value={sort}
																onChange={setSort}
																recordingKey="explorer-session-sort"
															/>
														),
													},
												]}
											/>
										)}
										{/* entity rows run a little wider than the padding: names need the room */}
										{view !== "sessions" && (
											<div className="-mx-2">
												{view === "origins" && <OriginsView {...viewProps} />}
												{view === "vendors" && <VendorsView {...viewProps} vendors={vendors} />}
												{view === "styles" && <StylesView {...viewProps} categories={categories} />}
											</div>
										)}
									</motion.div>
								</AnimatePresence>
							</div>
						</div>
					</div>
				</Panel>
			</div>
		</MotionConfig>
	)
}
