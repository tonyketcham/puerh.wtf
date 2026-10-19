"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { memo, useState, type CSSProperties, type DragEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import type { TreeNode } from "../../types/tree"
import ColoredFileIcon from "./ColoredFileIcon"
import { useFileTreeContext } from "./FileTreeContext"
import { setSessionDragPreview } from "./dragPreview"
import { LiquorSwatch } from "../command/parts"
import { PILL_SPRING } from "../command/ResultRow"
import { getLiquorColor, liquorTextRgb } from "@/lib/liquor"
import { setSessionDragData } from "@/lib/dnd"
import { cn } from "@/lib/utils/cn"
import { formatRating } from "@/lib/sessionSort"

interface FileProps {
	node: TreeNode
	hrefFunction: ((node: TreeNode) => string) | null
	indentationLevel?: number
}

const LIFT_SPRING = { type: "spring", stiffness: 520, damping: 30, mass: 0.6 } as const

/** Where the swatch starts: the rail (filetree.css --rail-x) plus its branch. */
const SWATCH_X = 26

const stripSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p)

/**
 * One row of the Explorer tree, built like a command palette tea row: the liquor swatch, the
 * name over a dim category · vendor line, and the vintage in its own column. The rail of the
 * data line (filetree.css) runs down its left edge and branches into the swatch.
 */
function File({ node, hrefFunction, indentationLevel = 0 }: FileProps) {
	const pathname = usePathname()
	const { referenceMatches, order } = useFileTreeContext()
	const showRating = order === "rating"
	const [dragging, setDragging] = useState(false)

	const hasHref = !!hrefFunction
	const href = hasHref && hrefFunction ? hrefFunction(node) : "#"
	const isCurrentPage = hasHref && stripSlash(pathname ?? "") === stripSlash(href)

	const isSession = node._collection === "Session" && !!node._slug
	const liquor = isSession ? getLiquorColor(node._slug) : null
	// lines and small marks use the text-safe lift so dark liquors still read on the panel
	const mark = liquor ? liquorTextRgb(liquor) : null
	const category = node.style?.[0]?.category
	const vendor = node.vendor?.[0]?.title
	const categoryFill =
		node._collection === "Category" ? (node as TreeNode & { color?: string }).color : undefined

	const matchOrder = isSession && referenceMatches ? referenceMatches.get(node._slug!) : undefined
	const isReference = matchOrder !== undefined
	const dimmed = !!referenceMatches && isSession && !isReference

	const onDragStart = (e: DragEvent<HTMLAnchorElement>) => {
		if (!isSession || !liquor) return
		const absolute = new URL(href, window.location.origin).href
		setSessionDragData(e.dataTransfer, node._slug!, absolute)
		setSessionDragPreview(e.dataTransfer, {
			title: node.title,
			year: node.production_year,
			liquor,
		})
		setDragging(true)
	}

	const meta = [category?.title, vendor].filter(Boolean).join(" · ")

	const content = (
		<motion.div
			className={cn(
				"relative flex items-center h-9 gap-2.5 pr-2 rounded-lg",
				// dimming is a CSS transition, not a per-row motion animation: a descriptor change
				// touches every row at once
				"transition-[opacity] duration-200",
				dimmed && "opacity-40"
			)}
			style={{ paddingLeft: SWATCH_X + Math.max(0, indentationLevel - 1) * 12 }}
			animate={{ y: dragging ? -2 : 0, scale: dragging ? 1.02 : 1 }}
			transition={{ y: LIFT_SPRING, scale: LIFT_SPRING }}
		>
			{/* the pill clears the rail, so the data line never sits under a fill */}
			<span
				aria-hidden
				className={cn(
					"absolute inset-y-0 right-0 rounded-lg transition-[background-color,box-shadow] duration-200",
					"group-hover:bg-white/[0.04] group-focus-visible:bg-white/[0.06] group-focus-visible:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]",
					dragging &&
						"bg-[#262226] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.08)]"
				)}
				style={{ left: SWATCH_X - 6 }}
			/>
			{isCurrentPage && (
				<motion.span
					layoutId="explorer-current-row"
					aria-hidden
					className="absolute inset-y-0 right-0 rounded-lg bg-white/[0.065] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
					style={{ left: SWATCH_X - 6 }}
					transition={PILL_SPRING}
				/>
			)}

			<span className="relative shrink-0 ft-swatch">
				{liquor ? (
					<LiquorSwatch liquor={liquor} size={12} />
				) : (
					<ColoredFileIcon color={category?.color} fill={categoryFill} />
				)}
				{/* find-references hit: a bead on the swatch's shoulder, staggered down the list */}
				{isSession && (
					<span
						aria-hidden={!isReference}
						className={cn(
							"absolute -top-1 -right-1 size-[5px] rounded-full ring-[1.5px] ring-[#1d1a1d] transition-[transform,opacity]",
							isReference
								? "scale-100 opacity-100 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
								: "scale-0 opacity-0 duration-150 ease-out"
						)}
						style={{
							background: "#edc446",
							boxShadow: "0 0 6px rgb(237 196 70 / 0.8)",
							transitionDelay: isReference ? `${Math.min(matchOrder ?? 0, 16) * 28}ms` : "0ms",
						}}
					>
						{isReference && <span className="sr-only">(mentions the selected descriptor)</span>}
					</span>
				)}
			</span>

			<span className="relative flex flex-col flex-1 min-w-0 gap-0.5">
				<span
					className={cn(
						"text-[13px] leading-tight truncate transition-colors",
						isCurrentPage ? "text-white" : "text-white/70 group-hover:text-white"
					)}
				>
					{node.title}
				</span>
				{meta && (
					<span className="flex items-center gap-1.5 text-[11px] leading-tight text-white/35 truncate">
						{category?.color && (
							<span
								aria-hidden
								className="inline-block rounded-full size-1.5 shrink-0"
								style={{ backgroundColor: category.color }}
							/>
						)}
						<span className="truncate">{meta}</span>
					</span>
				)}
			</span>

			<span className="relative flex flex-col items-end shrink-0 gap-0.5 w-9">
				<span
					className={cn(
						"text-[12px] leading-tight font-bold tabular-nums transition-colors",
						isCurrentPage ? "text-[#fff2ca]" : "text-white/70 group-hover:text-[#fff2ca]"
					)}
				>
					{node.production_year ?? ""}
				</span>
				<AnimatePresence initial={false}>
					{showRating && isSession && typeof node.rating === "number" && (
						<motion.span
							key="rating"
							className="text-[11px] leading-tight tabular-nums text-white/40 group-hover:text-white/70"
							initial={{ opacity: 0, x: 6 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: 6 }}
							transition={{ type: "spring", stiffness: 520, damping: 38 }}
						>
							{formatRating(node.rating)}
						</motion.span>
					)}
				</AnimatePresence>
			</span>
		</motion.div>
	)

	const rail = (
		<>
			<span aria-hidden className="ft-seg ft-seg-top" />
			<span aria-hidden className="ft-seg ft-seg-bottom" />
			<svg aria-hidden className="ft-branch" viewBox="0 0 14 8" fill="none">
				<path
					d="M1 1V2Q1 7 6 7H14"
					stroke="currentColor"
					strokeWidth="1"
					strokeLinecap="round"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
		</>
	)

	const sharedClasses = "group relative block rounded-lg outline-none"
	// the row's liquor drives its stretch of the data line
	const style = (mark ? { "--seg": mark.join(" ") } : undefined) as CSSProperties | undefined
	const title = [node.production_year, node.title, meta].filter(Boolean).join(" · ")

	if (hasHref) {
		return (
			<div className="relative" style={style}>
				{rail}
				<Link
					href={href}
					title={title}
					className={sharedClasses}
					aria-current={isCurrentPage ? "page" : undefined}
					draggable={isSession || undefined}
					onDragStart={isSession ? onDragStart : undefined}
					onDragEnd={isSession ? () => setDragging(false) : undefined}
				>
					{content}
				</Link>
			</div>
		)
	}

	return (
		<div className="relative" style={style}>
			{rail}
			<div className={sharedClasses}>{content}</div>
		</div>
	)
}

export default memo(File)
