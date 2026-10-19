/**
 * Server-side data for entity pages and their indexes (plan §3.2, §3.3): everything the
 * relation index doesn't carry because it only knows entities some session points at.
 *
 * - every entity of a kind, used or not (generateStaticParams; "not yet tasted" rows)
 * - full descriptions (markdown), vendor links, origin geo, the origin tree with unused nodes
 *
 * Sessions, counts, centroids and cross-links come from the client-side relation index
 * (relationIndexAtom), so these payloads stay small. One Flatbread query per kind, memoized
 * per request with React's cache().
 */
import { cache } from "react"
import { gql, GraphQLClient } from "graphql-request"
import { getExplorerSessions } from "@/lib/api"
import type { PageKind } from "@/lib/peek"
import { buildRelationIndex, type RelationIndex } from "@/lib/relations"
import type { OriginGeo, OriginKind } from "@/lib/types/origin"

const flatbread = new GraphQLClient(process.env.FLATBREAD_URL || "http://localhost:5057/graphql", {
	headers: {},
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Raw queries (one per kind, every field the pages use)
// ---------------------------------------------------------------------------

type RawRef = { _slug?: string | null; id?: string | null; title?: string | null } | null
type RawOrigin = RawRef & {
	hanzi?: string | null
	pinyin?: string | null
	kind?: string | null
	parent?: RawOrigin
}
type Raw = RawRef & {
	hanzi?: string | null
	pinyin?: string | null
	kind?: string | null
	color?: string | null
	image?: string | null
	description?: string | null
	location?: string | null
	municipality?: string | null
	country?: string | null
	groups?: (string | null)[] | null
	links?: Record<string, string | null> | null
	geo?: Record<string, unknown> | null
	category?: (RawRef & { color?: string | null }) | null
	styles?: (RawRef & { category?: RawRef | null })[] | null
	parent?: RawOrigin
}

/** village → … → country is 6 nodes (see ORIGIN_DEPTH in lib/api.ts); one extra level of slack */
const ORIGIN_DEPTH = 7
const ORIGIN_NODE = `_slug id title hanzi pinyin kind`
const ORIGIN_PARENTS = Array.from({ length: ORIGIN_DEPTH - 1 }).reduce<string>(
	(inner) => `${ORIGIN_NODE} parent { ${inner} }`,
	ORIGIN_NODE
)

const QUERIES: Record<PageKind, { root: string; query: string }> = {
	vendor: {
		root: "allVendors",
		query: gql`
			query EntityPageVendors {
				allVendors(sortBy: "_slug") {
					_slug
					id
					title
					image
					description
					location
					municipality
					country
					links {
						website
						instagram
						twitter
						facebook
						youtube
					}
				}
			}
		`,
	},
	origin: {
		root: "allOrigins",
		query: gql`
			query EntityPageOrigins {
				allOrigins(sortBy: "_slug") {
					description
					groups
					geo {
						lat
						lon
						precision
						radius_km
						elevation_m
						confidence
						source
					}
					${ORIGIN_PARENTS}
				}
			}
		`,
	},
	style: {
		root: "allStyles",
		query: gql`
			query EntityPageStyles {
				allStyles(sortBy: "_slug") {
					_slug
					id
					title
					color
					description
					category {
						_slug
						id
						title
						color
					}
				}
			}
		`,
	},
	category: {
		root: "allCategories",
		query: gql`
			query EntityPageCategories {
				allCategories(sortBy: "_slug") {
					_slug
					id
					title
					color
					description
				}
			}
		`,
	},
	cultivar: {
		root: "allVarietals",
		query: gql`
			query EntityPageCultivars {
				allVarietals(sortBy: "_slug") {
					_slug
					id
					title
					hanzi
					description
					styles {
						_slug
						id
						title
					}
				}
			}
		`,
	},
}

/**
 * Memoized per request in dev (content edits show up on reload) and per build worker in a
 * production build, where ~200 pages prerender in parallel against one local Flatbread server:
 * a handful of queries per worker instead of several per page.
 */
function memo<A extends string | void, T>(fn: (arg: A) => Promise<T>): (arg: A) => Promise<T> {
	if (process.env.NODE_ENV !== "production") return cache(fn)
	const results = new Map<A, Promise<T>>()
	return (arg: A) => {
		let hit = results.get(arg)
		if (!hit) {
			hit = fn(arg)
			// a failed request shouldn't poison the worker for every later page
			hit.catch(() => results.delete(arg))
			results.set(arg, hit)
		}
		return hit
	}
}

const loadAll = memo(async (kind: PageKind): Promise<Raw[]> => {
	const { root, query } = QUERIES[kind]
	const data: Record<string, Raw[] | null> = await flatbread.request(query)
	return (data[root] || []).filter((r): r is Raw => !!r?._slug)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)

/** Root-first ancestors of a raw origin (not including it). */
function originAncestors(raw: Raw): EntityCrumb[] {
	const chain: EntityCrumb[] = []
	const seen = new Set<string>([raw.id || ""])
	for (let node = raw.parent; node?._slug && !seen.has(node.id || node._slug); node = node.parent) {
		seen.add(node.id || node._slug)
		chain.unshift({
			kind: "origin",
			slug: node._slug,
			title: node.title || node._slug,
			hanzi: text(node.hanzi),
			originKind: (text(node.kind) as OriginKind | null) ?? null,
		})
	}
	return chain
}

function geoOf(raw: Raw): OriginGeo | null {
	const g = raw.geo
	const lat = num(g?.lat)
	const lon = num(g?.lon)
	if (lat === undefined || lon === undefined) return null
	const range = Array.isArray(g?.elevation_m)
		? (g!.elevation_m as unknown[]).map(num).filter((n): n is number => n !== undefined)
		: []
	return {
		lat,
		lon,
		precision: (text(g?.precision) as OriginKind) || "unknown",
		radius_km: num(g?.radius_km) ?? 0,
		elevation_m: range.length ? [range[0], range[range.length - 1]] : null,
		confidence: (text(g?.confidence) as OriginGeo["confidence"]) || "low",
		source: text(g?.source) || "",
	}
}

function placeOf(raw: Raw): string | null {
	const parts = [raw.location, raw.municipality, raw.country]
		.map(text)
		.filter((p, i, all): p is string => !!p && all.indexOf(p) === i)
	return parts.length ? parts.join(", ") : null
}

/** Social handles in vendor frontmatter are sometimes bare ("white2tea"): make them links. */
const SOCIAL: Record<string, { label: string; base: string }> = {
	website: { label: "website", base: "" },
	instagram: { label: "instagram", base: "https://www.instagram.com/" },
	twitter: { label: "x / twitter", base: "https://x.com/" },
	facebook: { label: "facebook", base: "https://www.facebook.com/" },
	youtube: { label: "youtube", base: "https://www.youtube.com/@" },
}

function linksOf(raw: Raw): EntityLink[] {
	const out: EntityLink[] = []
	for (const [key, { label, base }] of Object.entries(SOCIAL)) {
		const value = text(raw.links?.[key])
		if (!value) continue
		const href = /^https?:\/\//i.test(value)
			? value
			: base
			? `${base}${value.replace(/^@/, "")}`
			: `https://${value}`
		out.push({ label, href })
	}
	return out
}

/** The first sentence (or two short ones) of a markdown description, as plain text. */
export function summarize(markdown: string | null | undefined, max = 140): string | null {
	const plain = (markdown || "")
		.split(/\n\s*\n/)[0]
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		// what's left of a link cut mid-paragraph, and markdown escapes
		.replace(/\\?\[[^\]]*$/, "")
		.replace(/\\(.)/g, "$1")
		.replace(/[*_`>#]/g, "")
		.replace(/\s+/g, " ")
		.trim()
	if (!plain) return null
	const sentence = plain.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? plain
	const out = sentence.length < 48 && plain.length > sentence.length ? plain : sentence
	if (out.length <= max) return out
	const cut = out.slice(0, max)
	return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[,;:.\s]+$/, "")}…`
}

const host = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, "")
	} catch {
		return url
	}
}

const fmtCoord = (lat: number, lon: number) =>
	`${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(3)}°${
		lon >= 0 ? "E" : "W"
	}`

/** Great-circle distance in km. */
function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
	const rad = Math.PI / 180
	const dLat = (b.lat - a.lat) * rad
	const dLon = (b.lon - a.lon) * rad
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
	return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Areas too broad to be anyone's neighbour. */
const BROAD = new Set<string>(["country", "province", "prefecture", "unknown"])

/**
 * The nearest placed origins that aren't this one's ancestors or descendants (Yiwu's
 * neighbours are Mangzhi and Manzhuan, not Mengla or Gua Feng Zhai).
 */
function nearbyOrigins(self: Raw, geo: OriginGeo, all: Raw[], limit = 5) {
	const chainOf = (r: Raw) => {
		const ids = new Set<string>()
		for (let n: RawOrigin | undefined = r; n?._slug && !ids.has(n._slug); n = n.parent)
			ids.add(n._slug)
		return ids
	}
	const mine = chainOf(self)
	return all
		.filter((o) => !mine.has(o._slug as string) && !chainOf(o).has(self._slug as string))
		.filter((o) => !BROAD.has(text(o.kind) ?? "unknown"))
		.map((o) => ({ o, g: geoOf(o) }))
		.filter((x): x is { o: Raw; g: OriginGeo } => !!x.g)
		.map(({ o, g }) => ({
			crumb: {
				kind: "origin" as const,
				slug: o._slug as string,
				title: o.title || (o._slug as string),
				hanzi: text(o.hanzi),
				originKind: (text(o.kind) as OriginKind | null) ?? null,
			},
			km: Math.round(haversine(geo, g)),
		}))
		.sort((a, b) => a.km - b.km || a.crumb.title.localeCompare(b.crumb.title))
		.slice(0, limit)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Every slug of a kind, for generateStaticParams (tasted or not: unused entities get a page too). */
export async function getEntitySlugs(kind: PageKind): Promise<string[]> {
	return (await loadAll(kind)).map((r) => r._slug as string)
}

/** Every entity of a kind, as an index page lists them. */
export async function getEntityList(kind: PageKind): Promise<EntityListItem[]> {
	return (await loadAll(kind)).map((r) => ({
		kind,
		slug: r._slug as string,
		id: r.id || (r._slug as string),
		title: r.title || (r._slug as string),
		hanzi: text(r.hanzi),
		color: text(r.color) ?? text(r.category?.color),
		image: text(r.image),
		summary: summarize(r.description),
		place: kind === "vendor" ? placeOf(r) : null,
		parent:
			kind === "origin"
				? r.parent?._slug ?? null
				: kind === "style"
				? r.category?._slug ?? null
				: null,
		originKind: kind === "origin" ? (text(r.kind) as OriginKind | null) : null,
	}))
}

/** Everything a page shows that the relation index can't, or null when the slug doesn't exist. */
export async function getEntityPage(kind: PageKind, slug: string): Promise<EntityPageData | null> {
	const all = await loadAll(kind)
	const raw = all.find((r) => r._slug === slug)
	if (!raw) return null

	const base: EntityPageData = {
		kind,
		slug,
		id: raw.id || slug,
		title: raw.title || slug,
		hanzi: text(raw.hanzi),
		pinyin: text(raw.pinyin),
		color: text(raw.color),
		image: text(raw.image),
		description: text(raw.description),
		ancestors: [],
		children: [],
		facts: [],
		geo: null,
		originKind: null,
		groups: [],
		place: null,
		links: [],
		nearby: [],
	}

	switch (kind) {
		case "origin": {
			const geo = geoOf(raw)
			const originKind = (text(raw.kind) as OriginKind | null) ?? null
			const ancestors = originAncestors(raw)
			const parent = ancestors[ancestors.length - 1]
			const facts: EntityFact[] = [
				parent && { label: "parent", value: parent.title, ref: parent },
				geo && { label: "coords", value: fmtCoord(geo.lat, geo.lon) },
				geo && {
					label: "precision",
					value: `${geo.precision}${geo.radius_km ? ` · ±${geo.radius_km} km` : ""}`,
				},
				geo?.elevation_m && {
					label: "gardens",
					value: `${geo.elevation_m[0].toLocaleString("en-US")}–${geo.elevation_m[1].toLocaleString(
						"en-US"
					)} m`,
				},
				geo && { label: "confidence", value: geo.confidence },
				geo?.source && {
					label: "source",
					value: host(geo.source),
					href: geo.source,
					title: geo.source,
				},
			].filter(Boolean) as EntityFact[]
			return {
				...base,
				geo,
				originKind,
				groups: (raw.groups || []).filter((g): g is string => !!g),
				ancestors,
				children: all
					.filter((o) => o.parent?._slug === slug)
					.map((o) => ({
						kind: "origin" as const,
						slug: o._slug as string,
						title: o.title || (o._slug as string),
						hanzi: text(o.hanzi),
						originKind: (text(o.kind) as OriginKind | null) ?? null,
					}))
					.sort((a, b) => a.title.localeCompare(b.title)),
				facts,
				nearby: geo ? nearbyOrigins(raw, geo, all) : [],
			}
		}
		case "vendor": {
			const place = placeOf(raw)
			const links = linksOf(raw)
			const site = links.find((l) => l.label === "website")
			return {
				...base,
				place,
				links,
				facts: [
					place && { label: "based", value: place },
					site && { label: "website", value: host(site.href), href: site.href },
					...links
						.filter((l) => l !== site)
						.map((l) => ({ label: l.label.split(" ")[0], value: host(l.href), href: l.href })),
				].filter(Boolean) as EntityFact[],
			}
		}
		case "style": {
			const category = raw.category?._slug
				? {
						kind: "category" as const,
						slug: raw.category._slug,
						title: raw.category.title || raw.category._slug,
				  }
				: null
			const cultivars = await loadAll("cultivar")
			return {
				...base,
				color: text(raw.color) ?? text(raw.category?.color),
				ancestors: category ? [category] : [],
				// cultivars that name this style (Varietal.styles), tasted or not
				children: cultivars
					.filter((c) => (c.styles || []).some((s) => s?._slug === slug))
					.map((c) => ({
						kind: "cultivar" as const,
						slug: c._slug as string,
						title: c.title || (c._slug as string),
						hanzi: text(c.hanzi),
					})),
				facts: [category && { label: "category", value: category.title, ref: category }].filter(
					Boolean
				) as EntityFact[],
			}
		}
		case "category": {
			const styles = await loadAll("style")
			return {
				...base,
				children: styles
					.filter((s) => s.category?._slug === slug)
					.map((s) => ({
						kind: "style" as const,
						slug: s._slug as string,
						title: s.title || (s._slug as string),
					}))
					.sort((a, b) => a.title.localeCompare(b.title)),
				facts: base.color ? [{ label: "color", value: base.color.toLowerCase() }] : [],
			}
		}
		case "cultivar": {
			const styles = (raw.styles || [])
				.filter((s): s is NonNullable<typeof s> & { _slug: string } => !!s?._slug)
				.map((s) => ({ kind: "style" as const, slug: s._slug, title: s.title || s._slug }))
			return {
				...base,
				children: styles,
				facts: [base.hanzi && { label: "hanzi", value: base.hanzi }].filter(
					Boolean
				) as EntityFact[],
			}
		}
	}
}

/** The relation index, built on the server from the same sessions the root layout hydrates. */
export const getServerIndex = memo(
	async (): Promise<RelationIndex> => buildRelationIndex(await getExplorerSessions())
)

/** A placed origin as a dot on a small map. */
export type OriginPoint = {
	slug: string
	title: string
	lat: number
	lon: number
	precision: OriginKind
	radius_km: number
}

/** Every placed origin by slug ("unknown" placeholders have no point worth drawing). */
export const getOriginPoints = memo(async (): Promise<Record<string, OriginPoint>> => {
	const out: Record<string, OriginPoint> = {}
	for (const raw of await loadAll("origin")) {
		const geo = geoOf(raw)
		if (!geo || text(raw.kind) === "unknown") continue
		out[raw._slug as string] = {
			slug: raw._slug as string,
			title: raw.title || (raw._slug as string),
			lat: geo.lat,
			lon: geo.lon,
			precision: geo.precision,
			radius_km: geo.radius_km,
		}
	}
	return out
})
