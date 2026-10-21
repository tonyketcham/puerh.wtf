"use client"

import type { ReactNode } from "react"
import { useSetAtom } from "jotai"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { liquorInk, type RGB } from "@/lib/liquor"
import type { EntityStats } from "@/lib/relations"
import { formatRating } from "@/lib/sessionSort"
import { openCommandBarAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils/cn"
import { usePlatform } from "@/lib/utils/usePlatform"

/** Shared entity/lexicon chrome; callers supply their domain-specific status and controls. */
export default function StatusBarFrame({
	pageKey,
	label,
	recordingKey,
	glyph,
	name,
	accent,
	stats,
	left,
	leftClassName,
	afterLeft,
}: {
	pageKey: string
	label: string
	recordingKey: string
	glyph: ReactNode
	name: string
	accent: string | null
	stats?: EntityStats
	left: ReactNode[]
	leftClassName?: string
	afterLeft?: ReactNode
}) {
	const openCommandBar = useSetAtom(openCommandBarAtom)
	const reduce = useReducedMotion() ?? false
	// Preserve the status bars' initial shortcut while the platform hydrates.
	const isMac = usePlatform() !== "other"
	const ink = accent ? liquorInk(hexRgb(accent)) : "#121012"
	const right: ReactNode[] = []
	if (stats) {
		if (stats.years)
			right.push(
				<span key="years" className="tabular-nums" title="Vintages">
					{stats.years[0] === stats.years[1]
						? stats.years[0]
						: `${stats.years[0]}–${stats.years[1]}`}
				</span>
			)
		if (stats.avgRating != null)
			right.push(
				<span key="avg" className="tabular-nums" title="Average rating">
					<span className="text-white/35">avg</span>{" "}
					{formatRating(Math.round(stats.avgRating * 10) / 10)}
				</span>
			)
	}

	return (
		<footer
			className={cn(
				"fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-between h-[var(--statusbar-h)]",
				"surface-bar font-fira-code text-[11px] leading-none text-white/55",
				"overflow-hidden"
			)}
			aria-label={label}
			data-recording-key={recordingKey}
		>
			<AnimatePresence initial={false} mode="popLayout">
				<motion.div
					key={pageKey}
					className="flex items-stretch justify-between flex-1 min-w-0"
					initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
					transition={{ type: "spring", stiffness: 420, damping: 34 }}
				>
					<div className="flex items-stretch min-w-0 overflow-hidden">
						<div
							className="flex items-center gap-1.5 px-3 font-medium transition-colors duration-500"
							style={{
								backgroundColor: accent ?? "rgb(255 255 255 / 0.08)",
								color: accent ? ink : "rgb(255 255 255 / 0.7)",
							}}
						>
							<span aria-hidden>{glyph}</span>
							{name}
						</div>
						<div
							className={cn(
								"flex items-center min-w-0 gap-0 px-2.5 overflow-hidden whitespace-nowrap",
								leftClassName
							)}
						>
							{left.map((part, i) => (
								<span key={i} className="flex items-center">
									{i > 0 && <span className="px-1.5 text-white/20">·</span>}
									{part}
								</span>
							))}
						</div>
						{afterLeft}
					</div>
					<div className="flex items-stretch shrink-0">
						{right.map((part, i) => (
							<div key={i} className="hidden md:flex items-center px-2.5">
								{part}
							</div>
						))}
						{accent && (
							<div
								className="flex items-center gap-1.5 px-2.5"
								title="Blended liquor of its sessions"
							>
								<span
									aria-hidden
									className="size-2.5 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
									style={{ backgroundColor: accent }}
								/>
								<span className="uppercase">{accent}</span>
							</div>
						)}
						<button
							type="button"
							title="Command bar"
							onClick={() => openCommandBar({})}
							className="hidden md:flex items-center px-2.5 pr-3 text-white/35 outline-none hover:bg-white/[0.06] hover:text-white/85 focus-visible:bg-white/[0.08]"
						>
							<kbd className="font-fira-code">{isMac ? "⌘K" : "Ctrl K"}</kbd>
						</button>
					</div>
				</motion.div>
			</AnimatePresence>
		</footer>
	)
}

function hexRgb(hex: string): RGB {
	const h = hex.replace("#", "")
	const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
	const n = parseInt(full.slice(0, 6), 16)
	return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [217, 164, 65]
}
