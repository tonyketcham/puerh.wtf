/**
 * URL search params are the shared filter state for the Explorer and the command bar:
 *   ?q=<text>&styles=a,b&origins=…&years=2018,2019&vendors=…&cultivars=…&tags=…
 * (styles = category slugs, origins = origin slug/id, years = production years as integers.)
 *
 * Write with `replaceFilters()` (history.replaceState, which Next's router observes, so
 * useSearchParams() updates without a server round-trip). The Explorer reacts to any change.
 */

export const FACET_KEYS = ["styles", "origins", "years", "vendors", "cultivars", "tags"] as const
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

/** Current filters from window.location (client only). */
export function currentFilters(): FilterState {
	if (typeof window === "undefined") return { q: "", facets: { ...EMPTY_FACETS } }
	return readFilters(new URLSearchParams(window.location.search))
}

/**
 * Replace the URL's filter params on the current pathname without navigation/scroll.
 * Accepts a full state or an updater of the current state.
 */
export function replaceFilters(next: FilterState | ((current: FilterState) => FilterState)) {
	if (typeof window === "undefined") return
	const current = currentFilters()
	const state = typeof next === "function" ? next(current) : next
	const search = buildFilterSearch(window.location.search, state)
	const url = `${window.location.pathname}${search}${window.location.hash}`
	if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
		// pass null state: Next patches replaceState and only syncs its router (useSearchParams)
		// for calls that don't carry its own internal state object
		window.history.replaceState(null, "", url)
	}
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
