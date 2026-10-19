"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useAtomValue } from "jotai"
import {
	animate,
	motion,
	useAnimationFrame,
	useMotionTemplate,
	useMotionValue,
	useReducedMotion,
	useScroll,
	useSpring,
	useTransform,
	type Transition,
} from "motion/react"
import { activeSteepAtom, steepsAtom } from "@/lib/store/sessionAtom"
import { getLiquorColor } from "@/lib/liquor"
import { liquorAccent, readingModeAtom } from "./readingState"

export interface SessionTitleProps {
	title: string
	slug: string
	productionYear?: number | null
}

/** Wave tile (px): one sine period, ~4px amplitude at the 96px title. Black = visible in a mask. */
const WAVE_W = 64
const WAVE_H = 10
const waveTile = (fillBelow: boolean) => {
	const mid = WAVE_H / 2
	const amp = mid - 1
	const q = WAVE_W / 4
	// two half-periods drawn as cubic béziers (crest, then trough); tiles seamlessly
	const wave = `M0 ${mid} C ${q * 0.6} ${mid - amp} ${q * 1.4} ${mid - amp} ${q * 2} ${mid} S ${
		q * 3.4
	} ${mid + amp} ${WAVE_W} ${mid}`
	return `url("data:image/svg+xml,${encodeURIComponent(
		`<svg xmlns='http://www.w3.org/2000/svg' width='${WAVE_W}' height='${WAVE_H}' viewBox='0 0 ${WAVE_W} ${WAVE_H}' preserveAspectRatio='none'><path d='${wave} ${
			fillBelow ? `V${WAVE_H} H0` : "V0 H0"
		} Z' fill='black'/></svg>`
	)}")`
}
const WAVE_BELOW = waveTile(true)
const WAVE_ABOVE = waveTile(false)
const SOLID = "linear-gradient(#000, #000)"
/**
 * Masks clip at the border box, but Rock 3D's glyphs and the hard text-shadow paint past the
 * line box. Pad the masked spans so their box covers the ink; negative margins (or the negative
 * inset on the absolute copy) keep the layout unchanged.
 */
const BLEED = "0.25em"
/** The pour on non-scrollable pages. */
const POUR = { type: "spring", duration: 1.2, bounce: 0.12 } as const
const LEVEL_SPRING = { type: "spring", stiffness: 120, damping: 22, mass: 1 } as const

/**
 * The huge Rock 3D session title, filled from the bottom up with the tea's liquor as the
 * session is read:
 * - steep anchors in the prose → discrete: each steep crossed pours one more measure in
 * - no anchors → smooth scroll progress (useScroll + useSpring)
 * - page not scrollable → one pour to full on load
 *
 * Two stacked copies of the same text with complementary masks: the white original above the
 * surface, a liquor copy below, the surface a slowly drifting wave. Both keep the hard
 * text-shadow, so the empty state is exactly the original white title.
 */
export default function SessionTitle({ title, slug }: SessionTitleProps) {
	const reduce = useReducedMotion() ?? false
	const mode = useAtomValue(readingModeAtom)
	const steeps = useAtomValue(steepsAtom)
	const active = useAtomValue(activeSteepAtom)
	const fill = useMemo(() => liquorAccent(getLiquorColor(slug)), [slug])

	const ref = useRef<HTMLSpanElement>(null)
	const [measured, setMeasured] = useState(false)
	const height = useMotionValue(0)
	const level = useMotionValue(0)
	const waveX = useMotionValue(0)

	const { scrollYProgress } = useScroll()
	const smoothProgress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.6 })

	const pageMode = mode?.slug === slug ? mode.mode : null
	const anchored = useMemo(() => steeps.filter((s) => s.hasAnchor), [steeps])
	const pouredRef = useRef(false)

	// measure the heading box (wraps differently per width / once Rock 3D loads)
	useEffect(() => {
		const el = ref.current
		if (!el) return
		const update = () => {
			height.set(el.offsetHeight)
			setMeasured(el.offsetHeight > 0)
		}
		update()
		const ro = new ResizeObserver(update)
		ro.observe(el)
		return () => ro.disconnect()
	}, [height])

	// drive the level
	useEffect(() => {
		if (!pageMode) return
		const to = (target: number, transition: Transition = LEVEL_SPRING) => {
			if (reduce) {
				level.jump(target)
				return
			}
			const controls = animate(level, target, transition)
			return () => controls.stop()
		}

		if (pageMode === "static") {
			if (pouredRef.current || reduce) return to(1)
			let controls: ReturnType<typeof animate> | undefined
			const t = window.setTimeout(() => {
				pouredRef.current = true
				controls = animate(level, 1, POUR)
			}, 250)
			return () => {
				window.clearTimeout(t)
				// a re-run mid-pour keeps pouring (to(1) is a no-op once full)
				if (controls && level.get() >= 0.998) controls.stop()
			}
		}
		if (pageMode === "steps" && anchored.length) {
			const i = anchored.findIndex((s) => s.n === active)
			return to(i < 0 ? 0 : (i + 1) / anchored.length)
		}
		// smooth: follow the springed scroll progress (already continuous, so just mirror it)
		level.set(smoothProgress.get())
		return smoothProgress.on("change", (v) => level.set(v))
	}, [active, anchored, level, pageMode, reduce, smoothProgress])

	// the surface drifts only while it is inside the glyphs
	useAnimationFrame((t) => {
		if (reduce) return
		const l = level.get()
		if (l > 0.002 && l < 0.998) waveX.set((t * 0.018) % WAVE_W)
	})

	/** surface y in px from the top of the heading; parked outside the box when empty/full */
	const surface = useTransform(() => {
		const h = height.get()
		const l = level.get()
		if (l <= 0.002) return h + WAVE_H + 2
		if (l >= 0.998) return -WAVE_H - 2
		return (1 - l) * h
	})
	const waveTop = useTransform(surface, (s) => s - WAVE_H / 2)
	const solidBelowTop = useTransform(surface, (s) => s + WAVE_H / 2 - 0.5)
	const solidAboveTop = useTransform(
		[surface, height],
		([s, h]: number[]) => s - WAVE_H / 2 - h - 40 + 0.5
	)

	// liquor copy: wave (filled below) + solid block from the surface down
	const belowPosition = useMotionTemplate`${waveX}px ${waveTop}px, 0px ${solidBelowTop}px`
	// white original: wave (filled above) + solid block from the top to the surface
	const abovePosition = useMotionTemplate`${waveX}px ${waveTop}px, 0px ${solidAboveTop}px`
	const solidH = useTransform(height, (h) => h + 40)
	const maskSize = useMotionTemplate`${WAVE_W}px ${WAVE_H}px, 100% ${solidH}px`

	const maskBase: CSSProperties = {
		maskRepeat: "repeat-x, no-repeat",
		WebkitMaskRepeat: "repeat-x, no-repeat",
	}

	// Both copies sit in the same grid cell, so they share one box and wrap identically at every
	// width (an absolute copy can't: the in-flow copy's negative margin collapses through the h1,
	// which pushed the two copies 0.25em out of register). Grid items' margins never collapse.
	const stacked: CSSProperties = { gridArea: "1 / 1", padding: BLEED, margin: `-${BLEED}` }

	return (
		<h1 className="grid font-rock-3d text-8xl text-shadow-2xl" data-session-title>
			<motion.span
				ref={ref}
				className="block"
				style={
					measured
						? {
								...stacked,
								...maskBase,
								maskImage: `${WAVE_ABOVE}, ${SOLID}`,
								WebkitMaskImage: `${WAVE_ABOVE}, ${SOLID}`,
								maskSize,
								WebkitMaskSize: maskSize,
								maskPosition: abovePosition,
								WebkitMaskPosition: abovePosition,
						  }
						: stacked
				}
			>
				{title}
			</motion.span>
			{measured && (
				<motion.span
					aria-hidden
					className="block pointer-events-none select-none"
					style={{
						...stacked,
						...maskBase,
						color: fill,
						maskImage: `${WAVE_BELOW}, ${SOLID}`,
						WebkitMaskImage: `${WAVE_BELOW}, ${SOLID}`,
						maskSize,
						WebkitMaskSize: maskSize,
						maskPosition: belowPosition,
						WebkitMaskPosition: belowPosition,
					}}
				>
					{title}
				</motion.span>
			)}
		</h1>
	)
}
