/**
 * Lane-B-local reading state shared by SteepGutter, SessionTitle and StatusBar.
 * (Cross-lane state lives in @/lib/store/sessionAtom; this file only adds what the session
 * reading chrome needs to coordinate among itself.)
 */
import { atom } from "jotai"
import type { LiquorColor } from "@/lib/liquor"

/**
 * How reading progress is expressed on the current page, decided by SteepGutter after measuring:
 * - "steps":  scrollable page with steep anchors in the prose → discrete steep progression
 * - "smooth": scrollable page without anchors → smooth scroll progress
 * - "static": page barely/not scrollable → no scroll linking; the gutter is the control
 * Keyed by slug so a stale value from the previous session is never trusted.
 */
export type ReadingMode = "steps" | "smooth" | "static"

export const readingModeAtom = atom<{ slug: string; mode: ReadingMode } | null>(null)

export type SteepRequest =
	| { kind: "step"; delta: 1 | -1; nonce: number }
	| { kind: "goto"; n: number; nonce: number }

/** Last steep navigation request (status bar, keyboard); SteepGutter fulfils it. */
export const steepRequestAtom = atom<SteepRequest | null>(null)

/** Write-only: ask SteepGutter to step to the next/previous steep or go to steep n. */
export const requestSteepAtom = atom(
	null,
	(get, set, req: { kind: "step"; delta: 1 | -1 } | { kind: "goto"; n: number }) => {
		const nonce = (get(steepRequestAtom)?.nonce ?? 0) + 1
		set(steepRequestAtom, { ...req, nonce } as SteepRequest)
	}
)

/**
 * A liquor color that reads on the #121012 ground: measured liquors darker than L 0.62 are
 * lifted in OKLCH (hue/chroma kept), so pale/olive teas don't vanish as text fills.
 */
export function liquorAccent(color: LiquorColor, minL = 0.62): string {
	if (!color.oklch) return color.hex
	const [l, c, h] = color.oklch
	if (l >= minL) return color.hex
	return `oklch(${minL} ${Math.min(c, 0.16).toFixed(4)} ${h.toFixed(2)})`
}

/** Spring presets for the reading chrome (physical, lightly damped). */
export const SPRING_SNAPPY = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 } as const
export const SPRING_SOFT = { type: "spring", stiffness: 170, damping: 26, mass: 1 } as const
