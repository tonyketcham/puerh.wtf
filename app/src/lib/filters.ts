/**
 * Pure matching and URL serialization for the shared Explorer/command-bar filters:
 *   ?q=<text>&styles=a,b&origins=…&years=2018,2019&vendors=…&cultivars=…&tags=…&vessels=…
 * (styles = category or style slugs: a category is the top of the style tree, so `sheng` keeps
 * every Sheng style and `blended-sheng` only that one; origins = origin slug/id, rolling up the
 * tree; years = production years as integers.)
 *
 * Live state belongs to store/filterState. FilterUrlSync seeds it once on a fresh load
 * and lazily writes snapshots to the URL; URL edits do not drive the running app.
 */
import type { EntityKind } from "@/lib/entities"
import { sessionMatchesDescriptor } from "@/lib/descriptors"
import { canonicalOriginKey, originKeys, originSearchText } from "@/lib/origins"
import type { ExplorerSession } from "@/lib/types/session"

export const FACET_KEYS = [
	"styles",
	"origins",
	"years",
	"vendors",
	"cultivars",
	"tags",
	"vessels",
] as const
export type FacetKey = typeof FACET_KEYS[number]
export type FacetState = Record<FacetKey, string[]>

export type FilterState = {
	q: string
	facets: FacetState
}

export const EMPTY_FACETS: FacetState = {
	styles: [],
	origins: [],
	years: [],
	vendors: [],
	cultivars: [],
	tags: [],
	vessels: [],
}

type ParamsLike = { get(name: string): string | null }

export function readFilters(params: ParamsLike | null | undefined): FilterState {
	const readList = (k: string) => (params?.get(k) || "").split(",").filter(Boolean)
	return {
		q: params?.get("q") || "",
		facets: {
			styles: readList("styles"),
			origins: readList("origins"),
			years: readList("years"),
			vendors: readList("vendors"),
			cultivars: readList("cultivars"),
			tags: readList("tags"),
			vessels: readList("vessels"),
		},
	}
}

export function hasAnyFilter(state: FilterState): boolean {
	return !!state.q || FACET_KEYS.some((k) => state.facets[k].length > 0)
}

/**
 * How many filters a person would say are on: each facet value counts, except vintages, which
 * the year ruler writes as one range (years=2005,2006,2007…) and so count once.
 */
export function countActiveFilters(state: FilterState): number {
	return FACET_KEYS.reduce(
		(n, k) => n + (k === "years" ? Math.min(1, state.facets.years.length) : state.facets[k].length),
		state.q ? 1 : 0
	)
}

/**
 * Applies a filter state onto existing params (unrelated params are preserved) and returns
 * the search string including "?" (or "" when empty).
 */
export function buildFilterSearch(base: string | URLSearchParams, state: FilterState): string {
	const params = new URLSearchParams(typeof base === "string" ? base : base.toString())
	if (state.q) params.set("q", state.q)
	else params.delete("q")
	for (const key of FACET_KEYS) {
		const list = state.facets[key]
		if (list.length) params.set(key, list.join(","))
		else params.delete(key)
	}
	const s = params.toString()
	return s ? `?${s}` : ""
}

/** Toggle one value in a facet list. */
export function toggleFacet(state: FilterState, key: FacetKey, value: string): FilterState {
	const list = state.facets[key]
	return {
		...state,
		facets: {
			...state.facets,
			[key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
		},
	}
}

// ---------------------------------------------------------------------------
// Entities ↔ facets
// ---------------------------------------------------------------------------

/** The facet each entity kind filters by (styles and categories share `styles`). */
export const ENTITY_FACET: Record<EntityKind, FacetKey> = {
	origin: "origins",
	vendor: "vendors",
	style: "styles",
	category: "styles",
	cultivar: "cultivars",
	vessel: "vessels",
	tag: "tags",
	year: "years",
}

/** Whether an entity's filter is on (an origin also answers to its id and pre-rename slug). */
export function isEntityFiltered(
	state: FilterState,
	kind: EntityKind,
	slug: string,
	id?: string | null
): boolean {
	const list = state.facets[ENTITY_FACET[kind]]
	if (kind !== "origin") return list.includes(slug)
	return list.some((v) => {
		const key = canonicalOriginKey(v)
		return key === slug || (!!id && key === id)
	})
}

/** Toggle an entity's filter. Turning an origin off also drops it under its id or a legacy slug. */
export function toggleEntityFilter(
	state: FilterState,
	kind: EntityKind,
	slug: string,
	id?: string | null
): FilterState {
	if (kind === "origin" && isEntityFiltered(state, kind, slug, id)) {
		return {
			...state,
			facets: {
				...state.facets,
				origins: state.facets.origins.filter((v) => {
					const key = canonicalOriginKey(v)
					return key !== slug && (!id || key !== id)
				}),
			},
		}
	}
	return toggleFacet(state, ENTITY_FACET[kind], slug)
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Lowercased text plus its diacritic-free spelling, so "yiwu" finds Yìwǔ and "da ye" Dà Yè Zhòng. */
export function searchForms(text: string): string[] {
	const lower = text.toLowerCase()
	const bare = lower.normalize("NFD").replace(/\p{M}/gu, "")
	return bare === lower ? [lower] : [lower, bare]
}

const yearOf = (s: ExplorerSession) =>
	s.production_year ? String(Math.trunc(Number(s.production_year))) : ""

/**
 * Whether a session passes the facets and the free-text query (lowercased and trimmed).
 * `ignore` skips facets: the year ruler ignores years so its density stays informative
 * mid-selection; an Explorer entity view ignores its own facet, so a vendor filter still
 * leaves the other vendors on offer.
 */
export function matchesFilters(
	s: ExplorerSession,
	facets: FacetState,
	query: string,
	{ ignore = [] }: { ignore?: readonly FacetKey[] } = {}
): boolean {
	const on = (key: FacetKey) => facets[key].length > 0 && !ignore.includes(key)
	if (on("styles")) {
		// a category slug keeps every style in it; a style slug (or id) keeps that style
		const keys = (s.style || []).flatMap((st) => [st.category?._slug, st._slug, st.id])
		if (!facets.styles.some((slug) => keys.includes(slug))) return false
	}
	if (on("years") && !facets.years.includes(yearOf(s))) return false
	if (on("vendors")) {
		const vendorSlugs = (s.vendor || []).map((v) => v._slug)
		if (!facets.vendors.some((slug) => vendorSlugs.includes(slug))) return false
	}
	if (on("cultivars")) {
		const cultivarSlugs = (s.cultivar || []).map((c) => c._slug)
		if (!facets.cultivars.some((slug) => cultivarSlugs.includes(slug))) return false
	}
	if (on("tags")) {
		const tagSlugs = (s.tags || []).map((t) => t?._slug || "")
		if (!facets.tags.some((slug) => tagSlugs.includes(slug))) return false
	}
	if (on("vessels")) {
		const vesselSlugs = (s.vessel || []).map((v) => v?._slug || "")
		if (!facets.vessels.some((slug) => vesselSlugs.includes(slug))) return false
	}
	if (on("origins")) {
		// slug or id of the origin or any ancestor (so a Yiwu filter keeps its villages); legacy
		// long slugs from old shared URLs map to the current ones
		const keys = (s.origin || []).flatMap(originKeys)
		if (!facets.origins.some((value) => keys.includes(canonicalOriginKey(value)))) return false
	}

	if (!query) return true
	const haystack = [
		s.title,
		String(s.production_year || ""),
		...(s.vendor || []).map((v) => v.title),
		...(s.cultivar || []).map((c) => c.title),
		...(s.tags || []).map((t) => t?.title || ""),
		...(s.vessel || []).map((v) => v?.title || ""),
		...(s.origin || []).flatMap((o) => [...originSearchText(o), o?._slug]),
		s.origin_note || "",
		...(s.style || []).flatMap((st) => [st.title, st.category?.title]),
	]
		.filter(Boolean)
		.flatMap((t) => searchForms(String(t)))
	if (haystack.some((t) => t.includes(query))) return true
	// flavors: the command bar writes ?q=<descriptor> when a flavor is picked, so q also finds
	// sessions whose tasting notes mention it (plural-tolerant, word-bounded)
	return query.length >= 3 && sessionMatchesDescriptor(s, query)
}
