"use client"

import { useMemo } from "react"
import { useAtomValue } from "jotai"
import { motion, useReducedMotion } from "motion/react"
import FlavorGlyph from "@/lib/components/command/FlavorGlyph"
import { related } from "@/lib/relations"
import { formatRating } from "@/lib/sessionSort"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils/cn"
import type { EntityListItem } from "@/lib/content/entities"
import DotMap, { type DotMapPoint } from "../page/DotMap"
import { Logo } from "../page/Hero"
import { buildEntityModel } from "../page/model"
import { EntityLink, IndexHeader } from "./IndexParts"

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * /vendors (plan §3.3): a card per vendor, most-tasted first. Each card: logo, city, count,
 * the category mix it sells as one segmented bar, its flavor centroid, and a dot-map of the
 * origins it sourced from.
 */
export default function VendorIndex({
	vendors,
	points,
}: {
	vendors: EntityListItem[]
	/** sourced origins per vendor slug */
	points: Record<string, DotMapPoint[]>
}) {
	const index = useAtomValue(relationIndexAtom)
	const reduce = useReducedMotion() ?? false

	const cards = useMemo(
		() =>
			vendors
				.map((v) => {
					const model = buildEntityModel(index, "vendor", v.slug)
					const stats = model.stats
					const mix = stats.count ? related(index, "vendor", v.slug, "category") : []
					return { v, stats, mix, accent: stats.count ? model.accentText : null }
				})
				.sort((a, b) => b.stats.count - a.stats.count || a.v.title.localeCompare(b.v.title)),
		[vendors, index]
	)
	const tasted = cards.filter((c) => c.stats.count > 0).length

	return (
		<div className="space-y-10">
			<IndexHeader
				kind="vendor"
				title="Vendors"
				summary={`// ${vendors.length} vendors · ${tasted} tasted · by sessions`}
			/>
			<ul
				className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
				data-recording-key="vendor-index"
			>
				{cards.map(({ v, stats, mix, accent }, i) => {
					const total = mix.reduce((n, m) => n + m.count, 0)
					return (
						<motion.li
							key={v.slug}
							initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							transition={
								reduce
									? { duration: 0.2 }
									: { duration: 0.45, ease: EASE, delay: Math.min(i, 12) * 0.035 }
							}
						>
							<EntityLink
								kind="vendor"
								slug={v.slug}
								className={cn(
									"group flex flex-col h-full overflow-hidden rounded-xl outline-none",
									"ring-1 ring-inset ring-white/[0.07] bg-white/[0.015] transition-[box-shadow,background-color,transform] duration-200",
									"hover:ring-white/[0.16] hover:bg-white/[0.03] hover:-translate-y-0.5 focus-visible:ring-white/50",
									!stats.count && "opacity-60"
								)}
								data-vendor={v.slug}
							>
								<div className="flex items-center gap-3 p-4">
									<Logo src={v.image} title={v.title} className="text-xl size-11" />
									<div className="min-w-0 flex-1">
										<p
											className="text-base font-medium leading-tight text-white truncate"
											data-morph-title
										>
											{v.title}
										</p>
										<p className="text-[11px] truncate text-white/40">{v.place ?? "—"}</p>
									</div>
									<div className="flex flex-col items-end shrink-0">
										<span className="text-xl leading-none tabular-nums text-white">
											{stats.count}
										</span>
										<span className="text-[10px] text-white/35">
											{stats.count === 1 ? "session" : "sessions"}
										</span>
									</div>
								</div>

								{total > 0 && (
									<div
										aria-hidden
										className="flex h-1 mx-4 gap-px overflow-hidden rounded-full bg-white/[0.04]"
									>
										{mix.map((m, j) => (
											<motion.span
												key={m.node.slug}
												className="h-full origin-left"
												style={{
													width: `${(m.count / total) * 100}%`,
													backgroundColor: m.node.color || "#d9a441",
												}}
												initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
												animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
												transition={{
													duration: 0.45,
													ease: EASE,
													delay: 0.2 + Math.min(i, 12) * 0.035 + j * 0.04,
												}}
											/>
										))}
									</div>
								)}

								<div className="relative flex-1 min-h-24 mt-2">
									{points[v.slug]?.length ? (
										<DotMap
											points={points[v.slug]}
											width={300}
											height={96}
											labels={2}
											accent={accent ?? undefined}
											interactive={false}
										/>
									) : (
										<p className="px-4 pt-3 text-[10.5px] text-white/30">
											{stats.count ? "// sourcing undisclosed" : "// not tasted yet"}
										</p>
									)}
								</div>

								<div className="flex items-center gap-2 px-4 py-2.5 border-t border-white/[0.05] text-[11px] text-white/45">
									{stats.centroid && accent && (
										<FlavorGlyph axes={stats.centroid} color={accent} active={false} size={22} />
									)}
									<span className="truncate">
										{mix
											.slice(0, 3)
											.map((m) => m.node.title.toLowerCase())
											.join(" · ") || "—"}
									</span>
									<span className="flex-1" />
									{stats.avgRating != null && (
										<span className="tabular-nums whitespace-nowrap shrink-0">
											<span className="text-white/30">avg</span>{" "}
											{formatRating(Math.round(stats.avgRating * 10) / 10)}
										</span>
									)}
								</div>
							</EntityLink>
						</motion.li>
					)
				})}
			</ul>
		</div>
	)
}
