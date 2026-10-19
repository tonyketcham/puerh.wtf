"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { X as CloseIcon } from "lucide-react"

export type FilterToken = {
	/** stable key, e.g. "styles:sheng" */
	id: string
	/** short facet name shown dim before the value, e.g. "style" */
	kind: string
	label: string
	/** optional swatch (category color) */
	color?: string
	onRemove: () => void
}

interface FilterTokensProps {
	tokens: FilterToken[]
	onClearAll: () => void
}

const TOKEN_SPRING = { type: "spring", stiffness: 520, damping: 36, mass: 0.7 } as const

/**
 * Active filters as small removable tokens (shared URL filter state, so anything set from the
 * command bar shows up here). Tokens pop in/out and the rest reflow with layout springs.
 */
export default function FilterTokens({ tokens, onClearAll }: FilterTokensProps) {
	const reduce = useReducedMotion()
	const transition = reduce ? { duration: 0 } : TOKEN_SPRING

	return (
		<AnimatePresence initial={false}>
			{tokens.length > 0 && (
				<motion.div
					key="tokens"
					className="overflow-hidden"
					initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
					animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
					exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
					transition={{ height: transition, opacity: { duration: 0.15 } }}
				>
					<ul className="flex flex-wrap items-center gap-1 pb-3" aria-label="Active filters">
						<AnimatePresence mode="popLayout" initial={false}>
							{tokens.map((token) => (
								<motion.li
									key={token.id}
									layout={!reduce}
									initial={{ opacity: 0, scale: 0.85 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.85 }}
									transition={transition}
									className="flex items-center h-6 max-w-full gap-1.5 pl-2 pr-0.5 text-[11px] border rounded-md border-white/10 bg-white/[0.04] text-white/80"
								>
									{token.color && (
										<span
											aria-hidden="true"
											className="rounded-full size-1.5 shrink-0"
											style={{ background: token.color }}
										/>
									)}
									<span className="text-white/35 shrink-0">{token.kind}</span>
									<span className="truncate">{token.label}</span>
									<button
										type="button"
										onClick={token.onRemove}
										aria-label={`Remove filter ${token.kind}: ${token.label}`}
										className="grid rounded size-5 place-items-center shrink-0 text-white/40 hover:text-white hover:bg-white/10 outline-none focus-visible:ring-1 focus-visible:ring-white/40"
									>
										<CloseIcon size={11} strokeWidth={2.25} />
									</button>
								</motion.li>
							))}
							{tokens.length > 1 && (
								<motion.li
									key="__clear"
									layout={!reduce}
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={transition}
								>
									<button
										type="button"
										onClick={onClearAll}
										className="h-6 px-1.5 text-[11px] rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
									>
										clear all
									</button>
								</motion.li>
							)}
						</AnimatePresence>
					</ul>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
