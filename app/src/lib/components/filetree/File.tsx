"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { memo, useState, type DragEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import type { TreeNode } from "../../types/tree"
import ColoredFileIcon from "./ColoredFileIcon"
import { useFileTreeContext } from "./FileTreeContext"
import { setSessionDragPreview } from "./dragPreview"
import { getLiquorColor, liquorTextRgb, rgbCss } from "@/lib/liquor"
import { setSessionDragData } from "@/lib/dnd"
import { cn } from "@/lib/utils/cn"
import { formatRating } from "@/lib/sessionSort"

interface FileProps {
	node: TreeNode
	hrefFunction: ((node: TreeNode) => string) | null
	indentationLevel?: number
}

const LIFT_SPRING = { type: "spring", stiffness: 520, damping: 30, mass: 0.6 } as const

const stripSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p)

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
	// small marks (current-row bar, reference dot) use the text-safe lift so dark liquors still read
	const mark = liquor ? liquorTextRgb(liquor) : null
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

	const content = (
		<motion.div
			className={cn(
				"relative flex items-start gap-2 rounded-md py-1.5 pr-2 text-sm",
				// dimming is a CSS transition, not a per-row motion animation: a descriptor change
				// touches every row at once
				"transition-[background-color,box-shadow,opacity] duration-200",
				"group-hover:bg-white/[0.04] group-focus-visible:bg-white/[0.06]",
				isCurrentPage && "bg-white/[0.06]",
				dimmed && "opacity-45",
				dragging &&
					"bg-[#262226] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.08)]"
			)}
			style={{ paddingLeft: `${indentationLevel * 1.25 + 0.5}rem` }}
			animate={{ y: dragging ? -2 : 0, scale: dragging ? 1.02 : 1 }}
			transition={{ y: LIFT_SPRING, scale: LIFT_SPRING }}
		>
			{isCurrentPage && (
				<motion.span
					layoutId="explorer-current-row"
					aria-hidden="true"
					className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
					style={{ background: mark ? rgbCss(mark) : "#edc446" }}
					transition={{ type: "spring", stiffness: 500, damping: 40 }}
				/>
			)}
			<span className="mt-px">
				<ColoredFileIcon
					color={node?.style?.[0]?.category?.color}
					liquor={liquor}
					fill={categoryFill}
				/>
			</span>
			<span className="min-w-0 flex-1 font-normal text-white/60 group-hover:text-white">
				{node.production_year && (
					<span className="font-bold text-[#fff2ca]">{node.production_year}</span>
				)}
				<span className={isCurrentPage ? "text-white" : ""}>{` ${node.title}`}</span>
			</span>
			<AnimatePresence initial={false}>
				{showRating && isSession && typeof node.rating === "number" && (
					<motion.span
						key="rating"
						className="mt-px text-[11px] leading-5 tabular-nums text-white/40 group-hover:text-white/70"
						initial={{ opacity: 0, x: 6 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 6 }}
						transition={{ type: "spring", stiffness: 520, damping: 38 }}
					>
						{formatRating(node.rating)}
					</motion.span>
				)}
			</AnimatePresence>
			{/* always in the flow so a dot appearing never narrows the title and rewraps the row */}
			{isSession && (
				<span
					aria-hidden={!isReference}
					className={cn(
						"mt-[7px] size-1.5 shrink-0 rounded-full transition-[transform,opacity]",
						isReference
							? "scale-100 opacity-100 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
							: "scale-0 opacity-0 duration-150 ease-out"
					)}
					style={{
						background: mark ? rgbCss(mark) : undefined,
						boxShadow: mark
							? `0 0 0 2px ${rgbCss(mark, 0.18)}, 0 0 6px ${rgbCss(mark, 0.6)}`
							: undefined,
						transitionDelay: isReference ? `${Math.min(matchOrder ?? 0, 16) * 28}ms` : "0ms",
					}}
				>
					{isReference && <span className="sr-only">(mentions the selected descriptor)</span>}
				</span>
			)}
		</motion.div>
	)

	const sharedClasses = "group block rounded-md outline-none"
	if (hasHref) {
		return (
			<Link
				href={href}
				className={cn(sharedClasses, "focus-visible:ring-1 focus-visible:ring-white/25")}
				aria-current={isCurrentPage ? "page" : undefined}
				draggable={isSession || undefined}
				onDragStart={isSession ? onDragStart : undefined}
				onDragEnd={isSession ? () => setDragging(false) : undefined}
			>
				{content}
			</Link>
		)
	}

	return <div className={sharedClasses}>{content}</div>
}

export default memo(File)
