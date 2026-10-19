"use client"

import { useLayoutEffect } from "react"
import { useSetAtom } from "jotai"
import { sessionAtom } from "@/lib/store/sessionAtom"
import type { EntityPageData } from "./data"
import { entityPageAtom } from "./state"

/**
 * Publishes the page's entity to the layout chrome (Properties, status bar) in a layout
 * effect, so on client navigations it lands before paint. (The chrome renders before the page
 * streams in, so on first load it fills in right after hydration; see useHydrated.)
 *
 * Also clears the session store: an entity page is no session, so peeks stop calling a tea
 * "this" and the radar compare actions stand down.
 */
export default function SetEntityPage({ data }: { data: EntityPageData }) {
	const set = useSetAtom(entityPageAtom)
	const setSession = useSetAtom(sessionAtom)

	useLayoutEffect(() => {
		set({ kind: data.kind, slug: data.slug, data })
	}, [data, set])

	useLayoutEffect(() => {
		setSession(null)
	}, [setSession])

	return null
}
