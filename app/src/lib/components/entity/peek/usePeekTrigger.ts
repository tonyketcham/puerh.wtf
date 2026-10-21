"use client"

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type FocusEvent,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
} from "react"
import { useAtomValue } from "jotai"
import { selectAtom } from "jotai/utils"
import { peekAtom } from "@/lib/store/peekAtom"
import { peekId, type PeekTarget } from "@/lib/peek"
import { usePeekController } from "./controller"

/** id of the card element, for aria-controls on the open trigger */
export const PEEK_CARD_ID = "entity-peek"
/** id of the card's one-line summary ("Origin · 10 sessions"), for aria-describedby */
export const PEEK_SUMMARY_ID = "entity-peek-summary"

/** Touch: hold this long to peek instead of following the link. */
const LONG_PRESS_MS = 450
/** A finger that drifts this far is scrolling, not pressing. */
const PRESS_SLOP = 8
/** After a long-press lifts, the click it may still raise lands within this window. */
const PRESS_CLICK_MS = 400

export type PeekTriggerStatus = "open" | "pinned" | null

export type PeekTriggerHandlers<T extends HTMLElement> = {
	ref: (el: T | null) => void
	"data-peek": string | undefined
	"data-peek-state": PeekTriggerStatus | undefined
	"aria-describedby": string | undefined
	"aria-expanded": boolean | undefined
	"aria-controls": string | undefined
	onPointerEnter: (e: PointerEvent<T>) => void
	onPointerLeave: (e: PointerEvent<T>) => void
	onPointerDown: (e: PointerEvent<T>) => void
	onPointerMove: (e: PointerEvent<T>) => void
	onPointerUp: (e: PointerEvent<T>) => void
	onPointerCancel: (e: PointerEvent<T>) => void
	onContextMenu: (e: MouseEvent<T>) => void
	onFocus: (e: FocusEvent<T>) => void
	onBlur: (e: FocusEvent<T>) => void
	onClick: (e: MouseEvent<T>) => void
	onKeyDown: (e: KeyboardEvent<T>) => void
}

const isKeyboardFocus = (el: Element) => {
	try {
		return el.matches(":focus-visible")
	} catch {
		return true
	}
}

/**
 * Makes an element a peek trigger (plan §3.1):
 *
 * - hover with a 250 ms intent delay (a sweep across chips doesn't flash cards), keyboard
 *   focus, or a long-press on touch opens the card
 * - plain click does whatever the element does (links go to the page)
 * - ⌥-click or `p` while focused pins the card (`p` also moves focus into it)
 * - ⇧↵ applies the target's Explorer filter; Esc closes
 *
 * Spread the returned handlers onto the element; compose with your own where both exist.
 * Pass null to opt out (handlers become inert).
 */
export function usePeekTrigger<T extends HTMLElement = HTMLElement>(
	target: PeekTarget | null
): { handlers: PeekTriggerHandlers<T>; status: PeekTriggerStatus } {
	const peek = usePeekController()
	// state, not a ref: which element this is decides what the status selector compares against
	const [element, setElement] = useState<T | null>(null)
	const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null)
	/**
	 * Swallow the click a long-press may still raise: armed (Infinity) while the press holds,
	 * then a short window after it lifts. Android raises contextmenu and no click at all, so it
	 * must expire on its own rather than wait for a click that never comes.
	 */
	const suppressClickUntil = useRef(0)
	const suppressingClick = () => performance.now() < suppressClickUntil.current
	const id = target ? peekId(target) : undefined

	// keep the latest target without re-creating every handler when a parent re-renders
	const targetRef = useRef(target)
	useEffect(() => {
		targetRef.current = target
	})

	const statusAtom = useMemo(
		() =>
			selectAtom(
				peekAtom,
				(state): PeekTriggerStatus =>
					state && element && state.anchor === element ? (state.pinned ? "pinned" : "open") : null
			),
		[element]
	)
	const status = useAtomValue(statusAtom)

	// the card hangs off this element: if it unmounts, hand the card to its replacement
	useEffect(() => {
		if (!element || !id) return
		return () => peek.reanchor(element, id)
	}, [peek, element, id])

	const cancelPress = useCallback(() => {
		if (press.current) window.clearTimeout(press.current.timer)
		press.current = null
	}, [])
	useEffect(() => cancelPress, [cancelPress])

	/** The finger lifted (or the browser took the gesture): a fired press may still raise a click. */
	const releasePress = () => {
		if (press.current?.fired)
			suppressClickUntil.current = performance.now() + PRESS_CLICK_MS
		cancelPress()
	}

	const handlers: PeekTriggerHandlers<T> = {
		ref: setElement,
		"data-peek": id,
		"data-peek-state": status ?? undefined,
		// describe by the one-line summary, not the whole dialog; the card itself is aria-controls
		"aria-describedby": status ? PEEK_SUMMARY_ID : undefined,
		"aria-expanded": id ? !!status : undefined,
		"aria-controls": status ? PEEK_CARD_ID : undefined,

		onPointerEnter(e) {
			const t = targetRef.current
			if (!t || e.pointerType !== "mouse") return
			peek.intend(t, e.currentTarget, "hover")
		},
		onPointerLeave(e) {
			if (!targetRef.current || e.pointerType !== "mouse") return
			peek.leave(e.currentTarget, { x: e.clientX, y: e.clientY })
		},

		onPointerDown(e) {
			// a fresh press: whatever the last long-press armed is stale now
			suppressClickUntil.current = 0
			const t = targetRef.current
			if (!t || e.pointerType === "mouse") return
			cancelPress()
			const el = e.currentTarget
			press.current = {
				x: e.clientX,
				y: e.clientY,
				fired: false,
				timer: window.setTimeout(() => {
					if (!press.current) return
					press.current.fired = true
					suppressClickUntil.current = Infinity
					peek.show(t, el, "press", { pinned: true })
					navigator.vibrate?.(8)
				}, LONG_PRESS_MS),
			}
		},
		onPointerMove(e) {
			const p = press.current
			if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRESS_SLOP) cancelPress()
		},
		onPointerUp() {
			releasePress()
		},
		onPointerCancel() {
			releasePress()
		},
		onContextMenu(e) {
			// a long-press opened the card: don't also raise the OS link menu
			if (press.current?.fired || suppressingClick()) e.preventDefault()
		},

		onFocus(e) {
			const t = targetRef.current
			if (!t || !isKeyboardFocus(e.currentTarget)) return
			peek.intend(t, e.currentTarget, "focus")
		},
		onBlur(e) {
			if (!targetRef.current) return
			const next = e.relatedTarget as Node | null
			if (next && document.getElementById(PEEK_CARD_ID)?.contains(next)) return
			peek.leave(e.currentTarget)
		},

		onClick(e) {
			const t = targetRef.current
			if (!t) return
			if (suppressingClick()) {
				suppressClickUntil.current = 0
				e.preventDefault()
				return
			}
			if (e.altKey) {
				// ⌥-click: pin instead of following (and keep Chrome from downloading the link)
				e.preventDefault()
				e.stopPropagation()
				peek.togglePin(t, e.currentTarget)
			}
		},

		onKeyDown(e) {
			const t = targetRef.current
			if (!t) return
			const plain = !e.altKey && !e.ctrlKey && !e.metaKey
			if (plain && !e.shiftKey && (e.key === "p" || e.key === "P") && !e.repeat) {
				e.preventDefault()
				peek.togglePin(t, e.currentTarget, true)
			} else if (plain && e.shiftKey && e.key === "Enter") {
				// ⇧↵ filters (and keeps the browser from opening the link in a new window)
				if (peek.filter(t)) e.preventDefault()
			} else if (e.key === "Escape" && status) {
				e.preventDefault()
				e.stopPropagation()
				peek.close()
			}
		},
	}

	return { handlers, status }
}

/** Merge two handlers of the same event (ours first). */
export function chain<E>(
	a: ((e: E) => void) | undefined,
	b: ((e: E) => void) | undefined
): ((e: E) => void) | undefined {
	if (!a) return b
	if (!b) return a
	return (e: E) => {
		a(e)
		b(e)
	}
}
