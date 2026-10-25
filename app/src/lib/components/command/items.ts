/**
 * Command bar index + search. Pure (no React): builds a searchable index of teas, flavor
 * descriptors and every entity a session points at (origins, vendors, styles and their
 * categories, cultivars, tags, vintages) once, then turns (query, mode) into result groups.
 *
 * Quick-open prefixes scope the search to one kind (plan §2.1): `@` vendor, `#` tag,
 * `^` origin, `~` style, `%` cultivar, `:` vintage; `>` runs commands.
 */
import type { ExplorerSession, NoteStage } from "@/lib/types/session"
import type { Vendor } from "@/lib/types/vendor"
import type { Category } from "@/lib/types/category"
import { ENTITY_FACET, isEntityFiltered, type FacetKey, type FilterState } from "@/lib/filters"
import { descriptorRegex, extractDescriptors } from "@/lib/descriptors"
import { ENTITY_META, entityHref, type EntityKind } from "@/lib/entities"
import { EMPTY_ENTITY_DETAILS, type EntityDetails } from "@/lib/entityDetails"
import { getLiquorColor, type LiquorColor } from "@/lib/liquor"
import { originSearchText } from "@/lib/origins"
import { ancestorsOf, buildRelationIndex, type EntityNode } from "@/lib/relations"
import { NOTE_STAGES } from "@/lib/types/session"
import { fuzzyFields, fuzzyMatch } from "./fuzzy"
import type { RecentEntry } from "./recents"

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

export type TeaEntry = {
	slug: string
	session: ExplorerSession
	title: string
	year: string | null
	vendor: string | null
	category: { title: string; color: string } | null
	liquor: LiquorColor
	/** secondary search text (vendor, styles, tags, origin) */
	meta: string
	time: number
}

export type FlavorEntry = { term: string; count: number; stages: NoteStage[] }

/** An entity row: opens its page (when it has one) or toggles its Explorer filter. */
export type FacetEntry = {
	kind: EntityKind
	facet: FacetKey
	/** slug (vintages: the year) */
	value: string
	/** origins: the id, which old filter URLs may carry */
	id?: string
	label: string
	/** sessions behind it (origins and categories roll up) */
	count: number
	color?: string
	/** dim second line: an origin's hanzi and path, a style's category, a vendor's city */
	sub?: string
	/** origins and cultivars: the name in hanzi */
	hanzi?: string
	/** extra text the search matches (pinyin without tones, hanzi, slug) */
	alt?: string
	/** page route, or null for filter-only kinds (tags, vintages) */
	href: string | null
	/** origin tree depth, for the indented tree an empty `^` shows */
	depth?: number
	/** a style's category slug */
	parent?: string
}

export type CommandIndex = {
	teas: TeaEntry[]
	teasBySlug: Map<string, TeaEntry>
	flavors: FlavorEntry[]
	vendors: FacetEntry[]
	categories: FacetEntry[]
	styles: FacetEntry[]
	/** depth-first through the tree, biggest branch first */
	origins: FacetEntry[]
	cultivars: FacetEntry[]
	tags: FacetEntry[]
	/** newest first */
	years: FacetEntry[]
}

const yearOf = (s: ExplorerSession) =>
	s.production_year ? String(Math.trunc(Number(s.production_year))) : null

const bare = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "")

/** Same name, ignoring case and tone marks ("yiwu" names Yìwǔ). */
const sameName = (a: string, b: string) => bare(a.toLowerCase()) === bare(b.trim().toLowerCase())

const entry = (
	kind: EntityKind,
	node: Pick<EntityNode, "slug" | "title" | "all"> & Partial<EntityNode>,
	extra: Partial<FacetEntry> = {}
): FacetEntry => ({
	kind,
	facet: ENTITY_FACET[kind],
	value: node.slug,
	label: node.title,
	count: node.all.length,
	color: node.color ?? undefined,
	href: entityHref(kind, node.slug),
	...extra,
})

export function buildIndex(
	sessions: ExplorerSession[],
	vendors: Vendor[],
	categories: Category[],
	details: EntityDetails = EMPTY_ENTITY_DETAILS
): CommandIndex {
	const teas: TeaEntry[] = sessions.map((s) => {
		const cat = s.style?.[0]?.category
		return {
			slug: s._slug,
			session: s,
			title: s.title,
			year: yearOf(s),
			vendor: s.vendor?.[0]?.title ?? null,
			category: cat ? { title: cat.title, color: cat.color } : null,
			liquor: getLiquorColor(s._slug),
			meta: [
				s.tea_name,
				...(s.vendor ?? []).map((v) => v.title),
				...(s.style ?? []).flatMap((st) => [st.title, st.category?.title]),
				...(s.tags ?? []).map((t) => t?.title),
				...(s.cultivar ?? []).map((c) => c.title),
				...(s.origin ?? []).flatMap((o) => originSearchText(o).reverse()),
			]
				.filter(Boolean)
				.join(" · "),
			time: new Date(s.date).getTime() || 0,
		}
	})
	teas.sort((a, b) => b.time - a.time)

	// Flavor descriptors: collect terms from every session's notes, merge plural variants
	// (they share a regex), then count sessions whose notes/excerpt mention each one, the
	// same way the Explorer marks matches.
	const haystacks = sessions.map((s) =>
		[...NOTE_STAGES.map((k) => s.notes?.[k] ?? ""), s.excerpt ?? ""].join("\n")
	)
	const byPattern = new Map<string, { term: string; stages: Set<NoteStage>; re: RegExp }>()
	for (const s of sessions) {
		for (const d of extractDescriptors(s.notes)) {
			if (d.term.length < 3 || /^\d/.test(d.term)) continue
			const re = descriptorRegex(d.term, "iu")
			if (!re) continue
			const existing = byPattern.get(re.source)
			if (existing) {
				d.stages.forEach((st) => existing.stages.add(st))
				// keep the shorter (usually singular) spelling
				if (d.term.length < existing.term.length) existing.term = d.term
			} else {
				byPattern.set(re.source, { term: d.term, stages: new Set(d.stages), re })
			}
		}
	}
	const flavors: FlavorEntry[] = []
	for (const { term, stages, re } of byPattern.values()) {
		let count = 0
		for (const h of haystacks) if (re.test(h)) count++
		if (!count) continue
		flavors.push({ term, count, stages: NOTE_STAGES.filter((st) => stages.has(st)) })
	}
	flavors.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))

	// Entities come from the relation index (counts roll up through the origin and style trees)
	const rel = buildRelationIndex(sessions)
	const byCount = (a: FacetEntry, b: FacetEntry) =>
		b.count - a.count || a.label.localeCompare(b.label)

	const vendorEntries: FacetEntry[] = vendors
		.map((v) => rel.nodes.vendor.get(v._slug))
		.filter((n): n is EntityNode => !!n && n.all.length > 0)
		.map((n) => entry("vendor", n, { sub: details.vendor[n.slug]?.place }))
		.sort(byCount)

	const categoryEntries: FacetEntry[] = categories
		.map((c) => {
			const n = rel.nodes.category.get(c._slug)
			if (!n?.all.length) return null
			const styles = rel.children.category.get(c._slug)?.length ?? 0
			return entry("category", n, {
				color: c.color,
				sub: `category · ${styles} ${styles === 1 ? "style" : "styles"}`,
			})
		})
		.filter((e): e is FacetEntry => !!e)
		.sort(byCount)

	const styleEntries: FacetEntry[] = [...rel.nodes.style.values()]
		.map((n) => {
			const category = n.parent ? rel.nodes.category.get(n.parent) : undefined
			return entry("style", n, {
				sub: category?.title,
				alt: category?.title,
				parent: n.parent ?? undefined,
			})
		})
		.sort(byCount)

	// origins: depth-first, the biggest branch first, so an empty `^` reads as the tree
	const origins: FacetEntry[] = []
	const originCount = (slug: string) => rel.nodes.origin.get(slug)?.all.length ?? 0
	const bySize = (a: string, b: string) =>
		originCount(b) - originCount(a) ||
		(rel.nodes.origin.get(a)?.title ?? a).localeCompare(rel.nodes.origin.get(b)?.title ?? b)
	const visitOrigin = (slug: string, depth: number) => {
		const n = rel.nodes.origin.get(slug)
		if (!n) return
		const path = ancestorsOf(rel, "origin", slug).map((a) => a.title)
		origins.push(
			entry("origin", n, {
				id: n.id,
				depth,
				hanzi: n.hanzi ?? undefined,
				// the nearest places say the most; the country is implied past two levels
				sub: [n.hanzi, path.slice(-3).join(" › ")].filter(Boolean).join("  ") || undefined,
				alt: [n.pinyin ? bare(n.pinyin) : "", n.hanzi, n.slug].filter(Boolean).join(" "),
			})
		)
		for (const kid of [...(rel.children.origin.get(slug) ?? [])].sort(bySize))
			visitOrigin(kid, depth + 1)
	}
	for (const root of [...rel.nodes.origin.values()]
		.filter((n) => !n.parent)
		.map((n) => n.slug)
		.sort(bySize))
		visitOrigin(root, 0)

	const cultivarEntries: FacetEntry[] = [...rel.nodes.cultivar.values()]
		.map((n) => {
			const hanzi = details.cultivar[n.slug]?.hanzi
			return entry("cultivar", n, { sub: hanzi, alt: hanzi })
		})
		.sort(byCount)

	const tagEntries: FacetEntry[] = [...rel.nodes.tag.values()]
		.map((n) => entry("tag", n))
		.sort(byCount)

	const thisYear = new Date().getFullYear()
	const yearEntries: FacetEntry[] = [...rel.nodes.year.values()]
		.map((n) => {
			const age = thisYear - Number(n.slug)
			return entry("year", n, {
				sub: age > 0 ? `${age} ${age === 1 ? "year" : "years"} old` : "this year",
			})
		})
		.sort((a, b) => Number(b.value) - Number(a.value))

	return {
		teas,
		teasBySlug: new Map(teas.map((t) => [t.slug, t])),
		flavors,
		vendors: vendorEntries,
		categories: categoryEntries,
		styles: styleEntries,
		origins,
		cultivars: cultivarEntries,
		tags: tagEntries,
		years: yearEntries,
	}
}

// ---------------------------------------------------------------------------
// Quick-open prefixes
// ---------------------------------------------------------------------------

/** Kinds a prefix scopes the search to (`~` covers categories and styles). */
export type ScopeKind = "vendor" | "tag" | "origin" | "style" | "cultivar" | "year"

export const SCOPE_PREFIX: Record<string, ScopeKind> = {
	"@": "vendor",
	"#": "tag",
	"^": "origin",
	"~": "style",
	"%": "cultivar",
	":": "year",
}

export const SCOPE_META: Record<ScopeKind, { glyph: string; label: string; placeholder: string }> =
	{
		vendor: { glyph: "@", label: "Vendors", placeholder: "Open a vendor…" },
		tag: { glyph: "#", label: "Tags", placeholder: "Filter by tag…" },
		origin: {
			glyph: "^",
			label: "Origins",
			placeholder: "Open an origin: village, mountain, province…",
		},
		style: { glyph: "~", label: "Styles", placeholder: "Open a style or category…" },
		cultivar: { glyph: "%", label: "Cultivars", placeholder: "Open a cultivar…" },
		year: { glyph: ":", label: "Vintages", placeholder: "Filter by vintage…" },
	}

/** A query that opens with a prefix ("^yiwu") as its scope and the rest; null when it has none. */
export function parsePrefix(query: string): { scope: ScopeKind; rest: string } | null {
	const scope = SCOPE_PREFIX[query[0] ?? ""]
	return scope ? { scope, rest: query.slice(1).trimStart() } : null
}

// ---------------------------------------------------------------------------
// Items + groups
// ---------------------------------------------------------------------------

export type CommandId = "brew" | "compare" | "random" | "clear" | "home" | IndexId

/** The index pages a command opens (plan §2.3): the Explorer's views at full size. */
export type IndexId = "origins" | "vendors" | "styles" | "cultivars" | "teaware" | "lexicon"

export const INDEX_COMMANDS: readonly (CommandDef & { id: IndexId; href: string })[] = [
	{
		id: "origins",
		label: "Origins map",
		hint: "every place, on the contour map",
		aliases: "origins map places terroir mountains villages where ^",
		href: "/origins/",
	},
	{
		id: "vendors",
		label: "Vendors",
		hint: "who sold what",
		aliases: "vendors shops sellers merchants index @",
		href: "/vendors/",
	},
	{
		id: "styles",
		label: "Styles",
		hint: "categories and the styles beneath",
		aliases: "styles categories sheng shou oolong black index ~",
		href: "/styles/",
	},
	{
		id: "cultivars",
		label: "Cultivars",
		hint: "the plants behind the leaf",
		aliases: "cultivars varietals plants da ye zhong index %",
		href: "/cultivars/",
	},
	{
		id: "teaware",
		label: "Teaware",
		hint: "gaiwans, pots and cups",
		aliases: "teaware vessels gaiwan teapot pot cups clay index",
		href: "/teaware/",
	},
	{
		id: "lexicon",
		label: "Lexicon",
		hint: "every flavor word, by axis",
		aliases: "lexicon flavors words descriptors glossary vocabulary notes index",
		href: "/lexicon/",
	},
]
export type ArgCommand = "brew" | "compare"

export type Mode =
	| { kind: "all" }
	| { kind: "commands" }
	| { kind: "scope"; scope: "sessions" | "descriptors" }
	| { kind: "entity"; scope: ScopeKind }
	| { kind: "arg"; command: ArgCommand }

export type Item =
	| { kind: "tea"; key: string; tea: TeaEntry; hl: number[]; recent?: boolean }
	| {
			kind: "flavor"
			key: string
			flavor: FlavorEntry
			hl: number[]
			recent?: boolean
			active: boolean
	  }
	| {
			kind: "facet"
			key: string
			facet: FacetEntry
			hl: number[]
			recent?: boolean
			active: boolean
			/** indent (origin tree in an empty `^`) */
			depth?: number
	  }
	| { kind: "command"; key: string; command: CommandDef; hl: number[] }

export type GroupKey =
	| "recent"
	| "suggested"
	| "latest"
	| "teas"
	| "flavors"
	| "origins"
	| "vendors"
	| "styles"
	| "cultivars"
	| "tags"
	| "years"
	| "commands"

/** `key` is a GroupKey, or `cat:<slug>` for the per-category groups of an empty `~`. */
export type Group = { key: string; label: string; items: Item[]; color?: string }

export type CommandDef = {
	id: CommandId
	label: string
	hint: string
	aliases: string
	/** opens a second-step tea picker */
	arg?: ArgCommand
	/** goes to a page */
	href?: string
}

export type SearchContext = {
	sessionSlug: string | null
	filters: FilterState
	activeFilterCount: number
	descriptor: string | null
}

export function commandDefs(ctx: SearchContext): CommandDef[] {
	const defs: CommandDef[] = [
		{
			id: "brew",
			label: "Brew…",
			hint: "open a tea at its first steep",
			aliases: "brew steep infuse session open tea",
			arg: "brew",
		},
	]
	if (ctx.sessionSlug) {
		defs.push({
			id: "compare",
			label: "Compare with…",
			hint: "overlay another tea on the radar",
			aliases: "compare diff overlay versus vs radar",
			arg: "compare",
		})
	}
	defs.push(
		{
			id: "random",
			label: "Random tea",
			hint: "roll the dice",
			aliases: "random dice shuffle surprise lucky",
		},
		{
			id: "home",
			label: "Go home",
			hint: "all sessions",
			aliases: "home index start back sessions",
		},
		// the indexes go last: the empty bar suggests only the first few commands
		...INDEX_COMMANDS
	)
	// a no-op row is noise: only offer "clear" when there is something to clear
	if (ctx.activeFilterCount || ctx.descriptor) {
		defs.splice(defs.length - 1 - INDEX_COMMANDS.length, 0, {
			id: "clear",
			label: "Clear filters",
			hint: [
				ctx.activeFilterCount ? `${ctx.activeFilterCount} active` : null,
				ctx.descriptor ? `“${ctx.descriptor}” pinned` : null,
			]
				.filter(Boolean)
				.join(" · "),
			aliases: "clear reset filters unfilter remove all",
		})
	}
	return defs
}

const GROUP_LABEL: Record<GroupKey, string> = {
	recent: "Recent",
	suggested: "Commands",
	latest: "Latest sessions",
	teas: "Teas",
	flavors: "Flavors",
	origins: "Origins",
	vendors: "Vendors",
	styles: "Styles",
	cultivars: "Cultivars",
	tags: "Tags",
	years: "Vintages",
	commands: "Commands",
}

const group = (key: GroupKey, items: Item[], label = GROUP_LABEL[key]): Group[] =>
	items.length ? [{ key, label, items }] : []

function teaItems(
	index: CommandIndex,
	query: string,
	limit: number,
	filter?: (t: TeaEntry) => boolean
) {
	const pool = filter ? index.teas.filter(filter) : index.teas
	if (!query.trim()) {
		return pool
			.slice(0, limit)
			.map((tea): Item => ({ kind: "tea", key: `tea:${tea.slug}`, tea, hl: [] }))
	}
	const scored: { tea: TeaEntry; score: number; hl: number[] }[] = []
	for (const tea of pool) {
		const r = fuzzyFields(query, [
			{ text: tea.title, weight: 1, key: "title" },
			{ text: tea.year, weight: 0.9 },
			{ text: tea.vendor, weight: 0.75 },
			{ text: tea.meta, weight: 0.55 },
		])
		if (r) scored.push({ tea, score: r.score + tea.time / 1e13, hl: r.highlights.title ?? [] })
	}
	scored.sort((a, b) => b.score - a.score)
	return scored
		.slice(0, limit)
		.map(({ tea, hl }): Item => ({ kind: "tea", key: `tea:${tea.slug}`, tea, hl }))
}

function flavorItems(index: CommandIndex, query: string, limit: number, ctx: SearchContext) {
	const q = query.trim()
	if (!q) {
		return index.flavors.slice(0, limit).map(
			(flavor): Item => ({
				kind: "flavor",
				key: `flavor:${flavor.term}`,
				flavor,
				hl: [],
				active: ctx.descriptor === flavor.term,
			})
		)
	}
	const scored: { flavor: FlavorEntry; score: number; hl: number[] }[] = []
	for (const flavor of index.flavors) {
		const r = fuzzyMatch(q, flavor.term)
		// descriptors are short: only accept tight matches to keep the group meaningful
		if (r && r.score >= 20)
			scored.push({ flavor, score: r.score + Math.log2(flavor.count + 1) * 6, hl: r.indices })
	}
	scored.sort((a, b) => b.score - a.score)
	return scored.slice(0, limit).map(
		({ flavor, hl }): Item => ({
			kind: "flavor",
			key: `flavor:${flavor.term}`,
			flavor,
			hl,
			active: ctx.descriptor === flavor.term,
		})
	)
}

const facetItem = (
	facet: FacetEntry,
	ctx: SearchContext,
	hl: number[] = [],
	extra: { recent?: boolean; depth?: number; keyPrefix?: string } = {}
): Item => ({
	kind: "facet",
	key: `${extra.keyPrefix ?? ""}${facet.kind}:${facet.value}`,
	facet,
	hl,
	recent: extra.recent,
	depth: extra.depth,
	active: isEntityFiltered(ctx.filters, facet.kind, facet.value, facet.id),
})

/**
 * Entities matching the query, best first. Without a query, the list's own order (by count;
 * origins as a tree), with the origin depth kept when `tree` is set.
 */
function facetItems(
	entries: FacetEntry[],
	query: string,
	limit: number,
	ctx: SearchContext,
	{ tree = false }: { tree?: boolean } = {}
) {
	const q = query.trim()
	if (!q)
		return entries
			.slice(0, limit)
			.map((f) => facetItem(f, ctx, [], { depth: tree ? f.depth : undefined }))
	const scored: { facet: FacetEntry; score: number; hl: number[] }[] = []
	for (const facet of entries) {
		const r = fuzzyFields(q, [
			{ text: facet.label, key: "label" },
			{ text: facet.alt, weight: 0.85 },
		])
		if (r && r.score >= 20)
			scored.push({
				facet,
				score: r.score + Math.log2(facet.count + 1) * 4,
				hl: r.highlights.label ?? [],
			})
	}
	scored.sort((a, b) => b.score - a.score)
	return scored.slice(0, limit).map(({ facet, hl }) => facetItem(facet, ctx, hl))
}

function commandItems(ctx: SearchContext, query: string, limit = 10) {
	const defs = commandDefs(ctx)
	const q = query.trim()
	if (!q)
		return defs
			.slice(0, limit)
			.map((command): Item => ({ kind: "command", key: `cmd:${command.id}`, command, hl: [] }))
	const scored: { command: CommandDef; score: number; hl: number[] }[] = []
	for (const command of defs) {
		const r = fuzzyFields(q, [
			{ text: command.label, key: "label" },
			{ text: command.aliases, weight: 0.8 },
		])
		if (r && r.score >= 20) scored.push({ command, score: r.score, hl: r.highlights.label ?? [] })
	}
	scored.sort((a, b) => b.score - a.score)
	return scored
		.slice(0, limit)
		.map(({ command, hl }): Item => ({ kind: "command", key: `cmd:${command.id}`, command, hl }))
}

/** The entity list a recent entry points into. Recents saved before categories had a kind of their own stored them as "style". */
function recentFacet(index: CommandIndex, r: RecentEntry): FacetEntry | undefined {
	const find = (list: FacetEntry[]) => list.find((f) => f.value === r.id)
	switch (r.kind) {
		case "vendor":
			return find(index.vendors)
		case "style":
			return find(index.styles) ?? find(index.categories)
		case "category":
			return find(index.categories)
		case "origin":
			return find(index.origins)
		case "cultivar":
			return find(index.cultivars)
		case "tag":
			return find(index.tags)
		case "year":
			return find(index.years)
	}
}

function recentItems(index: CommandIndex, recents: RecentEntry[], ctx: SearchContext): Item[] {
	const out: Item[] = []
	for (const r of recents) {
		if (r.kind === "tea") {
			const tea = index.teasBySlug.get(r.id)
			if (tea) out.push({ kind: "tea", key: `recent:tea:${tea.slug}`, tea, hl: [], recent: true })
		} else if (r.kind === "flavor") {
			const flavor = index.flavors.find((f) => f.term === r.id)
			if (flavor)
				out.push({
					kind: "flavor",
					key: `recent:flavor:${flavor.term}`,
					flavor,
					hl: [],
					recent: true,
					active: ctx.descriptor === flavor.term,
				})
		} else {
			const facet = recentFacet(index, r)
			if (facet) out.push(facetItem(facet, ctx, [], { recent: true, keyPrefix: "recent:" }))
		}
	}
	return out
}

/** One scope's results: an empty `~` groups styles under their categories; an empty `^` is the tree. */
function scopeGroups(
	index: CommandIndex,
	scope: ScopeKind,
	q: string,
	ctx: SearchContext
): Group[] {
	switch (scope) {
		case "vendor":
			return group("vendors", facetItems(index.vendors, q, 60, ctx))
		case "tag":
			return group("tags", facetItems(index.tags, q, 60, ctx))
		case "cultivar":
			return group("cultivars", facetItems(index.cultivars, q, 60, ctx))
		case "year":
			return group("years", facetItems(index.years, q, 60, ctx))
		case "origin":
			return group("origins", facetItems(index.origins, q, 80, ctx, { tree: !q }))
		case "style": {
			if (q) {
				// a category that matches outranks its styles
				const items = [
					...facetItems(index.categories, q, 4, ctx),
					...facetItems(index.styles, q, 40, ctx),
				]
				return group("styles", items)
			}
			return index.categories.map((cat) => ({
				key: `cat:${cat.value}`,
				label: cat.label,
				color: cat.color,
				items: [
					facetItem(cat, ctx),
					...index.styles
						.filter((st) => st.parent === cat.value)
						.map((st) => facetItem(st, ctx, [], { depth: 1 })),
				],
			}))
		}
	}
}

export function search(
	index: CommandIndex,
	query: string,
	mode: Mode,
	ctx: SearchContext,
	recents: RecentEntry[]
): Group[] {
	const q = query.trim()
	switch (mode.kind) {
		case "commands":
			return group("commands", commandItems(ctx, q, 12))
		case "arg": {
			const filter =
				mode.command === "compare"
					? (t: TeaEntry) => t.slug !== ctx.sessionSlug && !!t.session.flavor_axes
					: undefined
			return group("teas", teaItems(index, q, 60, filter))
		}
		case "scope":
			return mode.scope === "sessions"
				? group("teas", teaItems(index, q, 60))
				: group("flavors", flavorItems(index, q, 40, ctx))
		case "entity":
			return scopeGroups(index, mode.scope, q, ctx)
		case "all": {
			if (!q) {
				const recent = recentItems(index, recents, ctx)
				const recentTeas = new Set(
					recent.filter((r) => r.kind === "tea").map((r) => (r.kind === "tea" ? r.tea.slug : ""))
				)
				return [
					...group("recent", recent),
					...group("suggested", commandItems(ctx, "", 5)),
					...group(
						"latest",
						teaItems(index, "", 4 + Math.max(0, 3 - recent.length), (t) => !recentTeas.has(t.slug))
					),
				]
			}
			const entities = [
				...group("origins", facetItems(index.origins, q, 4, ctx)),
				...group("vendors", facetItems(index.vendors, q, 4, ctx)),
				...group(
					"styles",
					[
						...facetItems(index.categories, q, 2, ctx),
						...facetItems(index.styles, q, 4, ctx),
					].slice(0, 5)
				),
				...group("cultivars", facetItems(index.cultivars, q, 3, ctx)),
				...group("tags", facetItems(index.tags, q, 4, ctx)),
			]
			// a query that names an entity outright ("yiwu", "white2tea") puts it above the teas
			const named = (g: Group) => {
				const top = g.items[0]
				return top?.kind === "facet" && sameName(top.facet.label, q)
			}
			return [
				...entities.filter(named),
				...group("teas", teaItems(index, q, 8)),
				...group("flavors", flavorItems(index, q, 6, ctx)),
				...entities.filter((g) => !named(g)),
				...group("commands", commandItems(ctx, q, 3)),
			]
		}
	}
}

/** What ↵ does on a row: open the entity's page, or (tags, vintages) toggle its filter. */
export const facetOpens = (facet: FacetEntry) => !!facet.href

/** The glyph of an entity kind (`^` origin, `@` vendor, `~` style…). */
export const glyphOf = (kind: EntityKind) => ENTITY_META[kind].glyph
