"use client"

import { createContext, useContext } from "react"

export type FileTreeContextValue = {
	/**
	 * Descriptor "find references": slug → match order (for staggering the reference dots).
	 * null when no descriptor is selected (nothing dims).
	 */
	referenceMatches: Map<string, number> | null
}

export const FileTreeContext = createContext<FileTreeContextValue>({ referenceMatches: null })

export function useFileTreeContext() {
	return useContext(FileTreeContext)
}
