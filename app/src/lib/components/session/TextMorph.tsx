"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"

const GLIDE = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const
const INSTANT = { duration: 0 } as const
/** furthest a shared letter may glide, in characters; beyond it, fading reads calmer than a long slide */
const MAX_TRAVEL = 2

type Glyph = { char: string; key: string }
type MorphState = { text: string; glyphs: Glyph[]; nextId: number }

/**
 * Pairs the new text's letters with the old text's identical letters, closest first, so shared
 * letters keep their key (and glide to their new spot) while the rest fade in or out.
 *
 * Distance is measured from each word's center, since morphing labels are centered: in
 * "Dry Leaf" → "Wet Leaf", "Leaf" stays put and only "Dry" → "Wet" changes.
 */
function morphGlyphs(prev: MorphState, text: string): MorphState {
	const next = [...text]
	const prevCenter = (prev.glyphs.length - 1) / 2
	const nextCenter = (next.length - 1) / 2

	const pairs: { i: number; j: number; cost: number }[] = []
	prev.glyphs.forEach((g, i) => {
		next.forEach((char, j) => {
			if (char !== g.char || char === " ") return
			const cost = Math.abs(i - prevCenter - (j - nextCenter))
			if (cost <= MAX_TRAVEL) pairs.push({ i, j, cost })
		})
	})
	pairs.sort((a, b) => a.cost - b.cost || a.j - b.j)

	const keys: (string | undefined)[] = new Array(next.length)
	const usedPrev = new Set<number>()
	for (const { i, j } of pairs) {
		if (keys[j] !== undefined || usedPrev.has(i)) continue
		keys[j] = prev.glyphs[i].key
		usedPrev.add(i)
	}

	let nextId = prev.nextId
	const glyphs = next.map((char, j) => ({ char, key: keys[j] ?? `g${nextId++}` }))
	return { text, glyphs, nextId }
}

function initialState(text: string): MorphState {
	return { text, glyphs: [...text].map((char, i) => ({ char, key: `g${i}` })), nextId: text.length }
}

/**
 * A label that morphs into its next value letter by letter: letters both words share glide to
 * their new positions, the others fade out in place or fade in. Reduced motion: instant swap.
 *
 * Monospace only. Every letter sits at `x = index × 1ch`, so positions are known without
 * measuring anything: no layout animation, no layout reads, nothing but transform and opacity
 * animating. That matters because the label changes while the page is scrolling — a layout
 * animation here measured every letter and injected a stylesheet per exiting letter
 * (AnimatePresence popLayout) in the middle of a scroll frame.
 */
export default function TextMorph({
	text,
	className,
	style,
}: {
	text: string
	className?: string
	style?: React.CSSProperties
}) {
	const reduce = useReducedMotion() ?? false
	// "adjust state when a prop changes": keys are derived from the previous render's glyphs
	const [state, setState] = useState(() => initialState(text))
	let glyphs = state.glyphs
	if (state.text !== text) {
		const next = morphGlyphs(state, text)
		glyphs = next.glyphs
		setState(next)
	}

	// Reduced motion keeps the same markup (so server and client render alike) and just swaps
	// letters instantly
	return (
		<span
			className={cn("relative inline-block whitespace-pre", className)}
			style={style}
			aria-label={text}
		>
			{/* in-flow, invisible copy: gives the label its size (and the letters a line box) */}
			<span aria-hidden className="invisible">
				{text}
			</span>
			<AnimatePresence initial={false}>
				{glyphs.map((glyph, j) => (
					<motion.span
						key={glyph.key}
						aria-hidden
						className={cn(
							"absolute top-0 left-0",
							// the glide is a CSS transition on `translate` (separate from motion's
							// `transform`): motion doesn't animate bare `ch` offsets, so a shared letter
							// stayed at its old index
							!reduce && "transition-[translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
						)}
						style={{ translate: `${j}ch 0` }}
						// a micro-interaction: barely-there lift, mostly a crossfade; exiting letters
						// keep their last spot (they're absolutely placed, so nothing reflows)
						initial={{ opacity: 0, y: 1.5 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -1.5, transition: reduce ? INSTANT : { duration: 0.12 } }}
						transition={reduce ? INSTANT : GLIDE}
					>
						{glyph.char}
					</motion.span>
				))}
			</AnimatePresence>
		</span>
	)
}
