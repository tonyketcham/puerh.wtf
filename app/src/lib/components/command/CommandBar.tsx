"use client"

import { useAtom, useAtomValue } from "jotai"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
	AnimatePresence,
	MotionConfig,
	motion,
	useIsPresent,
	useReducedMotion,
	type Transition,
} from "motion/react"
import { Search as SearchIcon } from "lucide-react"
import { commandBarAtom, explorerSessionsAtom, relationIndexAtom } from "@/lib/store/sessionAtom"
import { activeFilterCountAtom } from "@/lib/store/filterState"
import type { ExplorerSession } from "@/lib/types/session"
import type { Vendor } from "@/lib/types/vendor"
import type { Category } from "@/lib/types/category"
import type { EntityDetails } from "@/lib/entityDetails"
import { buildIndex } from "./items"
import Palette, { ICON_LAYOUT_ID, MORPH_SPRING, SURFACE_LAYOUT_ID } from "./Palette"
import { Kbd } from "./parts"
import { usePlatform } from "@/lib/utils/usePlatform"

export interface CommandBarProps {
	sessions: ExplorerSession[]
	vendors: Vendor[]
	categories: Category[]
	/** places, hanzi and descriptions for entity rows (the same data the peeks read) */
	details?: EntityDetails
}

function isEditable(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false
	if (target.isContentEditable) return true
	const tag = target.tagName
	if (tag === "TEXTAREA" || tag === "SELECT") return true
	if (tag === "INPUT") {
		const type = (target as HTMLInputElement).type
		return !["button", "checkbox", "radio", "range", "submit", "reset", "color", "file"].includes(
			type
		)
	}
	return false
}

/**
 * Top-center command bar (the site's search). At rest: a slim "command center" trigger
 * centered over the editor column. Open: the trigger morphs (shared layoutId) into a palette
 * dialog with teas, flavors, origins, vendors, styles, cultivars, tags and ">" commands;
 * quick-open prefixes (@ # ^ ~ % :) scope it to one kind.
 *
 * State: commandBarAtom (open/query/scope; anyone may open it via openCommandBarAtom).
 * Filters: the shared Jotai filter state (also used by the Explorer).
 */
export default function CommandBar({ sessions, vendors, categories, details }: CommandBarProps) {
	const [state, setState] = useAtom(commandBarAtom)
	const open = state.open
	const hydrated = useAtomValue(explorerSessionsAtom)
	const source = hydrated.length ? hydrated : sessions
	const sharedIndex = useAtomValue(relationIndexAtom)
	const reduceMotion = !!useReducedMotion()
	const platform = usePlatform()
	const filterCount = useAtomValue(activeFilterCountAtom)

	// Build the index when the browser is idle, so the first open is instant.
	const [armed, setArmed] = useState(false)
	useEffect(() => {
		const w = window as Window & {
			requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
			cancelIdleCallback?: (id: number) => void
		}
		if (w.requestIdleCallback) {
			const id = w.requestIdleCallback(() => setArmed(true), { timeout: 2500 })
			return () => w.cancelIdleCallback?.(id)
		}
		const id = window.setTimeout(() => setArmed(true), 1200)
		return () => window.clearTimeout(id)
	}, [])
	const index = useMemo(
		() =>
			armed || open
				? buildIndex(
						source,
						vendors,
						categories,
						details,
						sharedIndex.sessions === source ? sharedIndex : undefined
					)
				: null,
		[armed, open, source, vendors, categories, details, sharedIndex]
	)

	const close = useCallback(() => setState((s) => ({ ...s, open: false })), [setState])

	// ⌘K / Ctrl+K toggles; "/" opens when not typing somewhere
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
				e.preventDefault()
				setState((s) => (s.open ? { ...s, open: false } : { open: true, query: "", scope: "all" }))
				return
			}
			if (
				e.key === "/" &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.defaultPrevented &&
				!isEditable(e.target)
			) {
				e.preventDefault()
				setState((s) => (s.open ? s : { open: true, query: "", scope: "all" }))
			}
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [setState])

	// Focus: remember where it was, restore it on close; keep it inside the dialog while open.
	const triggerRef = useRef<HTMLButtonElement>(null)
	const dialogRef = useRef<HTMLDivElement>(null)
	const prevFocus = useRef<HTMLElement | null>(null)
	const wasOpen = useRef(false)
	const [hasOpened, setHasOpened] = useState(false)
	useLayoutEffect(() => {
		if (open && !wasOpen.current) {
			const a = document.activeElement
			prevFocus.current = a instanceof HTMLElement && a !== document.body ? a : null
			setHasOpened(true)
		} else if (!open && wasOpen.current) {
			const p = prevFocus.current
			prevFocus.current = null
			if (p && p.isConnected && !p.closest("[inert]")) p.focus({ preventScroll: true })
			else triggerRef.current?.focus({ preventScroll: true })
		}
		wasOpen.current = open
	}, [open])

	useEffect(() => {
		if (!open) return
		const onFocusIn = (e: FocusEvent) => {
			const dialog = dialogRef.current
			if (dialog && !dialog.contains(e.target as Node)) {
				dialog.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true })
			}
		}
		// the page underneath must not scroll while the palette is up (the list still does)
		const onWheel = (e: WheelEvent | TouchEvent) => {
			const list = document.getElementById("commandbar-listbox")
			if (list && list.contains(e.target as Node)) return
			e.preventDefault()
		}
		document.addEventListener("focusin", onFocusIn)
		window.addEventListener("wheel", onWheel, { passive: false })
		window.addEventListener("touchmove", onWheel, { passive: false })
		return () => {
			document.removeEventListener("focusin", onFocusIn)
			window.removeEventListener("wheel", onWheel)
			window.removeEventListener("touchmove", onWheel)
		}
	}, [open])

	const morph = reduceMotion ? { duration: 0 } : MORPH_SPRING
	const shortcut = platform === "mac" ? "⌘K" : "Ctrl K"

	return (
		<MotionConfig reducedMotion="user">
			<div
				className="fixed top-0 z-40 flex items-center justify-center px-4 pointer-events-none left-[var(--explorer-w)] right-[var(--rightpanel-w)] h-[var(--commandbar-h)]"
				data-commandbar
			>
				{/* soft title-bar fade so content scrolling under the bar recedes */}
				<div
					aria-hidden
					className="absolute inset-x-0 top-0 h-full bg-gradient-to-b from-background/90 via-background/50 to-transparent"
				/>
				{!open && (
					<motion.button
						ref={triggerRef}
						type="button"
						layoutId={SURFACE_LAYOUT_ID}
						transition={morph}
						aria-haspopup="dialog"
						aria-expanded={false}
						aria-keyshortcuts="Control+K Meta+K /"
						aria-label={
							filterCount
								? `Search and commands (${filterCount} filters active)`
								: "Search and commands"
						}
						onClick={() => setState({ open: true, query: "", scope: "all" })}
						style={{ borderRadius: 10 }}
						className="group relative flex items-center gap-2.5 h-9 pl-3 pr-1.5 w-[min(30rem,100%)] pointer-events-auto surface-card text-white/45 font-fira-code text-[12px] transition-[color,filter] duration-200 hover:text-white/75 hover:brightness-125 outline-none focus-visible:outline-1 focus-visible:outline-[#edc446]/50 focus-visible:text-white/80"
					>
						<motion.span
							layoutId={ICON_LAYOUT_ID}
							transition={morph}
							className="flex items-center shrink-0"
						>
							<SearchIcon size={14} aria-hidden />
						</motion.span>
						<motion.span
							layout="position"
							initial={hasOpened ? { opacity: 0 } : false}
							animate={{ opacity: 1, transition: { delay: 0.08, duration: 0.2 } }}
							className="flex-1 text-left truncate"
						>
							Search teas, vendors, flavors…
						</motion.span>
						<motion.span
							layout="position"
							initial={hasOpened ? { opacity: 0 } : false}
							animate={{ opacity: 1, transition: { delay: 0.1, duration: 0.2 } }}
							className="flex items-center gap-1 shrink-0"
						>
							{filterCount > 0 && (
								<span className="flex items-center gap-1 h-[18px] px-1.5 mr-1 rounded-[5px] text-[10px] text-[#edc446]/90 bg-[#edc446]/10">
									<span
										aria-hidden
										className="w-1.5 h-1.5 rounded-full bg-[var(--liquor-text,#edc446)]"
									/>
									{filterCount} {filterCount === 1 ? "filter" : "filters"}
								</span>
							)}
							<Kbd className={platform ? "" : "opacity-0"}>{shortcut}</Kbd>
							<Kbd>/</Kbd>
						</motion.span>
					</motion.button>
				)}
			</div>

			<AnimatePresence>
				{open && (
					<motion.div
						key="commandbar-backdrop"
						aria-hidden
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0, transition: { duration: 0.18 } }}
						transition={{ duration: 0.22, ease: "easeOut" }}
						onMouseDown={close}
						className="fixed inset-0 z-[60] bg-[#0b0a0b]/55 backdrop-blur-[2px]"
					/>
				)}
				{open && (
					<div
						key="commandbar-dialog"
						className="fixed z-[61] flex justify-center px-4 pointer-events-none top-[10px] left-[var(--explorer-w)] right-[var(--rightpanel-w)]"
					>
						<DialogSurface ref={dialogRef} transition={morph}>
							<Palette
								index={index}
								initialQuery={state.query}
								initialScope={state.scope}
								onClose={close}
								reduceMotion={reduceMotion}
							/>
						</DialogSurface>
					</div>
				)}
			</AnimatePresence>
		</MotionConfig>
	)
}

/** The morphing surface. Goes inert while exiting so stray clicks/keys can't reach it. */
function DialogSurface({
	ref,
	transition,
	children,
}: {
	ref: React.Ref<HTMLDivElement>
	transition: Transition
	children: React.ReactNode
}) {
	const isPresent = useIsPresent()
	return (
		<motion.div
			ref={ref}
			layoutId={SURFACE_LAYOUT_ID}
			transition={transition}
			role="dialog"
			aria-modal="true"
			aria-label="Search and commands"
			inert={!isPresent || undefined}
			style={{ borderRadius: 14 }}
			className="relative w-full max-w-[640px] overflow-hidden pointer-events-auto surface-card font-fira-code"
		>
			<motion.div
				layout="position"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1, transition: { delay: 0.04, duration: 0.18 } }}
				exit={{ opacity: 0, transition: { duration: 0.08 } }}
			>
				{children}
			</motion.div>
		</motion.div>
	)
}
