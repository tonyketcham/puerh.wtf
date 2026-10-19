/**
 * EntityPeek targets (plan §3.1): what a peek card can describe, how each kind is named and
 * where its "Open" / "Filter" actions lead. In IDE terms a peek is "Peek Definition"; the
 * entity page is "Go to Definition".
 *
 * Pure module (no React): the trigger hook, the card and the Explorer can all use it.
 */
import { ENTITY_META, entityHref, type EntityKind } from "@/lib/entities"
import { toggleFacet, type FacetKey, type FilterState } from "@/lib/filters"

/** Entity kinds that have (or will have) a page. Tags and vintages are Explorer filters, not peeks. */
export type PageKind = Exclude<EntityKind, "tag" | "year">

/**
 * Everything a peek can show: the page kinds (vessels among them, §3.5) and a tasting-note
 * descriptor (extends "find references").
 */
export type PeekKind = PageKind | "descriptor"

export type PeekTarget = {
	kind: PeekKind
	/** entity slug; the normalized term for descriptors */
	key: string
}

const PAGE_KINDS: readonly PageKind[] = [
	"origin",
	"vendor",
	"style",
	"category",
	"cultivar",
	"vessel",
]

export const isPageKind = (kind: string): kind is PageKind =>
	(PAGE_KINDS as readonly string[]).includes(kind)

export const isPeekKind = (kind: string): kind is PeekKind =>
	isPageKind(kind) || kind === "descriptor"

/** Stable identity of a target, also written to triggers as `data-peek`. */
export const peekId = (target: PeekTarget) => `${target.kind}:${target.key}`

export const samePeek = (a: PeekTarget | null | undefined, b: PeekTarget | null | undefined) =>
	!!a && !!b && a.kind === b.kind && a.key === b.key

export const PEEK_META: Record<PeekKind, { glyph: string; label: string }> = {
	origin: { glyph: ENTITY_META.origin.glyph, label: ENTITY_META.origin.label },
	vendor: { glyph: ENTITY_META.vendor.glyph, label: ENTITY_META.vendor.label },
	style: { glyph: ENTITY_META.style.glyph, label: ENTITY_META.style.label },
	category: { glyph: ENTITY_META.category.glyph, label: ENTITY_META.category.label },
	cultivar: { glyph: ENTITY_META.cultivar.glyph, label: ENTITY_META.cultivar.label },
	vessel: { glyph: ENTITY_META.vessel.glyph, label: ENTITY_META.vessel.label },
	descriptor: { glyph: "‘", label: "descriptor" },
}

/** Page of a target (§2.3 URLs, linked even before Phase 3 builds them), or null. */
export function peekHref(target: PeekTarget): string | null {
	return isPageKind(target.kind) ? entityHref(target.kind, target.key) : null
}

/** Whether the target's page exists yet (links to routes still to come skip prefetch). */
export function peekRouteReady(target: PeekTarget): boolean {
	return isPageKind(target.kind) && ENTITY_META[target.kind].routeReady
}

/** The page named like a file, as the editor tab will title it: `yiwu.origin`, `white2tea.vendor`. */
export const peekFileName = (target: PeekTarget) => `${target.key}.${PEEK_META[target.kind].label}`

// ---------------------------------------------------------------------------
// Filter (⇧↵)
// ---------------------------------------------------------------------------

/** Kinds that map onto an Explorer facet (styles = category slugs; origins roll up). */
const PEEK_FACET: Partial<Record<PeekKind, FacetKey>> = {
	origin: "origins",
	vendor: "vendors",
	category: "styles",
	cultivar: "cultivars",
	vessel: "vessels",
}

/**
 * The Explorer filter a target applies, as a toggle: facet kinds toggle their facet value;
 * styles (no facet of their own yet) and descriptors filter by text, which the Explorer
 * matches against style titles and tasting notes.
 */
export function peekFilter(
	target: PeekTarget,
	title: string
): { active: (state: FilterState) => boolean; toggle: (state: FilterState) => FilterState } | null {
	const facet = PEEK_FACET[target.kind]
	if (facet) {
		return {
			active: (state) => state.facets[facet].includes(target.key),
			toggle: (state) => toggleFacet(state, facet, target.key),
		}
	}
	if (target.kind === "style" || target.kind === "descriptor") {
		const q = (target.kind === "style" ? title : target.key).toLowerCase()
		return {
			active: (state) => state.q.toLowerCase() === q,
			toggle: (state) => ({ ...state, q: state.q.toLowerCase() === q ? "" : q }),
		}
	}
	return null
}
