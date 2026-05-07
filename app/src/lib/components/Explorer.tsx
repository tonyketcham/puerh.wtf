"use client"

import SiteHeader from "./SiteHeader"
import FileTree from "./filetree/FileTree"
import type { SessionPreview } from "../types/session"
import type { Vendor } from "../types/vendor"
import type { Category } from "../types/category"
import Panel from "./containers/Panel"
import PanelSection from "@/lib/components/containers/PanelSection"
import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { buildLink } from "@/lib/utils/BuildLinkToGivenCollectionNode"
import { Search as SearchIcon, X as CloseIcon } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import "simplebar-react/dist/simplebar.min.css"
import { cn } from "@/lib/utils/cn"

export interface ExplorerProps {
	sessions: SessionPreview[]
	vendors: Vendor[]
	categories: Category[]
	recordingKey?: string
}

type FacetState = {
	styles: string[]
	origins: string[]
	years: string[]
	vendors: string[]
	cultivars: string[]
	tags: string[]
}

type TypeaheadItem = {
	id: string
	label: string
	subLabel?: string
	type: "tea" | "vendor" | "tag" | "style"
	action: () => void
}

function useUrlSync(initial: { q: string; facets: FacetState }) {
	const router = useRouter()
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const [q, setQ] = useState(initial.q)
	const [facets, setFacets] = useState<FacetState>(initial.facets)

	// Initialize from URL once
	useEffect(() => {
		const qParam = searchParams.get("q") || ""
		const readList = (k: string) => (searchParams.get(k) || "").split(",").filter(Boolean)
		setQ(qParam)
		setFacets({
			styles: readList("styles"),
			origins: readList("origins"),
			years: readList("years"),
			vendors: readList("vendors"),
			cultivars: readList("cultivars"),
			tags: readList("tags"),
		})
	}, [])

	// Write to URL on change (replace, no scroll)
	useEffect(() => {
		const params = new URLSearchParams()
		if (q) params.set("q", q)
		const setList = (key: keyof FacetState) => {
			const arr = facets[key]
			if (arr.length) params.set(key, arr.join(","))
		}
		setList("styles")
		setList("origins")
		setList("years")
		setList("vendors")
		setList("cultivars")
		setList("tags")
		router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`)
	}, [q, facets, pathname, router])

	return { q, setQ, facets, setFacets }
}

function normalize(text?: string | null) {
	return (text || "").toLowerCase()
}

function unique<T>(arr: T[]): T[] {
	return Array.from(new Set(arr))
}

export default function Explorer({ sessions, vendors, categories, recordingKey }: ExplorerProps) {
	// URL-synced search state
	const { q, setQ, facets, setFacets } = useUrlSync({
		q: "",
		facets: { styles: [], origins: [], years: [], vendors: [], cultivars: [], tags: [] },
	})

	const [searchOpen, setSearchOpen] = useState(false)
	const inputRef = useRef<HTMLInputElement | null>(null)

	useEffect(() => {
		if (searchOpen) {
			inputRef.current?.focus()
		}
	}, [searchOpen])

	// Derived facet options
	const facetOptions = useMemo(() => {
		const styles = categories.map((c) => ({ value: c._slug, label: c.title }))
		const years = unique(
			sessions
				.map((s) => (s.production_year ? String(Math.trunc(Number(s.production_year))) : null))
				.filter(Boolean) as string[]
		).sort((a, b) => Number(b) - Number(a))
		const originsRaw = sessions.flatMap((s) => s.origin || [])
		const origins = unique(
			originsRaw.map((o) => ({
				value: o?._slug ?? o?.id ?? "",
				label: o?.location || o?.municipality || o?.country || (o?._slug ?? ""),
			}))
		).filter((o) => o.value)
		const cultivarRaw = sessions.flatMap((s) => s.cultivar || [])
		const cultivars = unique(cultivarRaw.map((c) => ({ value: c._slug, label: c.title }))).filter(
			(c) => !!c.value
		)
		const tagsRaw = sessions.flatMap((s) => s.tags || [])
		const tags = unique(
			tagsRaw.map((t) => ({ value: t?._slug ?? "", label: t?.title ?? "" }))
		).filter((t) => !!t.value)
		const vendorList = vendors.map((v) => ({ value: v._slug, label: v.title }))
		return { styles, years, origins, cultivars, tags, vendors: vendorList }
	}, [sessions, vendors, categories])

	// Filtering logic for sessions
	const filteredSessions = useMemo(() => {
		const query = normalize(q)
		const hasQ = query.length > 0
		return sessions.filter((s) => {
			// Facets
			if (facets.styles.length) {
				const catSlugs = (s.style || []).map((st) => st.category._slug)
				if (!facets.styles.some((slug) => catSlugs.includes(slug))) return false
			}
			if (facets.years.length) {
				const yearStr = s.production_year ? String(Math.trunc(Number(s.production_year))) : ""
				if (!facets.years.includes(yearStr)) return false
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
				const originSlugs = (s.origin || []).map((o) => o?._slug || o?.id || "")
				if (!facets.origins.some((slug) => originSlugs.includes(slug))) return false
			}

			// Query matching
			if (!hasQ) return true
			const haystack = [
				s.title,
				s.tea_name || "",
				String(s.production_year || ""),
				...(s.vendor || []).map((v) => v.title),
				...(s.cultivar || []).map((c) => c.title),
				...(s.tags || []).map((t) => t?.title || ""),
				...(s.origin || []).flatMap((o) => [o?.location, o?.municipality, o?.country, o?._slug]),
			]
				.filter(Boolean)
				.map((t) => normalize(String(t)))
			return haystack.some((t) => t.includes(query))
		})
	}, [sessions, facets, q])

	// Filter vendors/categories lists by query only (simple quick filter)
	const filteredVendors = useMemo(() => {
		const query = normalize(q)
		if (!query) return vendors
		return vendors.filter((v) => normalize(v.title).includes(query))
	}, [vendors, q])

	const filteredCategories = useMemo(() => {
		const query = normalize(q)
		if (!query) return categories
		return categories.filter((c) => normalize(c.title).includes(query))
	}, [categories, q])

	// Typeahead
	const typeaheadItems: TypeaheadItem[] = useMemo(() => {
		const items: TypeaheadItem[] = []
		const add = (it: TypeaheadItem) => items.push(it)
		// Teas
		for (const s of sessions.slice(0, 300)) {
			add({
				id: `tea:${s.id}`,
				label: s.title,
				subLabel: s.production_year ? String(Math.trunc(Number(s.production_year))) : undefined,
				type: "tea",
				action: () => {
					location.href = buildLink(s)
				},
			})
		}
		// Vendors
		for (const v of vendors) {
			add({
				id: `vendor:${v._slug}`,
				label: v.title,
				type: "vendor",
				action: () => setFacets((f) => ({ ...f, vendors: unique([...f.vendors, v._slug]) })),
			})
		}
		// Tags
		const tags = unique(
			sessions.flatMap((s) =>
				(s.tags || []).map((t) => ({ slug: t?._slug || "", title: t?.title || "" }))
			)
		).filter((t) => t.slug)
		for (const t of tags) {
			add({
				id: `tag:${t.slug}`,
				label: t.title,
				type: "tag",
				action: () => setFacets((f) => ({ ...f, tags: unique([...f.tags, t.slug]) })),
			})
		}
		// Styles (categories)
		for (const c of categories) {
			add({
				id: `style:${c._slug}`,
				label: c.title,
				type: "style",
				action: () => setFacets((f) => ({ ...f, styles: unique([...f.styles, c._slug]) })),
			})
		}
		return items
	}, [sessions, vendors, categories, setFacets])

	const [showSuggestions, setShowSuggestions] = useState(false)
	const suggestions = useMemo(() => {
		const query = normalize(q)
		if (!query) return [] as TypeaheadItem[]
		return typeaheadItems.filter((it) => normalize(it.label).includes(query)).slice(0, 8)
	}, [q, typeaheadItems])

	// Saved views (localStorage)
	const saveCurrentView = () => {
		const name = window.prompt("Save current filters as:")
		if (!name) return
		const payload = { q, facets }
		const key = "explorer_saved_views"
		const existing = JSON.parse(localStorage.getItem(key) || "{}") as Record<string, unknown>
		existing[name] = payload
		localStorage.setItem(key, JSON.stringify(existing))
	}
	const [savedViews, setSavedViews] = useState<
		{ name: string; data: { q: string; facets: FacetState } }[]
	>([])
	useEffect(() => {
		try {
			const existing = JSON.parse(localStorage.getItem("explorer_saved_views") || "{}") as Record<
				string,
				{ q: string; facets: FacetState }
			>
			setSavedViews(Object.entries(existing).map(([name, data]) => ({ name, data })))
		} catch {
			setSavedViews([])
		}
	}, [showSuggestions])
	const loadSavedView = (data: { q: string; facets: FacetState }) => {
		setQ(data.q)
		setFacets(data.facets)
	}

	// Simple chips UI for active facets
	const removeFacet = (key: keyof FacetState, val: string) => {
		setFacets((f) => ({ ...f, [key]: (f[key] as string[]).filter((v) => v !== val) }))
	}

	const rightSlot = (
		<div
			className={cn("flex items-center gap-1", searchOpen && "flex-1")}
			data-recording-key="explorer-search-controls"
		>
			<motion.div
				className={cn("relative h-7", searchOpen ? "w-full" : "w-7")}
				animate={{ width: searchOpen ? "100%" : 28 }}
				transition={{ type: "spring", stiffness: 300, damping: 30 }}
			>
				{/* Collapsed icon button */}
				<AnimatePresence initial={false}>
					{!searchOpen && (
						<motion.button
							key="search-collapsed"
							aria-label="Open search"
							onClick={() => setSearchOpen(true)}
							className="flex items-center justify-center border rounded-md w-7 h-7 border-heicha-500 text-white/80 hover:text-white"
							data-recording-key="explorer-search-toggle"
							initial={{ opacity: 0, x: 8 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: 8 }}
							transition={{ duration: 0.15 }}
						>
							<SearchIcon size={14} />
						</motion.button>
					)}
				</AnimatePresence>

				{/* Expanded input */}
				<AnimatePresence initial={false}>
					{searchOpen && (
						<motion.div
							key="search-expanded"
							className="absolute inset-0 flex items-center"
							initial={{ clipPath: "inset(0 0 0 100%)" }}
							animate={{ clipPath: "inset(0 0 0 0%)" }}
							exit={{ clipPath: "inset(0 0 0 100%)" }}
							transition={{ duration: 0.2 }}
						>
							<div className="relative w-full">
								<SearchIcon
									size={14}
									className="absolute -translate-y-1/2 left-2 top-1/2 text-white/60"
								/>
								<input
									ref={inputRef}
									value={q}
									onChange={(e) => {
										setQ(e.target.value)
										setShowSuggestions(true)
									}}
									placeholder="Search..."
									className={cn(
										"w-full pr-8 text-white border rounded-md pl-7 h-7 border-heicha-500 bg-heicha-800/70 text-[13px] placeholder-white/40",
										"focus:outline-none focus:ring-1 focus:ring-white/20"
									)}
									data-recording-key="explorer-search-input"
									onKeyDown={(e) => {
										if (e.key === "Escape") {
											setSearchOpen(false)
											setShowSuggestions(false)
										}
									}}
								/>
								<button
									aria-label="Close search"
									onClick={() => {
										setSearchOpen(false)
										setShowSuggestions(false)
									}}
									className="absolute -translate-y-1/2 right-1 top-1/2 text-white/70 hover:text-white"
								>
									<CloseIcon size={14} />
								</button>
								{showSuggestions && suggestions.length > 0 && (
									<div className="absolute z-50 mt-1 overflow-hidden border rounded-md shadow-xl w-72 border-heicha-500 bg-heicha-800/95">
										<ul>
											{suggestions.map((sug) => (
												<li
													key={sug.id}
													className="px-3 py-2 text-sm cursor-pointer text-white/80 hover:bg-white/10"
													onMouseDown={(e) => {
														e.preventDefault()
														sug.action()
														setShowSuggestions(false)
													}}
												>
													<span className="opacity-90">{sug.label}</span>
													{sug.subLabel && (
														<span className="ml-2 text-white/50">{sug.subLabel}</span>
													)}
													<span className="ml-2 text-xs text-white/40">{sug.type}</span>
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>

			{/* <button
				onClick={saveCurrentView}
				title="Save view"
				className="px-2 text-xs border rounded-md h-7 border-heicha-500 text-white/70 hover:text-white"
				data-recording-key="explorer-save-view"
			>
				★
			</button>
			<div className="relative">
				<button
					title="Saved views"
					className="px-2 text-xs border rounded-md h-7 border-heicha-500 text-white/70 hover:text-white"
					onClick={() => setShowSuggestions((v) => !v)}
				>
					Views
				</button>
				{showSuggestions && savedViews.length > 0 && (
					<div className="absolute right-0 z-50 w-56 mt-1 overflow-hidden border rounded-md shadow-xl border-heicha-500 bg-heicha-800/95">
						<ul>
							{savedViews.map(({ name, data }) => (
								<li
									key={name}
									className="px-3 py-2 text-sm cursor-pointer text-white/80 hover:bg-white/10"
									onMouseDown={(e) => {
										e.preventDefault()
										loadSavedView(data)
										setShowSuggestions(false)
									}}
								>
									{name}
								</li>
							))}
						</ul>
					</div>
				)}
			</div> */}
		</div>
	)

	// Active filters chips row
	const chips = (
		<div className="flex flex-wrap gap-1">
			{facets.styles.map((s) => (
				<button
					key={`style-${s}`}
					onClick={() => removeFacet("styles", s)}
					className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/80 hover:bg-white/15"
				>
					style:{s}
				</button>
			))}
			{facets.vendors.map((v) => (
				<button
					key={`vendor-${v}`}
					onClick={() => removeFacet("vendors", v)}
					className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/80 hover:bg-white/15"
				>
					vendor:{v}
				</button>
			))}
			{facets.tags.map((t) => (
				<button
					key={`tag-${t}`}
					onClick={() => removeFacet("tags", t)}
					className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/80 hover:bg-white/15"
				>
					tag:{t}
				</button>
			))}
			{facets.cultivars.map((c) => (
				<button
					key={`cultivar-${c}`}
					onClick={() => removeFacet("cultivars", c)}
					className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/80 hover:bg-white/15"
				>
					cultivar:{c}
				</button>
			))}
			{facets.origins.map((o) => (
				<button
					key={`origin-${o}`}
					onClick={() => removeFacet("origins", o)}
					className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/80 hover:bg-white/15"
				>
					origin:{o}
				</button>
			))}
			{facets.years.map((y) => (
				<button
					key={`year-${y}`}
					onClick={() => removeFacet("years", y)}
					className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/80 hover:bg-white/15"
				>
					year:{y}
				</button>
			))}
		</div>
	)

	return (
		<div
			className="fixed inset-y-0 left-0 z-20 flex flex-col w-[340px] p-8 space-y-10 pointer-events-none font-fira-code"
			data-recording-key={recordingKey}
		>
			<SiteHeader />

			{/* The actual sidebar panel. Make this interactive. */}
			<Panel className="flex-1 contain-size" backdropClassName="bg-[rgba(45,40,45,0.35)]">
				<PanelSection title="Explorer" rightSlot={rightSlot}>
					<div className="mb-2">{chips}</div>
					<FileTree
						data={[
							{ id: "sessions", title: "Sessions", children: filteredSessions },
							{ id: "vendors", title: "Vendors", children: filteredVendors },
							{
								id: "categories",
								title: "Categories",
								children: filteredCategories,
							},
						]}
					/>
				</PanelSection>
			</Panel>
		</div>
	)
}
