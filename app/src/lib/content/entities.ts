import type { PageKind } from "@/lib/peek"
import type { OriginGeo, OriginKind } from "@/lib/types/origin"

/** One step of a page's breadcrumb, or a child listed under it. */
export type EntityCrumb = {
	kind: PageKind
	slug: string
	title: string
	hanzi?: string | null
	/** origins: what the node is (country … village) */
	originKind?: OriginKind | null
}

/** A row of the Properties panel's Metadata section. */
export type EntityFact = {
	label: string
	value: string
	/** external link (source, website) */
	href?: string
	/** a page link to another entity instead of plain text */
	ref?: EntityCrumb
	title?: string
}

export type EntityLink = { label: string; href: string }

/** What a vessel is (content/vessels). */
export type VesselSpec = {
	/** gaiwan, teapot, shiboridashi, chawan */
	kind: string | null
	material: string | null
	/** what it holds, in ml */
	volume_ml: number | null
}

export type EntityPageData = {
	kind: PageKind
	slug: string
	id: string
	title: string
	hanzi: string | null
	pinyin: string | null
	/** style: its own color, else its category's; category: its color */
	color: string | null
	/** vendor logo */
	image: string | null
	/** full description (markdown) */
	description: string | null
	/** Sanitized Markdown body supplied by Flatbread, separate from the frontmatter description. */
	contentHtml: string | null
	/** root first, not including the entity (origin chain; style → category) */
	ancestors: EntityCrumb[]
	/** every child, tasted or not (origin → origins; category → styles; style → cultivars) */
	children: EntityCrumb[]
	facts: EntityFact[]
	/** origins only */
	geo: OriginGeo | null
	originKind: OriginKind | null
	groups: string[]
	/** vendors only: "Kunming, Yunnan, China" */
	place: string | null
	links: EntityLink[]
	/** origins only: the closest other placed origins, outside its own branch */
	nearby: { crumb: EntityCrumb; km: number }[]
	/** vessels only */
	vessel: VesselSpec | null
}

/** An entity as an index page lists it (all of a kind, tasted or not). */
export type EntityListItem = {
	kind: PageKind
	slug: string
	id: string
	title: string
	hanzi: string | null
	color: string | null
	image: string | null
	/** first sentence or so of the description, plain text */
	summary: string | null
	place: string | null
	/** origin: parent origin slug; style: category slug */
	parent: string | null
	originKind: OriginKind | null
	/** vessels only */
	vessel: VesselSpec | null
}

/** A placed origin as a dot on a small map. */
export type OriginPoint = {
	slug: string
	title: string
	lat: number
	lon: number
	precision: OriginKind
	radius_km: number
}
