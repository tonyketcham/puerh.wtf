"use client"

import SiteHeader from "./SiteHeader"
import FileTree from "./filetree/FileTree"
import type { ExplorerSession } from "../types/session"
import type { Vendor } from "../types/vendor"
import type { Category } from "../types/category"
import Panel from "./containers/Panel"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react"
import { useAtom } from "jotai"
import "simplebar-react/dist/simplebar.min.css"
import {
	EMPTY_FACETS,
	hasAnyFilter,
	matchesFilters,
	toggleEntityFilter,
	type FacetKey,
	type FacetState,
} from "@/lib/filters"
import { filtersAtom, replaceFilters } from "@/lib/store/filterState"
import { sessionMatchesDescriptor } from "@/lib/descriptors"
import { LEGACY_ORIGIN_SLUGS, originChain } from "@/lib/origins"
import { buildRelationIndex, sessionsOf } from "@/lib/relations"
import type { PageKind } from "@/lib/peek"
import { descriptorAtom, explorerSortAtom } from "@/lib/store/sessionAtom"
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
import LexiconView from "@/lib/components/explorer/LexiconView"
import {
	EXPLORER_VIEWS,
	explorerHoverAtom,
	explorerViewAtom,
	explorerDrawerOpenAtom,
	EXPLORER_DOCK_QUERY,
	type ExplorerView,
} from "@/lib/components/explorer/state"
import { stripSlash } from "@/lib/components/explorer/views"
import { EXPLORER_DRAWER_ID } from "@/lib/components/explorer/ExplorerToggle"
import { useMediaQuery } from "@/lib/utils/useMediaQuery"
import { useFocusTrap } from "@/lib/utils/useFocusTrap"
import { cn } from "@/lib/utils/cn"
import { X } from "lucide-react"

export interface ExplorerProps {
	sessions: ExplorerSession[]
	vendors: Vendor[]
	categories: Category[]
	recordingKey?: string
}

/** All filter controls read and update the same atom; URL persistence lives at the root. */
function useFilters() {
	const pathname = usePathname()
	const [filters, setFilters] = useAtom(filtersAtom)

	const setFacets = useCallback(
		(next: FacetState | ((current: FacetState) => FacetState)) => {
			setFilters((current) => ({
				...current,
				facets: typeof next === "function" ? next(current.facets) : next,
			}))
		},
		[setFilters]
	)

	const setQ = useCallback(
		(q: string) => setFilters((current) => ({ ...current, q })),
		[setFilters]
	)

	return { q: filters.q, setQ, facets: filters.facets, setFacets, filters, pathname }
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
	vessels: "vessel",
}

/** The facet an entity view leaves out of its own counts, so its list keeps every option. */
const VIEW_FACET: Record<ExplorerView, FacetKey | null> = {
	sessions: null,
	origins: "origins",
	vendors: "vendors",
	styles: "styles",
	lexicon: null,
}

const VIEW_SPRING = { type: "spring", stiffness: 520, damping: 38 } as const

/**
 * Below xl the Explorer is a modal drawer: a navigation puts it away, Escape closes it, focus
 * moves in when it opens and back to the masthead toggle when it closes, and the page under
 * it holds still. Docked (xl and up) none of this applies.
 */
function useDrawer(pathname: string | null) {
	const [open, setOpen] = useAtom(explorerDrawerOpenAtom)
	const drawer = !useMediaQuery(EXPLORER_DOCK_QUERY)
	const drawerRef = useRef<HTMLDivElement>(null)
	const closeDrawer = useCallback(() => setOpen(false), [setOpen])
	const previousPath = useRef(pathname)

	useEffect(() => {
		if (previousPath.current !== pathname) setOpen(false)
		previousPath.current = pathname
	}, [pathname, setOpen])

	const drawerOpen = drawer && open
	useFocusTrap(drawerRef, drawerOpen)
	useEffect(() => {
		if (!drawerOpen) return
		const root = document.documentElement
		const overflow = root.style.overflow
		root.style.overflow = "hidden"
		drawerRef.current?.focus({ preventScroll: true })
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false)
		}
		window.addEventListener("keydown", onKey)
		return () => {
			window.removeEventListener("keydown", onKey)
			root.style.overflow = overflow
			document.querySelector<HTMLElement>("[data-explorer-toggle]")?.focus({ preventScroll: true })
		}
	}, [drawerOpen, setOpen])

	return { drawerOpen, closeDrawer, drawerRef }
}

/**
 * The left sidebar: site header plus the Explorer panel. An activity rail switches the panel
 * between Sessions (the file tree) and the entity views, Origins (a tree), Vendors, Styles
 * and the flavor Lexicon (plan §2.1, §2.5). The vintage ruler and the filter tokens sit
 * above every view: filters narrow the entity views' counts too, each view ignoring its own
 * facet.
 */
export default function Explorer({ sessions, vendors, categories, recordingKey }: ExplorerProps) {
	const { q, setQ, facets, setFacets, filters, pathname } = useFilters()
	const [descriptor, setDescriptor] = useAtom(descriptorAtom)
	const [sort, setSort] = useAtom(explorerSortAtom)
	const [view, setView] = useAtom(explorerViewAtom)
	const [hover, setHover] = useAtom(explorerHoverAtom)
	const reduce = useReducedMotion()
	const { drawerOpen, closeDrawer, drawerRef } = useDrawer(pathname)

	const query = q.toLowerCase().trim()
	const index = useMemo(() => buildRelationIndex(sessions), [sessions])

	// Reuse the non-year pool while scrubbing: relation/query matching does not change
	// with either handle. Only membership in the selected year set needs recomputing.
	const { styles, origins, vendors: vendorFilters, cultivars, tags, vessels } = facets
	const otherFacetsJson = JSON.stringify({
		styles,
		origins,
		vendors: vendorFilters,
		cultivars,
		tags,
		vessels,
		years: EMPTY_FACETS.years,
	})
	const otherFacets = useMemo<FacetState>(() => JSON.parse(otherFacetsJson), [otherFacetsJson])
	const sessionsExceptYears = useMemo(
		() => sessions.filter((s) => matchesFilters(s, otherFacets, query)),
		[sessions, otherFacets, query]
	)
	const selectedYearSet = useMemo(() => new Set(facets.years), [facets.years])
	const filteredSessions = useMemo(
		() =>
			selectedYearSet.size
				? sessionsExceptYears.filter((s) => selectedYearSet.has(yearOf(s)))
				: sessionsExceptYears,
		[sessionsExceptYears, selectedYearSet]
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
	const orderedSessions = useMemo(
		() => (sort === "date" ? sessions : sortSessions(sessions, sort)),
		[sessions, sort]
	)
	const sortedSessions = useMemo(() => {
		if (sort === "date") return filteredSessions
		const kept = new Set(filteredSessions.map((s) => s.id))
		return orderedSessions.filter((s) => kept.has(s.id))
	}, [filteredSessions, orderedSessions, sort])
	const sessionTreeData = useMemo(
		() => [
			{
				id: "sessions",
				title: "Sessions",
				children: sortedSessions,
				total: hasAnyFilter(filters) ? sessions.length : undefined,
				actions: (
					<SessionSortToggle value={sort} onChange={setSort} recordingKey="explorer-session-sort" />
				),
			},
		],
		[sortedSessions, filters, sessions.length, sort, setSort]
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
			vessels: new Map<string, { label: string }>(),
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
			for (const v of s.vessel || []) if (v?._slug) map.vessels.set(v._slug, { label: v.title })
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
		for (const key of ["styles", "vendors", "origins", "cultivars", "vessels", "tags"] as const) {
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
		for (const [i, run] of runs.entries()) {
			const label = run.length === 1 ? String(run[0]) : `${run[0]}–${run[run.length - 1]}`
			const remove = new Set(run.map(String))
			out.push({
				// Dragging changes this range's endpoints, not the identity of the filter.
				id: `years:${i}`,
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

	// a lexicon word's "find all references": pin it and show the sessions that list it
	const findReferences = useCallback(
		(term: string) => {
			setDescriptor({ term, pinned: true })
			changeView("sessions")
		},
		[setDescriptor, changeView]
	)

	const viewProps = {
		index,
		pool: viewPool,
		filters,
		narrowed: filtered,
		pathname: stripSlash(pathname ?? ""),
		onToggleFilter,
	}

	return (
		<MotionConfig reducedMotion="user">
			{/* below xl: the scrim behind the drawer (a click on the page puts it away) */}
			<div
				aria-hidden
				onClick={closeDrawer}
				className={cn(
					"fixed inset-0 z-[44] bg-black/55 transition-opacity duration-300 xl:hidden motion-reduce:transition-none",
					drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
				)}
			/>
			<div
				ref={drawerRef}
				id={EXPLORER_DRAWER_ID}
				// docked from xl; below it app.css zeroes --explorer-w and the Explorer slides in
				// over the page from the masthead's toggle (CSS places it, so nothing jumps on hydration)
				className={cn(
					"fixed top-0 left-0 bottom-[var(--statusbar-h)] flex flex-col pointer-events-none font-fira-code outline-none",
					"xl:z-20 xl:w-[var(--explorer-w)] xl:p-6 xl:space-y-8 2xl:p-8 2xl:space-y-10",
					"max-xl:z-[45] max-xl:w-[min(22rem,calc(100vw-2.5rem))] max-xl:p-3 max-xl:duration-300 max-xl:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
					// visible at once on the way in (so it can take focus), hidden only once it is out
					drawerOpen
						? "max-xl:transition-[translate]"
						: "max-xl:transition-[translate,visibility] max-xl:-translate-x-full max-xl:invisible"
				)}
				tabIndex={-1}
				// a dialog only while it is out; closed, `invisible` already keeps it out of focus,
				// clicks and the accessibility tree, and the docked rail stays live before hydration
				role={drawerOpen ? "dialog" : undefined}
				aria-modal={drawerOpen || undefined}
				aria-label={drawerOpen ? "Explorer" : undefined}
				data-recording-key={recordingKey}
			>
				{/* the drawer sits under the compact masthead, which already carries the mark */}
				<SiteHeader className="max-xl:hidden" />

				{/* The actual sidebar panel. Make this interactive. */}
				<Panel className="flex-1 contain-size explorer-panel">
					<div className="relative">
						{/* header: the activity rail (a tablist), concentric with the panel: its 15px inner radius
						    less this 6px inset gives the tabs their 9px radius */}
						<div className="sticky top-0 z-10 p-0 surface-strip">
							<div className="flex items-center gap-1.5 p-1.5 overflow-hidden backdrop-blur-xl bg-panel-header-bg surface-grain">
								<h2 className="sr-only">Explorer</h2>
								<div className="flex-1 min-w-0">
									<ActivityRail value={view} onChange={changeView} recordingKey="explorer-rail" />
								</div>
								<button
									type="button"
									onClick={closeDrawer}
									aria-label="Close Explorer"
									className="grid w-7 h-7 rounded-[9px] outline-none shrink-0 place-items-center text-white/45 hover:text-white hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-white/50 xl:hidden"
								>
									<X size={14} strokeWidth={1.75} aria-hidden />
								</button>
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
											enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * 14 }),
											center: { opacity: 1, x: 0 },
											exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * -14 }),
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
												  }
										}
									>
										{view === "sessions" && (
											<FileTree
												referenceSlugs={references?.visible ?? null}
												order={sort}
												data={sessionTreeData}
											/>
										)}
										{/* entity rows run a little wider than the padding: names need the room */}
										{view !== "sessions" && (
											<div className="-mx-2">
												{view === "origins" && <OriginsView {...viewProps} />}
												{view === "vendors" && <VendorsView {...viewProps} vendors={vendors} />}
												{view === "styles" && <StylesView {...viewProps} categories={categories} />}
												{view === "lexicon" && (
													<LexiconView {...viewProps} onFindReferences={findReferences} />
												)}
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
