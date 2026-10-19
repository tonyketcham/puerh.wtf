"use client"

import { useRef, type KeyboardEvent } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { BookA, Files, Layers, Mountain, Store, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { EXPLORER_VIEWS, type ExplorerView } from "./state"

const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const

const VIEW_META: Record<ExplorerView, { label: string; icon: LucideIcon; glyph?: string }> = {
	sessions: { label: "Sessions", icon: Files },
	origins: { label: "Origins", icon: Mountain, glyph: "^" },
	vendors: { label: "Vendors", icon: Store, glyph: "@" },
	styles: { label: "Styles", icon: Layers, glyph: "~" },
	lexicon: { label: "Lexicon", icon: BookA },
}

export const explorerTabId = (view: ExplorerView) => `explorer-tab-${view}`
export const EXPLORER_PANEL_ID = "explorer-view-panel"

/**
 * The Explorer's activity rail (plan §2.1): switch between Sessions, Origins, Vendors,
 * Styles and the flavor Lexicon. Icons only, except the open view, whose name slides out
 * beside its icon while a shared pill glides under it. A tablist: ←/→ (and Home/End) move and select.
 */
export default function ActivityRail({
	value,
	onChange,
	recordingKey,
}: {
	value: ExplorerView
	onChange: (view: ExplorerView) => void
	recordingKey?: string
}) {
	const reduce = useReducedMotion()
	const refs = useRef<Partial<Record<ExplorerView, HTMLButtonElement | null>>>({})
	const transition = reduce ? { duration: 0 } : SPRING

	const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
		const i = EXPLORER_VIEWS.indexOf(value)
		const n = EXPLORER_VIEWS.length
		const to =
			e.key === "ArrowRight"
				? EXPLORER_VIEWS[(i + 1) % n]
				: e.key === "ArrowLeft"
				? EXPLORER_VIEWS[(i - 1 + n) % n]
				: e.key === "Home"
				? EXPLORER_VIEWS[0]
				: e.key === "End"
				? EXPLORER_VIEWS[n - 1]
				: null
		if (!to) return
		e.preventDefault()
		onChange(to)
		refs.current[to]?.focus()
	}

	return (
		<LayoutGroup id="explorer-rail">
			<div
				role="tablist"
				aria-label="Explorer views"
				className="flex items-center gap-px min-w-0"
				data-recording-key={recordingKey}
			>
				{EXPLORER_VIEWS.map((view) => {
					const meta = VIEW_META[view]
					const Icon = meta.icon
					const active = view === value
					return (
						<motion.button
							key={view}
							ref={(el) => {
								refs.current[view] = el
							}}
							layout
							transition={transition}
							type="button"
							role="tab"
							id={explorerTabId(view)}
							aria-selected={active}
							aria-controls={EXPLORER_PANEL_ID}
							aria-label={meta.label}
							tabIndex={active ? 0 : -1}
							title={meta.glyph ? `${meta.label}  (${meta.glyph} in search)` : meta.label}
							onClick={() => onChange(view)}
							onKeyDown={onKeyDown}
							data-view={view}
							className={cn(
								"relative flex items-center h-7 px-1.5 gap-1.5 rounded-md shrink-0",
								"outline-none focus-visible:ring-1 focus-visible:ring-white/40",
								"transition-colors duration-150",
								active ? "text-white/90" : "text-white/40 hover:text-white/75"
							)}
						>
							{active && (
								<motion.span
									layoutId="explorer-rail-pill"
									aria-hidden
									transition={transition}
									className="absolute inset-0 rounded-md bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]"
								>
									<span className="absolute left-2 right-2 -bottom-px h-px rounded-full bg-brand/70 shadow-[0_0_6px_rgb(237_196_70/0.6)]" />
								</motion.span>
							)}
							<motion.span layout="position" transition={transition} className="relative flex">
								<Icon size={13} strokeWidth={2} aria-hidden />
							</motion.span>
							<AnimatePresence initial={false} mode="popLayout">
								{active && (
									<motion.span
										key="label"
										layout="position"
										initial={reduce ? { opacity: 0 } : { opacity: 0, x: -4, filter: "blur(2px)" }}
										animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
										exit={{ opacity: 0, transition: { duration: 0.08 } }}
										transition={
											reduce ? { duration: 0.12 } : { ...SPRING, opacity: { duration: 0.18 } }
										}
										className="relative text-[11px] leading-none whitespace-nowrap"
									>
										{meta.label}
									</motion.span>
								)}
							</AnimatePresence>
						</motion.button>
					)
				})}
			</div>
		</LayoutGroup>
	)
}
