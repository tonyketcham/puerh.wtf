"use client"

import { Suspense, useMemo } from "react"
import EntityRef from "@/lib/components/entity/EntityRef"
import { ENTITY_META, type EntityKind } from "@/lib/entities"
import { related, type RelationIndex } from "@/lib/relations"
import { cn } from "@/lib/utils/cn"
import type { EntityCrumb, EntityPageData } from "./data"
import type { EntityModel } from "./model"
import RelatedGroup from "./RelatedGroup"

type Row = {
	kind: EntityKind
	slug: string
	title: string
	color?: string | null
	/** sessions shared with the entity (0 = named in content, never tasted) */
	count: number
	/** right-hand note instead of the share bar (nearby: "18 km") */
	note?: string
}

type RelGroup = { key: string; label: string; kind: EntityKind; rows: Row[]; hint?: string }

/**
 * ── Related ── (plan §2.4): the cross-links that fall out of co-occurrence. Each group lists
 * entities with the share of this entity's sessions they appear in, as hairline bars that draw
 * on in order. Rows are EntityRefs, so they peek on hover and open on click.
 */
export default function Related({
	model,
	index,
	data,
}: {
	model: EntityModel
	index: RelationIndex
	data: EntityPageData
}) {
	const groups = useMemo(() => buildGroups(model, index, data), [model, index, data])
	if (!groups.length) return <p className="text-sm text-white/40">{"// nothing linked yet"}</p>
	return (
		<div className="grid grid-cols-1 gap-x-8 gap-y-7 @xl/editor:grid-cols-2">
			{groups.map((g, i) => (
				<RelatedGroup
					key={g.key}
					group={{
						...g,
						glyph: ENTITY_META[g.kind].glyph,
						total: model.stats.count,
						rows: g.rows.map((row) => ({
							...row,
							key: row.kind + ":" + row.slug,
							render: (
								<Suspense fallback={<span className="text-xs text-white/70">{row.title}</span>}>
									<EntityRef
										kind={row.kind}
										slug={row.slug}
										label={row.title}
										color={row.color}
										className={cn(row.count === 0 && !row.note && "opacity-55")}
									/>
								</Suspense>
							),
						})),
					}}
					order={i}
					accent={model.accentText}
				/>
			))}
		</div>
	)
}

// ---------------------------------------------------------------------------

function buildGroups(model: EntityModel, index: RelationIndex, data: EntityPageData): RelGroup[] {
	const key = model.node?.slug ?? model.slug
	const has = !!model.node
	const rel = (other: EntityKind, rollup = true): Row[] =>
		has
			? related(index, model.kind, key, other, { rollup }).map(({ node, count }) => ({
					kind: other,
					slug: node.slug,
					title: node.title,
					color: other === "style" || other === "category" || other === "tag" ? node.color : null,
					count,
			  }))
			: []
	/** content-named children merged with tasted ones (untasted show with no bar) */
	const withNamed = (rows: Row[], named: EntityCrumb[]): Row[] => {
		const out = [...rows]
		for (const c of named) {
			if (out.some((r) => r.slug === c.slug && r.kind === c.kind)) continue
			const node = index.nodes[c.kind].get(c.slug)
			out.push({
				kind: c.kind,
				slug: c.slug,
				title: c.title,
				color: node?.color ?? null,
				count: 0,
			})
		}
		return out
	}
	const countIn = (kind: EntityKind, slug: string) => index.nodes[kind].get(slug)?.all.length ?? 0

	const groups: (RelGroup | null)[] = []
	const push = (g: RelGroup) => groups.push(g.rows.length ? g : null)

	switch (model.kind) {
		case "origin": {
			push({
				key: "within",
				label: "within",
				kind: "origin",
				rows: data.children
					.map((c) => ({
						kind: "origin" as const,
						slug: c.slug,
						title: c.title,
						count: countIn("origin", c.slug),
					}))
					.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)),
			})
			push({ key: "vendors", label: "vendors here", kind: "vendor", rows: rel("vendor") })
			push({ key: "styles", label: "styles", kind: "style", rows: rel("style") })
			push({ key: "cultivars", label: "cultivars", kind: "cultivar", rows: rel("cultivar") })
			push({
				key: "nearby",
				label: "nearby",
				kind: "origin",
				hint: "as the crow flies",
				rows: data.nearby.map((n) => ({
					kind: "origin" as const,
					slug: n.crumb.slug,
					title: n.crumb.title,
					count: countIn("origin", n.crumb.slug),
					note: `${n.km.toLocaleString("en-US")} km`,
				})),
			})
			break
		}
		case "vendor": {
			push({ key: "origins", label: "sources", kind: "origin", rows: rel("origin", false) })
			push({ key: "styles", label: "styles", kind: "style", rows: rel("style") })
			push({ key: "categories", label: "categories", kind: "category", rows: rel("category") })
			push({ key: "cultivars", label: "cultivars", kind: "cultivar", rows: rel("cultivar") })
			break
		}
		case "style": {
			const category = data.ancestors[0]
			const siblings = category
				? (index.children.category.get(category.slug) ?? [])
						.filter((s) => s !== key)
						.map((s) => index.nodes.style.get(s))
						.filter((n): n is NonNullable<typeof n> => !!n)
						.map((n) => ({
							kind: "style" as const,
							slug: n.slug,
							title: n.title,
							color: n.color,
							count: n.all.length,
						}))
						.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
				: []
			push({
				key: "cultivars",
				label: "cultivars",
				kind: "cultivar",
				rows: withNamed(rel("cultivar"), data.children),
			})
			push({ key: "origins", label: "origins", kind: "origin", rows: rel("origin", false) })
			push({ key: "vendors", label: "vendors", kind: "vendor", rows: rel("vendor") })
			push({
				key: "siblings",
				label: category ? `also ${category.title.toLowerCase()}` : "siblings",
				kind: "style",
				hint: "sessions each",
				rows: siblings.map((r) => ({ ...r, note: String(r.count) })),
			})
			break
		}
		case "category": {
			push({
				key: "styles",
				label: "styles",
				kind: "style",
				rows: data.children
					.map((c) => {
						const node = index.nodes.style.get(c.slug)
						return {
							kind: "style" as const,
							slug: c.slug,
							title: c.title,
							color: node?.color ?? data.color,
							count: node?.all.length ?? 0,
						}
					})
					.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)),
			})
			push({ key: "origins", label: "origins", kind: "origin", rows: rel("origin", false) })
			push({ key: "vendors", label: "vendors", kind: "vendor", rows: rel("vendor") })
			push({ key: "cultivars", label: "cultivars", kind: "cultivar", rows: rel("cultivar") })
			break
		}
		case "cultivar": {
			push({
				key: "styles",
				label: "styles",
				kind: "style",
				rows: withNamed(rel("style"), data.children),
			})
			push({ key: "origins", label: "grown", kind: "origin", rows: rel("origin", false) })
			push({ key: "vendors", label: "vendors", kind: "vendor", rows: rel("vendor") })
			break
		}
		case "vessel": {
			// what goes in it: the categories and styles it brews, and where they grew
			push({ key: "categories", label: "brews", kind: "category", rows: rel("category") })
			push({ key: "styles", label: "styles", kind: "style", rows: rel("style") })
			push({ key: "origins", label: "origins", kind: "origin", rows: rel("origin", false) })
			push({ key: "vendors", label: "vendors", kind: "vendor", rows: rel("vendor") })
			break
		}
	}
	push({
		key: "tags",
		label: "moods",
		kind: "tag",
		hint: "filters the Explorer",
		rows: rel("tag").slice(0, 10),
	})

	return groups.filter((g): g is RelGroup => !!g)
}
