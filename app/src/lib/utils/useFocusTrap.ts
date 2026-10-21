"use client"

import { useEffect, type RefObject } from "react"

/** Keep keyboard traversal inside an open modal, respecting each child's own key handling. */
export function useFocusTrap(rootRef: RefObject<HTMLElement | null>, active = true) {
	useEffect(() => {
		if (!active) return
		const onKey = (event: KeyboardEvent) => {
			const root = rootRef.current
			const focused = document.activeElement
			if (event.key !== "Tab" || event.defaultPrevented || !root?.contains(focused)) return
			const targets = [
				...root.querySelectorAll<HTMLElement>(
					"a[href], button, input, select, textarea, [tabindex]"
				),
			].filter(
				(el) =>
					el.tabIndex >= 0 &&
					!el.matches(":disabled") &&
					!el.closest("[inert]") &&
					el.getClientRects().length > 0 &&
					getComputedStyle(el).visibility !== "hidden"
			)
			const first = targets[0] ?? root
			const last = targets.at(-1) ?? root
			if (focused === root || focused === (event.shiftKey ? first : last)) {
				event.preventDefault()
				;(event.shiftKey ? last : first).focus({ preventScroll: true })
			}
		}
		document.addEventListener("keydown", onKey)
		return () => document.removeEventListener("keydown", onKey)
	}, [rootRef, active])
}
