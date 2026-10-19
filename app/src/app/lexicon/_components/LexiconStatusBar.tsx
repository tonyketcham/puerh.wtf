"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useSetAtom } from "jotai"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { LEXICON_GROUP_META, peakStage } from "@/lib/lexicon"
import { liquorInk, type RGB } from "@/lib/liquor"
import { NOTE_STAGE_META } from "@/lib/noteStages"
import { formatRating } from "@/lib/sessionSort"
import { openCommandBarAtom } from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils"
import { useLexiconWord } from "./useLexiconWord"

/**
 * The status bar on lexicon pages, VS Code style:
 *
 *   [‘ descriptor] 18 refs · 13 list it · cream · mostly taste      2001–2021 · avg 86.1 · ■ #B0702C · ⌘K
 *
 * The kind block is tinted with the word's blended liquor. On the index it sums up the lexicon.
 */
export default function LexiconStatusBar({ slug }: { slug: string | null }) {
	const { index, lexicon, entry, model } = useLexiconWord(slug)
	const openCommandBar = useSetAtom(openCommandBarAtom)
	const reduce = useReducedMotion() ?? false

	const [isMac, setIsMac] = useState(true)
	useEffect(() => {
		setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
	}, [])

	const left: ReactNode[] = []
	const right: ReactNode[] = []
	if (model && entry) {
		const { stats } = model
		const peak = peakStage(entry)
		left.push(
			<span key="refs" title="Sessions that mention it (find all references)">
				{stats.count} {stats.count === 1 ? "ref" : "refs"}
			</span>,
			<span key="listed" title="Sessions whose notes list it">
				{entry.listed.length} list it
			</span>,
			<span key="group">{LEXICON_GROUP_META[entry.group].label}</span>
		)
		if (peak)
			left.push(
				<span key="peak">
					<span className="text-white/35">mostly</span> {NOTE_STAGE_META[peak].title.toLowerCase()}
				</span>
			)
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
	} else {
		left.push(
			<span key="words">{lexicon.size.toLocaleString("en-US")} words</span>,
			<span key="paged">{lexicon.paged.length} with pages</span>,
			<span key="sessions">{index.sessions.length} sessions</span>
		)
	}

	const accent = model?.accent ?? null
	const ink = accent ? liquorInk(hexRgb(accent)) : "#121012"

	return (
		<footer
			className={cn(
				"fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-between h-[var(--statusbar-h)]",
				"border-t border-white/[0.07] bg-[#161416] font-fira-code text-[11px] leading-none text-white/55",
				"overflow-hidden"
			)}
			aria-label="Lexicon status"
			data-recording-key="lexicon-status-bar"
		>
			<AnimatePresence initial={false} mode="popLayout">
				<motion.div
					key={slug ?? "index"}
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
							<span aria-hidden>‘</span>
							{entry ? "descriptor" : "lexicon"}
						</div>
						<div className="flex items-center min-w-0 gap-0 px-2.5 overflow-hidden whitespace-nowrap">
							{left.map((part, i) => (
								<span key={i} className="flex items-center">
									{i > 0 && <span className="px-1.5 text-white/20">·</span>}
									{part}
								</span>
							))}
						</div>
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
