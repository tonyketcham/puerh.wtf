"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Pin, X as CloseIcon } from "lucide-react"
import type { DescriptorSelection } from "@/lib/store/sessionAtom"

interface DescriptorReferencesProps {
	descriptor: DescriptorSelection | null
	/** sessions (in the whole log) that mention the descriptor */
	total: number
	/** of those, how many the current filters hide */
	hidden: number
	onTogglePin: () => void
	onClear: () => void
}

/**
 * "Find references" header: ‘caramel’ · 7 sessions. Matching rows in the tree get a liquor dot,
 * the rest dim. Pinning keeps the descriptor across session navigation.
 */
export default function DescriptorReferences({
	descriptor,
	total,
	hidden,
	onTogglePin,
	onClear,
}: DescriptorReferencesProps) {
	const reduce = useReducedMotion()

	return (
		<AnimatePresence initial={false}>
			{descriptor && (
				<motion.div
					key="refs"
					className="overflow-hidden"
					initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
					animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
					exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
					transition={{
						height: reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 },
						opacity: { duration: 0.15 },
					}}
				>
					<div
						role="status"
						className="flex items-center gap-2 pl-2 pr-0.5 mb-3 h-7 text-[11px] rounded-md bg-white/[0.03] border border-white/[0.06]"
						style={{ boxShadow: "inset 2px 0 0 var(--liquor-text, #edc446)" }}
					>
						<span className="text-[9px] tracking-[0.14em] uppercase text-white/35 shrink-0">
							refs
						</span>
						<span className="min-w-0 truncate">
							<AnimatePresence mode="popLayout" initial={false}>
								<motion.span
									key={descriptor.term}
									className="inline-block text-white/90"
									initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
									transition={{ duration: 0.16 }}
								>
									‘{descriptor.term}’
								</motion.span>
							</AnimatePresence>
							<span className="text-white/30"> · </span>
							<span className="tabular-nums text-white/55">
								{total} {total === 1 ? "session" : "sessions"}
							</span>
							{hidden > 0 && (
								<span className="text-white/30" title="hidden by the active filters">
									{" "}
									({hidden} filtered)
								</span>
							)}
						</span>
						<span className="flex-1" />
						<button
							type="button"
							onClick={onTogglePin}
							aria-pressed={descriptor.pinned}
							aria-label={descriptor.pinned ? "Unpin descriptor" : "Pin descriptor across sessions"}
							title={
								descriptor.pinned ? "Pinned: follows you across sessions" : "Pin across sessions"
							}
							className="grid rounded size-6 place-items-center shrink-0 text-white/40 hover:text-white hover:bg-white/10 outline-none focus-visible:ring-1 focus-visible:ring-white/40 aria-pressed:text-[var(--liquor-text,#edc446)]"
						>
							<Pin
								size={11}
								strokeWidth={2.25}
								fill={descriptor.pinned ? "currentColor" : "none"}
							/>
						</button>
						<button
							type="button"
							onClick={onClear}
							aria-label="Clear descriptor references"
							className="grid rounded size-6 place-items-center shrink-0 text-white/40 hover:text-white hover:bg-white/10 outline-none focus-visible:ring-1 focus-visible:ring-white/40"
						>
							<CloseIcon size={12} strokeWidth={2.25} />
						</button>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
