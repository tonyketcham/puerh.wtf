"use client"

import Link from "next/link"
import { Suspense, useMemo, type CSSProperties, type ReactNode } from "react"
import { useAtomValue } from "jotai"
import { useSearchParams } from "next/navigation"
import { ChevronRight, Filter } from "lucide-react"
import EntityRef from "@/lib/components/entity/EntityRef"
import { ENTITY_META } from "@/lib/entities"
import { readFilters, replaceFilters } from "@/lib/filters"
import { peekFileName, peekFilter, type PageKind } from "@/lib/peek"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils/cn"
import AtAGlance from "./AtAGlance"
import type { EntityPageData } from "./data"
import type { DotMapPoint } from "./DotMap"
import type { MapPoint } from "@/lib/components/map/points"
import EntityTitle from "./EntityTitle"
import Hero from "./Hero"
import { buildEntityModel, liquorStops, type EntityModel } from "./model"
import Related from "./Related"
import Section from "./Section"
import SessionsList from "./SessionsList"
import SetEntityPage from "./SetEntityPage"
import { useMorphClick } from "./viewTransition"

/** Index page each kind's breadcrumb starts from. */
export const INDEX_OF: Record<PageKind, { label: string; href: string; kind: PageKind }> = {
	origin: { label: "origins", href: "/origins/", kind: "origin" },
	vendor: { label: "vendors", href: "/vendors/", kind: "vendor" },
	style: { label: "styles", href: "/styles/", kind: "style" },
	category: { label: "styles", href: "/styles/", kind: "style" },
	cultivar: { label: "cultivars", href: "/cultivars/", kind: "cultivar" },
	vessel: { label: "teaware", href: "/teaware/", kind: "vessel" },
}

/**
 * The entity page template (plan §3.2), "Go to Definition" for vendors, origins, styles,
 * categories, cultivars and vessels:
 *
 *   breadcrumb ................................................ [yiwu.origin]
 *   TITLE (Rock 3D, filled with its sessions' liquors)
 *   hanzi · pinyin · kind · coordinates
 *   [ hero ]
 *   ── At a glance ──  counts, vintages, rating, liquor; centroid over the parent's
 *   ── Sessions ──     find all references, sortable, grouped by child
 *   ── Related ──      cross-links from co-occurrence
 *   ── Notes ──        the description
 *
 * Relations come from the client relation index (hydrated by the root layout); the server
 * hands in what only content knows (data), the session cards and the description, rendered.
 */
export default function EntityPage({
	data,
	cards,
	lead,
	notes,
	points = [],
	mapPoints,
}: {
	data: EntityPageData
	/** server-rendered SessionCards by session slug */
	cards: Record<string, ReactNode>
	/** the description's first paragraph, for heroes that set it as prose */
	lead?: ReactNode
	/** the rest of the description (or all of it) */
	notes?: ReactNode
	/** origins as dots for the vendor / cultivar hero */
	points?: DotMapPoint[]
	/** origin pages: placed origins for the hero map */
	mapPoints?: MapPoint[]
}) {
	const index = useAtomValue(relationIndexAtom)
	const model = useMemo(
		() =>
			buildEntityModel(index, data.kind, data.slug, {
				color: data.color,
				parentSlug: data.ancestors[data.ancestors.length - 1]?.slug ?? null,
			}),
		[index, data]
	)
	const stops = useMemo(() => liquorStops(model.sessions), [model.sessions])

	return (
		<div
			className="space-y-10"
			data-entity-root
			data-entity-kind={data.kind}
			data-entity-slug={data.slug}
			style={{ "--entity-accent": model.accentText } as CSSProperties}
		>
			<SetEntityPage data={data} />

			<header className="space-y-4">
				<Suspense fallback={<div className="h-6" />}>
					<Crumbs data={data} model={model} />
				</Suspense>

				<EntityTitle
					kind={data.kind}
					slug={data.slug}
					title={data.title}
					stops={stops}
					recordingKey="entity-title"
				/>

				<Subtitle data={data} model={model} />
			</header>

			<div className="space-y-14">
				<Hero data={data} model={model} lead={lead} points={points} mapPoints={mapPoints} />

				<Section id="glance" label="At a glance" recordingKey="entity-at-a-glance">
					<AtAGlance model={model} index={index} title={data.title} />
				</Section>

				<Section
					id="sessions"
					label="Sessions"
					count={model.sessions.length || undefined}
					aside={<span className="text-[11px] text-white/25">find all references</span>}
					recordingKey="entity-sessions"
				>
					<SessionsList model={model} index={index} title={data.title} cards={cards} />
				</Section>

				<Section id="related" label="Related" recordingKey="entity-related">
					<Related model={model} index={index} data={data} />
				</Section>

				{notes && (
					<Section id="notes" label="Notes" recordingKey="entity-notes">
						<div className="text-[15px] leading-relaxed max-w-prose text-white/75">{notes}</div>
					</Section>
				)}
			</div>
		</div>
	)
}

/** `origins › China › Yunnan › Xishuangbanna › Yiwu` ............... `^ yiwu.origin` [Filter] */
function Crumbs({ data, model }: { data: EntityPageData; model: EntityModel }) {
	const root = INDEX_OF[data.kind]
	const rootMorph = useMorphClick(root.kind, "_index", root.href)
	const sep = (
		<ChevronRight aria-hidden size={12} strokeWidth={1.5} className="shrink-0 text-white/20" />
	)
	return (
		<div className="flex items-center min-w-0 gap-4">
			<nav aria-label="Breadcrumb" className="min-w-0 flex-1">
				<ol className="flex items-center min-w-0 gap-1 overflow-hidden text-xs leading-6 whitespace-nowrap">
					<li className="shrink-0">
						<Link
							href={root.href}
							// the crumb grows into the index's title
							onClick={rootMorph}
							className="rounded-sm outline-none text-white/40 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
						>
							{root.label}
						</Link>
					</li>
					{/* a narrow editor folds all but the parent into an ellipsis (they stay for readers);
					    the file tab shares the line, so this folds sooner than the session trail */}
					{data.ancestors.length > 1 && (
						<li
							aria-hidden
							title={data.ancestors
								.slice(0, -1)
								.map((a) => a.title)
								.join(" › ")}
							className="items-center hidden gap-1 shrink-0 @max-3xl/editor:flex text-white/35"
						>
							{sep}…
						</li>
					)}
					{data.ancestors.map((a, i) => (
						<li
							key={`${a.kind}:${a.slug}`}
							className={cn(
								"flex items-center min-w-[4ch] gap-1",
								i < data.ancestors.length - 1 && "@max-3xl/editor:sr-only"
							)}
						>
							{sep}
							<EntityRef
								kind={a.kind}
								slug={a.slug}
								label={a.title}
								variant="crumb"
								glyph={false}
							/>
						</li>
					))}
					{/* the title sits right under it; a narrow line spends its room on the way back */}
					<li
						className="flex items-center gap-1 shrink-0 @max-xl/editor:sr-only"
						aria-current="page"
					>
						{sep}
						<span className="text-white/90">{data.title}</span>
						{data.hanzi && (
							<span lang="zh" className="text-white/30">
								{data.hanzi}
							</span>
						)}
					</li>
				</ol>
			</nav>
			<FileTab data={data} model={model} />
		</div>
	)
}

/** The editor tab: `^ yiwu.origin`, plus the Explorer filter this page stands for. */
function FileTab({ data, model }: { data: EntityPageData; model: EntityModel }) {
	const params = useSearchParams()
	const target = { kind: data.kind, key: data.slug }
	const filter = peekFilter(target, data.title)
	const active = filter ? filter.active(readFilters(params)) : false
	return (
		<div className="flex items-center gap-1.5 shrink-0">
			<span
				className="inline-flex items-center h-6 gap-1.5 px-2 text-[11px] rounded-t-[5px] border-b-2 bg-white/[0.03] text-white/70"
				style={{ borderBottomColor: model.accentText }}
				title="This page, named like a file"
			>
				<span aria-hidden style={{ color: model.accentText }}>
					{ENTITY_META[data.kind].glyph}
				</span>
				{peekFileName(target)}
			</span>
			{filter && model.stats.count > 0 && (
				<button
					type="button"
					aria-pressed={active}
					onClick={() => replaceFilters((s) => filter.toggle(s))}
					title={active ? "Remove the Explorer filter" : `Show only ${data.title} in the Explorer`}
					className={cn(
						"inline-flex items-center h-6 gap-1 px-1.5 text-[11px] rounded-[5px] outline-none ring-1 ring-inset transition-colors",
						"focus-visible:ring-white/50",
						active
							? "text-white ring-white/30 bg-white/[0.08]"
							: "text-white/45 ring-white/[0.08] hover:text-white hover:bg-white/[0.05]"
					)}
				>
					<Filter size={11} strokeWidth={2} aria-hidden />
					{/* a phone-width line keeps the funnel; the word gives its room to the crumbs */}
					<span className="@max-sm/editor:sr-only">{active ? "filtered" : "filter"}</span>
				</button>
			)}
		</div>
	)
}

/** `易武 · Yìwǔ · mountain-area · 21.98°N 101.47°E ±15 km`, per kind. */
function Subtitle({ data, model }: { data: EntityPageData; model: EntityModel }) {
	const parts: ReactNode[] = []
	switch (data.kind) {
		case "origin":
			if (data.hanzi)
				parts.push(
					<span lang="zh" className="text-white/70">
						{data.hanzi}
					</span>
				)
			if (data.pinyin) parts.push(data.pinyin)
			if (data.originKind) parts.push(data.originKind)
			if (data.geo && data.originKind !== "unknown")
				parts.push(
					<span className="tabular-nums">
						{Math.abs(data.geo.lat).toFixed(2)}°{data.geo.lat >= 0 ? "N" : "S"}{" "}
						{Math.abs(data.geo.lon).toFixed(2)}°{data.geo.lon >= 0 ? "E" : "W"}
						{data.geo.radius_km ? ` ±${data.geo.radius_km} km` : ""}
					</span>
				)
			break
		case "vendor":
			if (data.place) parts.push(data.place)
			parts.push(`${model.stats.count} ${model.stats.count === 1 ? "session" : "sessions"}`)
			break
		case "style":
			if (data.ancestors[0]) parts.push(data.ancestors[0].title.toLowerCase())
			if (data.children.length)
				parts.push(
					`${data.children.length} ${
						data.children.length === 1 ? "cultivar" : "cultivars"
					} on record`
				)
			break
		case "category":
			parts.push(`${data.children.length} ${data.children.length === 1 ? "style" : "styles"}`)
			parts.push(`${model.stats.count} ${model.stats.count === 1 ? "session" : "sessions"}`)
			break
		case "cultivar":
			if (data.hanzi)
				parts.push(
					<span lang="zh" className="text-white/70">
						{data.hanzi}
					</span>
				)
			parts.push("cultivar")
			break
		case "vessel":
			if (data.hanzi)
				parts.push(
					<span lang="zh" className="text-white/70">
						{data.hanzi}
					</span>
				)
			if (data.vessel?.kind) parts.push(data.vessel.kind)
			if (data.vessel?.material) parts.push(data.vessel.material)
			if (data.vessel?.volume_ml)
				parts.push(<span className="tabular-nums">{data.vessel.volume_ml} ml</span>)
			break
	}
	if (!parts.length) return null
	return (
		<p className="flex flex-wrap items-center text-sm gap-x-2 gap-y-1 text-white/45">
			{parts.map((p, i) => (
				<span key={i} className="inline-flex items-center gap-2">
					{i > 0 && (
						<span aria-hidden className="text-white/20">
							·
						</span>
					)}
					{p}
				</span>
			))}
		</p>
	)
}
