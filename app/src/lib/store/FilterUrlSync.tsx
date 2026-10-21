"use client"

import { useEffect, useLayoutEffect } from "react"
import { usePathname } from "next/navigation"
import { useStore } from "jotai"
import { buildFilterSearch, readFilters } from "@/lib/filters"
import { filtersAtom, initializeFiltersAtom } from "./filterState"

const URL_DELAY_MS = 300

/** Read once on load; thereafter the address bar follows the atom, never the reverse. */
export default function FilterUrlSync() {
	const store = useStore()
	const pathname = usePathname()

	useLayoutEffect(() => {
		store.set(initializeFiltersAtom, readFilters(new URLSearchParams(window.location.search)))
	}, [store])

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined
		const write = () => {
			const { pathname, search, hash } = window.location
			const next = `${pathname}${buildFilterSearch(search, store.get(filtersAtom))}${hash}`
			if (next === `${pathname}${search}${hash}`) return
			// Call the browser method, bypassing Next's instance-level router patch. Keep its
			// history metadata intact so subsequent navigation/back/forward still work.
			History.prototype.replaceState.call(window.history, window.history.state, "", next)
		}
		const schedule = () => {
			clearTimeout(timer)
			timer = setTimeout(write, URL_DELAY_MS)
		}
		const unsubscribe = store.sub(filtersAtom, schedule)
		// Client navigation may drop query params; mirror the retained atom onto the new path.
		schedule()
		return () => {
			unsubscribe()
			clearTimeout(timer)
		}
	}, [store, pathname])

	return null
}
