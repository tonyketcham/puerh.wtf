"use client"

import Link from "next/link"
import { Suspense, useMemo, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronRight } from "lucide-react"
import Hatch from "@/lib/components/entity/Hatch"
import { explorerHoverAtom } from "@/lib/components/explorer/state"
import OriginsMap from "@/lib/components/map/OriginsMap"
import type { MapPoint } from "@/lib/components/map/points"
import { originNoteLabel } from "@/lib/components/entity/OriginTrail"
import { sessionColor, sessionsOf, type RelationIndex } from "@/lib/relations"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import type { ExplorerSession } from "@/lib/types/session"
import { buildLink } from "@/lib/utils/BuildLinkToGivenCollectionNode"
import { cn } from "@/lib/utils/cn"
import type { EntityListItem } from "../page/data"
import { EntityLink, IndexHeader } from "./IndexParts"

const EASE = [0.22, 1, 0.36, 1] as const
const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const

type Branch = { item: EntityListItem; count: number; direct: ExplorerSession[]; children: Branch[] }

/**
 * /origins (plan §3.3): the full origin map on the left two thirds (pinned while the page
 * scrolls, so the first scroll lays the ridgeline hero flat), and the tree on the right:
 * China › Yunnan › Xishuangbanna › Yiwu (11), every node with its rolled-up count and one
 * liquor dot per session filed right there. Folders fold; a row under the pointer lights its
 * rings on the map. Below both, the "unplaced" tray: sessions without a surveyed origin, on a
 * hatched terra incognita strip.
 */
export default function OriginIndex({
	origins,
	points,
}: {
	origins: EntityListItem[]
	points: MapPoint[]
}) {
	const index = useAtomValue(relationIndexAtom)
	const forest = useMemo(() => buildForest(origins, index), [origins, index])
	const unplaced = useMemo(() => unplacedSessions(index), [index])
	const [folded, setFolded] = useState<Set<string>>(() => new Set())
	const tasted = origins.filter((o) => (index.nodes.origin.get(o.slug)?.all.length ?? 0) > 0).length
	const placedSessions = index.sessions.length - unplaced.reduce((n, g) => n + g.sessions.length, 0)

	const toggle = (slug: string) =>
		setFolded((prev) => {
			const next = new Set(prev)
			if (next.has(slug)) next.delete(slug)
			else next.add(slug)
			return next
		})

	return (
		<div className="space-y-10">
			<IndexHeader
				kind="origin"
				title="Origins"
				summary={`// ${origins.length} places · ${tasted} with sessions · ${placedSessions} of ${index.sessions.length} sessions placed`}
			/>

			<div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
				<div className="lg:sticky lg:top-[calc(var(--commandbar-h)+0.5rem)]">
					{/* the map shares the Explorer's live filter atom */}
					<Suspense fallback={<div className={MAP_BOX} />}>
						<OriginsMap points={points} className={MAP_BOX} recordingKey="origins-map" />
					</Suspense>
				</div>

				<div
					role="tree"
					aria-label="Origins"
					className="py-2 rounded-xl ring-1 ring-inset ring-white/[0.06] bg-white/[0.01]"
					data-recording-key="origin-tree"
				>
					<Rows
						branches={forest}
						depth={0}
						guides=""
						folded={folded}
						toggle={toggle}
						startIndex={0}
					/>
				</div>
			</div>

			{unplaced.length > 0 && <UnplacedTray groups={unplaced} />}
		</div>
	)
}

/** The map's box: the viewport below the command bar, above the status bar. */
const MAP_BOX =
	"h-[calc(100vh-var(--commandbar-h)-var(--statusbar-h)-1.5rem)] min-h-[26rem] rounded-xl ring-1 ring-inset ring-white/[0.07] bg-[#121012]"

function Rows({
	branches,
	depth,
	guides,
	folded,
	toggle,
	startIndex,
}: {
	branches: Branch[]
	depth: number
	guides: string
	folded: Set<string>
	toggle: (slug: string) => void
	startIndex: number
}) {
	const reduce = useReducedMotion() ?? false
	const setHover = useSetAtom(explorerHoverAtom)
	return (
		<>
			{branches.map((b, i) => {
				const last = i === branches.length - 1
				const open = !folded.has(b.item.slug)
				const hasKids = b.children.length > 0
				const prefix = depth === 0 ? "" : `${guides}${last ? "└ " : "├ "}`
				const childGuides = depth === 0 ? "" : `${guides}${last ? "  " : "│ "}`
				return (
					<div
						key={b.item.slug}
						role="treeitem"
						aria-selected={false}
						aria-expanded={hasKids ? open : undefined}
						aria-level={depth + 1}
					>
						<motion.div
							className={cn(
								"group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 h-8 px-4 rounded-sm",
								"transition-colors hover:bg-white/[0.03]",
								!b.count && "text-white/40"
							)}
							// the map lights this branch's rings
							onPointerEnter={() => b.count && setHover({ kind: "origin", slug: b.item.slug })}
							onPointerLeave={() =>
								setHover((h) => (h?.kind === "origin" && h.slug === b.item.slug ? null : h))
							}
							initial={reduce ? { opacity: 0 } : { opacity: 0, x: -4 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{
								duration: 0.3,
								ease: EASE,
								delay: reduce ? 0 : Math.min(startIndex + i, 30) * 0.012,
							}}
						>
							<span className="flex items-center min-w-0 gap-1.5 text-sm">
								<span aria-hidden className="whitespace-pre text-white/15 font-fira-code">
									{prefix}
								</span>
								{hasKids ? (
									<button
										type="button"
										onClick={() => toggle(b.item.slug)}
										aria-label={open ? `Fold ${b.item.title}` : `Unfold ${b.item.title}`}
										className="grid rounded-sm size-4 place-items-center shrink-0 text-white/35 outline-none hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
									>
										<motion.span
											animate={{ rotate: open ? 90 : 0 }}
											transition={reduce ? { duration: 0 } : SPRING}
											className="grid"
										>
											<ChevronRight size={12} strokeWidth={2} />
										</motion.span>
									</button>
								) : (
									<span
										aria-hidden
										className="grid size-4 place-items-center shrink-0 text-white/20"
									>
										·
									</span>
								)}
								<EntityLink
									kind="origin"
									slug={b.item.slug}
									className={cn(
										"min-w-0 truncate rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-white/40",
										b.count ? "text-white/85 hover:text-white" : "hover:text-white/80",
										depth === 0 && "font-medium tracking-[0.06em] uppercase text-[13px]"
									)}
								>
									<span data-morph-title>{b.item.title}</span>
								</EntityLink>
								{b.item.hanzi && (
									<span
										lang="zh"
										// gives way before the name does in a narrow column
										className="min-w-0 overflow-hidden whitespace-nowrap shrink-[8] text-xs text-white/30"
									>
										{b.item.hanzi}
									</span>
								)}
								{b.item.originKind && (
									<span className="hidden shrink-0 text-[10px] text-white/25 2xl:inline">
										{b.item.originKind}
									</span>
								)}
							</span>
							<span className="flex items-center gap-3">
								<span aria-hidden className="flex items-center">
									{b.direct.slice(0, 10).map((s, j) => (
										<span
											key={s._slug}
											className="size-2 rounded-full ring-[1.5px] ring-[#121012]"
											style={{ backgroundColor: sessionColor(s), marginLeft: j ? -3 : 0 }}
											title={s.title}
										/>
									))}
								</span>
								<span
									className={cn(
										"w-6 text-xs text-right tabular-nums",
										b.count ? "text-white/60" : "text-white/20"
									)}
								>
									{b.count || "·"}
								</span>
							</span>
						</motion.div>
						{hasKids && (
							<AnimatePresence initial={false}>
								{open && (
									<motion.div
										role="group"
										className="overflow-hidden"
										initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
										animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
										exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
										transition={
											reduce ? { duration: 0.15 } : { height: SPRING, opacity: { duration: 0.2 } }
										}
									>
										<Rows
											branches={b.children}
											depth={depth + 1}
											guides={childGuides}
											folded={folded}
											toggle={toggle}
											startIndex={startIndex + i + 1}
										/>
									</motion.div>
								)}
							</AnimatePresence>
						)}
					</div>
				)
			})}
		</>
	)
}

/** Sessions with no origin, or only an "unknown" placeholder, by why. */
function UnplacedTray({ groups }: { groups: { label: string; sessions: ExplorerSession[] }[] }) {
	const reduce = useReducedMotion() ?? false
	const total = groups.reduce((n, g) => n + g.sessions.length, 0)
	return (
		<section
			aria-labelledby="unplaced-h"
			className="space-y-3"
			data-recording-key="origin-unplaced"
		>
			<h2 id="unplaced-h" className="flex items-center gap-3 text-sm text-white/45">
				<span aria-hidden className="text-white/20">
					──
				</span>
				<span className="text-tea-soup-400">Unplaced</span>
				<span className="tabular-nums text-white/25">{total}</span>
				<span aria-hidden className="flex-1 h-px bg-white/[0.07]" />
				<span className="text-[11px] text-white/25">terra incognita</span>
			</h2>
			<div className="relative overflow-hidden rounded-xl ring-1 ring-inset ring-white/[0.07]">
				<Hatch className="absolute inset-0 w-full h-full" spacing={7} />
				<div className="relative grid gap-4 p-4 sm:grid-cols-2">
					{groups.map((g, gi) => (
						<div key={g.label} className="space-y-2">
							<p className="text-[11px] text-white/45">
								{`// ${g.label}`} <span className="text-white/25">{g.sessions.length}</span>
							</p>
							<ul className="flex flex-wrap gap-1.5">
								{g.sessions.map((s, i) => (
									<motion.li
										key={s._slug}
										initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
										animate={{ opacity: 1, scale: 1 }}
										transition={
											reduce
												? { duration: 0.2 }
												: { ...SPRING, delay: gi * 0.05 + Math.min(i, 20) * 0.015 }
										}
									>
										<Link
											href={buildLink(s)}
											className="inline-flex items-center h-6 gap-1.5 pl-1 pr-2 text-[11px] rounded-[4px] outline-none bg-[var(--surface-face)]/90 shadow-key-soft ring-1 ring-inset ring-white/[0.06] text-white/70 transition-colors hover:text-white hover:ring-white/25 focus-visible:ring-white/50"
										>
											<span
												aria-hidden
												className="w-1.5 h-3.5 rounded-[2px]"
												style={{ backgroundColor: sessionColor(s) }}
											/>
											<span className="max-w-[16rem] truncate">{s.title}</span>
										</Link>
									</motion.li>
								))}
							</ul>
						</div>
					))}
				</div>
			</div>
		</section>
	)
}

// ---------------------------------------------------------------------------

function buildForest(origins: EntityListItem[], index: RelationIndex): Branch[] {
	const bySlug = new Map(origins.map((o) => [o.slug, o] as const))
	const kids = new Map<string | null, EntityListItem[]>()
	for (const o of origins) {
		const parent = o.parent && bySlug.has(o.parent) ? o.parent : null
		kids.set(parent, [...(kids.get(parent) ?? []), o])
	}
	const seen = new Set<string>()
	const grow = (item: EntityListItem): Branch => {
		seen.add(item.slug)
		const node = index.nodes.origin.get(item.slug)
		return {
			item,
			count: node?.all.length ?? 0,
			direct: node ? sessionsOf(index, "origin", item.slug, { rollup: false }) : [],
			children: (kids.get(item.slug) ?? [])
				.filter((c) => !seen.has(c.slug))
				.map(grow)
				.sort((a, b) => b.count - a.count || a.item.title.localeCompare(b.item.title)),
		}
	}
	return (kids.get(null) ?? [])
		.map(grow)
		.sort((a, b) => b.count - a.count || a.item.title.localeCompare(b.item.title))
}

function unplacedSessions(index: RelationIndex): { label: string; sessions: ExplorerSession[] }[] {
	const groups = new Map<string, ExplorerSession[]>()
	for (const s of index.sessions) {
		const origins = (s.origin || []).filter(Boolean)
		const placed = origins.some((o) => o.kind !== "unknown")
		if (placed) continue
		const label = origins.length
			? `unknown · somewhere in ${origins.find((o) => o.parent)?.parent?.title ?? "the region"}`
			: originNoteLabel(s.origin_note)
		groups.set(label, [...(groups.get(label) ?? []), s])
	}
	return [...groups]
		.map(([label, sessions]) => ({ label, sessions }))
		.sort((a, b) => b.sessions.length - a.sessions.length)
}
