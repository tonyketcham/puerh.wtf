"use client"

import { useMemo } from "react"
import { useAtomValue } from "jotai"
import { lexiconOf } from "@/lib/lexicon"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import { buildWordModel } from "@/lib/components/lexicon/model"

/** A word of the lexicon by slug, with its model, from the client relation index. */
export function useLexiconWord(slug: string | null) {
	const index = useAtomValue(relationIndexAtom)
	return useMemo(() => {
		const lexicon = lexiconOf(index.sessions)
		const entry = slug ? lexicon.bySlug.get(slug) ?? null : null
		return { index, lexicon, entry, model: entry ? buildWordModel(index, entry) : null }
	}, [index, slug])
}
