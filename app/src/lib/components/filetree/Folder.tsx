"use client"

import { useId, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import File from "./File"
import { useFileTreeContext } from "./FileTreeContext"
import type { TreeNode } from "../../types/tree"
import { buildLink } from "../../utils/BuildLinkToGivenCollectionNode"

export const FolderIcon = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 16 16"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		className="shrink-0 w-4 h-4 text-white/60"
		aria-hidden="true"
	>
		<path
			d="M14.6666 12.6667V6C14.6666 5.64638 14.5262 5.30724 14.2761 5.05719C14.0261 4.80714 13.6869 4.66667 13.3333 4.66667H8.82398C8.57632 4.66666 8.33355 4.59767 8.1229 4.46744C7.91224 4.33721 7.74202 4.15088 7.63131 3.92933L7.03531 2.73733C6.92456 2.51569 6.75423 2.32929 6.54345 2.19905C6.33266 2.06881 6.08976 1.99988 5.84198 2H2.66665C2.31302 2 1.97389 2.14048 1.72384 2.39052C1.47379 2.64057 1.33331 2.97971 1.33331 3.33333V12.6667C1.33331 13.0203 1.47379 13.3594 1.72384 13.6095C1.97389 13.8595 2.31302 14 2.66665 14H13.3333C13.6869 14 14.0261 13.8595 14.2761 13.6095C14.5262 13.3594 14.6666 13.0203 14.6666 12.6667Z"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
)

const ExpandCollapseIcon = ({ expanded }: { expanded: boolean }) => (
	<motion.svg
		width="6"
		height="6"
		viewBox="0 0 6 6"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		className="w-2 h-2 text-white/60"
		aria-hidden="true"
		initial={false}
		animate={{ rotate: expanded ? 90 : 0 }}
		transition={{ type: "spring", stiffness: 500, damping: 32 }}
	>
		<g opacity="0.8">
			<path d="M2 1L4 3L2 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
		</g>
	</motion.svg>
)

const ROW_SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.7 } as const

interface FolderProps {
	title: string
	nodes: TreeNode[]
	/** unfiltered size; when larger than nodes.length the header shows "n / total" */
	total?: number
	/** header actions, right of the title (kept outside the toggle button) */
	actions?: ReactNode
	expanded?: boolean
	indentationLevel?: number
}

export default function Folder({
	title,
	nodes,
	total,
	actions,
	expanded: initialExpanded = true,
	indentationLevel = 0,
}: FolderProps) {
	const [expanded, setExpanded] = useState(initialExpanded)
	const reduce = useReducedMotion()
	const listId = useId()
	const { order } = useFileTreeContext()
	const filtered = total !== undefined && total !== nodes.length

	// rows collapse/expand in height so siblings glide instead of jumping
	const rowMotion = reduce
		? {
				initial: { opacity: 0 },
				animate: { opacity: 1 },
				exit: { opacity: 0 },
				transition: { duration: 0.12 },
		  }
		: {
				initial: { opacity: 0, height: 0, overflow: "hidden" },
				// clip only while resizing, so a lifted (dragging) row isn't cut off
				animate: { opacity: 1, height: "auto", transitionEnd: { overflow: "visible" } },
				exit: { opacity: 0, height: 0, overflow: "hidden" },
				transition: { height: ROW_SPRING, layout: ROW_SPRING, opacity: { duration: 0.18 } },
		  }

	return (
		<div className="px-2 py-1.5">
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					aria-expanded={expanded}
					aria-controls={listId}
					className="flex flex-1 min-w-0 items-center px-2 space-x-2 text-left rounded-sm cursor-pointer group outline-none focus-visible:ring-1 focus-visible:ring-white/25"
					style={{ paddingLeft: `${indentationLevel * 1.25 + 0.25}rem` }}
				>
					<ExpandCollapseIcon expanded={expanded} />
					<FolderIcon />
					<span className="flex-1 text-sm leading-4 text-white/60 group-hover:text-white">
						{title}
					</span>
					<AnimatePresence initial={false}>
						{filtered && (
							<motion.span
								key="count"
								className="text-[10px] tabular-nums text-white/40"
								initial={{ opacity: 0, x: 4 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: 4 }}
							>
								{nodes.length}
								<span className="text-white/25"> / {total}</span>
							</motion.span>
						)}
					</AnimatePresence>
				</button>
				{actions}
			</div>
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.ul
						id={listId}
						key="list"
						initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0, overflow: "hidden" }}
						animate={
							reduce
								? { opacity: 1 }
								: { height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }
						}
						exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0, overflow: "hidden" }}
						transition={{ height: ROW_SPRING, opacity: { duration: 0.16 } }}
					>
						<li aria-hidden="true" className="h-1" />
						<AnimatePresence initial={false}>
							{nodes.map((node) => (
								<motion.li key={node.id} layout="position" layoutDependency={order} {...rowMotion}>
									{node?.children ? (
										<Folder
											title={node.title}
											nodes={node.children ?? []}
											indentationLevel={indentationLevel + 1}
										/>
									) : (
										<File
											node={node}
											hrefFunction={buildLink}
											indentationLevel={indentationLevel + 1}
										/>
									)}
								</motion.li>
							))}
						</AnimatePresence>
						{nodes.length === 0 && (
							<li
								className="py-1.5 text-xs text-white/35"
								style={{ paddingLeft: `${(indentationLevel + 1) * 1.25 + 0.5}rem` }}
							>
								nothing matches
							</li>
						)}
						<li aria-hidden="true" className="h-1" />
					</motion.ul>
				)}
			</AnimatePresence>
		</div>
	)
}
