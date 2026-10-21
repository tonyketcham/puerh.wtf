import { atom } from "jotai/vanilla"
import { countActiveFilters, EMPTY_FACETS, FACET_KEYS, type FilterState } from "@/lib/filters"
import { store } from "./store"

type FilterUpdate = FilterState | ((current: FilterState) => FilterState)
const baseAtom = atom<FilterState>({ q: "", facets: EMPTY_FACETS })

/** Authoritative live filters. The URL is only an initial seed and a lazy output. */
export const filtersAtom = atom(
	(get) => get(baseAtom),
	(get, set, update: FilterUpdate) => {
		const current = get(baseAtom)
		const next = typeof update === "function" ? update(current) : update
		// Preserve unchanged facets so narrow subscribers are not invalidated by other filters.
		const facets = { ...next.facets }
		let changed = current.q !== next.q
		for (const key of FACET_KEYS) {
			const previous = current.facets[key]
			const values = next.facets[key]
			if (previous.length === values.length && previous.every((value, i) => value === values[i]))
				facets[key] = previous
			else changed = true
		}
		if (changed) set(baseAtom, { q: next.q, facets })
	}
)

export const activeFilterCountAtom = atom((get) => countActiveFilters(get(filtersAtom)))
const initializedAtom = atom(false)

/** Once per document/store, including Strict Mode remounts and client-side navigation. */
export const initializeFiltersAtom = atom(null, (get, set, initial: FilterState) => {
	if (get(initializedAtom)) return
	set(initializedAtom, true)
	set(filtersAtom, initial)
})

/** Read current UI state, including changes not yet serialized to the URL. */
export const currentFilters = () => store.get(filtersAtom)

/** Update the same store used by React, including from peek/command callbacks. */
export const replaceFilters = (next: FilterUpdate) => store.set(filtersAtom, next)
