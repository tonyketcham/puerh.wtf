"use client"

import { useLayoutEffect } from "react"
import { useSetAtom } from "jotai"
import type { EntityPageData } from "@/lib/content/entities"
import { entityPageAtom } from "./state"

/**
 * Publishes the page's entity to the layout chrome (Properties, status bar) in a layout
 * effect, so on client navigations it lands before paint. (The chrome renders before the page
 * streams in, so on first load it fills in right after hydration; see useHydrated.)
 */
export default function SetEntityPage({ data }: { data: EntityPageData }) {
	const set = useSetAtom(entityPageAtom)

	useLayoutEffect(() => {
		set({ kind: data.kind, slug: data.slug, data })
	}, [data, set])

	return null
}
