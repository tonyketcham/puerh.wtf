"use client"

import { Suspense, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import EntityRef from "@/lib/components/entity/EntityRef"
import { ENTITY_META, type EntityKind } from "@/lib/entities"
import { related, type RelationIndex } from "@/lib/relations"
import { cn } from "@/lib/utils/cn"
import type { EntityCrumb, EntityPageData } from "./data"
import type { EntityModel } from "./model"

const EASE = [0.22, 1, 0.36, 1] as const
const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const
const COLLAPSED = 6

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
					group={g}
					total={model.stats.count}
					order={i}
					accent={model.accentText}
				/>
			))}
		</div>
	)
}

function RelatedGroup({
	group,
	total,
	order,
	accent,
}: {
	group: RelGroup
	total: number
	order: number
	accent: string
}) {
	const reduce = useReducedMotion() ?? false
	const [open, setOpen] = useState(false)
	const shown = open ? group.rows : group.rows.slice(0, COLLAPSED)
	const more = group.rows.length - COLLAPSED

	return (
		<div className="min-w-0 space-y-2" data-related={group.key}>
			<h3 className="flex items-center gap-2 text-[11px] text-white/40">
				<span aria-hidden className="text-white/25">
					{ENTITY_META[group.kind].glyph}
				</span>
				<span className="tracking-[0.1em] uppercase">{group.label}</span>
				<span className="tabular-nums text-white/25">{group.rows.length}</span>
				{group.hint && <span className="text-white/25 normal-case">· {group.hint}</span>}
			</h3>
			<motion.ul layout={reduce ? false : "size"} transition={SPRING} className="space-y-1">
				<AnimatePresence initial={false}>
					{shown.map((row, i) => (
						<motion.li
							key={`${row.kind}:${row.slug}`}
							layout={reduce ? false : "position"}
							className="grid grid-cols-[minmax(0,auto)_minmax(2rem,1fr)_auto] items-center gap-3"
							initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, transition: { duration: 0.12 } }}
							transition={{
								duration: 0.35,
								ease: EASE,
								delay: reduce
									? 0
									: i < COLLAPSED
									? order * 0.05 + i * 0.03
									: (i - COLLAPSED) * 0.025,
							}}
						>
							<Suspense fallback={<span className="text-xs text-white/70">{row.title}</span>}>
								<EntityRef
									kind={row.kind}
									slug={row.slug}
									label={row.title}
									color={row.color}
									className={cn(row.count === 0 && !row.note && "opacity-55")}
								/>
							</Suspense>
							{row.note ? (
								<span aria-hidden className="h-px bg-white/[0.06]" />
							) : (
								<span
									aria-hidden
									className="relative h-1 rounded-full bg-white/[0.04] overflow-hidden"
								>
									{row.count > 0 && (
										<motion.span
											className="absolute inset-y-0 left-0 origin-left rounded-full"
											style={{
												width: `${Math.max(4, (row.count / Math.max(1, total)) * 100)}%`,
												backgroundColor: row.color || accent,
												opacity: 0.8,
											}}
											initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
											animate={reduce ? { opacity: 0.8 } : { scaleX: 1 }}
											transition={
												reduce
													? { duration: 0.2 }
													: { ...SPRING, delay: 0.15 + order * 0.05 + i * 0.03 }
											}
										/>
									)}
								</span>
							)}
							<span className="text-[11px] tabular-nums text-white/35 min-w-[3ch] text-right">
								{row.note ?? (row.count > 0 ? row.count : "untasted")}
							</span>
						</motion.li>
					))}
				</AnimatePresence>
			</motion.ul>
			{more > 0 && (
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					aria-expanded={open}
					className="h-6 px-1 -ml-1 text-[10px] rounded-[4px] outline-none text-white/35 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
				>
					{open ? "show fewer" : `+${more} more`}
				</button>
			)}
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
