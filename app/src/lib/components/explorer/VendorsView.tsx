"use client"

import VirtualList from "./VirtualList"

import { memo, useMemo } from "react"
import { isEntityFiltered } from "@/lib/filters"
import { entityHref } from "@/lib/entities"
import type { Vendor } from "@/lib/types/vendor"
import EntityRow from "./EntityRow"
import { MixBar, type MixSegment } from "./marks"
import ViewHeader, { IndexLink } from "./ViewHeader"
import { countBy, stripSlash, type EntityViewProps } from "./views"

/**
 * Vendors by how many sessions they supplied, each with the category mix of its teas.
 * Vendors with no tasted tea stay at the bottom, dimmed, while nothing is filtered.
 */
function VendorsView({
	vendors,
	pool,
	filters,
	narrowed,
	pathname,
	onToggleFilter,
	index,
}: EntityViewProps & { vendors: Vendor[] }) {
	const counts = useMemo(() => countBy(pool, "vendor"), [pool])

	const rows = useMemo(() => {
		const list = vendors.map((v) => {
			const sessions = counts.get(v._slug) ?? []
			const mix = new Map<string, MixSegment>()
			for (const s of sessions) {
				const cat = s.style?.[0]?.category
				const key = cat?._slug ?? "?"
				const seg = mix.get(key)
				if (seg) seg.count++
				else
					mix.set(key, {
						key,
						color: cat?.color ?? "rgb(255 255 255 / 0.25)",
						count: 1,
						label: cat?.title ?? "unstyled",
					})
			}
			return {
				vendor: v,
				count: sessions.length,
				total: index.nodes.vendor.get(v._slug)?.all.length ?? 0,
				mix: [...mix.values()].sort((a, b) => b.count - a.count),
			}
		})
		return (
			list
				// a filtered vendor stays listed even when nothing passes, so it can be turned off here
				.filter(
					(r) => !narrowed || r.count > 0 || isEntityFiltered(filters, "vendor", r.vendor._slug)
				)
				.sort((a, b) => b.count - a.count || a.vendor.title.localeCompare(b.vendor.title))
		)
	}, [vendors, counts, narrowed, index, filters])

	return (
		<div data-explorer-view="vendors">
			<ViewHeader
				label="Vendors"
				count={rows.length}
				noun={rows.length === 1 ? "vendor" : "vendors"}
			>
				<IndexLink href="/vendors/" pathname={pathname} recordingKey="explorer-vendors-index" />
			</ViewHeader>
			<VirtualList
				items={rows}
				getKey={(row) => row.vendor._slug}
				rowHeight={28}
				label="Vendors"
				renderRow={({ vendor, count, total, mix }, i) => (
					<>
						<EntityRow
							kind="vendor"
							slug={vendor._slug}
							title={vendor.title}
							count={count}
							total={total}
							flat
							mark={
								<span
									aria-hidden
									className="grid size-4 shrink-0 place-items-center text-[12px] leading-none text-white/35"
								>
									@
								</span>
							}
							trailing={<MixBar segments={mix} index={i} />}
							filtered={isEntityFiltered(filters, "vendor", vendor._slug)}
							onToggleFilter={onToggleFilter}
							current={pathname === stripSlash(entityHref("vendor", vendor._slug) ?? "")}
							muted={count === 0}
							recordingKey={`explorer-vendor-${vendor._slug}`}
						/>
					</>
				)}
			/>
			{rows.length === 0 && <p className="px-2 py-1.5 text-xs text-white/35">nothing matches</p>}
		</div>
	)
}

export default memo(VendorsView)
