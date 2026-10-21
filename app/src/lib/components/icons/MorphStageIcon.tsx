"use client"

import { useEffect, useState } from "react"
import {
	animate,
	motion,
	useMotionValue,
	useReducedMotion,
	useTransform,
	type MotionValue,
} from "motion/react"
import { fromCircle, interpolate, toCircle, type Interpolator } from "flubber"
import { STAGE_ICON_PARTS, type IconPart } from "./TeaIcons"
import type { NoteStage } from "@/lib/types/session"
import { cn } from "@/lib/utils/cn"

const MORPH_SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.8 } as const
/** the icon grid is 16 units: sample finely or flubber's default (10) flattens every curve */
const FLUBBER = { maxSegmentLength: 0.5 }
const CENTER = 8

type Style = Omit<IconPart, "d">
type Ring = { d: string; style: Style }
type Slot = { interp: Interpolator; style: Style; exiting: boolean }
/** `run` counts morphs; 0 = the first, settled render */
type MorphState = { stage: NoteStage; slots: Slot[]; run: number }

/** flubber morphs single rings, so multi-subpath parts ("M…h…M…v…") split into one ring each */
function ringsOf(stage: NoteStage): Ring[] {
	return STAGE_ICON_PARTS[stage].flatMap(({ d, ...style }) =>
		d
			.split(/(?=M)/)
			.map((sub) => sub.trim())
			.filter(Boolean)
			.map((sub) => ({ d: sub, style }))
	)
}

function settledSlots(stage: NoteStage): Slot[] {
	return ringsOf(stage).map(({ d, style }) => ({ interp: () => d, style, exiting: false }))
}

/**
 * Pairs the shapes on screen (mid-morph if interrupted) with the next stage's rings in drawing
 * order. Extra rings grow out of / shrink into the icon's center.
 */
function morphSlots(prev: MorphState, t: number, stage: NoteStage): Slot[] {
	// settled on a stage: the morph only depends on the two stages, so reuse it (resampling the
	// paths is the expensive part, and it lands right as the caption changes mid-scroll)
	if (t >= 0.999) return stageMorph(prev.stage, stage)
	const from = prev.slots.filter((s) => !s.exiting).map((s) => ({ d: s.interp(t), style: s.style }))
	return buildSlots(from, stage)
}

/** Settled-stage morphs, keyed "from>to"; interpolators are pure, so instances share them */
const morphCache = new Map<string, Slot[]>()

function stageMorph(from: NoteStage, to: NoteStage): Slot[] {
	const key = `${from}>${to}`
	let slots = morphCache.get(key)
	if (!slots) {
		slots = buildSlots(ringsOf(from), to)
		morphCache.set(key, slots)
	}
	return slots
}

type IdleDeadlineLike = { timeRemaining: () => number }
const onIdle = (cb: (deadline: IdleDeadlineLike) => void) =>
	typeof window.requestIdleCallback === "function"
		? window.requestIdleCallback(cb, { timeout: 2000 })
		: window.setTimeout(() => cb({ timeRemaining: () => 8 }), 200)

/**
 * Precomputes the morphs between these stages in idle time, so the first turn to each stage
 * costs nothing when it happens. Returns a cancel function.
 */
export function prewarmStageMorphs(stages: readonly NoteStage[]): () => void {
	const unique = [...new Set(stages)]
	const pending: [NoteStage, NoteStage][] = []
	for (const a of unique) for (const b of unique) if (a !== b) pending.push([a, b])
	if (!pending.length) return () => {}
	let cancelled = false
	const work = (deadline: IdleDeadlineLike) => {
		while (!cancelled && pending.length && deadline.timeRemaining() > 2) {
			const [a, b] = pending.shift()!
			stageMorph(a, b)
		}
		if (!cancelled && pending.length) onIdle(work)
	}
	onIdle(work)
	return () => {
		cancelled = true
	}
}

function buildSlots(from: Ring[], stage: NoteStage): Slot[] {
	const to = ringsOf(stage)
	const count = Math.max(from.length, to.length)
	const slots: Slot[] = []
	for (let k = 0; k < count; k++) {
		const a = from[k]
		const b = to[k]
		if (a && b)
			slots.push({ interp: interpolate(a.d, b.d, FLUBBER), style: b.style, exiting: false })
		else if (b)
			slots.push({
				interp: fromCircle(CENTER, CENTER, 0.05, b.d, FLUBBER),
				style: b.style,
				exiting: false,
			})
		else if (a)
			slots.push({ interp: toCircle(a.d, CENTER, CENTER, 0.05), style: a.style, exiting: true })
	}
	return slots
}

/**
 * NoteStageIcon that flubbers from one stage's drawing into the next, part by part, instead of
 * swapping. Reduced motion: the same drawing, swapped instantly (same markup either way, so
 * server and client render alike).
 */
export default function MorphStageIcon({
	stage,
	className,
	style,
}: {
	stage: NoteStage
	className?: string
	style?: React.CSSProperties
}) {
	const reduce = useReducedMotion() ?? false
	const progress = useMotionValue(1)
	// "adjust state when a prop changes": the new morph starts from whatever is on screen now
	const [morph, setMorph] = useState<MorphState>(() => ({
		stage,
		slots: settledSlots(stage),
		run: 0,
	}))
	let current = morph
	if (morph.stage !== stage) {
		current = { stage, slots: morphSlots(morph, progress.get(), stage), run: morph.run + 1 }
		setMorph(current)
	}

	useEffect(() => {
		if (reduce || morph.run === 0) return
		progress.set(0)
		const controls = animate(progress, 1, MORPH_SPRING)
		return () => controls.stop()
	}, [morph.run, progress, reduce])

	return (
		<svg
			aria-hidden
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.25}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={cn("size-4 shrink-0 overflow-visible", className)}
			style={style}
		>
			{current.slots.map((slot, k) => (
				<MorphPath key={k} slot={slot} progress={progress} reduce={reduce} />
			))}
		</svg>
	)
}

function MorphPath({
	slot,
	progress,
	reduce,
}: {
	slot: Slot
	progress: MotionValue<number>
	reduce: boolean
}) {
	const d = useTransform(progress, slot.interp)
	const filled = slot.style.fillOpacity != null
	return (
		<motion.path
			d={d}
			fill="currentColor"
			strokeDasharray={slot.style.dash}
			initial={false}
			// stroke and fill both stay painted so a stroke can become a fill (and back) smoothly
			animate={{
				strokeWidth: slot.style.strokeWidth ?? 1.25,
				strokeOpacity: filled ? 0 : slot.exiting ? 0 : slot.style.strokeOpacity ?? 1,
				fillOpacity: filled && !slot.exiting ? slot.style.fillOpacity! : 0,
			}}
			transition={reduce ? { duration: 0 } : MORPH_SPRING}
		/>
	)
}
