"use client"

import { useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

const EASE = [0.22, 1, 0.36, 1] as const
const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const
const COLLAPSED = 6

type RelRow = {
	key: string
	count: number
	render: ReactNode
	color?: string | null
	/** Replaces the share bar and count (nearby origins show distance). */
	note?: string
}

export type RelatedGroupData = {
	key: string
	label: string
	glyph: string
	rows: RelRow[]
	total: number
	hint?: string
}

/** Shared related-item presentation: six rows, expandable, with staggered share bars. */
export default function RelatedGroup({
	group,
	order,
	accent,
}: {
	group: RelatedGroupData
	order: number
	accent: string
}) {
	const reduce = useReducedMotion() ?? false
	const [open, setOpen] = useState(false)
	const shown = open ? group.rows : group.rows.slice(0, COLLAPSED)
	const more = group.rows.length - COLLAPSED

	return (
		<div className="min-w-0 space-y-2" data-related={group.key}>
			<h3 className="flex items-center gap-2 text-[11px] text-white/40">
				<span aria-hidden className="text-white/25">
					{group.glyph}
				</span>
				<span className="tracking-[0.1em] uppercase">{group.label}</span>
				<span className="tabular-nums text-white/25">{group.rows.length}</span>
				{group.hint && <span className="text-white/25 normal-case">· {group.hint}</span>}
			</h3>
			<motion.ul layout={reduce ? false : "size"} transition={SPRING} className="space-y-1">
				<AnimatePresence initial={false}>
					{shown.map((row, i) => (
						<motion.li
							key={row.key}
							layout={reduce ? false : "position"}
							className="grid grid-cols-[minmax(0,auto)_minmax(2rem,1fr)_auto] items-center gap-3"
							initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, transition: { duration: 0.12 } }}
							transition={{
								duration: 0.35,
								ease: EASE,
								delay: reduce
									? 0
									: i < COLLAPSED
									? order * 0.05 + i * 0.03
									: (i - COLLAPSED) * 0.025,
							}}
						>
							{row.render}
							{row.note ? (
								<span aria-hidden className="h-px bg-white/[0.06]" />
							) : (
								<span
									aria-hidden
									className="relative h-1 rounded-full bg-white/[0.04] overflow-hidden"
								>
									{row.count > 0 && (
										<motion.span
											className="absolute inset-y-0 left-0 origin-left rounded-full"
											style={{
												width: `${Math.max(4, (row.count / Math.max(1, group.total)) * 100)}%`,
												backgroundColor: row.color || accent,
												opacity: 0.8,
											}}
											initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
											animate={reduce ? { opacity: 0.8 } : { scaleX: 1 }}
											transition={
												reduce
													? { duration: 0.2 }
													: { ...SPRING, delay: 0.15 + order * 0.05 + i * 0.03 }
											}
										/>
									)}
								</span>
							)}
							<span className="text-[11px] tabular-nums text-white/35 min-w-[3ch] text-right">
								{row.note ?? (row.count > 0 ? row.count : "untasted")}
							</span>
						</motion.li>
					))}
				</AnimatePresence>
			</motion.ul>
			{more > 0 && (
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					aria-expanded={open}
					className="h-6 px-1 -ml-1 text-[10px] rounded-[4px] outline-none text-white/35 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
				>
					{open ? "show fewer" : `+${more} more`}
				</button>
			)}
		</div>
	)
}
