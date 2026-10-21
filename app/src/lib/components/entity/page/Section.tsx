"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * An editor section: `── At a glance ─────────── aside`, the label set like a code-fold
 * header, the rule drawing out from it as the section scrolls into view.
 */
export default function Section({
	id,
	label,
	count,
	aside,
	children,
	className,
	recordingKey,
}: {
	id: string
	label: string
	count?: ReactNode
	aside?: ReactNode
	children: ReactNode
	className?: string
	recordingKey?: string
}) {
	const reduce = useReducedMotion() ?? false
	return (
		<motion.section
			aria-labelledby={`${id}-h`}
			className={cn("space-y-4 scroll-mt-24", className)}
			data-recording-key={recordingKey}
			initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "0px 0px -10% 0px" }}
			transition={reduce ? { duration: 0.2 } : { duration: 0.45, ease: EASE }}
		>
			<h2 id={`${id}-h`} className="flex items-center gap-3 text-sm text-white/45">
				<span aria-hidden className="text-white/20">
					──
				</span>
				<span className="text-tea-soup-400">{label}</span>
				{count !== undefined && <span className="tabular-nums text-white/25">{count}</span>}
				<motion.span
					aria-hidden
					className="flex-1 h-px origin-left bg-white/[0.07]"
					initial={reduce ? false : { scaleX: 0 }}
					whileInView={{ scaleX: 1 }}
					viewport={{ once: true }}
					transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
				/>
				{aside}
			</h2>
			{children}
		</motion.section>
	)
}
