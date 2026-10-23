"use client"

import {
	useCallback,
	memo,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	startTransition,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
} from "react"
import {
	AnimatePresence,
	motion,
	useMotionValue,
	useTransform,
	useReducedMotion,
	animate,
	type Transition,
} from "motion/react"
import type { ExplorerSession } from "@/lib/types/session"
import { cn } from "@/lib/utils/cn"
import TextMorph from "@/lib/components/session/TextMorph"

export interface YearRulerProps {
	/** all sessions (unfiltered) — the ruler's domain */
	sessions: ExplorerSession[]
	/**
	 * sessions passing every filter EXCEPT the year facet — tick fill shows how many of each
	 * vintage survive the other filters, so the ruler stays useful while a range is selected
	 */
	filteredSessions: ExplorerSession[]
	/** currently selected production years (shared filter state, as strings) */
	activeYears: string[]
	/** replace the `years` facet */
	onYearsChange: (years: string[]) => void
	/**
	 * Vintages to preview (the Explorer entity row under the pointer): a bead rises over each
	 * of its vintages, so hovering Yiwu shows when Yiwu teas were pressed. Null for none.
	 */
	previewYears?: ReadonlySet<number> | null
}

type Handle = "lo" | "hi"

type Gesture =
	/** `base`: vintages a shift-brush adds to (empty for a plain brush, which replaces) */
	| { kind: "pending"; pointerId: number; startX: number; startYear: number; base: number[] }
	| { kind: "brush"; pointerId: number; startYear: number; base: number[] }
	| { kind: "handle"; pointerId: number; which: Handle; fixed: number; grabOffset: number }

const TICK_MAX_H = 20
const TICK_MIN_H = 4
const DRAG_THRESHOLD_PX = 4
/** band / handle overhang either side of a tick, in years */
const BAND_PAD = 0.42

const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const
const HANDLE_SPRING = { type: "spring", stiffness: 700, damping: 30, mass: 0.6 } as const

const LIQUOR = "var(--liquor-text, #edc446)"
const liquorA = (a: number) => `rgb(var(--liquor-text-rgb, 237 196 70) / ${a})`

const yearOf = (s: ExplorerSession) =>
	s.production_year ? Math.trunc(Number(s.production_year)) : null

/** consecutive runs of selected vintages (consecutive in the vintage list, not the calendar) */
function toRuns(selected: number[], vintages: number[]): [number, number][] {
	const runs: [number, number][] = []
	let prevIdx = -2
	for (const y of selected) {
		const idx = vintages.indexOf(y)
		if (idx < 0) continue
		if (idx === prevIdx + 1 && runs.length) runs[runs.length - 1][1] = y
		else runs.push([y, y])
		prevIdx = idx
	}
	return runs
}

/**
 * Vintage (production_year) ruler above the Explorer tree.
 *
 * - One tick per vintage; height ~ √(sessions that year); fill = share surviving other filters.
 * - Drag across it to brush a range (shift-drag adds another range); click a tick to toggle a
 *   single vintage (shift-click fills in from the nearest selected vintage); double-click clears.
 *   Handles snap to vintages with a spring.
 * - Handles are sliders: ←/→ step between vintages, PgUp/PgDn ×5, Home/End, Esc/Backspace clears.
 * - Writes only through onYearsChange (the shared years facet). Selecting every vintage = no filter.
 */
function YearRuler({
	sessions,
	filteredSessions,
	activeYears,
	onYearsChange,
	previewYears = null,
}: YearRulerProps) {
	const reduce = useReducedMotion()
	const trackRef = useRef<HTMLDivElement | null>(null)
	const gestureRef = useRef<Gesture | null>(null)
	const lastWriteRef = useRef<string | null>(null)
	const clickYearRef = useRef<number | null>(null)
	const trackRectRef = useRef<DOMRect | null>(null)
	const pointerFrameRef = useRef<number | null>(null)
	const pendingPointerRef = useRef<{
		clientX: number
		pointerId: number
		pointerType: string
	} | null>(null)
	const previewKeyRef = useRef<string | null>(null)
	const readoutId = useId()

	const { vintages, counts, maxCount, minY, maxY } = useMemo(() => {
		const counts = new Map<number, number>()
		for (const s of sessions) {
			const y = yearOf(s)
			if (y) counts.set(y, (counts.get(y) ?? 0) + 1)
		}
		const vintages = [...counts.keys()].sort((a, b) => a - b)
		const minY = vintages[0] ?? 0
		const maxY = vintages[vintages.length - 1] ?? 0
		return { vintages, counts, maxCount: Math.max(1, ...counts.values()), minY, maxY }
	}, [sessions])

	const filteredCounts = useMemo(() => {
		const m = new Map<number, number>()
		for (const s of filteredSessions) {
			const y = yearOf(s)
			if (y) m.set(y, (m.get(y) ?? 0) + 1)
		}
		return m
	}, [filteredSessions])

	const committed = useMemo(
		() =>
			[...new Set(activeYears.map((y) => Math.trunc(Number(y))))]
				.filter((y) => counts.has(y))
				.sort((a, b) => a - b),
		[activeYears, counts]
	)

	// live selection while a gesture is in flight (the parent catches up underneath)
	const [draft, setDraft] = useState<number[] | null>(null)
	const [hoverYear, setHoverYear] = useState<number | null>(null)
	const [activeHandle, setActiveHandle] = useState<Handle | null>(null)
	const [dragging, setDragging] = useState(false)
	// selection a shift-brush in flight is adding to (drawn as static runs beside the live band)
	const [brushBase, setBrushBase] = useState<number[]>([])

	const selected = draft ?? committed
	const selectedSet = useMemo(() => new Set(selected), [selected])
	const hasSelection = selected.length > 0 && selected.length < vintages.length
	const runs = useMemo(() => toRuns(selected, vintages), [selected, vintages])
	const baseRuns = useMemo(() => toRuns(brushBase, vintages), [brushBase, vintages])
	const lo = selected.length ? selected[0] : minY
	const hi = selected.length ? selected[selected.length - 1] : maxY

	// ----- geometry ---------------------------------------------------------
	const span = maxY - minY + 1
	const pct = useCallback((y: number) => ((y - minY + 0.5) / span) * 100, [minY, span])
	const loPosition = useMotionValue(pct(lo - BAND_PAD))
	const hiPosition = useMotionValue(pct(hi + BAND_PAD))
	const loTranslate = useTransform(loPosition, (p) => `${p}%`)
	const hiTranslate = useTransform(hiPosition, (p) => `${p}%`)
	const bandWidth = useTransform(
		[loPosition, hiPosition],
		([l, h]) => `${Math.max(0, Number(h) - Number(l))}%`
	)

	// During the gesture the pointer owns the geometry. Only release, keyboard and
	// Committed filter changes spring to exact vintages; filtering never pulls the handle back.
	useEffect(() => {
		if (gestureRef.current) return
		const transition = reduce ? { duration: 0 } : HANDLE_SPRING
		const lower = animate(loPosition, pct(lo - BAND_PAD), transition)
		const upper = animate(hiPosition, pct(hi + BAND_PAD), transition)
		return () => {
			lower.stop()
			upper.stop()
		}
	}, [lo, hi, pct, reduce, dragging, loPosition, hiPosition])

	const yearAtClientX = useCallback(
		(clientX: number, clamp = true) => {
			const rect = trackRectRef.current ?? trackRef.current?.getBoundingClientRect()
			if (!rect || rect.width === 0) return minY
			if (gestureRef.current) trackRectRef.current = rect
			const raw = (clientX - rect.left) / rect.width
			const frac = clamp ? Math.min(1, Math.max(0, raw)) : raw
			return minY - 0.5 + frac * span
		},
		[minY, span]
	)

	const nearestVintage = useCallback(
		(y: number) => {
			let best = vintages[0]
			for (const v of vintages) if (Math.abs(v - y) < Math.abs(best - y)) best = v
			return best
		},
		[vintages]
	)

	const vintagesBetween = useCallback(
		(a: number, b: number) => {
			const [l, h] = a <= b ? [a, b] : [b, a]
			return vintages.filter((v) => v >= l && v <= h)
		},
		[vintages]
	)

	// ----- writes -----------------------------------------------------------
	const committedKey = committed.join(",")

	const commit = useCallback(
		(list: number[]) => {
			const uniq = [...new Set(list)].sort((a, b) => a - b)
			const next = uniq.length === 0 || uniq.length === vintages.length ? [] : uniq
			const key = next.join(",")
			// Mid-gesture the parent render may lag our writes; dedupe against the last write.
			const baseline = gestureRef.current ? lastWriteRef.current : committedKey
			if (key === baseline) return
			lastWriteRef.current = key
			onYearsChange(next.map(String))
		},
		[onYearsChange, vintages.length, committedKey]
	)

	// After a gesture, hold the draft until the parent echoes the last write (no snap-back flicker).
	const settleKeyRef = useRef<string | null>(null)
	useEffect(() => {
		if (settleKeyRef.current !== null && settleKeyRef.current === committedKey) {
			settleKeyRef.current = null
			setDraft(null)
		}
	}, [committedKey])

	const preview = useCallback(
		(list: number[]) => {
			const key = list.join(",")
			if (previewKeyRef.current === key) return
			previewKeyRef.current = key
			setDraft(list)
			// The ruler is urgent input; filtering the rest of the page may yield to it.
			startTransition(() => commit(list))
		},
		[commit]
	)

	const clear = useCallback(() => {
		setDraft(null)
		settleKeyRef.current = null
		commit([])
	}, [commit])

	// ----- brush ghost (raw pointer extent; MotionValues, no per-frame renders) -----
	const ghostLeft = useMotionValue("0%")
	const ghostWidth = useMotionValue("0%")
	const ghostOpacity = useMotionValue(0)

	const setGhost = (a: number, b: number) => {
		const l = Math.min(a, b)
		const h = Math.max(a, b)
		ghostLeft.set(`${((l - minY + 0.5) / span) * 100}%`)
		ghostWidth.set(`${((h - l) / span) * 100}%`)
	}

	// ----- pointer ----------------------------------------------------------
	const endGesture = () => {
		const written = lastWriteRef.current
		gestureRef.current = null
		trackRectRef.current = null
		previewKeyRef.current = null
		setActiveHandle(null)
		setDragging(false)
		setBrushBase([])
		// The atom holds the normalized selection ("" = all), so compare normalized keys.
		if (written === null || written === committedKey) {
			setDraft(null)
		} else {
			settleKeyRef.current = written
			window.setTimeout(() => {
				if (settleKeyRef.current !== written) return
				settleKeyRef.current = null
				setDraft(null)
			}, 600)
		}
		if (reduce) ghostOpacity.set(0)
		else animate(ghostOpacity, 0, { duration: 0.18 })
	}

	const onTrackPointerDown = (e: PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0 || vintages.length === 0) return
		e.currentTarget.setPointerCapture(e.pointerId)
		trackRectRef.current = trackRef.current?.getBoundingClientRect() ?? null
		lastWriteRef.current = committedKey
		settleKeyRef.current = null
		gestureRef.current = {
			kind: "pending",
			pointerId: e.pointerId,
			startX: e.clientX,
			startYear: yearAtClientX(e.clientX),
			base: e.shiftKey && hasSelection ? committed : [],
		}
	}

	const onHandlePointerDown = (which: Handle) => (e: PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return
		e.stopPropagation()
		e.currentTarget.setPointerCapture(e.pointerId)
		trackRectRef.current = trackRef.current?.getBoundingClientRect() ?? null
		loPosition.stop()
		hiPosition.stop()
		lastWriteRef.current = committedKey
		settleKeyRef.current = null
		gestureRef.current = {
			kind: "handle",
			pointerId: e.pointerId,
			which,
			fixed: which === "lo" ? hi : lo,
			grabOffset:
				yearAtClientX(e.clientX, false) -
				(minY - 0.5 + ((which === "lo" ? loPosition.get() : hiPosition.get()) / 100) * span),
		}
		setActiveHandle(which)
		setDragging(true)
		setHoverYear(null)
	}

	const movePointer = (e: { clientX: number; pointerId: number; pointerType: string }) => {
		const g = gestureRef.current
		const y = yearAtClientX(e.clientX)

		if (!g) {
			if (e.pointerType === "mouse") {
				const v = nearestVintage(y)
				const near = Math.abs(v - y) <= Math.max(1.2, span / 40)
				setHoverYear(near ? v : null)
			}
			return
		}
		if (g.pointerId !== e.pointerId) return

		if (g.kind === "pending") {
			if (Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD_PX) return
			gestureRef.current = {
				kind: "brush",
				pointerId: g.pointerId,
				startYear: g.startYear,
				base: g.base,
			}
			setBrushBase(g.base)
			setHoverYear(null)
			setDragging(true)
			ghostOpacity.set(1)
		}

		const cur = gestureRef.current!
		if (cur.kind === "brush") {
			setGhost(cur.startYear, y)
			loPosition.set(pct(Math.min(cur.startYear, y) - BAND_PAD))
			hiPosition.set(pct(Math.max(cur.startYear, y) + BAND_PAD))
			const brushed = vintagesBetween(Math.round(cur.startYear), Math.round(y))
			preview(
				cur.base.length ? [...new Set([...cur.base, ...brushed])].sort((a, b) => a - b) : brushed
			)
		} else if (cur.kind === "handle") {
			const v = nearestVintage(y - cur.grabOffset + (cur.which === "lo" ? BAND_PAD : -BAND_PAD))
			const next =
				cur.which === "lo"
					? vintagesBetween(Math.min(v, cur.fixed), cur.fixed)
					: vintagesBetween(cur.fixed, Math.max(v, cur.fixed))
			preview(next)
		}
	}

	// Hardware can send several moves per display frame. Only the latest sample matters;
	// release flushes it synchronously so a quick drag never loses its final vintage.
	const flushPointer = () => {
		if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current)
		pointerFrameRef.current = null
		const pending = pendingPointerRef.current
		pendingPointerRef.current = null
		if (pending) movePointer(pending)
	}
	const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
		const g = gestureRef.current
		if (g?.pointerId === e.pointerId && g.kind === "handle") {
			const raw =
				yearAtClientX(e.clientX, false) - g.grabOffset + (g.which === "lo" ? BAND_PAD : -BAND_PAD)
			const min = g.which === "lo" ? minY : g.fixed
			const max = g.which === "lo" ? g.fixed : maxY
			const bound = Math.min(max, Math.max(min, raw))
			const distance = raw - bound
			// Resistance approaches a small overhang, including when the handles meet.
			const limit = (g.which === "lo" ? raw > max : raw < min) ? BAND_PAD * 0.75 : span * 0.05
			const elastic = bound + (distance * 0.3) / (1 + (Math.abs(distance) * 0.3) / limit)
			;(g.which === "lo" ? loPosition : hiPosition).set(
				pct(elastic + (g.which === "lo" ? -BAND_PAD : BAND_PAD))
			)
		}
		pendingPointerRef.current = {
			clientX: e.clientX,
			pointerId: e.pointerId,
			pointerType: e.pointerType,
		}
		if (pointerFrameRef.current === null) {
			pointerFrameRef.current = requestAnimationFrame(flushPointer)
		}
	}
	useEffect(() => {
		const invalidateTrack = () => {
			trackRectRef.current = null
		}
		window.addEventListener("resize", invalidateTrack)
		window.addEventListener("scroll", invalidateTrack, true)
		return () => {
			if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current)
			window.removeEventListener("resize", invalidateTrack)
			window.removeEventListener("scroll", invalidateTrack, true)
		}
	}, [])

	const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
		if (!gestureRef.current || gestureRef.current.pointerId !== e.pointerId) return
		flushPointer()
		const g = gestureRef.current!
		// a press that never moved is a click on the nearest tick; resolved in onClick (needs e.detail)
		clickYearRef.current = g.kind === "pending" ? nearestVintage(g.startYear) : null
		endGesture()
	}

	const onTrackClick = (e: MouseEvent<HTMLDivElement>) => {
		const year = clickYearRef.current
		clickYearRef.current = null
		if (year === null) return
		if (e.detail >= 2) {
			clear() // double-click
			return
		}
		if (e.shiftKey && committed.length && !committed.includes(year)) {
			// fill the gap to the nearest selected vintage, keeping every other range
			const anchor = committed.reduce((a, b) => (Math.abs(b - year) < Math.abs(a - year) ? b : a))
			commit([...committed, ...vintagesBetween(anchor, year)])
			return
		}
		const base = committed.length ? committed : []
		commit(base.includes(year) ? base.filter((y) => y !== year) : [...base, year])
	}

	// ----- keyboard (handles) -----------------------------------------------
	const onHandleKeyDown = (which: Handle) => (e: KeyboardEvent<HTMLDivElement>) => {
		const stepBy = (delta: number) => {
			const current = which === "lo" ? lo : hi
			const idx = Math.max(0, vintages.indexOf(current))
			const v = vintages[Math.min(vintages.length - 1, Math.max(0, idx + delta))]
			commit(
				which === "lo" ? vintagesBetween(Math.min(v, hi), hi) : vintagesBetween(lo, Math.max(v, lo))
			)
		}
		switch (e.key) {
			case "ArrowLeft":
			case "ArrowDown":
				stepBy(-1)
				break
			case "ArrowRight":
			case "ArrowUp":
				stepBy(1)
				break
			case "PageDown":
				stepBy(-5)
				break
			case "PageUp":
				stepBy(5)
				break
			case "Home":
				stepBy(-vintages.length)
				break
			case "End":
				stepBy(vintages.length)
				break
			case "Escape":
			case "Backspace":
			case "Delete":
				if (!hasSelection) return
				clear()
				break
			default:
				return
		}
		e.preventDefault()
	}

	// ----- readout ----------------------------------------------------------
	const sumFiltered = (ys: number[]) => ys.reduce((n, y) => n + (filteredCounts.get(y) ?? 0), 0)
	let label: string
	let count: number
	if (hoverYear !== null) {
		label = String(hoverYear)
		count = filteredCounts.get(hoverYear) ?? 0
	} else if (!hasSelection) {
		label = "all vintages"
		count = filteredSessions.length
	} else if (runs.length === 1) {
		label = lo === hi ? String(lo) : `${lo}–${hi}`
		count = sumFiltered(selected)
	} else {
		label = `${selected.length} vintages`
		count = sumFiltered(selected)
	}

	if (vintages.length < 2) return null

	const decades: number[] = []
	for (let d = Math.ceil(minY / 10) * 10; d <= maxY; d += 10) decades.push(d)
	const graduations: number[] = []
	for (let y = minY; y <= maxY; y++) graduations.push(y)

	const t = (spring: Transition): Transition => (reduce ? { duration: 0 } : spring)

	return (
		<div className="mb-3 select-none" data-year-ruler>
			{/* header: label + live readout */}
			<div className="flex items-baseline justify-between h-4 mb-1 text-[10px] leading-4">
				<span className="tracking-[0.14em] uppercase text-white/35">Vintage</span>
				<motion.span
					id={readoutId}
					className="relative flex items-baseline gap-1.5 tabular-nums"
					aria-live="polite"
					initial={reduce ? false : { opacity: 0, filter: "blur(2px)" }}
					animate={{ opacity: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
					transition={{ duration: reduce ? 0 : 0.16 }}
				>
					<TextMorph
						text={label}
						className={hasSelection || hoverYear !== null ? "text-white/85" : "text-white/45"}
					/>
					<span className="text-white/30">·</span>
					<span className="text-white/45">{count}</span>
				</motion.span>
			</div>

			{/* track */}
			<div
				ref={trackRef}
				role="group"
				aria-label="Filter by vintage"
				aria-describedby={readoutId}
				className="relative isolate h-7 cursor-crosshair touch-pan-y group/ruler"
				onPointerDown={onTrackPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={(e) => {
					if (gestureRef.current?.pointerId !== e.pointerId) return
					flushPointer()
					endGesture()
				}}
				onLostPointerCapture={(e) => {
					if (gestureRef.current?.pointerId !== e.pointerId) return
					flushPointer()
					endGesture()
				}}
				onPointerLeave={() => {
					if (!gestureRef.current) {
						pendingPointerRef.current = null
						setHoverYear(null)
					}
				}}
				onClick={onTrackClick}
			>
				{/* baseline */}
				<div className="absolute inset-x-0 bottom-0 h-px bg-white/10" />

				{/* brush ghost: raw pointer extent while brushing */}
				<motion.div
					aria-hidden="true"
					className="absolute inset-y-0 rounded-[3px] pointer-events-none"
					style={{
						left: ghostLeft,
						width: ghostWidth,
						opacity: ghostOpacity,
						backgroundImage: `repeating-linear-gradient(135deg, ${liquorA(
							0.12
						)} 0 2px, transparent 2px 5px)`,
					}}
				/>

				{/* selected runs */}
				<AnimatePresence initial={false}>
					{(hasSelection || dragging) &&
						// mid-drag: the existing ranges a shift-brush adds to, then the live band
						(dragging ? [...baseRuns, null] : runs).map((run, i) => {
							const live = run === null || (!dragging && runs.length === 1)
							const [a, b] = run ?? [lo, hi]
							const left = `${pct(a - BAND_PAD)}%`
							const width = `${pct(b + BAND_PAD) - pct(a - BAND_PAD)}%`
							return (
								<motion.div
									key={`run-${i}`}
									aria-hidden="true"
									className="absolute inset-y-0 rounded-[3px] pointer-events-none"
									layout={!reduce && runs.length > 1 && !dragging}
									style={{
										left: live ? loTranslate : left,
										width: live ? bandWidth : width,
										borderRadius: 3,
										background: `linear-gradient(to top, ${liquorA(0.22)}, ${liquorA(0.06)})`,
										boxShadow: `inset 0 0 0 1px ${liquorA(0.32)}`,
									}}
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0, transition: { duration: 0.15 } }}
									transition={t(SPRING)}
								/>
							)
						})}
				</AnimatePresence>

				{/* hover cursor */}
				{hoverYear !== null && (
					<div
						aria-hidden="true"
						className="absolute inset-y-0 w-px -translate-x-1/2 pointer-events-none bg-white/20"
						style={{ left: `${pct(hoverYear)}%` }}
					/>
				)}

				{/* Only ticks whose fill, highlight or bead changed need to update. */}
				{vintages.map((v) => {
					const total = counts.get(v) ?? 0
					return (
						<VintageTick
							key={v}
							position={pct(v)}
							height={TICK_MIN_H + Math.sqrt(total / maxCount) * (TICK_MAX_H - TICK_MIN_H)}
							fill={total ? (filteredCounts.get(v) ?? 0) / total : 0}
							tone={
								hoverYear === v
									? "hover"
									: hasSelection
									? selectedSet.has(v)
										? "selected"
										: "dim"
									: "all"
							}
							preview={previewYears?.has(v) ?? false}
							delay={(v - minY) * 0.006}
							reduce={!!reduce}
						/>
					)
				})}

				{/* handles (always present so the range is keyboard reachable) */}
				{(["lo", "hi"] as const).map((which) => {
					const value = which === "lo" ? lo : hi
					const active = activeHandle === which
					return (
						<motion.div
							key={which}
							className="absolute -top-0.5 -bottom-0.5 left-0 z-10 w-full pointer-events-none"
							initial={false}
							style={{ x: which === "lo" ? loTranslate : hiTranslate }}
						>
							<div
								role="slider"
								tabIndex={0}
								aria-label={which === "lo" ? "Earliest vintage" : "Latest vintage"}
								aria-valuemin={vintages[0]}
								aria-valuemax={vintages[vintages.length - 1]}
								aria-valuenow={value}
								aria-valuetext={hasSelection ? String(value) : `${value} (all vintages)`}
								aria-orientation="horizontal"
								className="absolute inset-y-0 left-0 flex justify-center w-3 -translate-x-1/2 outline-none cursor-ew-resize touch-none pointer-events-auto group/handle"
								onPointerDown={onHandlePointerDown(which)}
								onKeyDown={onHandleKeyDown(which)}
							>
								<motion.span
									className={cn(
										"block h-full w-[3px] rounded-full",
										"ring-offset-1 ring-offset-[#151315] group-focus-visible/handle:ring-2 group-focus-visible/handle:ring-white/50",
										!hasSelection &&
											!active &&
											"opacity-30 group-hover/ruler:opacity-60 group-focus-visible/handle:opacity-100"
									)}
									style={{
										background: LIQUOR,
										boxShadow: `0 0 0 1px rgba(0,0,0,0.5), 0 0 8px ${liquorA(active ? 0.7 : 0.35)}`,
									}}
									initial={false}
									animate={{ scaleY: active ? 1.15 : 1, scaleX: active ? 1.35 : 1 }}
									whileHover={reduce ? undefined : { scaleX: 1.35 }}
									transition={t(HANDLE_SPRING)}
								/>
							</div>
						</motion.div>
					)
				})}
			</div>

			{/* graduations + decade labels */}
			<div className="relative h-4" aria-hidden="true">
				{graduations.map((y) => (
					<div
						key={y}
						className={cn(
							"absolute top-0 w-px -translate-x-1/2",
							y % 10 === 0
								? "h-1.5 bg-white/35"
								: y % 5 === 0
								? "h-1 bg-white/20"
								: "h-0.5 bg-white/10"
						)}
						style={{ left: `${pct(y)}%` }}
					/>
				))}
				{decades.map((d) => (
					<span
						key={d}
						className="absolute top-1.5 -translate-x-1/2 text-[9px] leading-3 tabular-nums text-white/35"
						style={{ left: `${pct(d)}%` }}
					>
						{d}
					</span>
				))}
			</div>
		</div>
	)
}

/** Density is independent of the selected range: don't restart every tick's Motion tree on a drag. */
const VintageTick = memo(function VintageTick({
	position,
	height,
	fill,
	tone,
	preview,
	delay,
	reduce,
}: {
	position: number
	height: number
	fill: number
	tone: "hover" | "selected" | "dim" | "all"
	preview: boolean
	delay: number
	reduce: boolean
}) {
	return (
		<div
			aria-hidden="true"
			className="absolute bottom-0 w-[3px] -translate-x-1/2 pointer-events-none"
			style={{ left: position + "%", height }}
		>
			<div className="absolute inset-0 rounded-t-[1px] bg-white/[0.08]" />
			<motion.div
				className={cn(
					"absolute inset-0 origin-bottom rounded-t-[1px] transition-colors duration-200",
					tone === "hover"
						? "bg-white"
						: tone === "selected"
						? "bg-[var(--liquor-text,#edc446)]"
						: tone === "dim"
						? "bg-white/25"
						: "bg-white/60"
				)}
				initial={false}
				animate={{ scaleY: fill }}
				transition={reduce ? { duration: 0 } : SPRING}
			/>
			<AnimatePresence>
				{preview && (
					<motion.span
						key="bead"
						className="absolute left-1/2 size-[5px] -ml-[2.5px] rounded-full"
						style={{ bottom: height + 3, background: LIQUOR, boxShadow: "0 0 6px " + liquorA(0.7) }}
						initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.4 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.1 } }}
						transition={
							reduce ? { duration: 0.1 } : { type: "spring", stiffness: 640, damping: 26, delay }
						}
					/>
				)}
			</AnimatePresence>
		</div>
	)
})

// the Explorer re-renders on every tab switch; nothing here depends on the view
export default memo(YearRuler)
