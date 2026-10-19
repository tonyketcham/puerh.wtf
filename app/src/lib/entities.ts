/**
 * Entity kinds a session points at, and how each one is addressed (plan §2.1–2.3).
 *
 * Glyphs double as the command bar's quick-open prefixes: `@` vendor, `#` tag, `^` origin,
 * `~` style, `:` year. Pure module (no React) so the relation index and server code can use it.
 */

export type EntityKind = "origin" | "vendor" | "style" | "category" | "cultivar" | "tag" | "year"

export const ENTITY_KINDS: readonly EntityKind[] = [
	"origin",
	"vendor",
	"style",
	"category",
	"cultivar",
	"tag",
	"year",
] as const

type EntityKindMeta = {
	glyph: string
	/** singular label, used as the "file type" (`yiwu.origin`) */
	label: string
	/** route segment of the entity page (§2.3); null for kinds that act as Explorer filters */
	route: string | null
	/**
	 * Whether the page route exists yet. Links to routes still to come (Phase 3) skip prefetch so
	 * the static export doesn't log a 404 for every chip on screen.
	 */
	routeReady: boolean
}

export const ENTITY_META: Record<EntityKind, EntityKindMeta> = {
	origin: { glyph: "^", label: "origin", route: "origins", routeReady: false },
	vendor: { glyph: "@", label: "vendor", route: "vendors", routeReady: true },
	style: { glyph: "~", label: "style", route: "styles", routeReady: false },
	category: { glyph: "~", label: "category", route: "categories", routeReady: true },
	cultivar: { glyph: "%", label: "cultivar", route: "cultivars", routeReady: false },
	tag: { glyph: "#", label: "tag", route: null, routeReady: false },
	year: { glyph: ":", label: "vintage", route: null, routeReady: false },
}

/** Page route of an entity (trailing slash, matching `trailingSlash: true`), or null for filter-only kinds. */
export function entityHref(kind: EntityKind, slug: string): string | null {
	const route = ENTITY_META[kind].route
	return route ? `/${route}/${encodeURIComponent(slug)}/` : null
}
