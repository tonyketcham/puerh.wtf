"use client"

import { hasFinishProfile } from "@/lib/sessionScores"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai"
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import RadarChart, { type RadarCompare } from "@/lib/components/dataviz/radar/RadarChart"
import PhaseScrubber from "@/lib/components/dataviz/radar/PhaseScrubber"
import { radarAccent, radarCompareAccent, withAlpha } from "@/lib/components/dataviz/radar/geometry"
import PanelSection from "@/lib/components/containers/PanelSection"
import { CrossIcon, RadarDiffIcon } from "@/lib/components/icons/TeaIcons"
import {
	commandBarAtom,
	compareSessionAtom,
	compareSlugAtom,
	currentLiquorAtom,
	explorerSessionsBySlugAtom,
	flavorAxesAtom,
	flavorPhaseAtom,
	flavorPhaseMotion,
	flavorPhaseSourceAtom,
	openCommandBarAtom,
	scrollRunwayAtom,
	sessionSlugAtom,
} from "@/lib/store/sessionAtom"
import { getLiquorColor } from "@/lib/liquor"
import { getSessionDragSlug, hasSessionDrag } from "@/lib/dnd"
import type { ExplorerSession } from "@/lib/types/session"

const POP = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const
const SOFT = { type: "spring", stiffness: 300, damping: 30 } as const

function compareLabel(s: Pick<ExplorerSession, "title" | "production_year">) {
	const year = s.production_year ? String(s.production_year) : ""
	return year && !s.title.startsWith(year) ? `${year} ${s.title}` : s.title
}

/**
 * Flavor Profile section of the Properties panel (radar).
 *
 * - Header: start ⇄ finish scrubber (writes flavorPhaseMotion, source "scrub").
 * - Radar: blended at the live phase, liquor-colored, dashed ghost of the other end.
 * - Drop target for SESSION_DRAG_MIME (drag a tea from the Explorer) → compareSlugAtom;
 *   renders a diff against the other tea. Esc or the chip's × clears.
 */
export default function FlavorProfilePanel() {
	const store = useStore()
	const reduce = useReducedMotion() ?? false
	const flavorAxes = useAtomValue(flavorAxesAtom)
	const hasFinish = hasFinishProfile(flavorAxes)
	const slug = useAtomValue(sessionSlugAtom)
	const liquor = useAtomValue(currentLiquorAtom)
	const phaseValue = useAtomValue(flavorPhaseAtom)
	const source = useAtomValue(flavorPhaseSourceAtom)
	const setSource = useSetAtom(flavorPhaseSourceAtom)
	const [compareSlug, setCompareSlug] = useAtom(compareSlugAtom)
	const compareSession = useAtomValue(compareSessionAtom)
	const bySlug = useAtomValue(explorerSessionsBySlugAtom)
	const openCommandBar = useSetAtom(openCommandBarAtom)

	const accent = useMemo(() => radarAccent(liquor), [liquor])

	const activeCompare = compareSession && compareSession._slug !== slug ? compareSession : null
	const compareAccent = useMemo(
		() => (activeCompare ? radarCompareAccent(liquor, getLiquorColor(activeCompare._slug)) : null),
		[activeCompare, liquor]
	)
	const compare: RadarCompare | null = useMemo(
		() =>
			activeCompare?.flavor_axes && compareAccent
				? { key: activeCompare._slug, data: activeCompare.flavor_axes, color: compareAccent }
				: null,
		[activeCompare, compareAccent]
	)

	const clearCompare = useCallback(() => setCompareSlug(null), [setCompareSlug])

	// ------------------------------------------------------------------ Esc clears the diff
	useEffect(() => {
		if (!compareSlug) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented) return
			if (store.get(commandBarAtom).open) return
			setCompareSlug(null)
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [compareSlug, setCompareSlug, store])

	// ------------------------------------------------------------------ scrubber ⇄ scroll arbitration
	const scrubbing = useRef(false)
	const onScrubStart = useCallback(() => {
		scrubbing.current = true
		setSource("scrub")
	}, [setSource])
	const onScrubEnd = useCallback(() => {
		scrubbing.current = false
	}, [])

	// Hand the phase back to scroll on the next *user* page scroll (wheel / touch / keys that
	// actually scroll the document). Programmatic scrolls (steep clicks) don't count.
	useEffect(() => {
		if (source !== "scrub") return
		let lastIntent = 0
		const intent = (e: Event) => {
			const t = e.target as Element | null
			if (t?.closest?.("[data-properties-panel],[data-commandbar]")) return
			if (e.type === "keydown") {
				const k = (e as KeyboardEvent).key
				if (!["PageDown", "PageUp", "ArrowDown", "ArrowUp", " ", "Home", "End"].includes(k)) return
				if (t?.closest?.("input,textarea,select,[contenteditable],[role=slider]")) return
			}
			lastIntent = performance.now()
		}
		const onScroll = () => {
			if (scrubbing.current) return
			if (performance.now() - lastIntent > 350) return
			if (!store.get(scrollRunwayAtom).scrollable) return
			if (store.get(flavorPhaseSourceAtom) === "scrub") store.set(flavorPhaseSourceAtom, "scroll")
		}
		window.addEventListener("wheel", intent, { passive: true })
		window.addEventListener("touchmove", intent, { passive: true })
		window.addEventListener("keydown", intent)
		window.addEventListener("scroll", onScroll, { passive: true })
		return () => {
			window.removeEventListener("wheel", intent)
			window.removeEventListener("touchmove", intent)
			window.removeEventListener("keydown", intent)
			window.removeEventListener("scroll", onScroll)
		}
	}, [source, store])

	// ------------------------------------------------------------------ drag-to-compare
	const [armed, setArmed] = useState(false) // a session drag is in flight somewhere
	const [over, setOver] = useState(false)
	const [rejected, setRejected] = useState(0) // bump to replay the "same tea" nudge
	const depth = useRef(0)
	const rootRef = useRef<HTMLDivElement>(null)
	const reduceRef = useRef(reduce)
	useEffect(() => {
		reduceRef.current = reduce
	}, [reduce])

	useEffect(() => {
		const onStart = (e: globalThis.DragEvent) => {
			if (!hasSessionDrag(e.dataTransfer)) return
			setArmed(true)
			// the notes may have scrolled the radar out of the properties panel: bring the drop
			// target back before the pointer gets there
			const el = rootRef.current
			const scroller = el?.closest("[data-properties-panel]")
			if (el && scroller && el.getBoundingClientRect().top < scroller.getBoundingClientRect().top) {
				el.scrollIntoView({ block: "nearest", behavior: reduceRef.current ? "auto" : "smooth" })
			}
		}
		const onEnd = () => {
			depth.current = 0
			setArmed(false)
			setOver(false)
		}
		window.addEventListener("dragstart", onStart)
		window.addEventListener("dragend", onEnd)
		window.addEventListener("drop", onEnd)
		return () => {
			window.removeEventListener("dragstart", onStart)
			window.removeEventListener("dragend", onEnd)
			window.removeEventListener("drop", onEnd)
		}
	}, [])

	useEffect(() => {
		if (!rejected) return
		const t = window.setTimeout(() => setRejected(0), 1500)
		return () => window.clearTimeout(t)
	}, [rejected])

	const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
		if (!hasSessionDrag(e.dataTransfer)) return
		e.preventDefault()
		depth.current += 1
		setOver(true)
		setArmed(true)
	}
	const onDragOver = (e: DragEvent<HTMLDivElement>) => {
		if (!hasSessionDrag(e.dataTransfer)) return
		e.preventDefault()
		e.dataTransfer.dropEffect = "link"
	}
	const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
		if (!hasSessionDrag(e.dataTransfer)) return
		depth.current = Math.max(0, depth.current - 1)
		if (depth.current === 0) setOver(false)
	}
	const onDrop = (e: DragEvent<HTMLDivElement>) => {
		if (!hasSessionDrag(e.dataTransfer)) return
		e.preventDefault()
		depth.current = 0
		setOver(false)
		setArmed(false)
		const dropped = getSessionDragSlug(e.dataTransfer)
		if (!dropped) return
		if (dropped === slug) {
			setRejected((n) => n + 1)
			return
		}
		if (!bySlug.has(dropped)) return
		setCompareSlug(dropped)
	}

	const showDropUi = over || armed

	return (
		<div
			ref={rootRef}
			className="relative"
			data-flavor-profile
			data-drop-state={over ? "over" : armed ? "armed" : "idle"}
			onDragEnter={onDragEnter}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			<PanelSection
				title="Session Details"
				hasBottomBorder
				hasPadding={false}
				rightSlot={
					hasFinish ? (
						<PhaseScrubber
							phase={flavorPhaseMotion}
							value={phaseValue}
							color={accent}
							onScrubStart={onScrubStart}
							onScrubEnd={onScrubEnd}
						/>
					) : undefined
				}
			>
				<div className="relative group/radar">
					<motion.div
						animate={over ? { opacity: 0.45, scale: 0.97 } : { opacity: 1, scale: 1 }}
						transition={reduce ? { duration: 0 } : SOFT}
					>
						<RadarChart
							data={flavorAxes ?? {}}
							phase={flavorPhaseMotion}
							color={accent}
							compare={compare}
						/>
					</motion.div>

					{/* top: "vs …" legend chip */}
					<div className="absolute inset-x-0 top-2 flex justify-center px-3 pointer-events-none">
						<AnimatePresence mode="popLayout" initial={false}>
							{activeCompare && compareAccent && (
								<motion.div
									key={activeCompare._slug}
									layout
									initial={
										reduce
											? { opacity: 0 }
											: { opacity: 0, y: -6, scale: 0.96, filter: "blur(4px)" }
									}
									animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
									exit={
										reduce
											? { opacity: 0 }
											: { opacity: 0, y: -4, scale: 0.97, filter: "blur(3px)" }
									}
									transition={reduce ? { duration: 0.12 } : POP}
									className="pointer-events-auto inline-flex max-w-full items-center gap-1.5 h-6 pl-2 pr-0.5 rounded-full bg-[var(--surface-face)]/90 backdrop-blur-md shadow-key text-[11px] text-white/85"
									data-compare-chip
								>
									<span aria-hidden className="relative flex items-center">
										<span className="size-2 rounded-full" style={{ background: accent }} />
										<span
											className="-ml-[3px] size-2 rounded-full ring-[1.5px] ring-[#121012]"
											style={{ background: compareAccent }}
										/>
									</span>
									<span className="text-white/40">vs</span>
									<span className="truncate" title={compareLabel(activeCompare)}>
										{compareLabel(activeCompare)}
									</span>
									{!activeCompare.flavor_axes && (
										<span className="text-white/35 whitespace-nowrap">· no profile</span>
									)}
									<button
										type="button"
										onClick={clearCompare}
										aria-label={`Stop comparing with ${compareLabel(activeCompare)}`}
										title="Clear (Esc)"
										className="grid shrink-0 size-5 place-items-center rounded-full text-white/45 transition-colors hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
									>
										<CrossIcon className="size-3" />
									</button>
								</motion.div>
							)}
						</AnimatePresence>
					</div>

					{/* bottom corners: diff legend, or the idle "compare…" affordance */}
					<AnimatePresence initial={false}>
						{compare && compareAccent && !showDropUi && !rejected && (
							<motion.div
								key="legend"
								initial={{ opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 4 }}
								transition={reduce ? { duration: 0.12 } : SOFT}
								aria-hidden
								className="absolute inset-x-3 bottom-2 flex items-center justify-between text-[10px] leading-none text-white/45 pointer-events-none"
							>
								<span className="flex items-center gap-2.5">
									<Swatch color={accent} label="this" />
									<Swatch color="#ffffff" alpha={14} label="shared" />
								</span>
								<Swatch color={compareAccent} label="other" dashed />
							</motion.div>
						)}
						{!activeCompare && !showDropUi && !rejected && (
							<motion.div
								key="compare-cta"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: reduce ? 0 : 0.15 }}
								className="absolute right-2 bottom-2"
							>
								{/* hover reveal lives on the button (motion owns the wrapper's opacity) */}
								<button
									type="button"
									onClick={() => openCommandBar({ scope: "compare" })}
									title="Drag a tea from the Explorer onto the radar, or pick one"
									className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] text-white/45 opacity-0 transition-[opacity,color,background-color] duration-150 group-hover/radar:opacity-100 focus-visible:opacity-100 hover:text-white hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
								>
									<RadarDiffIcon className="size-3" />
									compare…
								</button>
							</motion.div>
						)}
					</AnimatePresence>

					{/* drop affordances */}
					<AnimatePresence>
						{showDropUi && (
							<motion.div
								key="drop"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: reduce ? 0 : 0.16 }}
								className="absolute inset-0 grid place-items-center pointer-events-none"
							>
								<motion.div
									animate={
										over ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.94, opacity: 0.75, y: 0 }
									}
									initial={reduce ? false : { scale: 0.9, opacity: 0, y: 4 }}
									transition={reduce ? { duration: 0 } : POP}
									className="inline-flex items-center gap-2 h-7 pl-1.5 pr-3 rounded-full border bg-[var(--surface-face)]/90 backdrop-blur-md text-[11px] text-white shadow-key"
									style={{
										borderColor: over ? withAlpha(accent, 70) : "rgba(255,255,255,0.12)",
									}}
								>
									<span
										aria-hidden
										className="grid size-4 place-items-center rounded-[4px]"
										style={{ background: withAlpha(accent, over ? 35 : 18), color: accent }}
									>
										<RadarDiffIcon className="size-3" />
									</span>
									{over ? "drop to diff" : "drop on the radar to diff"}
								</motion.div>
							</motion.div>
						)}
					</AnimatePresence>

					{/* "that's this tea" nudge */}
					<AnimatePresence>
						{rejected > 0 && (
							<motion.div
								key={rejected}
								role="status"
								initial={{ opacity: 0, y: 4 }}
								animate={
									reduce ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, x: [0, -5, 5, -3, 3, 0] }
								}
								exit={{ opacity: 0, y: 4 }}
								transition={{ duration: reduce ? 0 : 0.36, ease: "easeOut" }}
								className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none"
							>
								<span className="rounded-full bg-[var(--surface-face)]/90 shadow-key px-2.5 py-1 text-[10px] text-white/70">
									that’s this tea — drop another
								</span>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</PanelSection>

			{/* section glow while a session is dragged / over */}
			<AnimatePresence>
				{showDropUi && (
					<motion.div
						key="glow"
						aria-hidden
						initial={{ opacity: 0 }}
						animate={{ opacity: over ? 1 : 0.55 }}
						exit={{ opacity: 0 }}
						transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}
						className="absolute inset-0 z-10 pointer-events-none rounded-[2px]"
						style={{
							boxShadow: over
								? `inset 0 0 0 1px ${withAlpha(accent, 75)}, inset 0 0 28px -6px ${withAlpha(
										accent,
										45
								  )}`
								: `inset 0 0 0 1px ${withAlpha(accent, 28)}`,
						}}
					/>
				)}
			</AnimatePresence>
		</div>
	)
}

function Swatch({
	color,
	label,
	alpha = 45,
	dashed = false,
}: {
	color: string
	label: string
	alpha?: number
	dashed?: boolean
}) {
	return (
		<span className="inline-flex items-center gap-1">
			<span
				className="size-2 rounded-[2px]"
				style={{
					background: withAlpha(color, alpha),
					outline: `1px ${dashed ? "dashed" : "solid"} ${withAlpha(color, 80)}`,
					outlineOffset: -1,
				}}
			/>
			{label}
		</span>
	)
}
