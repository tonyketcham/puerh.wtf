/**
 * What an entity page knows about its entity, from the relation index: the node, the sessions
 * behind it (rolled up through the origin and style trees), their stats, and the reference it
 * is read against ("vs Xishuangbanna", "vs Sheng", "vs the whole log").
 *
 * Pure module (no React): the page, the Properties panel and the status bar share it.
 */
import { extractDescriptors } from "@/lib/descriptors"
import type { PageKind } from "@/lib/peek"
import { blendColors, liftedColor, type SessionAnalysis } from "@/lib/sessionAnalysis"
import {
	computeStats,
	getEntity,
	sessionsOf,
	type EntityNode,
	type RelationIndex,
} from "@/lib/relations"
import type { ExplorerSession, NoteStage } from "@/lib/types/session"

export type EntityModel = SessionAnalysis & {
	kind: PageKind
	slug: string
	node: EntityNode | null
	/** what the centroid is read against */
	reference: SessionAnalysis["reference"] & { node: EntityNode | null }
}

const WHOLE_LOG = "the whole log"

export function buildEntityModel(
	index: RelationIndex,
	kind: PageKind,
	slug: string,
	fallback: { color?: string | null; parentSlug?: string | null } = {}
): EntityModel {
	const node = getEntity(index, kind, slug)
	const sessions = sessionsOf(index, kind, slug)
	const stats = computeStats(sessions)

	// origin → its parent origin; style → its category; everything else → the whole log
	const parentKind: PageKind | null =
		kind === "origin" ? "origin" : kind === "style" ? "category" : null
	const parentSlug = node?.parent ?? fallback.parentSlug ?? null
	const parent = parentKind && parentSlug ? getEntity(index, parentKind, parentSlug) : null
	const reference = parent
		? {
				label: parent.title,
				node: parent,
				stats: computeStats(sessionsOf(index, parentKind!, parent.slug)),
		  }
		: { label: WHOLE_LOG, node: null, stats: computeStats(index.sessions) }

	const accent = stats.liquor.length
		? blendColors(stats.liquor)
		: node?.color || fallback.color || "#d9a441"

	return {
		kind,
		slug,
		node,
		sessions,
		direct: node?.direct.length ?? 0,
		stats,
		reference,
		accent,
		accentText: liftedColor(accent, 0.32),
	}
}

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

export type DescriptorCount = { term: string; count: number; stages: NoteStage[] }

/** Tasting-note words across an entity's sessions, by how many sessions use them. */
export function topDescriptors(
	sessions: readonly ExplorerSession[],
	limit = 12
): DescriptorCount[] {
	const counts = new Map<string, DescriptorCount>()
	for (const s of sessions) {
		for (const d of extractDescriptors(s.notes)) {
			if (d.term.length < 3 || /^\d/.test(d.term)) continue
			const entry = counts.get(d.term) ?? { term: d.term, count: 0, stages: [] }
			entry.count++
			for (const stage of d.stages) if (!entry.stages.includes(stage)) entry.stages.push(stage)
			counts.set(d.term, entry)
		}
	}
	return [...counts.values()]
		.filter((d) => d.count >= (sessions.length > 2 ? 2 : 1))
		.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
		.slice(0, limit)
}
