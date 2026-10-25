"use client"

/**
 * The entity page currently open, for chrome that lives in the persistent per-kind layout
 * (Properties panel, status bar) rather than the page: the server-only parts of the entity
 * (facts, geo, description). Everything relational is read from relationIndexAtom by
 * kind + slug, which the layout knows from the URL.
 */
import { useSyncExternalStore } from "react"
import { atom } from "jotai"
import type { PageKind } from "@/lib/peek"
import type { EntityPageData } from "@/lib/content/entities"

export type EntityPageState = { kind: PageKind; slug: string; data: EntityPageData }

export const entityPageAtom = atom<EntityPageState | null>(null)

export const entityKey = (kind: PageKind, slug: string) => `${kind}:${slug}`

const noop = () => () => {}

/** false on the server and during hydration, true after: for chrome the page data arrives late to. */
export function useHydrated(): boolean {
	return useSyncExternalStore(
		noop,
		() => true,
		() => false
	)
}
