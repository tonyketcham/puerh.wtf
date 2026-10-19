"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, type DragEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import type { TreeNode } from "../../types/tree"
import ColoredFileIcon from "./ColoredFileIcon"
import { useFileTreeContext } from "./FileTreeContext"
import { setSessionDragPreview } from "./dragPreview"
import { getLiquorColor, liquorTextRgb, rgbCss } from "@/lib/liquor"
import { setSessionDragData } from "@/lib/dnd"
import { cn } from "@/lib/utils/cn"

interface FileProps {
	node: TreeNode
	hrefFunction: ((node: TreeNode) => string) | null
	indentationLevel?: number
}

const LIFT_SPRING = { type: "spring", stiffness: 520, damping: 30, mass: 0.6 } as const
const DOT_SPRING = { type: "spring", stiffness: 600, damping: 24 } as const

const stripSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p)

export default function File({ node, hrefFunction, indentationLevel = 0 }: FileProps) {
	const pathname = usePathname()
	const { referenceMatches } = useFileTreeContext()
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
				"transition-[background-color,box-shadow] duration-150",
				"group-hover:bg-white/[0.04] group-focus-visible:bg-white/[0.06]",
				isCurrentPage && "bg-white/[0.06]",
				dragging &&
					"bg-[#262226] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.08)]"
			)}
			style={{ paddingLeft: `${indentationLevel * 1.25 + 0.5}rem` }}
			animate={{
				y: dragging ? -2 : 0,
				scale: dragging ? 1.02 : 1,
				opacity: dimmed ? 0.45 : 1,
			}}
			transition={{ y: LIFT_SPRING, scale: LIFT_SPRING, opacity: { duration: 0.2 } }}
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
				{isReference && (
					<motion.span
						key="ref-dot"
						className="mt-[7px] size-1.5 shrink-0 rounded-full"
						style={{
							background: mark ? rgbCss(mark) : undefined,
							boxShadow: mark
								? `0 0 0 2px ${rgbCss(mark, 0.18)}, 0 0 6px ${rgbCss(mark, 0.6)}`
								: undefined,
						}}
						initial={{ scale: 0, opacity: 0 }}
						animate={{
							scale: 1,
							opacity: 1,
							transition: { ...DOT_SPRING, delay: Math.min(matchOrder ?? 0, 16) * 0.028 },
						}}
						exit={{ scale: 0, opacity: 0, transition: { duration: 0.12 } }}
					>
						<span className="sr-only">(mentions the selected descriptor)</span>
					</motion.span>
				)}
			</AnimatePresence>
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
