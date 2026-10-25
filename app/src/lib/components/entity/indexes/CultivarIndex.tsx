"use client"

import { Suspense, useMemo } from "react"
import { useAtomValue } from "jotai"
import { motion, useReducedMotion } from "motion/react"
import EntityRef from "@/lib/components/entity/EntityRef"
import { related } from "@/lib/relations"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils/cn"
import type { EntityListItem } from "@/lib/content/entities"
import LeafGlyph, { leafSize } from "../page/LeafGlyph"
import { buildEntityModel } from "../page/model"
import { EntityLink, IndexHeader } from "./IndexParts"

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * /cultivars (plan §3.3): one row per cultivar with its hanzi, a leaf-size glyph (only when
 * the name says: da ye, zhong xiao ye, xiao ye), session count and the styles made from it.
 * The count bar is drawn against the most-tasted cultivar (Da Ye Zhong, by a mile).
 */
export default function CultivarIndex({ cultivars }: { cultivars: EntityListItem[] }) {
	const index = useAtomValue(relationIndexAtom)
	const reduce = useReducedMotion() ?? false

	const rows = useMemo(
		() =>
			cultivars
				.map((c) => {
					const model = buildEntityModel(index, "cultivar", c.slug)
					return {
						c,
						count: model.stats.count,
						accent: model.accentText,
						styles: model.stats.count
							? related(index, "cultivar", c.slug, "style").slice(0, 3)
							: [],
					}
				})
				.sort((a, b) => b.count - a.count || a.c.title.localeCompare(b.c.title)),
		[cultivars, index]
	)
	const max = Math.max(1, ...rows.map((r) => r.count))
	const tasted = rows.filter((r) => r.count).length

	return (
		<div className="space-y-10">
			<IndexHeader
				kind="cultivar"
				title="Cultivars"
				summary={`// ${cultivars.length} cultivars · ${tasted} tasted`}
			/>
			<ol
				className="divide-y divide-white/[0.05] border-y border-white/[0.05]"
				data-recording-key="cultivar-index"
			>
				{rows.map(({ c, count, accent, styles }, i) => (
					<motion.li
						key={c.slug}
						className="relative group"
						initial={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
						animate={{ opacity: 1, x: 0 }}
						transition={
							reduce
								? { duration: 0.2 }
								: { duration: 0.4, ease: EASE, delay: Math.min(i, 14) * 0.03 }
						}
					>
						<div
							className={cn(
								"grid grid-cols-[4.5rem_2.75rem_minmax(0,1fr)_minmax(0,14rem)_4rem] items-center gap-4 px-2 py-3 rounded-md",
								"transition-[background-color,opacity] group-hover:bg-white/[0.025]",
								!count && "opacity-55 group-hover:opacity-90"
							)}
						>
							<span
								lang="zh"
								className="text-lg leading-none text-center whitespace-nowrap text-white/55"
							>
								{c.hanzi ?? <span className="text-white/15">—</span>}
							</span>
							<LeafGlyph size={leafSize(c.title)} color={accent} className="w-10" />
							<span className="min-w-0">
								<EntityLink
									kind="cultivar"
									slug={c.slug}
									className="block text-base leading-tight truncate outline-none text-white/90 hover:text-white focus-visible:underline after:absolute after:inset-0"
								>
									<span data-morph-title>{c.title}</span>
								</EntityLink>
								<span className="block text-[11px] text-white/35 truncate">
									{count ? c.summary ?? "" : "not yet tasted"}
								</span>
							</span>
							<span className="relative z-10 flex flex-wrap gap-1 min-w-0">
								<Suspense fallback={null}>
									{styles.map((s) => (
										<EntityRef
											key={s.node.slug}
											kind="style"
											slug={s.node.slug}
											label={s.node.title}
											color={s.node.color}
										/>
									))}
								</Suspense>
							</span>
							<span className="flex flex-col items-end gap-1">
								<span className="text-sm tabular-nums text-white/70">{count || ""}</span>
								<span
									aria-hidden
									className="relative w-full h-[3px] rounded-full bg-white/[0.04] overflow-hidden"
								>
									{count > 0 && (
										<motion.span
											className="absolute inset-y-0 right-0 origin-right rounded-full"
											style={{
												width: `${Math.max(6, (count / max) * 100)}%`,
												backgroundColor: accent,
											}}
											initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
											animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
											transition={{
												type: "spring",
												stiffness: 520,
												damping: 38,
												delay: 0.2 + Math.min(i, 14) * 0.03,
											}}
										/>
									)}
								</span>
							</span>
						</div>
					</motion.li>
				))}
			</ol>
		</div>
	)
}
