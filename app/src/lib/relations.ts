/**
 * Relation index: every entity a session points at, and every session behind every entity
 * (plan §2.4). Built on the client from the Explorer's session list (getExplorerSessions(),
 * already loaded in the root layout), so peeks, pages and the Properties panel never fetch.
 *
 * Two trees roll up:
 * - origin: a session counts for its origin and every ancestor (Gua Feng Zhai → Yiwu → … → China)
 * - style: a session counts for its style and that style's category
 *
 * Pure functions over plain data: no React, no jotai (see relationIndexAtom for the shared one).
 * Entities are keyed by `_slug`; origin ids and pre-rename origin slugs resolve too.
 */
import type { EntityKind } from "@/lib/entities"
import { canonicalOriginKey, originChain } from "@/lib/origins"
import { getLiquorColor, LIQUOR_FALLBACK } from "@/lib/liquor"
import type { OriginKind, OriginRef } from "@/lib/types/origin"
import {
	FLAVOR_AXES,
	type ExplorerSession,
	type FlavorAxis,
	type SessionFlavorAxes,
} from "@/lib/types/session"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityNode = {
	kind: EntityKind
	slug: string
	title: string
	id?: string
	/** tag / category color; a style's own color, else its category's */
	color?: string | null
	/** parent in its tree: origin → origin, style → category */
	parent?: string | null
	hanzi?: string | null
	pinyin?: string | null
	originKind?: OriginKind | null
	image?: string | null
	/** sessions that reference this entity themselves, in index order (category: via its styles) */
	direct: readonly string[]
	/** direct plus every descendant's sessions (equals direct for flat kinds) */
	all: readonly string[]
}

export type RelationIndex = {
	/** in the order given (getExplorerSessions: newest session first) */
	sessions: readonly ExplorerSession[]
	bySlug: ReadonlyMap<string, ExplorerSession>
	nodes: Readonly<Record<EntityKind, ReadonlyMap<string, EntityNode>>>
	/** child slugs per node, for the two trees (origin, category → style) */
	children: Readonly<Record<EntityKind, ReadonlyMap<string, readonly string[]>>>
	/** origin and style ids → slug (legacy origin slugs resolve through canonicalOriginKey) */
	aliases: Readonly<Record<EntityKind, ReadonlyMap<string, string>>>
}

export type EntityStats = {
	count: number
	/** [oldest, newest] production year, null when no session has one */
	years: [number, number] | null
	avgRating: number | null
	/** mean start/finish per flavor axis across the sessions that have a profile */
	centroid: SessionFlavorAxes | null
	/** one color per session, same order: measured liquor, else the category color */
	liquor: string[]
}

export type RollupOption = {
	/** count sessions of descendants too (default true) */
	rollup?: boolean
}

// ---------------------------------------------------------------------------
// Keys a session answers to
// ---------------------------------------------------------------------------

const unique = <T>(list: T[]) => [...new Set(list)]

const yearKey = (s: ExplorerSession) =>
	s.production_year ? String(Math.trunc(Number(s.production_year))) : null

/**
 * The entity slugs of one kind that a session points at. With rollup (the default), origins
 * include every ancestor. Categories are always reached through the session's styles.
 */
export function entityKeys(
	session: ExplorerSession,
	kind: EntityKind,
	{ rollup = true }: RollupOption = {}
): string[] {
	switch (kind) {
		case "origin":
			return unique(
				(session.origin || []).flatMap((o) =>
					rollup ? originChain(o).map((node) => node._slug) : o ? [o._slug] : []
				)
			)
		case "vendor":
			return unique((session.vendor || []).map((v) => v._slug).filter(Boolean))
		case "style":
			return unique((session.style || []).map((st) => st._slug || st.id).filter(Boolean))
		case "category":
			return unique((session.style || []).map((st) => st.category?._slug).filter(Boolean))
		case "cultivar":
			return unique((session.cultivar || []).map((c) => c._slug).filter(Boolean))
		case "vessel":
			return unique((session.vessel || []).map((v) => v?._slug).filter(Boolean))
		case "tag":
			return unique((session.tags || []).map((t) => t?._slug).filter(Boolean))
		case "year": {
			const year = yearKey(session)
			return year ? [year] : []
		}
	}
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

type MutableNode = Omit<EntityNode, "direct" | "all"> & { direct: string[]; all: string[] }

const kindRecord = <T>(make: () => T): Record<EntityKind, T> => ({
	origin: make(),
	vendor: make(),
	style: make(),
	category: make(),
	cultivar: make(),
	vessel: make(),
	tag: make(),
	year: make(),
})

export function buildRelationIndex(sessions: readonly ExplorerSession[]): RelationIndex {
	const nodes = kindRecord(() => new Map<string, MutableNode>())
	const children = kindRecord(() => new Map<string, string[]>())
	const aliases = kindRecord(() => new Map<string, string>())

	const ensure = (
		kind: EntityKind,
		slug: string,
		init: Omit<MutableNode, "kind" | "slug" | "direct" | "all">
	) => {
		let node = nodes[kind].get(slug)
		if (!node) {
			node = { kind, slug, ...init, direct: [], all: [] }
			nodes[kind].set(slug, node)
		}
		return node
	}
	const link = (kind: EntityKind, parent: string, child: string) => {
		const list = children[kind].get(parent) ?? []
		if (!list.includes(child)) list.push(child)
		children[kind].set(parent, list)
	}

	for (const s of sessions) {
		// register nodes (first sighting wins; refs to one entity carry the same fields)
		for (const origin of s.origin || []) {
			let parent: string | null = null
			for (const o of originChain(origin)) {
				ensure("origin", o._slug, {
					id: o.id,
					title: o.title,
					hanzi: o.hanzi,
					pinyin: o.pinyin,
					originKind: o.kind,
					parent,
				})
				aliases.origin.set(o.id, o._slug)
				if (parent) link("origin", parent, o._slug)
				parent = o._slug
			}
		}
		for (const v of s.vendor || []) ensure("vendor", v._slug, { title: v.title, image: v.image })
		for (const st of s.style || []) {
			const slug = st._slug || st.id
			const category = st.category
			if (category?._slug) {
				ensure("category", category._slug, { title: category.title, color: category.color })
				link("category", category._slug, slug)
			}
			ensure("style", slug, {
				id: st.id,
				title: st.title,
				color: st.color || category?.color,
				parent: category?._slug ?? null,
			})
			if (st.id) aliases.style.set(st.id, slug)
		}
		for (const c of s.cultivar || []) ensure("cultivar", c._slug, { id: c.id, title: c.title })
		for (const v of s.vessel || [])
			if (v?._slug)
				ensure("vessel", v._slug, { id: v.id, title: v.title, hanzi: v.hanzi, image: v.image })
		for (const t of s.tags || [])
			if (t?._slug) ensure("tag", t._slug, { title: t.title, color: t.color })
		const year = yearKey(s)
		if (year) ensure("year", year, { title: year })

		// attach the session
		for (const kind of Object.keys(nodes) as EntityKind[]) {
			const direct = new Set(entityKeys(s, kind, { rollup: false }))
			for (const key of entityKeys(s, kind)) {
				const node = nodes[kind].get(key)
				if (!node) continue
				node.all.push(s._slug)
				if (direct.has(key)) node.direct.push(s._slug)
			}
		}
	}

	return {
		sessions,
		bySlug: new Map(sessions.map((s) => [s._slug, s] as const)),
		nodes,
		children,
		aliases,
	}
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Slug for any key an entity answers to: its slug, an id, or (origins) a legacy slug. */
export function resolveKey(index: RelationIndex, kind: EntityKind, key: string): string | null {
	if (index.nodes[kind].has(key)) return key
	const alias = index.aliases[kind].get(key) ?? (kind === "origin" ? canonicalOriginKey(key) : null)
	return alias && index.nodes[kind].has(alias) ? alias : null
}

export function getEntity(index: RelationIndex, kind: EntityKind, key: string): EntityNode | null {
	const slug = resolveKey(index, kind, key)
	return slug ? index.nodes[kind].get(slug) ?? null : null
}

/** Sessions behind an entity, in index order. Rolls up through the origin and style trees by default. */
export function sessionsOf(
	index: RelationIndex,
	kind: EntityKind,
	key: string,
	{ rollup = true }: RollupOption = {}
): ExplorerSession[] {
	const node = getEntity(index, kind, key)
	if (!node) return []
	return (rollup ? node.all : node.direct)
		.map((slug) => index.bySlug.get(slug))
		.filter((s): s is ExplorerSession => !!s)
}

/** Ancestors of an origin or style, root first (China › Yunnan › …), not including the node itself. */
export function ancestorsOf(index: RelationIndex, kind: EntityKind, key: string): EntityNode[] {
	const chain: EntityNode[] = []
	const seen = new Set<string>()
	let node = getEntity(index, kind, key)
	const parentKind: EntityKind = kind === "style" ? "category" : kind
	while (node?.parent && !seen.has(node.parent)) {
		seen.add(node.parent)
		node = index.nodes[parentKind].get(node.parent) ?? null
		if (node) chain.unshift(node)
	}
	return chain
}

/**
 * Co-occurrence counts: a → b → number of sessions that point at both (origin↔vendor,
 * origin↔style, style↔cultivar, vendor↔style, tag↔tag…). Origins roll up by default, so a
 * Gua Feng Zhai session counts for Yiwu too. For one kind with itself, self-pairs are skipped.
 */
export function cooccur(
	index: RelationIndex,
	kindA: EntityKind,
	kindB: EntityKind,
	{ rollup = true }: RollupOption = {}
): Map<string, Map<string, number>> {
	const out = new Map<string, Map<string, number>>()
	for (const s of index.sessions) {
		const as = entityKeys(s, kindA, { rollup })
		const bs = kindA === kindB ? as : entityKeys(s, kindB, { rollup })
		for (const a of as) {
			for (const b of bs) {
				if (kindA === kindB && a === b) continue
				const row = out.get(a) ?? new Map<string, number>()
				row.set(b, (row.get(b) ?? 0) + 1)
				out.set(a, row)
			}
		}
	}
	return out
}

/** Entities of `other` kind that share sessions with one entity, most shared first. */
export function related(
	index: RelationIndex,
	kind: EntityKind,
	key: string,
	other: EntityKind,
	{ rollup = true }: RollupOption = {}
): { node: EntityNode; count: number }[] {
	const self = resolveKey(index, kind, key)
	const counts = new Map<string, number>()
	for (const s of sessionsOf(index, kind, key, { rollup })) {
		for (const b of entityKeys(s, other, { rollup })) {
			if (other === kind && b === self) continue
			counts.set(b, (counts.get(b) ?? 0) + 1)
		}
	}
	return [...counts]
		.map(([slug, count]) => ({ node: index.nodes[other].get(slug), count }))
		.filter((r): r is { node: EntityNode; count: number } => !!r.node)
		.sort((a, b) => b.count - a.count || a.node.title.localeCompare(b.node.title))
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** A session's color: its measured liquor, else its category color, else the amber fallback. */
export function sessionColor(session: ExplorerSession): string {
	const liquor = getLiquorColor(session._slug)
	if (liquor.measured) return liquor.hex
	const style = session.style?.[0]
	return style?.category?.color || style?.color || LIQUOR_FALLBACK.hex
}

/** Mean start/finish per flavor axis; null when no session has a profile. */
export function flavorCentroid(sessions: readonly ExplorerSession[]): SessionFlavorAxes | null {
	const profiles = sessions.map((s) => s.flavor_axes).filter((f): f is SessionFlavorAxes => !!f)
	if (!profiles.length) return null
	const mean = (axis: FlavorAxis, end: "start" | "finish") =>
		profiles.reduce((sum, p) => sum + (Number(p[axis]?.[end]) || 0), 0) / profiles.length
	return Object.fromEntries(
		FLAVOR_AXES.map((axis) => [axis, { start: mean(axis, "start"), finish: mean(axis, "finish") }])
	) as SessionFlavorAxes
}

/** Count, vintage span, mean rating, flavor centroid and colors of a set of sessions. */
export function computeStats(sessions: readonly ExplorerSession[]): EntityStats {
	const years = sessions
		.map((s) => Math.trunc(Number(s.production_year)))
		.filter((y) => Number.isFinite(y) && y > 0)
	const ratings = sessions
		.map((s) => s.rating)
		.filter((r): r is number => typeof r === "number" && Number.isFinite(r))
	return {
		count: sessions.length,
		years: years.length ? [Math.min(...years), Math.max(...years)] : null,
		avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
		centroid: flavorCentroid(sessions),
		liquor: sessions.map(sessionColor),
	}
}

export function stats(
	index: RelationIndex,
	kind: EntityKind,
	key: string,
	options?: RollupOption
): EntityStats {
	return computeStats(sessionsOf(index, kind, key, options))
}

/**
 * Where a session's rating places it among all rated sessions (1 = best; ties share a rank).
 * Null when the session has no rating.
 */
export function ratingRank(
	index: RelationIndex,
	slug: string
): { rank: number; of: number } | null {
	const rating = index.bySlug.get(slug)?.rating
	if (typeof rating !== "number") return null
	const rated = index.sessions.filter((s) => typeof s.rating === "number")
	return { rank: 1 + rated.filter((s) => (s.rating as number) > rating).length, of: rated.length }
}

// ---------------------------------------------------------------------------
// Origin trails
// ---------------------------------------------------------------------------

/**
 * A session's origins as one breadcrumb: the chain they all share, root first, plus what's
 * left of each chain below it. One origin → its whole chain is `common` and `tails` is empty.
 * The six origins of a blend from across Xishuangbanna → common: China › Yunnan ›
 * Xishuangbanna, tails: [Mengla › Yiwu], [Menghai › Bulang], …
 */
export function splitOriginTrail(
	origins: readonly (OriginRef | null | undefined)[] | null | undefined
): {
	common: OriginRef[]
	tails: OriginRef[][]
} {
	const seen = new Set<string>()
	const chains = (origins || [])
		.map((o) => originChain(o))
		.filter((chain) => {
			const leaf = chain[chain.length - 1]
			if (!leaf || seen.has(leaf.id)) return false
			seen.add(leaf.id)
			return true
		})
	if (!chains.length) return { common: [], tails: [] }
	if (chains.length === 1) return { common: chains[0], tails: [] }
	let depth = 0
	while (
		depth < Math.min(...chains.map((c) => c.length)) &&
		chains.every((c) => c[depth].id === chains[0][depth].id)
	)
		depth++
	// a chain that ends at the shared node (Yiwu itself next to a Yiwu village) leaves no tail
	return {
		common: chains[0].slice(0, depth),
		tails: chains.map((c) => c.slice(depth)).filter((t) => t.length > 0),
	}
}
