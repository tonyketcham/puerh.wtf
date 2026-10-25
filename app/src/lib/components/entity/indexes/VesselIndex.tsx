"use client"

import { useMemo } from "react"
import { useAtomValue } from "jotai"
import { motion, useReducedMotion } from "motion/react"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils/cn"
import type { EntityListItem } from "@/lib/content/entities"
import { buildEntityModel } from "../page/model"
import { brewFacts, brewProfile, rotationLabel, timeDomain } from "../vessel/brew"
import UseStrip from "../vessel/UseStrip"
import VesselPhoto from "../vessel/VesselPhoto"
import { EntityLink, IndexHeader } from "./IndexParts"

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * /teaware (plan §2.3, §3.5): every vessel as a card, most used first: the vessel in use (or
 * its line silhouette), shape, body and volume, the mean brew, and a rotation strip drawn on
 * the whole log's timeline, so the cards read together as a history of the tea table (the
 * shiboridashi hands over to the xishi, then the cat gaiwan takes over).
 */
export default function VesselIndex({ vessels }: { vessels: EntityListItem[] }) {
	const index = useAtomValue(relationIndexAtom)
	const reduce = useReducedMotion() ?? false
	const domain = useMemo(() => timeDomain(index.sessions), [index.sessions])

	const cards = useMemo(
		() =>
			vessels
				.map((v) => {
					const model = buildEntityModel(index, "vessel", v.slug)
					return {
						v,
						model,
						facts: brewFacts(brewProfile(model.sessions)).slice(0, 3),
						rotation: rotationLabel(model.sessions),
					}
				})
				.sort(
					(a, b) => b.model.stats.count - a.model.stats.count || a.v.title.localeCompare(b.v.title)
				),
		[vessels, index]
	)
	const used = cards.filter((c) => c.model.stats.count).length

	return (
		<div className="space-y-10">
			<IndexHeader
				kind="vessel"
				title="Teaware"
				summary={`// ${vessels.length} vessels · ${used} in the log · ${index.sessions.length} sessions poured`}
			/>
			<ol className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-recording-key="vessel-index">
				{cards.map(({ v, model, facts, rotation }, i) => {
					const spec = [
						v.vessel?.kind,
						v.vessel?.material,
						v.vessel?.volume_ml ? `${v.vessel.volume_ml} ml` : null,
					]
						.filter(Boolean)
						.join(" · ")
					const count = model.stats.count
					return (
						<motion.li
							key={v.slug}
							className={cn(
								"relative flex flex-col overflow-hidden rounded-lg ring-1 ring-inset ring-white/[0.07] group",
								"transition-[box-shadow,background-color] duration-200 hover:ring-white/[0.16] hover:bg-white/[0.015]",
								!count && "opacity-60 hover:opacity-100"
							)}
							initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={
								reduce
									? { duration: 0.2 }
									: { duration: 0.45, ease: EASE, delay: Math.min(i, 10) * 0.05 }
							}
						>
							<VesselPhoto
								src={v.image}
								kind={v.vessel?.kind}
								title={v.title}
								color={model.accentText}
								className="aspect-[16/9] ring-0 border-b border-white/[0.06]"
							/>
							<div className="flex flex-col flex-1 gap-3 p-4">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<EntityLink
											kind="vessel"
											slug={v.slug}
											className="block outline-none text-white/90 hover:text-white focus-visible:underline after:absolute after:inset-0"
										>
											<span data-morph-title className="font-rock-3d text-xl leading-tight">
												{v.title}
											</span>
										</EntityLink>
										<p className="mt-1 text-[11px] text-white/45 truncate">
											{v.hanzi && (
												<span lang="zh" className="mr-1.5 text-white/35">
													{v.hanzi}
												</span>
											)}
											{spec}
										</p>
									</div>
									<span className="flex flex-col items-end shrink-0">
										<span
											className="text-lg leading-none tabular-nums"
											style={{ color: model.accentText }}
										>
											{count || "–"}
										</span>
										<span className="text-[10px] text-white/30">
											{count === 1 ? "session" : "sessions"}
										</span>
									</span>
								</div>
								{facts.length > 0 && (
									<dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
										{facts.map((f) => (
											<div key={f.k} title={f.title} className="flex items-baseline gap-1.5">
												<dt className="text-white/30">{f.k}</dt>
												<dd className="tabular-nums text-white/70">{f.v}</dd>
											</div>
										))}
									</dl>
								)}
								{domain && (
									<div className="mt-auto space-y-1">
										<p className="text-[10px] text-white/30">
											{rotation ? `// ${rotation}` : "// not in the log yet"}
										</p>
										<UseStrip sessions={model.sessions} domain={domain} axis />
									</div>
								)}
							</div>
						</motion.li>
					)
				})}
			</ol>
		</div>
	)
}
