"use client"

import { memo, startTransition, useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useAtomValue } from "jotai"
import { hoveredNoteStageAtom } from "@/lib/store/sessionAtom"
import { NOTE_STAGE_META } from "@/lib/noteStages"
import TextMorph from "@/lib/components/session/TextMorph"
import MorphStageIcon, { prewarmStageMorphs } from "@/lib/components/icons/MorphStageIcon"
import type { NoteStage } from "@/lib/types/session"

const CAPTION_SPRING = { type: "spring", stiffness: 420, damping: 34 } as const
const INSTANT = { duration: 0 } as const
/** stage icon (size-3) and the flex gaps (gap-1.5) the caption is laid out with, in px */
const ICON_PX = 12
const GAP_PX = 6

// ---------------------------------------------------------------------------
// Caption store: the cube reports its face here, and only the caption subscribes, so a face
// change re-renders this small component and nothing else (not the cube, not its parent)
// ---------------------------------------------------------------------------

export type CubeCaptionState = {
	index: number
	/** +1 when the cube turned forward, -1 backward: the digit rolls the same way */
	direction: 1 | -1
}

export type CubeCaptionStore = {
	get: () => CubeCaptionState
	set: (next: CubeCaptionState) => void
	subscribe: (listener: () => void) => () => void
}

export function createCubeCaptionStore(): CubeCaptionStore {
	let state: CubeCaptionState = { index: 0, direction: 1 }
	const listeners = new Set<() => void>()
	return {
		get: () => state,
		set: (next) => {
			if (next.index === state.index && next.direction === state.direction) return
			state = next
			listeners.forEach((listener) => listener())
		},
		subscribe: (listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}

// ---------------------------------------------------------------------------

/** `px + ch`, always in the same calc() shape so motion can interpolate between any two */
const offset = (px: number, ch: number) => `calc(${+px.toFixed(3)}px + ${+ch.toFixed(3)}ch)`

interface CubeCaptionProps {
	store: CubeCaptionStore
	/** the stage each photo belongs to (null: no note stage) */
	stages: readonly (NoteStage | null)[]
	/** fallback label for photos with no stage */
	alts: readonly (string | undefined)[]
	accent: string
}

/**
 * "[icon] Stage label  n/N" under the photo cube. Only the part that changed animates: the icon
 * flubbers when the stage changes, the label morphs letter by letter, the digit rolls when the
 * index does; "/N" never moves except to stay centered.
 *
 * Every part is absolutely placed from the label's length (the caption is monospace), so
 * re-centering is a transform animation, never a layout animation: nothing here measures layout
 * or reflows the page while it scrolls.
 */
function CubeCaption({ store, stages, alts, accent }: CubeCaptionProps) {
	const reduce = useReducedMotion() ?? false

	// Face changes arrive mid-scroll: render them as a transition, off the scroll frame
	const [{ index, direction }, setState] = useState(store.get)
	useEffect(() => {
		const sync = () => startTransition(() => setState(store.get()))
		sync()
		return store.subscribe(sync)
	}, [store])

	// Pre-resample the icon morphs this cube will need while the browser is idle
	useEffect(
		() => prewarmStageMorphs(stages.filter((stage): stage is NoteStage => stage != null)),
		[stages]
	)

	const hoveredStage = useAtomValue(hoveredNoteStageAtom)
	const count = stages.length
	const stage = stages[index] ?? null
	const linked = stage != null && hoveredStage === stage
	const color = linked ? accent : "rgb(255 255 255 / 0.6)"
	const caption = stage ? NOTE_STAGE_META[stage].title : alts[index] || `Photo ${index + 1}`

	// [icon gap] label gap digits"/"N — centered on the box
	const digits = String(count).length
	const iconPx = stage ? ICON_PX + GAP_PX : 0
	const labelCh = [...caption].length
	const half = { px: (iconPx + GAP_PX) / 2, ch: (labelCh + 2 * digits + 1) / 2 }
	/** the icon + label group; the icon rides along with it, the label sits after the icon */
	const groupX = offset(-half.px, -half.ch)
	const digitsX = offset(iconPx + GAP_PX - half.px, labelCh - half.ch)

	const move = reduce ? INSTANT : CAPTION_SPRING
	const part = "absolute inset-y-0 left-0 flex items-center whitespace-nowrap"

	// reduced motion: plain crossfades (same animated values either way, so SSR markup matches)
	const lift = reduce ? 0 : 1
	const fade = reduce ? { duration: 0.12 } : CAPTION_SPRING
	const iconSwap = {
		initial: { opacity: 0, y: 2 * lift },
		animate: { opacity: 1, y: 0 },
		exit: { opacity: 0, y: -2 * lift },
		transition: fade,
	}
	const digitSwap = {
		variants: {
			enter: (dir: number) => ({ opacity: 0, y: dir * 3 * lift }),
			center: { opacity: 1, y: 0 },
			leave: (dir: number) => ({ opacity: 0, y: dir * -3 * lift }),
		},
		initial: "enter",
		animate: "center",
		exit: "leave",
		transition: fade,
	}

	return (
		<div
			className="relative h-7 overflow-hidden w-36 font-fira-code text-[11px] [contain:layout_paint]"
			aria-hidden
		>
			{/* the parts hang off the box's center line */}
			<div className="absolute inset-y-0 left-1/2">
				<motion.span className={part} initial={false} animate={{ x: groupX }} transition={move}>
					<AnimatePresence initial={false}>
						{stage && (
							// one icon that flubbers between stages; presence only for photos with no stage
							<motion.span key="stage-icon" className={part} {...iconSwap}>
								<MorphStageIcon stage={stage} className="size-3" style={{ color }} />
							</motion.span>
						)}
					</AnimatePresence>

					<motion.span className={part} initial={false} animate={{ x: iconPx }} transition={move}>
						<TextMorph
							text={caption}
							className="transition-colors duration-300"
							style={{ color }}
						/>
					</motion.span>
				</motion.span>

				<motion.span
					className={`${part} tabular-nums text-white/30`}
					initial={false}
					animate={{ x: digitsX }}
					transition={move}
				>
					<span className="relative inline-block overflow-hidden">
						{/* sizes the slot; the rolling digits sit on top of it */}
						<span className="invisible">{"0".repeat(digits)}</span>
						<AnimatePresence initial={false} custom={direction}>
							<motion.span
								key={index}
								custom={direction}
								className="absolute inset-0 flex justify-end"
								{...digitSwap}
							>
								{index + 1}
							</motion.span>
						</AnimatePresence>
					</span>
					<span>/{count}</span>
				</motion.span>
			</div>
		</div>
	)
}

export default memo(CubeCaption)
