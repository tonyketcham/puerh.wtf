"use client"

import { createContext, useContext } from "react"

export type FileTreeContextValue = {
	/**
	 * Descriptor "find references": slug → match order (for staggering the reference dots).
	 * null when no descriptor is selected (nothing dims).
	 */
	referenceMatches: Map<string, number> | null
	/**
	 * Current sort of the rows. Rows glide to their new place only when it changes (not on every
	 * filter), and session rows show their rating while it is "rating".
	 */
	order: string
}

export const FileTreeContext = createContext<FileTreeContextValue>({
	referenceMatches: null,
	order: "date",
})

export function useFileTreeContext() {
	return useContext(FileTreeContext)
}
