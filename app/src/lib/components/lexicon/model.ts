/**
 * A lexicon word read the way the entity page template reads an entity: its sessions (find
 * all references), their stats, the whole log as reference, and one blended liquor color.
 * Pure module (no React): the page, the Properties panel and the status bar share it.
 */
import { blendColors, liftedColor, type EntityModel } from "@/lib/components/entity/page/model"
import { lexiconRefs, type LexiconEntry } from "@/lib/lexicon"
import { computeStats, sessionColor, type RelationIndex } from "@/lib/relations"
import type { ExplorerSession } from "@/lib/types/session"

export type WordModel = EntityModel & { entry: LexiconEntry }

const FALLBACK = "#d9a441"

export function buildWordModel(index: RelationIndex, entry: LexiconEntry): WordModel {
	const sessions = lexiconRefs(index.sessions, entry) as ExplorerSession[]
	const stats = computeStats(sessions)
	const accent = stats.liquor.length ? blendColors(stats.liquor) : FALLBACK
	return {
		// EntityModel's kind only decides whether references group under children (origins,
		// categories); a word is flat, like a vendor
		kind: "vendor",
		slug: entry.slug,
		node: null,
		sessions,
		direct: sessions.length,
		stats,
		reference: { label: "the whole log", node: null, stats: computeStats(index.sessions) },
		accent,
		accentText: liftedColor(accent, 0.32),
		entry,
	}
}

/** One color for a word on the index: the liquors of the sessions that list it, blended. */
export function wordColor(index: RelationIndex, entry: LexiconEntry): string {
	const colors = entry.listed
		.map((slug) => index.bySlug.get(slug))
		.filter((s): s is ExplorerSession => !!s)
		.map(sessionColor)
	return liftedColor(colors.length ? blendColors(colors) : FALLBACK, 0.36)
}
