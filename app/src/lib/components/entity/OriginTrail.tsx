"use client"

import { Fragment, useMemo } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronRight } from "lucide-react"
import EntityRef from "@/lib/components/entity/EntityRef"
import Hatch from "@/lib/components/entity/Hatch"
import { splitOriginTrail } from "@/lib/relations"
import type { OriginNote, OriginRef } from "@/lib/types/origin"
import { cn } from "@/lib/utils/cn"

const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const
/** breadcrumb: how many of a blend's origins show before "+n" */
const MAX_TAILS = 3

/** What to call a session with no origin. */
export function originNoteLabel(note: OriginNote | null | undefined): string {
	if (note === "blend") return "blend · undisclosed"
	if (note === "undisclosed") return "undisclosed"
	if (note === "unknown") return "unknown"
	return "unrecorded"
}

export interface OriginTrailProps {
	origins: readonly (OriginRef | null | undefined)[] | null | undefined
	originNote?: OriginNote | null
	/**
	 * breadcrumb: one line, VS Code style (above the session title)
	 * tree: wraps; a blend's origins hang off the shared path as tree rows (Properties)
	 */
	variant?: "breadcrumb" | "tree"
	/** sessions behind an origin (rolled up), shown dim after each crumb */
	countOf?: (slug: string) => number | undefined
	className?: string
	recordingKey?: string
}

/**
 * China › Yunnan › Xishuangbanna › Yiwu › Gua Feng Zhai, every crumb an EntityRef.
 *
 * Crumbs are keyed by origin id, so arrowing between two teas from the same mountain keeps the
 * shared path still and only the tail swaps (popLayout + layout: the rest glides to make room).
 * Sessions without an origin show a hatched "terra incognita" swatch and their origin_note.
 */
export default function OriginTrail({
	origins,
	originNote,
	variant = "breadcrumb",
	countOf,
	className,
	recordingKey,
}: OriginTrailProps) {
	const reduce = useReducedMotion() ?? false
	const { common, tails } = useMemo(() => splitOriginTrail(origins), [origins])
	const tree = variant === "tree"

	const enter = (i: number) =>
		reduce
			? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
			: {
					initial: { opacity: 0, x: -6 },
					animate: { opacity: 1, x: 0, transition: { ...SPRING, delay: i * 0.035 } },
					exit: { opacity: 0, transition: { duration: 0.12 } },
			  }

	if (!common.length && !tails.length) {
		return (
			<span
				className={cn("inline-flex items-center gap-2 text-xs text-white/45", className)}
				data-recording-key={recordingKey}
				title="No surveyed origin"
			>
				<Hatch className="w-5 h-2.5 rounded-[2px] ring-1 ring-inset ring-white/10" />
				{originNoteLabel(originNote)}
			</span>
		)
	}

	const crumb = (node: OriginRef, current: boolean) => (
		<EntityRef
			kind="origin"
			slug={node._slug}
			variant="crumb"
			current={current}
			glyph={false}
			count={tree ? countOf?.(node._slug) : undefined}
			label={
				<>
					{node.title}
					{current && !tree && node.hanzi && (
						<span lang="zh" className="ml-1.5 text-white/30">
							{node.hanzi}
						</span>
					)}
				</>
			}
			title={[node.title, node.hanzi, node.pinyin, node.kind].filter(Boolean).join(" · ")}
		/>
	)

	const sep = (
		<ChevronRight aria-hidden size={12} strokeWidth={1.5} className="shrink-0 text-white/20" />
	)

	const shownTails = tree ? tails : tails.slice(0, MAX_TAILS)
	const hidden = tails.length - shownTails.length

	return (
		<nav aria-label="Origin" className={cn("min-w-0", className)} data-recording-key={recordingKey}>
			<ol
				className={cn(
					"relative flex items-center gap-x-1 gap-y-0.5 text-xs leading-5",
					tree ? "flex-wrap" : "flex-nowrap overflow-hidden whitespace-nowrap"
				)}
			>
				<li aria-hidden className="mr-0.5 text-[0.9em] text-white/30">
					^
				</li>
				<AnimatePresence mode="popLayout" initial={false}>
					{common.map((node, i) => (
						<motion.li
							key={node.id}
							layout={reduce ? false : "position"}
							className={cn(
								"flex items-center gap-1",
								// when the line is short, ancestors give way (truncate); the leaf never does
								!tails.length && i === common.length - 1 ? "shrink-0" : "min-w-[4ch]"
							)}
							{...enter(i)}
						>
							{i > 0 && sep}
							{crumb(node, !tails.length && i === common.length - 1)}
						</motion.li>
					))}
					{!tree && shownTails.length > 0 && (
						<motion.li
							key={`tails-${tails.map((t) => t[t.length - 1].id).join(",")}`}
							layout={reduce ? false : "position"}
							className="flex items-center gap-1 min-w-0"
							{...enter(common.length)}
						>
							{common.length > 0 && sep}
							<span className="text-white/25">{"{"}</span>
							{shownTails.map((tail, i) => (
								<Fragment key={tail[tail.length - 1].id}>
									{i > 0 && <span className="text-white/25">,</span>}
									{crumb(tail[tail.length - 1], false)}
								</Fragment>
							))}
							{hidden > 0 && <span className="text-white/35">, +{hidden}</span>}
							<span className="text-white/25">{"}"}</span>
						</motion.li>
					)}
				</AnimatePresence>
			</ol>
			{tree && tails.length > 0 && (
				<ul className="mt-1.5 space-y-0.5 text-xs leading-5">
					{treeRows(tails).map((row, i) => (
						<motion.li
							key={row.key}
							className="flex items-center min-w-0 gap-1"
							{...enter(common.length + i)}
						>
							<span aria-hidden className="shrink-0 whitespace-pre text-white/20">
								{row.guides}
							</span>
							{row.path.map((node, j) => (
								<Fragment key={node.id}>
									{j > 0 && sep}
									{crumb(node, false)}
								</Fragment>
							))}
						</motion.li>
					))}
				</ul>
			)}
		</nav>
	)
}

type Branch = { node: OriginRef; children: Branch[] }

/**
 * A blend's origin tails as file-tree rows: shared parents become one row with the rest nested
 * under it (├ │ └ guides), and single-child runs collapse into a path (Jinghong › Youle).
 */
function treeRows(tails: OriginRef[][]): { key: string; guides: string; path: OriginRef[] }[] {
	const forest: Branch[] = []
	for (const tail of tails) {
		let level = forest
		for (const node of tail) {
			let branch = level.find((b) => b.node.id === node.id)
			if (!branch) {
				branch = { node, children: [] }
				level.push(branch)
			}
			level = branch.children
		}
	}

	const rows: { key: string; guides: string; path: OriginRef[] }[] = []
	const walk = (level: Branch[], prefix: string) => {
		level.forEach((branch, i) => {
			const last = i === level.length - 1
			const path = [branch.node]
			let end = branch
			while (end.children.length === 1) {
				end = end.children[0]
				path.push(end.node)
			}
			rows.push({ key: end.node.id, guides: `${prefix}${last ? "└" : "├"} `, path })
			walk(end.children, `${prefix}${last ? "  " : "│ "}`)
		})
	}
	walk(forest, "")
	return rows
}
