/**
 * What a peek card knows about its target, all from the client-side relation index (no fetch):
 * the entity node, its ancestors, the sessions behind it and their stats.
 */
import { sessionMatchesDescriptor } from "@/lib/descriptors"
import { isPageKind, type PeekTarget } from "@/lib/peek"
import {
	ancestorsOf,
	computeStats,
	getEntity,
	sessionsOf,
	type EntityNode,
	type EntityStats,
	type RelationIndex,
} from "@/lib/relations"
import { FLAVOR_AXES, type ExplorerSession, type FlavorAxis } from "@/lib/types/session"

export type PeekModel = {
	target: PeekTarget
	title: string
	node: EntityNode | null
	/** root first, not including the node (origins, and style → category) */
	ancestors: EntityNode[]
	/** every session behind the target (origins and categories roll up), newest first */
	sessions: ExplorerSession[]
	/** sessions that reference the target itself (equals sessions.length for flat kinds) */
	direct: number
	stats: EntityStats
}

export function buildPeekModel(index: RelationIndex, target: PeekTarget): PeekModel {
	const { kind, key } = target
	if (isPageKind(kind)) {
		const node = getEntity(index, kind, key)
		const sessions = sessionsOf(index, kind, key)
		return {
			target,
			title: node?.title ?? key,
			node,
			ancestors: node ? ancestorsOf(index, kind, key) : [],
			sessions,
			direct: node?.direct.length ?? sessions.length,
			stats: computeStats(sessions),
		}
	}
	// descriptors: every session whose notes use the word
	const sessions = index.sessions.filter((s) => sessionMatchesDescriptor(s, key))
	return {
		target,
		title: key,
		node: null,
		ancestors: [],
		sessions: [...sessions],
		direct: sessions.length,
		stats: computeStats(sessions),
	}
}

/** The axes a centroid leans on: highest mean of start and finish, strongest first. */
export function dominantAxes(stats: EntityStats, count = 3): FlavorAxis[] {
	const centroid = stats.centroid
	if (!centroid) return []
	return [...FLAVOR_AXES]
		.map((axis) => ({ axis, v: (centroid[axis].start + centroid[axis].finish) / 2 }))
		.filter((a) => a.v >= 1)
		.sort((a, b) => b.v - a.v)
		.slice(0, count)
		.map((a) => a.axis)
}

/**
 * Sessions to list on the card: best rated first, without the one you're reading (it would
 * only point back at itself), unless it's the only one.
 */
export function featuredSessions(
	sessions: readonly ExplorerSession[],
	currentSlug: string | null,
	limit = 3
): { shown: ExplorerSession[]; more: number } {
	const others = sessions.filter((s) => s._slug !== currentSlug)
	const pool = others.length ? others : [...sessions]
	const ranked = [...pool].sort(
		(a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title)
	)
	return { shown: ranked.slice(0, limit), more: Math.max(0, pool.length - limit) }
}
