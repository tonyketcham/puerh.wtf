"use client"

import { useMemo } from "react"
import { atom, useAtomValue } from "jotai"
import { peekFilter, type PeekTarget } from "@/lib/peek"
import { filtersAtom } from "./filterState"

/** Filter buttons subscribe to their pressed boolean, not every vintage/query change. */
export function useFilterActive({ kind, key }: PeekTarget, id?: string | null): boolean {
	const active = useMemo(
		() => atom((get) => peekFilter({ kind, key }, id)?.active(get(filtersAtom)) ?? false),
		[kind, key, id]
	)
	return useAtomValue(active)
}
