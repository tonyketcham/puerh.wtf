/**
 * Server half of the lexicon routes: the lexicon built from the same sessions the root layout
 * hydrates (so static params, metadata and the client agree on every word and slug).
 */
import { getServerIndex } from "@/lib/components/entity/page/data"
import { lexiconOf, type Lexicon } from "@/lib/lexicon"
import type { RelationIndex } from "@/lib/relations"

export async function getServerLexicon(): Promise<{ index: RelationIndex; lexicon: Lexicon }> {
	const index = await getServerIndex()
	return { index, lexicon: lexiconOf(index.sessions) }
}
