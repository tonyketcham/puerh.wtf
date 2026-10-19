/**
 * What an entity page knows about its entity, from the relation index: the node, the sessions
 * behind it (rolled up through the origin and style trees), their stats, and the reference it
 * is read against ("vs Xishuangbanna", "vs Sheng", "vs the whole log").
 *
 * Pure module (no React): the page, the Properties panel and the status bar share it.
 */
import { extractDescriptors } from "@/lib/descriptors"
import { liftLiquor, type RGB } from "@/lib/liquor"
import type { PageKind } from "@/lib/peek"
import {
	computeStats,
	getEntity,
	sessionColor,
	sessionsOf,
	type EntityNode,
	type EntityStats,
	type RelationIndex,
} from "@/lib/relations"
import type { ExplorerSession, NoteStage } from "@/lib/types/session"

export type EntityModel = {
	kind: PageKind
	slug: string
	node: EntityNode | null
	/** every session behind the entity, newest first (origins and categories roll up) */
	sessions: ExplorerSession[]
	/** sessions that point at the entity itself */
	direct: number
	stats: EntityStats
	/** what the centroid is read against */
	reference: { label: string; node: EntityNode | null; stats: EntityStats }
	/** one color for the entity: its sessions' liquors blended, else its own color */
	accent: string
	/** accent lifted to read as text / hairlines on the #121012 ground */
	accentText: string
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
		accentText: toHex(liftLiquor(hexToRgb(accent) ?? [217, 164, 65], 0.32)),
	}
}

/** Sessions ordered by vintage, oldest first (undated last), for color timelines. */
export function byVintage(sessions: readonly ExplorerSession[]): ExplorerSession[] {
	const year = (s: ExplorerSession) => {
		const y = Math.trunc(Number(s.production_year))
		return Number.isFinite(y) && y > 0 ? y : Infinity
	}
	return [...sessions].sort((a, b) => year(a) - year(b) || a.title.localeCompare(b.title))
}

/** The liquors of a set of sessions as color stops, oldest vintage first. */
export function liquorStops(sessions: readonly ExplorerSession[]): string[] {
	return byVintage(sessions).map(sessionColor)
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

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): RGB | null {
	const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
	if (!m) return null
	const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}

const toHex = (rgb: RGB) =>
	`#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`

const toLinear = (c: number) => {
	const s = c / 255
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const toSrgb = (l: number) =>
	255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.max(0, l) ** (1 / 2.4) - 0.055)

/** A liquor lifted until it reads on the #121012 ground (a dark shou would vanish otherwise). */
export function liftedColor(hex: string, minLuminance = 0.32): string {
	return toHex(liftLiquor(hexToRgb(hex) ?? [217, 164, 65], minLuminance))
}

/** Mean of several colors in linear light (what mixing the liquors would look like). */
export function blendColors(colors: readonly string[]): string {
	const rgbs = colors.map(hexToRgb).filter((c): c is RGB => !!c)
	if (!rgbs.length) return colors[0] ?? "#d9a441"
	const mean = [0, 1, 2].map((i) => rgbs.reduce((sum, c) => sum + toLinear(c[i]), 0) / rgbs.length)
	return toHex(mean.map(toSrgb) as unknown as RGB)
}
