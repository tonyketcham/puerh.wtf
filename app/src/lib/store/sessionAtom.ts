/**
 * Shared client state (jotai). This file is the cross-lane contract: components read/write
 * these atoms instead of reaching into each other. Keep it free of component code.
 *
 * Per-page atoms (phase, steeps, hovered stage, compare, unpinned descriptor) are reset
 * automatically when `sessionAtom` is set to a session with a different slug.
 */
import { atom } from "jotai"
import { motionValue, type MotionValue } from "motion/react"
import type {
	ExplorerSession,
	NoteStage,
	SessionFlavorAxes,
	SessionFull,
	SessionNotes,
} from "@/lib/types/session"
import { getLiquorColor, type LiquorColor } from "@/lib/liquor"

// ---------------------------------------------------------------------------
// Current session
// ---------------------------------------------------------------------------

const sessionBaseAtom = atom<SessionFull | null>(null)

/** The session currently open on a session page (set by SetSessionState). */
export const sessionAtom = atom(
	(get) => get(sessionBaseAtom),
	(get, set, next: SessionFull | null) => {
		const prev = get(sessionBaseAtom)
		set(sessionBaseAtom, next)
		if (prev?._slug !== next?._slug) set(resetSessionUiAtom)
	}
)

export const sessionSlugAtom = atom((get) => get(sessionBaseAtom)?._slug ?? null)

/** Liquor color of the current session (amber fallback when unknown). */
export const currentLiquorAtom = atom<LiquorColor>((get) =>
	getLiquorColor(get(sessionBaseAtom)?._slug)
)

export const flavorAxesAtom = atom(
	(get) => get(sessionAtom)?.flavor_axes ?? null,
	(get, set, update: SessionFlavorAxes) => {
		const session = get(sessionBaseAtom)
		if (session) {
			set(sessionBaseAtom, { ...session, flavor_axes: update })
		}
	}
)

export const notesAtom = atom(
	(get) => get(sessionAtom)?.notes ?? null,
	(get, set, update: SessionNotes) => {
		const session = get(sessionBaseAtom)
		if (session) {
			set(sessionBaseAtom, { ...session, notes: update })
		}
	}
)

// ---------------------------------------------------------------------------
// Flavor phase: the radar's start → finish blend
// ---------------------------------------------------------------------------

export type FlavorPhaseSource = "scroll" | "scrub" | "steep" | "auto"

/**
 * THE live, per-frame flavor phase (0 = start, 1 = finish). Single source of truth.
 *
 * - Continuous writers (scroll-linked gutter, a scrubber being dragged) call
 *   `flavorPhaseMotion.set(v)` or `animate(flavorPhaseMotion, v, spring)` — never React state.
 * - Continuous readers (the radar) subscribe with useTransform / useMotionValueEvent /
 *   useSpring(flavorPhaseMotion).
 * Module singleton so it survives route changes; reset to 0 on session change.
 */
export const flavorPhaseMotion: MotionValue<number> = motionValue(0)

const PHASE_STEP = 0.02
const quantizePhase = (v: number) => Math.round(Math.min(1, Math.max(0, v)) / PHASE_STEP) * PHASE_STEP

const flavorPhaseMirrorAtom = atom(0)
flavorPhaseMirrorAtom.onMount = (setMirror) => {
	setMirror(quantizePhase(flavorPhaseMotion.get()))
	return flavorPhaseMotion.on("change", (v) => setMirror(quantizePhase(v)))
}

/**
 * React-level view of the phase: a 0.02-quantized mirror of `flavorPhaseMotion`, for
 * discrete UI (labels, aria-valuenow, status bar). Writing it jumps the motion value
 * (no animation); for animated jumps use `animate(flavorPhaseMotion, target, {type:"spring"})`.
 */
export const flavorPhaseAtom = atom(
	(get) => get(flavorPhaseMirrorAtom),
	(_get, set, value: number) => {
		const v = Math.min(1, Math.max(0, value))
		flavorPhaseMotion.set(v)
		set(flavorPhaseMirrorAtom, quantizePhase(v))
	}
)

/**
 * Who is driving the phase right now. Arbitration rule: the scroll-linked writer only writes
 * while source is "scroll" or "auto"; a scrubber sets "scrub" on pointerdown and hands back
 * ("scroll") on release/next user scroll; clicking a steep sets "steep" until the next scroll.
 */
export const flavorPhaseSourceAtom = atom<FlavorPhaseSource>("auto")

// ---------------------------------------------------------------------------
// Steeps
// ---------------------------------------------------------------------------

export type DetectedSteep = {
	/** steep number; 0 = rinse */
	n: number
	/** planned seconds from the brewing schedule (0 when unknown / rinse) */
	seconds: number
	/** true when the article prose mentions this steep (a gutter anchor exists) */
	hasAnchor: boolean
}

/** Steeps for the current session page (written by SteepGutter, read by status bar, radar, …). */
export const steepsAtom = atom<DetectedSteep[]>([])

/** Steep currently in view / selected (null = none). */
export const activeSteepAtom = atom<number | null>(null)

// ---------------------------------------------------------------------------
// Notes ↔ cube
// ---------------------------------------------------------------------------

/** Note stage hovered/focused in NotesPanel (or the photo cube face) — cross-highlighting. */
export const hoveredNoteStageAtom = atom<NoteStage | null>(null)

// ---------------------------------------------------------------------------
// Descriptor "find references"
// ---------------------------------------------------------------------------

export type DescriptorSelection = {
	/** normalized descriptor term, e.g. "dark chocolate" */
	term: string
	/** pinned descriptors persist across session navigation; unpinned ones are hover/preview */
	pinned: boolean
}

export const descriptorAtom = atom<DescriptorSelection | null>(null)

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

/** Slug of a session overlaid for comparison (drag-to-compare, command "compare with"). */
export const compareSlugAtom = atom<string | null>(null)

// ---------------------------------------------------------------------------
// Explorer index (all sessions)
// ---------------------------------------------------------------------------

/** Every session (hydrated once from the root layout by HydrateExplorerSessions). */
export const explorerSessionsAtom = atom<ExplorerSession[]>([])

export const explorerSessionsBySlugAtom = atom(
	(get) => new Map(get(explorerSessionsAtom).map((s) => [s._slug, s] as const))
)

/** The ExplorerSession for compareSlugAtom (null if unset/unknown). */
export const compareSessionAtom = atom(
	(get) => {
		const slug = get(compareSlugAtom)
		return slug ? get(explorerSessionsBySlugAtom).get(slug) ?? null : null
	}
)

// ---------------------------------------------------------------------------
// Layout / scroll
// ---------------------------------------------------------------------------

export type ScrollRunway = {
	/** whether the session page scrolls enough to drive the phase by scroll */
	scrollable: boolean
	/** scrollable distance in px available to the scroll-linked phase */
	runwayPx: number
}

/** Written by SteepGutter after measuring; read by SessionTitle and others. */
export const scrollRunwayAtom = atom<ScrollRunway>({ scrollable: false, runwayPx: 0 })

// ---------------------------------------------------------------------------
// Command bar
// ---------------------------------------------------------------------------

export type CommandBarScope = "all" | "sessions" | "compare" | "descriptors"

export type CommandBarState = {
	open: boolean
	/** query to prefill when opening */
	query: string
	scope: CommandBarScope
}

/** Owned by CommandBar; anyone may open it (e.g. explorer search icon, status bar). */
export const commandBarAtom = atom<CommandBarState>({ open: false, query: "", scope: "all" })

/** Write-only: open the command bar, optionally prefilled / scoped. */
export const openCommandBarAtom = atom(
	null,
	(_get, set, opts?: { query?: string; scope?: CommandBarScope }) => {
		set(commandBarAtom, { open: true, query: opts?.query ?? "", scope: opts?.scope ?? "all" })
	}
)

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/** Write-only: reset per-page UI state (called automatically on session change). */
export const resetSessionUiAtom = atom(null, (get, set) => {
	flavorPhaseMotion.jump(0)
	set(flavorPhaseMirrorAtom, 0)
	set(flavorPhaseSourceAtom, "auto")
	set(steepsAtom, [])
	set(activeSteepAtom, null)
	set(hoveredNoteStageAtom, null)
	set(compareSlugAtom, null)
	set(scrollRunwayAtom, { scrollable: false, runwayPx: 0 })
	const descriptor = get(descriptorAtom)
	if (descriptor && !descriptor.pinned) set(descriptorAtom, null)
})
