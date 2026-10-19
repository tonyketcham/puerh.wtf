"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { usePathname } from "next/navigation"
import { useAtomValue, useStore } from "jotai"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
	FloatingPortal,
	autoUpdate,
	computePosition,
	flip,
	hide,
	offset,
	shift,
	size,
	type Placement,
} from "@floating-ui/react"
import { peekAtom, type PeekState } from "@/lib/store/peekAtom"
import { commandBarAtom, relationIndexAtom } from "@/lib/store/sessionAtom"
import { EMPTY_ENTITY_DETAILS, type EntityDetails } from "@/lib/entityDetails"
import { PEEK_META, peekId } from "@/lib/peek"
import { usePeekController } from "./controller"
import { buildPeekModel } from "./model"
import PeekCard from "./PeekCard"
import { PEEK_CARD_ID, PEEK_SUMMARY_ID } from "./usePeekTrigger"

const CARD_W = 320
/** before the first content lands, assume a typical card so flip() picks the right side */
const ESTIMATED_H = 340
/** UI chrome spring (plan §3) */
const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const

type Shown = {
	state: PeekState
	x: number
	y: number
	placement: Placement
	/** px from the card's left edge to the anchor, so it grows out of its trigger */
	originX: number
	/** the trigger scrolled out of view (a pinned card waits, hidden) */
	hidden: boolean
	/** the peek closed: the card exits where it stood, and the next one waits for its position */
	closed?: boolean
}

/**
 * The one EntityPeek card (plan §3.1), mounted once in the root layout.
 *
 * Floating UI places it against whichever trigger peekAtom names (below, flipping above near
 * the viewport edge). Content and position switch in the same render, and the card carries a
 * shared layoutId keyed to the peek's token, so moving to an adjacent trigger morphs this one
 * card (position and size) instead of closing and reopening; scroll-follow updates keep the
 * token and just move. Entering, it springs out of its anchor (scale 0.96 → 1, 4 px).
 */
export default function EntityPeekHost({
	details = EMPTY_ENTITY_DETAILS,
}: {
	details?: EntityDetails
}) {
	const state = useAtomValue(peekAtom)
	const index = useAtomValue(relationIndexAtom)
	const store = useStore()
	const peek = usePeekController()
	const reduce = useReducedMotion() ?? false
	const pathname = usePathname()
	const floatingRef = useRef<HTMLDivElement>(null)
	const cardRef = useRef<HTMLDivElement>(null)
	const [shown, setShown] = useState<Shown | null>(null)
	const [engaged, setEngaged] = useState(false)
	// while a new target is being placed, the card keeps showing the previous one (then morphs)
	const open = !!state && !!shown && !shown.closed

	// --- position: content and coordinates land together ------------------------------
	useLayoutEffect(() => {
		const floating = floatingRef.current
		if (!state) {
			setShown((prev) => (prev && !prev.closed ? { ...prev, closed: true } : prev))
			return
		}
		if (!floating) return
		let live = true
		const update = () => {
			const anchor = state.anchor
			if (!anchor.isConnected) return // the trigger's reanchor() takes it from here
			computePosition(anchor, floating, {
				strategy: "fixed",
				placement: "bottom-start",
				middleware: [
					offset(8),
					flip({ padding: 12, fallbackPlacements: ["top-start", "bottom-end", "top-end"] }),
					shift({ padding: 12 }),
					size({
						padding: 12,
						apply({ availableHeight, elements }) {
							elements.floating.style.setProperty(
								"--peek-max-h",
								`${Math.max(180, Math.floor(availableHeight))}px`
							)
						},
					}),
					hide({ strategy: "referenceHidden" }),
				],
			}).then(({ x, y, placement, middlewareData }) => {
				if (!live) return
				const rect = anchor.getBoundingClientRect()
				const originX = Math.min(
					CARD_W - 12,
					Math.max(12, rect.left + Math.min(rect.width / 2, 28) - x)
				)
				const hidden = !!middlewareData.hide?.referenceHidden
				setShown((prev) =>
					prev &&
					prev.state === state &&
					prev.x === x &&
					prev.y === y &&
					prev.placement === placement &&
					prev.hidden === hidden
						? prev
						: {
								state,
								x,
								y,
								placement,
								originX: prev?.state === state ? prev.originX : originX,
								hidden,
						  }
				)
			})
		}
		const stop = autoUpdate(state.anchor, floating, update, { animationFrame: false })
		return () => {
			live = false
			stop()
		}
	}, [state])

	// a hover card whose trigger scrolled away closes; a pinned one waits hidden
	useEffect(() => {
		if (shown?.hidden && state && !state.pinned && shown.state === state) peek.close()
	}, [shown, state, peek])

	// --- dismissal ---------------------------------------------------------------------
	// route change (Open, a session row, any navigation)
	const lastPath = useRef(pathname)
	useEffect(() => {
		if (lastPath.current === pathname) return
		lastPath.current = pathname
		peek.close()
	}, [pathname, peek])

	useEffect(() => {
		if (!state) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || store.get(commandBarAtom).open) return
			const card = cardRef.current
			const active = document.activeElement
			const inCard = !!card?.contains(active)
			const engagedHere =
				state.pinned ||
				inCard ||
				state.anchor.contains(active) ||
				!!card?.matches(":hover") ||
				state.anchor.matches(":hover")
			// claim it only when this card is what Esc is aimed at, so the descriptor pill (and
			// others that honor defaultPrevented) stay put; a lingering hover card just closes
			if (engagedHere) e.preventDefault()
			// focus goes back to the trigger without its focus intent reopening the card
			peek.close(inCard ? { restoreFocusTo: state.anchor } : undefined)
		}
		const onPointerDown = (e: PointerEvent) => {
			const t = e.target as Node | null
			if (!t || cardRef.current?.contains(t) || state.anchor.contains(t)) return
			peek.close()
		}
		window.addEventListener("keydown", onKey, true)
		document.addEventListener("pointerdown", onPointerDown, true)
		return () => {
			window.removeEventListener("keydown", onKey, true)
			document.removeEventListener("pointerdown", onPointerDown, true)
		}
	}, [state, store, peek])

	// pinned from the keyboard (`p`): take focus to the first action
	useEffect(() => {
		if (!open || !state?.focusCard) return
		const id = requestAnimationFrame(() => {
			cardRef.current
				?.querySelector<HTMLElement>("a[href]:not([data-skip-focus]),button:not([disabled])")
				?.focus({ preventScroll: true })
			peek.focused()
		})
		return () => cancelAnimationFrame(id)
	}, [open, state, peek])

	useEffect(() => {
		if (!state) setEngaged(false)
	}, [state])

	const target = shown?.state.target
	const model = useMemo(() => (target ? buildPeekModel(index, target) : null), [index, target])

	const below = !shown || shown.placement.startsWith("bottom")
	const visible = open && !shown!.hidden
	const pinned = !!shown?.state.pinned

	return (
		<FloatingPortal>
			<div
				ref={floatingRef}
				data-entity-peek-layer
				style={
					{
						position: "fixed",
						top: shown?.y ?? 0,
						left: shown?.x ?? 0,
						width: CARD_W,
						minHeight: open ? undefined : ESTIMATED_H,
						zIndex: 60,
						pointerEvents: visible ? "auto" : "none",
						visibility: shown?.hidden ? "hidden" : undefined,
					} as CSSProperties
				}
			>
				{/* wait: an exiting card and a quick reopen never both hold the id and layoutId */}
				<AnimatePresence mode="wait">
					{open && model && (
						<motion.div
							key="peek"
							ref={cardRef}
							id={PEEK_CARD_ID}
							role="dialog"
							aria-modal={false}
							aria-label={`${model.title} · ${PEEK_META[model.target.kind].label}`}
							data-recording-key="entity-peek"
							data-peek-kind={model.target.kind}
							data-pinned={pinned || undefined}
							layoutId="entity-peek"
							layoutDependency={shown!.state.token}
							initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: below ? -4 : 4 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={
								reduce
									? { opacity: 0, transition: { duration: 0.12 } }
									: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } }
							}
							transition={{
								...SPRING,
								opacity: { duration: 0.14 },
								layout: reduce ? { duration: 0 } : SPRING,
							}}
							style={{
								borderRadius: 8,
								transformOrigin: `${shown!.originX}px ${below ? "0px" : "100%"}`,
							}}
							onPointerEnter={(e) => {
								if (e.pointerType !== "mouse") return
								peek.hold()
								setEngaged(true)
							}}
							onPointerLeave={(e) => {
								if (e.pointerType !== "mouse") return
								setEngaged(false)
								peek.leave()
							}}
							onFocus={() => peek.hold()}
							onBlur={(e) => {
								const next = e.relatedTarget as Node | null
								if (next && (e.currentTarget.contains(next) || shown!.state.anchor.contains(next)))
									return
								peek.leave()
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" && e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
									if (peek.filter(shown!.state.target)) e.preventDefault()
								}
							}}
							className="relative overflow-x-hidden overflow-y-auto max-h-[var(--peek-max-h,80vh)] overscroll-contain font-fira-code text-white bg-[#121012] ring-1 ring-inset ring-[#fff2ca]/10 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.95),0_2px_8px_-2px_rgba(0,0,0,0.6)]"
						>
							{/* the trigger's aria-describedby: one line, not the whole dialog */}
							<span id={PEEK_SUMMARY_ID} hidden>
								{`${PEEK_META[model.target.kind].label} · ${model.stats.count} ${
									model.stats.count === 1 ? "session" : "sessions"
								}`}
							</span>
							<AnimatePresence mode="popLayout" initial={false}>
								<motion.div
									key={peekId(model.target)}
									layout="position"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: reduce ? 0.12 : 0.16 }}
								>
									<PeekCard
										model={model}
										state={shown!.state}
										index={index}
										details={details}
										peek={peek}
										engaged={engaged}
									/>
								</motion.div>
							</AnimatePresence>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</FloatingPortal>
	)
}
