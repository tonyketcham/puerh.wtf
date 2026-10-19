/**
 * Shared plumbing for the Explorer's entity views (Origins, Vendors, Styles): what each view
 * receives, and how a view counts sessions per entity under the current filters.
 */
import type { EntityKind } from "@/lib/entities"
import type { PageKind } from "@/lib/peek"
import type { FilterState } from "@/lib/filters"
import { entityKeys, type RelationIndex } from "@/lib/relations"
import type { ExplorerSession } from "@/lib/types/session"

export type EntityViewProps = {
	index: RelationIndex
	/** sessions passing every filter except this view's own facet */
	pool: readonly ExplorerSession[]
	/** the URL filters, for each row's filtered state */
	filters: FilterState
	/** whether any filter or query is narrowing the sessions */
	narrowed: boolean
	/** the current pathname without its trailing slash */
	pathname: string
	onToggleFilter: (kind: PageKind, slug: string) => void
}

/** Sessions per entity slug (rolled up through the origin tree by default). */
export function countBy(
	sessions: readonly ExplorerSession[],
	kind: EntityKind,
	{ rollup = true }: { rollup?: boolean } = {}
): Map<string, ExplorerSession[]> {
	const out = new Map<string, ExplorerSession[]>()
	for (const s of sessions) {
		for (const key of entityKeys(s, kind, { rollup })) {
			const list = out.get(key)
			if (list) list.push(s)
			else out.set(key, [s])
		}
	}
	return out
}

export const stripSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p)
