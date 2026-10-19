"use client"

import { motion, useReducedMotion } from "motion/react"
import { SESSION_SORTS, SESSION_SORT_LABEL, type SessionSort } from "@/lib/sessionSort"
import TextMorph from "@/lib/components/session/TextMorph"
import { cn } from "@/lib/utils/cn"

const TURN = { type: "spring", stiffness: 520, damping: 30, mass: 0.6 } as const

/**
 * The Sessions folder's sort, as an IDE-style header action: one compact button that cycles
 * date → vintage → rating (⇧-click goes back). The label morphs letter by letter and the bars
 * glyph re-stacks, so the order change reads before the rows glide into place.
 */
export default function SessionSortToggle({
	value,
	onChange,
	recordingKey,
}: {
	value: SessionSort
	onChange: (next: SessionSort) => void
	recordingKey?: string
}) {
	const reduce = useReducedMotion() ?? false
	const i = SESSION_SORTS.indexOf(value)
	const step = (delta: number) =>
		SESSION_SORTS[(i + delta + SESSION_SORTS.length) % SESSION_SORTS.length]
	const next = step(1)

	return (
		<button
			type="button"
			onClick={(e) => onChange(step(e.shiftKey ? -1 : 1))}
			aria-label={`Sessions sorted by ${SESSION_SORT_LABEL[value]}; sort by ${SESSION_SORT_LABEL[next]}`}
			title={`Sort by ${SESSION_SORT_LABEL[next]}  (⇧-click: back)`}
			data-recording-key={recordingKey}
			data-sort={value}
			className={cn(
				"flex items-center gap-1 h-5 px-1.5 rounded-sm shrink-0",
				"text-[10px] leading-none text-white/40 hover:text-white/80 hover:bg-white/[0.05]",
				"transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/25",
				// off the default order, the action stays lit so a re-sorted list never goes unexplained
				value !== "date" && "text-brand/80"
			)}
		>
			<SortGlyph sort={value} reduce={reduce} />
			<TextMorph text={SESSION_SORT_LABEL[value]} />
		</button>
	)
}

/** Three bars that re-stack per order: date = even, vintage = stepped, rating = descending. */
const BAR_WIDTHS: Record<SessionSort, [number, number, number]> = {
	date: [8, 8, 8],
	vintage: [4, 6, 8],
	rating: [8, 6, 3],
}

function SortGlyph({ sort, reduce }: { sort: SessionSort; reduce: boolean }) {
	return (
		<svg aria-hidden viewBox="0 0 10 10" className="size-2.5 shrink-0" fill="none">
			{BAR_WIDTHS[sort].map((w, row) => (
				<motion.line
					key={row}
					x1={1}
					y1={2 + row * 3}
					y2={2 + row * 3}
					stroke="currentColor"
					strokeWidth={1.25}
					strokeLinecap="round"
					initial={false}
					animate={{ x2: 1 + w }}
					transition={reduce ? { duration: 0 } : { ...TURN, delay: row * 0.03 }}
				/>
			))}
		</svg>
	)
}
