"use client"

import { useMemo, type CSSProperties } from "react"
import { useAtomValue } from "jotai"
import { motion, useReducedMotion } from "motion/react"
import FlavorGlyph from "@/lib/components/command/FlavorGlyph"
import { computeStats, sessionsOf } from "@/lib/relations"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils/cn"
import type { EntityListItem } from "@/lib/content/entities"
import { EntityLink, IndexHeader } from "./IndexParts"

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * /styles (plan §3.3): nine category bands in their own colors, each with its styles beneath,
 * session counts and the first line of the description. Styles nobody has tasted yet stay
 * listed, greyed ("not yet tasted"): a nudge to go find one.
 */
export default function StyleIndex({
	categories,
	styles,
}: {
	categories: EntityListItem[]
	styles: EntityListItem[]
}) {
	const index = useAtomValue(relationIndexAtom)
	const reduce = useReducedMotion() ?? false

	const bands = useMemo(() => {
		const count = (kind: "style" | "category", slug: string) => sessionsOf(index, kind, slug).length
		return categories
			.map((c) => ({
				c,
				count: count("category", c.slug),
				styles: styles
					.filter((s) => s.parent === c.slug)
					.map((s) => {
						const sessions = sessionsOf(index, "style", s.slug)
						return { s, count: sessions.length, centroid: computeStats(sessions).centroid }
					})
					.sort((a, b) => b.count - a.count || a.s.title.localeCompare(b.s.title)),
			}))
			.sort((a, b) => b.count - a.count || a.c.title.localeCompare(b.c.title))
	}, [categories, styles, index])

	const tasted = bands.reduce((n, b) => n + b.styles.filter((s) => s.count).length, 0)

	return (
		<div className="space-y-10">
			<IndexHeader
				kind="style"
				title="Styles"
				summary={`// ${styles.length} styles in ${categories.length} categories · ${tasted} tasted`}
			/>
			<div className="space-y-4" data-recording-key="style-index">
				{bands.map(({ c, count, styles: rows }, bi) => {
					const color = c.color || "#d9a441"
					return (
						<motion.section
							key={c.slug}
							aria-labelledby={`cat-${c.slug}`}
							className="relative overflow-hidden rounded-xl ring-1 ring-inset ring-white/[0.06]"
							initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={
								reduce ? { duration: 0.2 } : { duration: 0.45, ease: EASE, delay: bi * 0.05 }
							}
						>
							{/* the band: the category's color as a field, drawing out from its edge */}
							<motion.div
								aria-hidden
								className="absolute inset-0 origin-left pointer-events-none"
								style={{
									background: `linear-gradient(100deg, color-mix(in oklab, ${color} 22%, transparent), color-mix(in oklab, ${color} 4%, transparent) 45%, transparent 75%)`,
								}}
								initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
								animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
								transition={{ duration: 0.7, ease: EASE, delay: 0.1 + bi * 0.05 }}
							/>
							<span
								aria-hidden
								className="absolute inset-y-0 left-0 w-[3px]"
								style={{ backgroundColor: color }}
							/>

							<header className="relative flex items-baseline gap-3 px-5 pt-4 pb-2">
								<EntityLink
									kind="category"
									slug={c.slug}
									id={`cat-${c.slug}`}
									className="text-2xl leading-none text-white outline-none font-rock-3d hover:text-[color:var(--band)] focus-visible:underline"
									style={{ "--band": color } as CSSProperties}
								>
									<span data-morph-title>{c.title}</span>
								</EntityLink>
								<span className="text-xs tabular-nums text-white/40">
									{count} {count === 1 ? "session" : "sessions"}
								</span>
								{c.summary && (
									<span className="hidden min-w-0 text-xs truncate md:block text-white/35">
										{c.summary}
									</span>
								)}
							</header>

							<ul className="relative grid px-3 pb-3 sm:grid-cols-2">
								{rows.map(({ s, count: n, centroid }, i) => (
									<motion.li
										key={s.slug}
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										transition={{ duration: 0.3, delay: reduce ? 0 : 0.2 + bi * 0.05 + i * 0.02 }}
									>
										<EntityLink
											kind="style"
											slug={s.slug}
											className={cn(
												"group grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-0.5 px-2 py-2 rounded-md outline-none",
												"transition-colors hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-white/40",
												!n && "opacity-50 hover:opacity-90"
											)}
											title={n ? undefined : "Not yet tasted"}
										>
											<span className="pt-0.5">
												{centroid ? (
													<FlavorGlyph axes={centroid} color={color} active={false} />
												) : (
													<span
														aria-hidden
														className="block mt-1.5 ml-1 size-3 rounded-full border border-dashed border-white/25"
													/>
												)}
											</span>
											<span className="min-w-0">
												<span
													className="block text-sm truncate text-white/90 group-hover:text-white"
													data-morph-title
												>
													{s.title}
												</span>
												<span className="text-[11px] leading-snug text-white/40 line-clamp-1">
													{n ? s.summary ?? "" : "not yet tasted"}
												</span>
											</span>
											<span className="pt-0.5 text-xs tabular-nums text-white/40">{n || ""}</span>
										</EntityLink>
									</motion.li>
								))}
								{rows.length === 0 && (
									<li className="px-2 py-2 text-[11px] text-white/30">
										{"// no styles filed here yet"}
									</li>
								)}
							</ul>
						</motion.section>
					)
				})}
			</div>
		</div>
	)
}
