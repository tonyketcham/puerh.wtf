import type { ReactNode } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import SessionCard from "@/lib/components/SessionCard"
import { getOriginPoints } from "@/lib/components/entity/page/data"
import type { DotMapPoint } from "@/lib/components/entity/page/DotMap"
import { LEXICON_GROUP_META, lexiconRefs } from "@/lib/lexicon"
import { entityKeys } from "@/lib/relations"
import LexiconTermPage from "../_components/LexiconTermPage"
import { getServerLexicon } from "../_components/server"

type TermParams = { params: Promise<{ term: string }> }

export const dynamicParams = false

/** Route params arrive percent-encoded for non-ASCII slugs. */
function decodeTerm(term: string): string {
	try {
		return decodeURIComponent(term)
	} catch {
		return term
	}
}

/** A page for every word listed in two or more sessions (plan §2.3). */
export async function generateStaticParams() {
	const { lexicon } = await getServerLexicon()
	return lexicon.paged.map((entry) => ({ term: entry.slug }))
}

export async function generateMetadata({ params }: TermParams): Promise<Metadata> {
	const { index, lexicon } = await getServerLexicon()
	const entry = lexicon.bySlug.get(decodeTerm((await params).term))
	if (!entry) return {}
	const refs = lexiconRefs(index.sessions, entry).length
	const group = LEXICON_GROUP_META[entry.group].label
	return {
		title: `‘${entry.term}’ · lexicon · puerh.wtf`,
		description: `‘${entry.term}’ in the puerh.wtf tea log: ${refs} sessions mention it (${group}). Where it turns up, at which stage, and what it's said with.`,
	}
}

export default async function LexiconTerm({ params }: TermParams) {
	const slug = decodeTerm((await params).term)
	const [{ index, lexicon }, origins] = await Promise.all([getServerLexicon(), getOriginPoints()])
	const entry = lexicon.bySlug.get(slug)
	if (!entry) notFound()

	// one clock for every card, so tapes age against the same "now"
	const now = new Date()
	const sessions = lexiconRefs(index.sessions, entry)
	const cards: Record<string, ReactNode> = {}
	for (const s of sessions) cards[s._slug] = <SessionCard session={s} now={now} />

	// where it's tasted: the origins of its sessions, as dots
	const counts = new Map<string, number>()
	for (const s of sessions) {
		for (const o of entityKeys(s, "origin", { rollup: false }))
			counts.set(o, (counts.get(o) ?? 0) + 1)
	}
	const points: DotMapPoint[] = []
	for (const [o, count] of counts) {
		const p = origins[o]
		if (p) points.push({ slug: p.slug, title: p.title, lat: p.lat, lon: p.lon, count })
	}

	return <LexiconTermPage slug={entry.slug} cards={cards} points={points} />
}
