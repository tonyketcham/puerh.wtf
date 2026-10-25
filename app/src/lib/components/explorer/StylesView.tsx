"use client"

import VirtualList from "./VirtualList"

import { memo, useCallback, useMemo } from "react"
import { useAtom } from "jotai"
import { isEntityFiltered } from "@/lib/filters"
import { entityHref } from "@/lib/entities"
import { sessionColor } from "@/lib/relations"
import type { Category } from "@/lib/types/category"
import type { ExplorerSession } from "@/lib/types/session"
import EntityRow from "./EntityRow"
import { CupStrip } from "./marks"
import ViewHeader, { IndexLink } from "./ViewHeader"
import { styleGroupsClosedAtom } from "./state"
import { countBy, stripSlash, type EntityViewProps } from "./views"

type Row =
	| {
			kind: "category"
			slug: string
			title: string
			color?: string
			sessions: ExplorerSession[]
			total: number
			open: boolean
			hasChildren: boolean
	  }
	| {
			kind: "style"
			slug: string
			title: string
			color?: string
			sessions: ExplorerSession[]
			total: number
			parent: string
	  }

/**
 * Styles grouped under their tea category (the category's color carries down), each with
 * its sessions' cups. Categories fold; a category row filters or opens the whole group.
 */
function StylesView({
	categories,
	index,
	pool,
	filters,
	narrowed,
	pathname,
	onToggleFilter,
}: EntityViewProps & { categories: Category[] }) {
	const [closed, setClosed] = useAtom(styleGroupsClosedAtom)
	const byCategory = useMemo(() => countBy(pool, "category"), [pool])
	const byStyle = useMemo(() => countBy(pool, "style"), [pool])

	const { rows, styleCount } = useMemo(() => {
		const rows: Row[] = []
		let styleCount = 0
		const cats = categories
			.map((c) => ({ c, sessions: byCategory.get(c._slug) ?? [] }))
			.filter(
				({ c, sessions }) =>
					sessions.length > 0 ||
					isEntityFiltered(filters, "category", c._slug) ||
					(index.children.category.get(c._slug) ?? []).some((st) =>
						isEntityFiltered(filters, "style", st)
					) ||
					(!narrowed && index.nodes.category.has(c._slug))
			)
			.sort((a, b) => b.sessions.length - a.sessions.length || a.c.title.localeCompare(b.c.title))
		for (const { c, sessions } of cats) {
			const styles = (index.children.category.get(c._slug) ?? [])
				.map((slug) => ({ node: index.nodes.style.get(slug), sessions: byStyle.get(slug) ?? [] }))
				// a filtered style stays listed even when nothing passes, so it can be turned off here
				.filter(
					(s) =>
						s.node && (s.sessions.length > 0 || isEntityFiltered(filters, "style", s.node.slug))
				)
				.sort(
					(a, b) =>
						b.sessions.length - a.sessions.length || a.node!.title.localeCompare(b.node!.title)
				)
			styleCount += styles.length
			const open = !closed.has(c._slug)
			rows.push({
				kind: "category",
				slug: c._slug,
				title: c.title,
				color: c.color ?? undefined,
				sessions,
				total: index.nodes.category.get(c._slug)?.all.length ?? 0,
				open,
				hasChildren: styles.length > 0,
			})
			if (!open) continue
			for (const { node, sessions: ss } of styles) {
				rows.push({
					kind: "style",
					slug: node!.slug,
					title: node!.title,
					color: node!.color || c.color || undefined,
					sessions: ss,
					total: node!.all.length,
					parent: c._slug,
				})
			}
		}
		return { rows, styleCount }
	}, [categories, byCategory, byStyle, index, closed, narrowed, filters])

	const onOpenChange = useCallback(
		(slug: string, open: boolean) =>
			setClosed((s) => {
				const next = new Set(s)
				if (open) next.delete(slug)
				else next.add(slug)
				return next
			}),
		[setClosed]
	)

	return (
		<div data-explorer-view="styles">
			<ViewHeader label="Styles" count={styleCount} noun={styleCount === 1 ? "style" : "styles"}>
				<IndexLink href="/styles/" pathname={pathname} recordingKey="explorer-styles-index" />
			</ViewHeader>
			<VirtualList
				items={rows}
				getKey={(row) => `${row.kind}:${row.slug}`}
				rowHeight={(row) => (row.kind === "category" && row !== rows[0] ? 32 : 28)}
				label="Styles by category"
				rowClassName={(row) => (row.kind === "category" && row !== rows[0] ? "pt-1" : undefined)}
				getFocusKey={(row) => row.slug}
				renderRow={(row, i) => (
					<>
						{row.kind === "category" ? (
							<EntityRow
								kind="category"
								slug={row.slug}
								title={row.title}
								count={row.sessions.length}
								total={row.total}
								mark={
									<span aria-hidden className="grid size-4 shrink-0 place-items-center">
										<span
											className="size-2.5 rounded-[3px]"
											style={{
												background: row.color,
												boxShadow: `0 0 8px -1px ${row.color}`,
											}}
										/>
									</span>
								}
								expandable={row.hasChildren}
								open={row.open}
								onOpenChange={onOpenChange}
								filtered={isEntityFiltered(filters, "category", row.slug)}
								onToggleFilter={onToggleFilter}
								current={pathname === stripSlash(entityHref("category", row.slug) ?? "")}
								muted={row.sessions.length === 0}
								recordingKey={`explorer-category-${row.slug}`}
							/>
						) : (
							<EntityRow
								kind="style"
								slug={row.slug}
								title={row.title}
								count={row.sessions.length}
								total={row.total}
								mark={
									<span
										aria-hidden
										className="grid size-4 shrink-0 place-items-center text-[12px] leading-none"
										style={{ color: row.color }}
									>
										~
									</span>
								}
								trailing={<CupStrip colors={row.sessions.map(sessionColor)} index={i} />}
								depth={1}
								parentSlug={row.parent}
								filtered={isEntityFiltered(filters, "style", row.slug)}
								onToggleFilter={onToggleFilter}
								current={pathname === stripSlash(entityHref("style", row.slug) ?? "")}
								recordingKey={`explorer-style-${row.slug}`}
							/>
						)}
					</>
				)}
			/>
			{rows.length === 0 && <p className="px-2 py-1.5 text-xs text-white/35">nothing matches</p>}
		</div>
	)
}

export default memo(StylesView)
