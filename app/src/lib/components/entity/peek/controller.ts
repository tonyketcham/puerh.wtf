"use client"

import { useMemo } from "react"
import { useStore } from "jotai"
import { peekAtom, type PeekState, type PeekVia } from "@/lib/store/peekAtom"
import { relationIndexAtom } from "@/lib/store/sessionAtom"
import { getEntity } from "@/lib/relations"
import { isPageKind, peekFilter, samePeek, type PeekTarget } from "@/lib/peek"
import { replaceFilters } from "@/lib/filters"

/** Hover intent before a closed card opens (plan §3.1). */
export const INTENT_MS = 250
/** While a card is open, moving to an adjacent trigger morphs it after this much dwell. */
export const SWITCH_MS = 90
/** Grace for the pointer to cross the gap between trigger and card. */
export const LEAVE_MS = 180

type Store = ReturnType<typeof useStore>

// one card for the app, so one set of timers (module scope: shared by every trigger)
const timers = { open: 0, close: 0 }
let tokens = 0

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

	const show = (
		target: PeekTarget,
		anchor: HTMLElement,
		via: PeekVia,
		{ pinned = false, focusCard = false }: { pinned?: boolean; focusCard?: boolean } = {}
	) => {
		clearOpen()
		clearClose()
		const current = get()
		if (current && isShowing(target, anchor)) {
			if ((pinned && !current.pinned) || focusCard)
				set({ ...current, pinned: current.pinned || pinned, via, focusCard })
			return
		}
		set({ target, anchor, pinned, via, token: ++tokens, history: [], focusCard })
	}

	const close = () => {
		clearOpen()
		clearClose()
		if (get()) set(null)
	}

	return {
		show,
		close,

		/** Pointer or focus arrived on a trigger: open after the intent delay (or morph sooner). */
		intend(target: PeekTarget, anchor: HTMLElement, via: PeekVia) {
			clearClose()
			if (isShowing(target, anchor)) {
				clearOpen()
				return
			}
			const current = get()
			// a pinned card stays put until dismissed; hovering other refs doesn't steal it
			if (current?.pinned) return
			clearOpen()
			timers.open = window.setTimeout(
				() => show(target, anchor, via),
				current ? SWITCH_MS : INTENT_MS
			)
		},

		/** Pointer or focus left a trigger or the card: close after a grace unless it comes back. */
		leave(anchor?: HTMLElement) {
			clearOpen()
			const current = get()
			if (!current || current.pinned) return
			if (anchor && current.anchor !== anchor) return
			clearClose()
			timers.close = window.setTimeout(() => {
				if (get() && !get()!.pinned) set(null)
			}, LEAVE_MS)
		},

		/** Pointer is on the card: keep it. */
		hold() {
			clearClose()
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
			const title = isPageKind(target.kind)
				? getEntity(index, target.kind, target.key)?.title ?? target.key
				: target.key
			const action = peekFilter(target, title)
			if (!action) return false
			replaceFilters(action.toggle)
			return true
		},
	}
}

export function usePeekController(): PeekController {
	const store = useStore()
	return useMemo(() => createPeekController(store), [store])
}
