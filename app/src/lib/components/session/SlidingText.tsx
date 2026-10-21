"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"

const SLIDE = { type: "spring", stiffness: 480, damping: 36, mass: 0.6 } as const

/**
 * Odometer-style text for monospaced numbers: each character cell slides its old glyph out and
 * the new one in (up when the value grows, down when it shrinks). Cells are keyed from the right
 * so units stay units as the width changes. Reduced motion: a quick crossfade.
 *
 * Pass `value` for direction; `text` is what renders (defaults to String(value)).
 */
export default function SlidingText({
	value,
	text,
	className,
}: {
	value: number
	text?: string
	className?: string
}) {
	const reduce = useReducedMotion() ?? false
	// slide direction derived from the previous value: React's "adjust state when a prop changes"
	// pattern (a render-time state update), so no ref is read during render
	const [prev, setPrev] = useState(value)
	const [dir, setDir] = useState<1 | -1>(1)
	if (prev !== value) {
		setPrev(value)
		setDir(value > prev ? 1 : -1)
	}
	const chars = (text ?? String(value)).split("")

	return (
		<span className={cn("inline-flex tabular-nums", className)} aria-label={text ?? String(value)}>
			{chars.map((char, i) => (
				<span
					key={chars.length - i}
					aria-hidden
					className="relative inline-flex justify-center overflow-hidden"
					style={{ width: "1ch", height: "1lh" }}
				>
					<AnimatePresence initial={false} mode="popLayout" custom={dir}>
						<motion.span
							key={char}
							custom={dir}
							variants={{
								enter: (d: number) => (reduce ? { opacity: 0 } : { y: `${d * 100}%`, opacity: 0 }),
								center: { y: "0%", opacity: 1 },
								exit: (d: number) => (reduce ? { opacity: 0 } : { y: `${d * -100}%`, opacity: 0 }),
							}}
							initial="enter"
							animate="center"
							exit="exit"
							transition={reduce ? { duration: 0.12 } : SLIDE}
							className="inline-block"
						>
							{char === " " ? " " : char}
						</motion.span>
					</AnimatePresence>
				</span>
			))}
		</span>
	)
}
