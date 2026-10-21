/**
 * EntityPeek state (plan §3.1). One card for the whole app: every trigger (EntityRef chips,
 * breadcrumb crumbs, descriptor tokens, the vessel chip) asks for it, so moving between
 * adjacent triggers morphs the open card instead of closing one and opening another.
 *
 * Written only through the peek controller (lib/components/entity/peek/controller.ts), which
 * owns the hover-intent timers; read by the host that renders the card.
 */
import { atom } from "jotai"
import type { PeekTarget } from "@/lib/peek"

/** How the peek was asked for: pointer hover, keyboard focus, touch long-press, or a pin. */
export type PeekVia = "hover" | "focus" | "press" | "pin"

export type PeekState = {
	target: PeekTarget
	/** the trigger the card hangs off */
	anchor: HTMLElement
	/** a pinned card ignores hover and leave; only Esc, an outside click or the close button end it */
	pinned: boolean
	via: PeekVia
	/** bumps whenever the card moves to a new target or anchor: the card morphs on each bump */
	token: number
	/** targets walked from inside the card (crumbs, chips), for Back */
	history: PeekTarget[]
	/** move keyboard focus into the card once it shows (pinned from the keyboard) */
	focusCard: boolean
}

export const peekAtom = atom<PeekState | null>(null)
