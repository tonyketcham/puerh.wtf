"use client"

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import EntityRef from "@/lib/components/entity/EntityRef"
import SessionSortToggle from "@/lib/components/explorer/SessionSortToggle"
import { entityKeys, sessionColor, type RelationIndex } from "@/lib/relations"
import { sortSessions, type SessionSort } from "@/lib/sessionSort"
import type { PageKind } from "@/lib/peek"
import type { ExplorerSession } from "@/lib/types/session"
import { cn } from "@/lib/utils/cn"
import type { EntityModel } from "./model"

const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const
const EASE = [0.22, 1, 0.36, 1] as const

type Group = {
	key: string
	/** the child entity the sessions sit under; null = the entity itself */
	child: { kind: PageKind; slug: string; title: string } | null
	sessions: ExplorerSession[]
}

/**
 * ── Sessions ── as Find All References (plan §3.2): every session behind the entity as a
 * SessionCard, sortable by date / vintage / rating, and grouped by child where the entity is a
 * tree node (an origin by its child origins, a category by its styles). Re-sorting and
 * regrouping glide (shared layout); cards stagger in on arrival.
 *
 * Cards are server-rendered (SessionCard computes ages at build time) and handed in by slug.
 */
export default function SessionsList({
	model,
	index,
	title,
	cards,
	recordingKey,
}: {
	model: EntityModel
	index: RelationIndex
	title: string
	cards: Record<string, ReactNode>
	recordingKey?: string
}) {
	const reduce = useReducedMotion() ?? false
	const [sort, setSort] = useState<SessionSort>("date")
	const groupable = model.kind === "origin" || model.kind === "category"
	const [grouped, setGrouped] = useState(true)

	const sorted = useMemo(() => sortSessions(model.sessions, sort), [model.sessions, sort])
	const groups = useMemo(
		() => (groupable && grouped ? groupSessions(model, index, sorted) : null),
		[groupable, grouped, model, index, sorted]
	)
	const showGroups = !!groups && groups.length > 1

	// stagger only this page's first paint; later re-sorts and regroups glide instead
	const [arriving, setArriving] = useState(true)
	useEffect(() => {
		setArriving(false)
	}, [])
	const order = useMemo(
		() => new Map(model.sessions.map((s, i) => [s._slug, i] as const)),
		[model.sessions]
	)

	const card = (s: ExplorerSession) => {
		const delay = Math.min(order.get(s._slug) ?? 0, 10) * 0.045
		const arrive = arriving
		return (
			<motion.div
				key={s._slug}
				// a layoutId (not just layout) so a card glides between groups when they regroup
				layoutId={reduce ? undefined : `entity-session-${s._slug}`}
				initial={arrive ? (reduce ? { opacity: 0 } : { opacity: 0, y: 14 }) : false}
				animate={{ opacity: 1, y: 0 }}
				transition={{
					layout: SPRING,
					opacity: { duration: 0.3, delay: arrive ? delay : 0 },
					y: { ...SPRING, delay: arrive ? delay : 0 },
				}}
				data-session-slug={s._slug}
				// each card on its own layer: its tape textures (SVG turbulence and shadow filters)
				// rasterize ahead of the scroll, in small pieces, instead of in one 100–300 ms task the
				// moment the list scrolls into view (measured: plan §7)
				style={{ willChange: "transform" }}
			>
				{cards[s._slug]}
			</motion.div>
		)
	}

	if (!model.sessions.length) {
		return (
			<p className="text-sm text-white/45" data-recording-key={recordingKey}>
				{"// no references to "}
				{title}
				{" yet"}
			</p>
		)
	}

	return (
		<div className="space-y-4" data-recording-key={recordingKey}>
			<div className="flex items-center gap-2 text-[11px] text-white/35">
				<span>
					{model.sessions.length} {model.sessions.length === 1 ? "reference" : "references"}
					{showGroups && ` in ${groups!.length} groups`}
				</span>
				<span className="flex-1" />
				{groupable && (groups?.length ?? 2) > 1 && (
					<button
						type="button"
						aria-pressed={grouped}
						onClick={() => setGrouped((g) => !g)}
						title={
							grouped
								? "Show one flat list"
								: `Group by ${model.kind === "origin" ? "child origin" : "style"}`
						}
						className={cn(
							"flex items-center gap-1 h-5 px-1.5 rounded-sm text-[10px] leading-none outline-none transition-colors",
							"text-white/40 hover:text-white/80 hover:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-white/25",
							grouped && "text-brand/80"
						)}
					>
						<GroupGlyph grouped={grouped} reduce={reduce} />
						{grouped ? "grouped" : "flat"}
					</button>
				)}
				<SessionSortToggle value={sort} onChange={setSort} recordingKey="entity-sessions-sort" />
			</div>

			<LayoutGroup id="entity-sessions">
				{showGroups ? (
					<div className="space-y-7">
						<AnimatePresence initial={false} mode="popLayout">
							{groups!.map((group, gi) => (
								<motion.div
									key={group.key}
									layout={reduce ? false : "position"}
									transition={SPRING}
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="space-y-2.5"
								>
									<GroupHeader group={group} title={title} index={gi} reduce={reduce} />
									<div className="grid grid-cols-1 gap-2.5 items-start">
										{group.sessions.map(card)}
									</div>
								</motion.div>
							))}
						</AnimatePresence>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-2.5 items-start">{sorted.map(card)}</div>
				)}
			</LayoutGroup>
		</div>
	)
}

function GroupHeader({
	group,
	title,
	index,
	reduce,
}: {
	group: Group
	title: string
	index: number
	reduce: boolean
}) {
	return (
		<motion.div
			layout={reduce ? false : "position"}
			className="flex items-center min-w-0 gap-2 text-xs"
			initial={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{ duration: 0.35, ease: EASE, delay: reduce ? 0 : index * 0.04 }}
		>
			<span aria-hidden className="text-white/20">
				{group.child ? "├" : "◆"}
			</span>
			{group.child ? (
				<Suspense fallback={<span className="text-white/70">{group.child.title}</span>}>
					<EntityRef
						kind={group.child.kind}
						slug={group.child.slug}
						label={group.child.title}
						variant="crumb"
						glyph
					/>
				</Suspense>
			) : (
				<span className="text-white/60">
					{title} <span className="text-white/30">itself</span>
				</span>
			)}
			<span className="tabular-nums text-white/30">{group.sessions.length}</span>
			{/* the group's liquors, a tiny stack */}
			<span aria-hidden className="flex items-center ml-1">
				{group.sessions.slice(0, 8).map((s, i) => (
					<span
						key={s._slug}
						className="size-2 rounded-full ring-[1.5px] ring-[#121012]"
						style={{ backgroundColor: sessionColor(s), marginLeft: i ? -3 : 0 }}
					/>
				))}
			</span>
			<span aria-hidden className="flex-1 h-px bg-white/[0.05]" />
		</motion.div>
	)
}

function GroupGlyph({ grouped, reduce }: { grouped: boolean; reduce: boolean }) {
	const t = reduce ? { duration: 0 } : SPRING
	return (
		<svg aria-hidden viewBox="0 0 10 10" className="size-2.5" fill="currentColor">
			<motion.rect
				x={0}
				width={10}
				height={1.6}
				rx={0.8}
				initial={false}
				animate={{ y: grouped ? 0.5 : 1.2 }}
				transition={t}
			/>
			<motion.rect
				height={1.6}
				rx={0.8}
				initial={false}
				animate={{ x: grouped ? 2.5 : 0, width: grouped ? 7.5 : 10, y: 4.2 }}
				transition={t}
			/>
			<motion.rect
				height={1.6}
				rx={0.8}
				initial={false}
				animate={{ x: grouped ? 2.5 : 0, width: grouped ? 7.5 : 10, y: grouped ? 7.9 : 7.2 }}
				transition={t}
			/>
		</svg>
	)
}

/**
 * Sessions by the child they sit under. An origin's sessions group by its child origin (a blend
 * from two of Yiwu's villages lands in the first); a category's by style. Sessions that point
 * at the entity itself form their own group, first. Larger groups come first; within a group
 * the list's sort order holds.
 */
function groupSessions(
	model: EntityModel,
	index: RelationIndex,
	sorted: ExplorerSession[]
): Group[] {
	const kind = model.kind
	const slug = model.node?.slug ?? model.slug
	const childKind: PageKind = kind === "category" ? "style" : "origin"
	const children = index.children[kind].get(slug) ?? []
	const groups = new Map<string, Group>()
	for (const s of sorted) {
		const keys = new Set(entityKeys(s, childKind))
		const childSlug = children.find((c) => keys.has(c)) ?? null
		const direct = kind === "origin" && entityKeys(s, "origin", { rollup: false }).includes(slug)
		const key = direct || !childSlug ? "" : childSlug
		let group = groups.get(key)
		if (!group) {
			const node = key ? index.nodes[childKind].get(key) : null
			group = {
				key: key || "__self",
				child: node ? { kind: childKind, slug: node.slug, title: node.title } : null,
				sessions: [],
			}
			groups.set(key, group)
		}
		group.sessions.push(s)
	}
	return [...groups.values()].sort(
		(a, b) =>
			Number(!!a.child) - Number(!!b.child) ||
			b.sessions.length - a.sessions.length ||
			(a.child?.title ?? "").localeCompare(b.child?.title ?? "")
	)
}
