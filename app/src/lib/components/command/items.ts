/**
 * Command bar index + search. Pure (no React): builds a searchable index of teas, flavor
 * descriptors, vendors, styles and tags once, then turns (query, mode) into result groups.
 */
import type { ExplorerSession, NoteStage } from "@/lib/types/session"
import type { Vendor } from "@/lib/types/vendor"
import type { Category } from "@/lib/types/category"
import type { FacetKey, FilterState } from "@/lib/filters"
import { descriptorRegex, extractDescriptors } from "@/lib/descriptors"
import { getLiquorColor, type LiquorColor } from "@/lib/liquor"
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

export type FacetEntry = {
	facet: FacetKey
	value: string
	label: string
	count: number
	color?: string
}

export type CommandIndex = {
	teas: TeaEntry[]
	teasBySlug: Map<string, TeaEntry>
	flavors: FlavorEntry[]
	vendors: FacetEntry[]
	styles: FacetEntry[]
	tags: FacetEntry[]
}

const yearOf = (s: ExplorerSession) =>
	s.production_year ? String(Math.trunc(Number(s.production_year))) : null

export function buildIndex(
	sessions: ExplorerSession[],
	vendors: Vendor[],
	categories: Category[]
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
				...(s.origin ?? []).flatMap((o) => [o?.location, o?.municipality, o?.country]),
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

	const countBy = (pick: (s: ExplorerSession) => (string | undefined | null)[]) => {
		const m = new Map<string, number>()
		for (const s of sessions) for (const v of new Set(pick(s))) if (v) m.set(v, (m.get(v) ?? 0) + 1)
		return m
	}
	const vendorCounts = countBy((s) => (s.vendor ?? []).map((v) => v._slug))
	const styleCounts = countBy((s) => (s.style ?? []).map((st) => st.category?._slug))
	const tagCounts = countBy((s) => (s.tags ?? []).map((t) => t?._slug))

	const tagTitles = new Map<string, string>()
	for (const s of sessions)
		for (const t of s.tags ?? []) if (t?._slug) tagTitles.set(t._slug, t.title)

	const byCount = (a: FacetEntry, b: FacetEntry) =>
		b.count - a.count || a.label.localeCompare(b.label)

	return {
		teas,
		teasBySlug: new Map(teas.map((t) => [t.slug, t])),
		flavors,
		vendors: vendors
			.map((v) => ({
				facet: "vendors" as const,
				value: v._slug,
				label: v.title,
				count: vendorCounts.get(v._slug) ?? 0,
			}))
			.filter((v) => v.count > 0)
			.sort(byCount),
		styles: categories
			.map((c) => ({
				facet: "styles" as const,
				value: c._slug,
				label: c.title,
				color: c.color,
				count: styleCounts.get(c._slug) ?? 0,
			}))
			.filter((c) => c.count > 0)
			.sort(byCount),
		tags: [...tagTitles]
			.map(([slug, title]) => ({
				facet: "tags" as const,
				value: slug,
				label: title,
				count: tagCounts.get(slug) ?? 0,
			}))
			.sort(byCount),
	}
}

// ---------------------------------------------------------------------------
// Items + groups
// ---------------------------------------------------------------------------

export type CommandId = "brew" | "compare" | "random" | "clear" | "home"
export type ArgCommand = "brew" | "compare"

export type Mode =
	| { kind: "all" }
	| { kind: "commands" }
	| { kind: "scope"; scope: "sessions" | "descriptors" }
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
	  }
	| { kind: "command"; key: string; command: CommandDef; hl: number[] }

export type GroupKey =
	| "recent"
	| "suggested"
	| "latest"
	| "teas"
	| "flavors"
	| "vendors"
	| "styles"
	| "tags"
	| "commands"

export type Group = { key: GroupKey; label: string; items: Item[] }

export type CommandDef = {
	id: CommandId
	label: string
	hint: string
	aliases: string
	/** opens a second-step tea picker */
	arg?: ArgCommand
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
		}
	)
	// a no-op row is noise: only offer "clear" when there is something to clear
	if (ctx.activeFilterCount || ctx.descriptor) {
		defs.splice(defs.length - 1, 0, {
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
	vendors: "Vendors",
	styles: "Styles",
	tags: "Tags",
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

function facetItems(entries: FacetEntry[], query: string, limit: number, ctx: SearchContext) {
	const q = query.trim()
	const scored: { facet: FacetEntry; score: number; hl: number[] }[] = []
	for (const facet of entries) {
		if (!q) {
			scored.push({ facet, score: facet.count, hl: [] })
			continue
		}
		const r = fuzzyFields(q, [{ text: facet.label, key: "label" }])
		if (r && r.score >= 20)
			scored.push({ facet, score: r.score + facet.count * 0.2, hl: r.highlights.label ?? [] })
	}
	scored.sort((a, b) => b.score - a.score)
	return scored.slice(0, limit).map(
		({ facet, hl }): Item => ({
			kind: "facet",
			key: `${facet.facet}:${facet.value}`,
			facet,
			hl,
			active: ctx.filters.facets[facet.facet].includes(facet.value),
		})
	)
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
			const list =
				r.kind === "vendor" ? index.vendors : r.kind === "style" ? index.styles : index.tags
			const facet = list.find((f) => f.value === r.id)
			if (facet)
				out.push({
					kind: "facet",
					key: `recent:${facet.facet}:${facet.value}`,
					facet,
					hl: [],
					recent: true,
					active: ctx.filters.facets[facet.facet].includes(facet.value),
				})
		}
	}
	return out
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
			return group("commands", commandItems(ctx, q))
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
			return [
				...group("teas", teaItems(index, q, 8)),
				...group("flavors", flavorItems(index, q, 6, ctx)),
				...group("vendors", facetItems(index.vendors, q, 4, ctx)),
				...group("styles", facetItems(index.styles, q, 4, ctx)),
				...group("tags", facetItems(index.tags, q, 4, ctx)),
				...group("commands", commandItems(ctx, q, 3)),
			]
		}
	}
}
