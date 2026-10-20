"use client"

import { type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { TreeNode } from "../../types/tree"
import "./filetree.css"

export const FolderIcon = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 16 16"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		className="w-4 h-4 transition-colors shrink-0 text-white/50 group-hover:text-white/80"
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
		className="w-2 h-2 transition-colors text-white/50 group-hover:text-white"
		aria-hidden="true"
		initial={false}
		animate={{ rotate: expanded ? 90 : 0 }}
		transition={{ type: "spring", stiffness: 500, damping: 32 }}
	>
		<path d="M2 1L4 3L2 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
	</motion.svg>
)

const COUNT_SPRING = { type: "spring", stiffness: 520, damping: 38 } as const

interface FolderProps {
	title: string
	nodes: TreeNode[]
	/** unfiltered size; when larger than nodes.length the header shows "n/total" */
	total?: number
	/** header actions, right of the title (kept outside the toggle button) */
	actions?: ReactNode
	expanded: boolean
	onToggle: () => void
	indentationLevel?: number
}

export default function Folder({
	title,
	nodes,
	total,
	actions,
	expanded,
	onToggle,
	indentationLevel = 0,
}: FolderProps) {
	const reduce = useReducedMotion()
	const filtered = total !== undefined && total !== nodes.length

	return (
		<div className="pt-1">
			<div className="flex items-center gap-1 pr-1">
				<button
					type="button"
					onClick={onToggle}
					aria-expanded={expanded}
					className="flex items-center flex-1 h-8 min-w-0 gap-2 pr-2 text-left transition-colors rounded-lg outline-none cursor-pointer group hover:bg-white/[0.03] focus-visible:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]"
					// the chevron sits on the rail column (filetree.css --rail-x)
					style={{ paddingLeft: 7 + indentationLevel * 12 }}
				>
					<span className="grid w-3 shrink-0 place-items-center">
						<ExpandCollapseIcon expanded={expanded} />
					</span>
					<FolderIcon />
					<span className="flex-1 min-w-0 truncate text-[13px] leading-4 text-white/70 group-hover:text-white">
						{title}
					</span>
					<span className="flex text-[11px] tabular-nums text-white/35 group-hover:text-white/60">
						<AnimatePresence initial={false} mode="popLayout">
							<motion.span
								key={nodes.length}
								className="inline-block"
								initial={reduce ? { opacity: 0 } : { opacity: 0, y: -5 }}
								animate={{ opacity: 1, y: 0 }}
								exit={reduce ? { opacity: 0 } : { opacity: 0, y: 5 }}
								transition={COUNT_SPRING}
							>
								{nodes.length}
							</motion.span>
						</AnimatePresence>
						{filtered && <span className="text-white/20">/{total}</span>}
					</span>
				</button>
				{actions}
			</div>
		</div>
	)
}
