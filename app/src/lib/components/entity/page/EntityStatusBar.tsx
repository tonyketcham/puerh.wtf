"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ENTITY_META } from "@/lib/entities"
import { liquorInk, type RGB } from "@/lib/liquor"
import type { PageKind } from "@/lib/peek"
import { formatRating } from "@/lib/sessionSort"
import { openCommandBarAtom, relationIndexAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils/cn"
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
	const openCommandBar = useSetAtom(openCommandBarAtom)
	const reduce = useReducedMotion() ?? false
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

	const [isMac, setIsMac] = useState(true)
	useEffect(() => {
		setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
	}, [])

	const left: ReactNode[] = []
	const right: ReactNode[] = []
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
		if (data?.kind === "cultivar" && data.hanzi)
			left.push(
				<span key="hanzi" lang="zh">
					{data.hanzi}
				</span>
			)

		if (stats.years)
			right.push(
				<span key="years" className="tabular-nums" title="Vintages">
					{stats.years[0] === stats.years[1]
						? stats.years[0]
						: `${stats.years[0]}–${stats.years[1]}`}
				</span>
			)
		if (stats.avgRating != null)
			right.push(
				<span key="avg" className="tabular-nums" title="Average rating">
					<span className="text-white/35">avg</span>{" "}
					{formatRating(Math.round(stats.avgRating * 10) / 10)}
				</span>
			)
	} else {
		const nodes = index.nodes[kind]
		const tasted = kind === "category" ? index.nodes.style.size : nodes.size
		left.push(
			<span key="count">
				{tasted} {PLURAL[kind]} tasted
			</span>
		)
		left.push(<span key="sessions">{index.sessions.length} sessions</span>)
	}

	const accent = model?.accent ?? null
	const ink = accent ? liquorInk(hexRgb(accent)) : "#121012"

	return (
		<footer
			className={cn(
				"fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-between h-[var(--statusbar-h)]",
				"border-t border-white/[0.07] bg-[#161416] font-fira-code text-[11px] leading-none text-white/55",
				"overflow-hidden"
			)}
			aria-label={`${ENTITY_META[kind].label} status`}
			data-recording-key="entity-status-bar"
		>
			<AnimatePresence initial={false} mode="popLayout">
				<motion.div
					key={slug ?? "index"}
					className="flex items-stretch justify-between flex-1 min-w-0"
					initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
					transition={{ type: "spring", stiffness: 420, damping: 34 }}
				>
					<div className="flex items-stretch min-w-0">
						<div
							className="flex items-center gap-1.5 px-3 font-medium transition-colors duration-500"
							style={{
								backgroundColor: accent ?? "rgb(255 255 255 / 0.08)",
								color: accent ? ink : "rgb(255 255 255 / 0.7)",
							}}
						>
							<span aria-hidden>{ENTITY_META[kind].glyph}</span>
							{slug ? ENTITY_META[kind].label : PLURAL[kind]}
						</div>
						<div className="flex items-center min-w-0 gap-0 px-2.5 overflow-hidden whitespace-nowrap">
							{left.map((part, i) => (
								<span key={i} className="flex items-center">
									{i > 0 && <span className="px-1.5 text-white/20">·</span>}
									{part}
								</span>
							))}
						</div>
						{/* the origin map's layers (plan §4.5), on /origins */}
						{kind === "origin" && !slug && (
							<MapLayerToggles className="pl-2.5 border-l border-white/[0.07]" />
						)}
					</div>
					<div className="flex items-stretch shrink-0">
						{right.map((part, i) => (
							<div key={i} className="flex items-center px-2.5">
								{part}
							</div>
						))}
						{accent && (
							<div
								className="flex items-center gap-1.5 px-2.5"
								title="Blended liquor of its sessions"
							>
								<span
									aria-hidden
									className="size-2.5 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
									style={{ backgroundColor: accent }}
								/>
								<span className="uppercase">{accent}</span>
							</div>
						)}
						<button
							type="button"
							title="Command bar"
							onClick={() => openCommandBar({})}
							className="flex items-center px-2.5 pr-3 text-white/35 outline-none hover:bg-white/[0.06] hover:text-white/85 focus-visible:bg-white/[0.08]"
						>
							<kbd className="font-fira-code">{isMac ? "⌘K" : "Ctrl K"}</kbd>
						</button>
					</div>
				</motion.div>
			</AnimatePresence>
		</footer>
	)
}

function hexRgb(hex: string): RGB {
	const h = hex.replace("#", "")
	const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
	const n = parseInt(full.slice(0, 6), 16)
	return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [217, 164, 65]
}
