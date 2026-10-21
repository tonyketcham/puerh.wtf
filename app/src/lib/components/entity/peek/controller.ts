"use client"

import { useMemo } from "react"
import { useStore } from "jotai"
import { peekAtom, type PeekState, type PeekVia } from "@/lib/store/peekAtom"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import { getEntity } from "@/lib/relations"
import { isPageKind, peekFilter, samePeek, type PeekTarget } from "@/lib/peek"
import { filtersAtom } from "@/lib/store/filterState"
import { PEEK_CARD_ID } from "./usePeekTrigger"

/** Hover intent before a closed card opens (plan §3.1). */
export const INTENT_MS = 250
/** While a card is open, moving to an adjacent trigger morphs it after this much dwell. */
export const SWITCH_MS = 90
/** Grace for the pointer to cross the gap between trigger and card. */
export const LEAVE_MS = 180
/** Inside the safety triangle, a pointer that stops this long has given up on the card. */
export const REST_MS = 320

type Store = ReturnType<typeof useStore>
type Point = { x: number; y: number }

// one card for the app, so one set of timers (module scope: shared by every trigger)
const timers = { open: 0, close: 0 }
let tokens = 0
/**
 * The safety triangle (Amazon-menu style) armed when the pointer leaves a trigger with its card
 * open: from where it left to the card's near edge. A docked card can sit a panel's width away,
 * so while the pointer travels inside it the card stays, and triggers it crosses on the way
 * don't steal it (they wait in `pending`, and win only if the pointer settles or strays there).
 */
let corridor: { stop: () => void } | null = null
let pending: { anchor: HTMLElement; show: () => void } | null = null

const cross = (a: Point, b: Point, c: Point) => (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y)
const inTriangle = (p: Point, [a, b, c]: Point[]) => {
	const d1 = cross(p, a, b)
	const d2 = cross(p, b, c)
	const d3 = cross(p, c, a)
	return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

/**
 * From `p` to the card's near edge. The apex sits a few px behind where the pointer left, so the
 * first wobble off the trigger still counts, and the far corners overshoot the card slightly.
 */
function triangleTo(p: Point, r: DOMRect): Point[] {
	const pad = 8
	const cx = r.left + r.width / 2
	const cy = r.top + r.height / 2
	const len = Math.hypot(cx - p.x, cy - p.y) || 1
	const apex = { x: p.x - ((cx - p.x) / len) * 6, y: p.y - ((cy - p.y) / len) * 6 }
	if (p.x <= r.left) return [apex, { x: r.left, y: r.top - pad }, { x: r.left, y: r.bottom + pad }]
	if (p.x >= r.right) return [apex, { x: r.right, y: r.top - pad }, { x: r.right, y: r.bottom + pad }]
	if (p.y <= r.top) return [apex, { x: r.left - pad, y: r.top }, { x: r.right + pad, y: r.top }]
	return [apex, { x: r.left - pad, y: r.bottom }, { x: r.right + pad, y: r.bottom }]
}

function endCorridor() {
	corridor?.stop()
	corridor = null
	pending = null
}
/**
 * The trigger focus was just handed back to (Esc from inside the card). After a keydown,
 * Chromium treats that scripted focus as :focus-visible, so its onFocus would reopen the card
 * Esc just closed. Swallowed by that one focus intent, or cleared when the trigger blurs.
 */
let returningFocusTo: HTMLElement | null = null

export type PeekController = ReturnType<typeof createPeekController>

/**
 * The only writer of peekAtom. Triggers call intend / leave / togglePin; the card calls hold /
 * leave / retarget / back / close.
 */
export function createPeekController(store: Store) {
	const get = () => store.get(peekAtom)
	const set = (next: PeekState | null) => store.set(peekAtom, next)
	const clearOpen = () => {
		window.clearTimeout(timers.open)
		timers.open = 0
	}
	const clearClose = () => {
		window.clearTimeout(timers.close)
		timers.close = 0
	}
	const isShowing = (target: PeekTarget, anchor: HTMLElement) => {
		const current = get()
		return !!current && current.anchor === anchor && samePeek(current.target, target)
	}
	const closeUnpinned = () => {
		endCorridor()
		if (get() && !get()!.pinned) set(null)
	}

	/** Arm the safety triangle from `from` to the open card. False when there's no card to aim at. */
	const guard = (anchor: HTMLElement, from: Point): boolean => {
		const card = document.getElementById(PEEK_CARD_ID)
		const rect = card?.getBoundingClientRect()
		if (!card || !rect?.width) return false
		endCorridor()
		const triangle = triangleTo(from, rect)
		const settle = () => {
			const next = pending
			endCorridor()
			if (next) next.show()
			else closeUnpinned()
		}
		const onMove = (e: PointerEvent) => {
			if (e.pointerType !== "mouse") return
			const t = e.target as Node | null
			// back on the trigger or onto the card: their own enter handlers take over
			if (t && (card.contains(t) || anchor.contains(t))) return
			clearOpen()
			clearClose()
			if (inTriangle({ x: e.clientX, y: e.clientY }, triangle)) {
				timers.close = window.setTimeout(settle, REST_MS)
				return
			}
			// strayed out: the trigger it strayed onto takes over, or the plain leave grace runs
			const next = pending
			endCorridor()
			if (next) timers.open = window.setTimeout(next.show, SWITCH_MS)
			else timers.close = window.setTimeout(closeUnpinned, LEAVE_MS)
		}
		window.addEventListener("pointermove", onMove, true)
		corridor = { stop: () => window.removeEventListener("pointermove", onMove, true) }
		timers.close = window.setTimeout(settle, REST_MS)
		return true
	}

	const show = (
		target: PeekTarget,
		anchor: HTMLElement,
		via: PeekVia,
		{ pinned = false, focusCard = false }: { pinned?: boolean; focusCard?: boolean } = {}
	) => {
		clearOpen()
		clearClose()
		endCorridor()
		const current = get()
		if (current && isShowing(target, anchor)) {
			if ((pinned && !current.pinned) || focusCard)
				set({ ...current, pinned: current.pinned || pinned, via, focusCard })
			return
		}
		set({ target, anchor, pinned, via, token: ++tokens, history: [], focusCard })
	}

	const close = ({ restoreFocusTo }: { restoreFocusTo?: HTMLElement } = {}) => {
		clearOpen()
		clearClose()
		endCorridor()
		if (get()) set(null)
		if (!restoreFocusTo?.isConnected) return
		returningFocusTo = restoreFocusTo
		restoreFocusTo.focus({ preventScroll: true })
		// focus didn't land (not focusable, or no onFocus to swallow it): don't leave it armed
		if (document.activeElement !== restoreFocusTo) returningFocusTo = null
	}

	return {
		show,
		close,

		/** Pointer or focus arrived on a trigger: open after the intent delay (or morph sooner). */
		intend(target: PeekTarget, anchor: HTMLElement, via: PeekVia) {
			if (via === "focus" && returningFocusTo === anchor) {
				returningFocusTo = null
				return
			}
			if (isShowing(target, anchor)) {
				clearClose()
				clearOpen()
				endCorridor()
				return
			}
			const current = get()
			// a pinned card stays put until dismissed; hovering other refs doesn't steal it
			if (current?.pinned) return
			// crossed on the way to the card: wait to see whether the pointer settles here
			if (corridor && via === "hover") {
				pending = { anchor, show: () => show(target, anchor, via) }
				return
			}
			clearClose()
			clearOpen()
			timers.open = window.setTimeout(
				() => show(target, anchor, via),
				current ? SWITCH_MS : INTENT_MS
			)
		},

		/**
		 * Pointer or focus left a trigger or the card: close after a grace unless it comes back.
		 * A pointer leaving its card's trigger (`from`) gets the safety triangle instead.
		 */
		leave(anchor?: HTMLElement, from?: Point) {
			if (anchor && returningFocusTo === anchor) returningFocusTo = null
			if (anchor && pending?.anchor === anchor) {
				// a trigger crossed inside the triangle, passed through: the corridor runs on
				pending = null
				return
			}
			if (corridor) return
			clearOpen()
			const current = get()
			if (!current || current.pinned) return
			if (anchor && current.anchor !== anchor) {
				// the pointer passed over another trigger without settling: the card's own grace
				if (from) {
					clearClose()
					timers.close = window.setTimeout(closeUnpinned, LEAVE_MS)
				}
				return
			}
			clearClose()
			if (anchor && from && guard(anchor, from)) return
			timers.close = window.setTimeout(closeUnpinned, LEAVE_MS)
		},

		/** Pointer is on the card: keep it. */
		hold() {
			clearClose()
			endCorridor()
		},

		/** ⌥-click / `p`: pin this trigger's card (or unpin and close it when already pinned). */
		togglePin(target: PeekTarget, anchor: HTMLElement, focusCard = false) {
			const current = get()
			if (current?.pinned && isShowing(target, anchor) && !focusCard) close()
			else show(target, anchor, "pin", { pinned: true, focusCard })
		},

		pin() {
			const current = get()
			if (current && !current.pinned) set({ ...current, pinned: true })
		},

		/** Walk to another entity from inside the card (crumb, chip): same anchor, card pins. */
		retarget(target: PeekTarget) {
			const current = get()
			if (!current || samePeek(current.target, target)) return
			clearClose()
			set({
				...current,
				target,
				pinned: true,
				token: ++tokens,
				history: [...current.history, current.target].slice(-12),
				focusCard: false,
			})
		},

		back() {
			const current = get()
			const previous = current?.history[current.history.length - 1]
			if (!current || !previous) return
			set({
				...current,
				target: previous,
				token: ++tokens,
				history: current.history.slice(0, -1),
				focusCard: false,
			})
		},

		/** Focus moved into the card; don't ask again. */
		focused() {
			const current = get()
			if (current?.focusCard) set({ ...current, focusCard: false })
		},

		/**
		 * A trigger unmounted (session change remounts the Properties rows). If the card hangs off
		 * it, move to the trigger that replaced it, or close.
		 */
		reanchor(anchor: HTMLElement, id: string) {
			requestAnimationFrame(() => {
				const current = get()
				if (!current || current.anchor !== anchor) return
				if (anchor.isConnected && anchor.getAttribute("data-peek") === id) return
				const next = Array.from(document.querySelectorAll<HTMLElement>("[data-peek]")).find(
					(el) => el.getAttribute("data-peek") === id && el.isConnected
				)
				if (next) set({ ...current, anchor: next, token: ++tokens })
				else close()
			})
		},

		/** ⇧↵: toggle the Explorer filter the target stands for. False when it has none. */
		filter(target: PeekTarget): boolean {
			const index = store.get(relationIndexAtom)
			const id = isPageKind(target.kind) ? getEntity(index, target.kind, target.key)?.id : null
			const action = peekFilter(target, id)
			if (!action) return false
			store.set(filtersAtom, action.toggle)
			return true
		},
	}
}

export function usePeekController(): PeekController {
	const store = useStore()
	return useMemo(() => createPeekController(store), [store])
}
