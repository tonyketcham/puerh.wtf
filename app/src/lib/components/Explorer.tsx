"use client"

import SiteHeader from "./SiteHeader"
import FileTree from "./filetree/FileTree"
import type { ExplorerSession } from "../types/session"
import type { Vendor } from "../types/vendor"
import type { Category } from "../types/category"
import Panel from "./containers/Panel"
import PanelSection from "@/lib/components/containers/PanelSection"
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Search as SearchIcon } from "lucide-react"
import { MotionConfig } from "motion/react"
import { useAtom, useSetAtom } from "jotai"
import "simplebar-react/dist/simplebar.min.css"
import {
	EMPTY_FACETS,
	hasAnyFilter,
	readFilters,
	replaceFilters,
	type FacetKey,
	type FacetState,
	type FilterState,
} from "@/lib/filters"
import { sessionMatchesDescriptor } from "@/lib/descriptors"
import { descriptorAtom, openCommandBarAtom } from "@/lib/store/sessionAtom"
import YearRuler from "@/lib/components/explorer/YearRuler"
import FilterTokens, { type FilterToken } from "@/lib/components/explorer/FilterTokens"
import DescriptorReferences from "@/lib/components/explorer/DescriptorReferences"

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

	return { q: urlState.q, setQ, facets: urlState.facets, setFacets }
}

function normalize(text?: string | null) {
	return (text || "").toLowerCase()
}

const yearOf = (s: ExplorerSession) =>
	s.production_year ? String(Math.trunc(Number(s.production_year))) : ""

function passesFilters(
	s: ExplorerSession,
	facets: FacetState,
	query: string,
	{ ignoreYears = false }: { ignoreYears?: boolean } = {}
) {
	if (facets.styles.length) {
		const catSlugs = (s.style || []).map((st) => st.category._slug)
		if (!facets.styles.some((slug) => catSlugs.includes(slug))) return false
	}
	if (!ignoreYears && facets.years.length) {
		if (!facets.years.includes(yearOf(s))) return false
	}
	if (facets.vendors.length) {
		const vendorSlugs = (s.vendor || []).map((v) => v._slug)
		if (!facets.vendors.some((slug) => vendorSlugs.includes(slug))) return false
	}
	if (facets.cultivars.length) {
		const cultivarSlugs = (s.cultivar || []).map((c) => c._slug)
		if (!facets.cultivars.some((slug) => cultivarSlugs.includes(slug))) return false
	}
	if (facets.tags.length) {
		const tagSlugs = (s.tags || []).map((t) => t?._slug || "")
		if (!facets.tags.some((slug) => tagSlugs.includes(slug))) return false
	}
	if (facets.origins.length) {
		const originSlugs = (s.origin || []).flatMap((o) => [o?._slug || "", o?.id || ""])
		if (!facets.origins.some((slug) => originSlugs.includes(slug))) return false
	}

	if (!query) return true
	const haystack = [
		s.title,
		s.tea_name || "",
		String(s.production_year || ""),
		...(s.vendor || []).map((v) => v.title),
		...(s.cultivar || []).map((c) => c.title),
		...(s.tags || []).map((t) => t?.title || ""),
		...(s.origin || []).flatMap((o) => [o?.location, o?.municipality, o?.country, o?._slug]),
		...(s.style || []).flatMap((st) => [st.title, st.category?.title]),
	]
		.filter(Boolean)
		.map((t) => normalize(String(t)))
	if (haystack.some((t) => t.includes(query))) return true
	// flavors: the command bar writes ?q=<descriptor> when a flavor is picked, so q also finds
	// sessions whose tasting notes mention it (plural-tolerant, word-bounded)
	return query.length >= 3 && sessionMatchesDescriptor(s, query)
}

const FACET_KIND: Record<FacetKey, string> = {
	styles: "style",
	origins: "origin",
	years: "vintage",
	vendors: "vendor",
	cultivars: "cultivar",
	tags: "tag",
}

// ⌘ on Apple platforms, Ctrl elsewhere. Server snapshot is "Ctrl" so hydration matches.
const subscribeNoop = () => () => {}
const getModKey = () =>
	/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"
const getServerModKey = () => "Ctrl"

export default function Explorer({ sessions, vendors, categories, recordingKey }: ExplorerProps) {
	const { q, setQ, facets, setFacets } = useUrlSync()
	const [descriptor, setDescriptor] = useAtom(descriptorAtom)
	const openCommandBar = useSetAtom(openCommandBarAtom)
	const modKey = useSyncExternalStore(subscribeNoop, getModKey, getServerModKey)

	const query = normalize(q).trim()

	// Filtering
	const filteredSessions = useMemo(
		() => sessions.filter((s) => passesFilters(s, facets, query)),
		[sessions, facets, query]
	)
	// Everything but the year facet: the ruler's density, so it stays informative mid-selection
	const sessionsExceptYears = useMemo(
		() =>
			facets.years.length
				? sessions.filter((s) => passesFilters(s, facets, query, { ignoreYears: true }))
				: filteredSessions,
		[sessions, facets, query, filteredSessions]
	)

	// Vendors/categories lists are narrowed by the free-text query only
	const filteredVendors = useMemo(
		() => (query ? vendors.filter((v) => normalize(v.title).includes(query)) : vendors),
		[vendors, query]
	)
	const filteredCategories = useMemo(
		() => (query ? categories.filter((c) => normalize(c.title).includes(query)) : categories),
		[categories, query]
	)

	// Descriptor "find references"
	const descriptorTerm = descriptor?.term ?? null
	const references = useMemo(() => {
		if (!descriptorTerm) return null
		const all = new Set(
			sessions.filter((s) => sessionMatchesDescriptor(s, descriptorTerm)).map((s) => s._slug)
		)
		const visible = filteredSessions.filter((s) => all.has(s._slug)).map((s) => s._slug)
		return { total: all.size, visible }
	}, [descriptorTerm, sessions, filteredSessions])

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
		for (const v of vendors) map.vendors.set(v._slug, { label: v.title })
		for (const s of sessions) {
			for (const o of s.origin || []) {
				if (!o) continue
				const label = o.location || o.municipality || o.country || o._slug
				if (o._slug) map.origins.set(o._slug, { label })
				if (o.id) map.origins.set(o.id, { label })
			}
			for (const c of s.cultivar || []) map.cultivars.set(c._slug, { label: c.title })
			for (const t of s.tags || []) if (t?._slug) map.tags.set(t._slug, { label: t.title })
		}
		return map
	}, [categories, vendors, sessions])

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

	const filtered = hasAnyFilter({ q, facets })

	const rightSlot = (
		<button
			type="button"
			onClick={() => openCommandBar({ query: q, scope: "sessions" })}
			aria-label="Search sessions"
			aria-keyshortcuts="Meta+K Control+K"
			className="flex items-center h-7 gap-1.5 px-2 text-white/55 border rounded-md border-heicha-500 bg-white/[0.02] hover:text-white hover:border-white/15 hover:bg-white/[0.05] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40"
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
					<PanelSection title="Explorer" rightSlot={rightSlot}>
						<YearRuler
							sessions={sessions}
							filteredSessions={sessionsExceptYears}
							activeYears={facets.years}
							onYearsChange={(years) => setFacets((f) => ({ ...f, years }))}
						/>
						<FilterTokens tokens={tokens} onClearAll={clearAll} />
						<DescriptorReferences
							descriptor={descriptor}
							total={references?.total ?? 0}
							hidden={references ? references.total - references.visible.length : 0}
							onTogglePin={() => setDescriptor((d) => (d ? { ...d, pinned: !d.pinned } : d))}
							onClear={() => setDescriptor(null)}
						/>
						<FileTree
							referenceSlugs={references?.visible ?? null}
							data={[
								{
									id: "sessions",
									title: "Sessions",
									children: filteredSessions,
									total: filtered ? sessions.length : undefined,
								},
								{
									id: "vendors",
									title: "Vendors",
									children: filteredVendors,
									total: query ? vendors.length : undefined,
								},
								{
									id: "categories",
									title: "Categories",
									children: filteredCategories,
									total: query ? categories.length : undefined,
								},
							]}
						/>
					</PanelSection>
				</Panel>
			</div>
		</MotionConfig>
	)
}
