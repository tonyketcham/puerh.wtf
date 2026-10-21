"use client"

import StatusBarFrame from "@/lib/components/containers/StatusBarFrame"
import { useMemo, type ReactNode } from "react"
import { useAtomValue } from "jotai"
import { ENTITY_META } from "@/lib/entities"
import type { PageKind } from "@/lib/peek"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import MapLayerToggles from "@/lib/components/map/MapLayerToggles"
import { buildEntityModel } from "./model"
import { entityPageAtom, useHydrated } from "./state"

/** Index pages: what the bar names the collection. */
const PLURAL: Record<PageKind, string> = {
	origin: "origins",
	vendor: "vendors",
	style: "styles",
	category: "styles",
	cultivar: "cultivars",
	vessel: "vessels",
}

/**
 * The status bar on entity pages (plan §3.2), VS Code style:
 *
 *   [^ origin] 10 refs · 22.07°N 101.42°E · ±6 km · precision: mountain-area     2000–2020 · avg 84.7 · ■ #B0702C · ⌘K
 *
 * The kind block on the left is tinted with the entity's blended liquor. On an index page the
 * bar sums up the collection instead.
 */
export default function EntityStatusBar({ kind, slug }: { kind: PageKind; slug: string | null }) {
	const index = useAtomValue(relationIndexAtom)
	const page = useAtomValue(entityPageAtom)
	const hydrated = useHydrated()
	const data = hydrated && slug && page?.kind === kind && page.slug === slug ? page.data : null
	const model = useMemo(
		() =>
			slug
				? buildEntityModel(index, kind, slug, {
						color: data?.color,
						parentSlug: data?.ancestors[data.ancestors.length - 1]?.slug ?? null,
				  })
				: null,
		[index, kind, slug, data]
	)

	const left: ReactNode[] = []
	if (model) {
		const { stats } = model
		left.push(
			<span key="refs" title="Sessions behind this entity (find all references)">
				{stats.count} {stats.count === 1 ? "ref" : "refs"}
				{model.direct > 0 && model.direct < stats.count && (
					<span className="text-white/35"> ({model.direct} direct)</span>
				)}
			</span>
		)
		const geo = data?.geo
		if (geo && data?.originKind !== "unknown") {
			left.push(
				<span key="coords" className="tabular-nums" title="Coordinates (WGS84)">
					{Math.abs(geo.lat).toFixed(2)}°{geo.lat >= 0 ? "N" : "S"} {Math.abs(geo.lon).toFixed(2)}°
					{geo.lon >= 0 ? "E" : "W"}
				</span>
			)
			if (geo.radius_km) left.push(<span key="radius">±{geo.radius_km} km</span>)
			left.push(
				<span key="precision">
					<span className="text-white/35">precision:</span> {geo.precision}
				</span>
			)
		}
		if (data?.kind === "vendor" && data.place) left.push(<span key="place">{data.place}</span>)
		if (data?.kind === "style" && data.ancestors[0])
			left.push(<span key="cat">{data.ancestors[0].title.toLowerCase()}</span>)
		if (data?.kind === "vessel" && data.vessel) {
			const v = data.vessel
			if (v.kind) left.push(<span key="vkind">{v.kind}</span>)
			if (v.material) left.push(<span key="material">{v.material}</span>)
			if (v.volume_ml)
				left.push(
					<span key="volume" className="tabular-nums" title="What it holds">
						{v.volume_ml} ml
					</span>
				)
		}
		if (data?.kind === "cultivar" && data.hanzi)
			left.push(
				<span key="hanzi" lang="zh">
					{data.hanzi}
				</span>
			)
	} else {
		const nodes = index.nodes[kind]
		const tasted = kind === "category" ? index.nodes.style.size : nodes.size
		left.push(
			<span key="count">
				{tasted} {PLURAL[kind]} {kind === "vessel" ? "in use" : "tasted"}
			</span>
		)
		left.push(<span key="sessions">{index.sessions.length} sessions</span>)
	}

	return (
		<StatusBarFrame
			pageKey={slug ?? "index"}
			label={ENTITY_META[kind].label + " status"}
			recordingKey="entity-status-bar"
			glyph={ENTITY_META[kind].glyph}
			name={slug ? ENTITY_META[kind].label : PLURAL[kind]}
			accent={model?.accent ?? null}
			stats={model?.stats}
			left={left}
			leftClassName={kind === "origin" && !slug ? "hidden md:flex" : undefined}
			afterLeft={
				kind === "origin" && !slug ? (
					<MapLayerToggles className="pl-2.5 border-l border-white/[0.07]" />
				) : undefined
			}
		/>
	)
}
