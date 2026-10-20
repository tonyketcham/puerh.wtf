"use client"

import Link from "next/link"
import { memo, useMemo, type KeyboardEvent, type ReactNode } from "react"
import { motion } from "motion/react"
import { useSetAtom, useStore } from "jotai"
import { Funnel } from "lucide-react"
import { ENTITY_META, entityHref } from "@/lib/entities"
import type { PageKind } from "@/lib/peek"
import { chain, usePeekTrigger } from "@/lib/components/entity/peek/usePeekTrigger"
import { cn } from "@/lib/utils"
import { explorerHoverAtom } from "./state"
import { useVirtualListNavigation } from "./VirtualList"

/** Indent per tree level, in px (the guides sit on these columns). */
export const INDENT_PX = 12

export interface EntityRowProps {
	kind: PageKind
	slug: string
	title: string
	/** dim secondary label after the title (hanzi, a place) */
	sub?: ReactNode
	/** sessions passing the other filters */
	count: number
	/** sessions overall; shown as "/total" when the filters narrow it */
	total: number
	/** a flat list: no gutter for tree chevrons */
	flat?: boolean
	/** the 16px mark before the title */
	mark: ReactNode
	/** a small chart right of the title (mix bar, cup strip) */
	trailing?: ReactNode
	depth?: number
	/** tree columns whose guide is lit (the hovered node's subtree runs through them) */
	litGuides?: readonly number[] | null
	/** tree rows: whether the node has children, and its open state */
	expandable?: boolean
	open?: boolean
	onOpenChange?: (slug: string, open: boolean) => void
	/** slug of the row's parent row, for ← */
	parentSlug?: string | null
	/** this entity's Explorer filter is on */
	filtered: boolean
	onToggleFilter: (kind: PageKind, slug: string) => void
	/** this entity's page is the current page */
	current: boolean
	/** none of its sessions pass the filters (kept for context, dimmed) */
	muted?: boolean
	recordingKey?: string
}

/** Every row link in the view the event came from, in display order. */
function rowsOf(el: HTMLElement) {
	const view = el.closest("[data-explorer-view]")
	return view ? [...view.querySelectorAll<HTMLAnchorElement>("a[data-explorer-row]")] : []
}

/**
 * One entity in an Explorer view, IDE-tree style. The row is a link to the entity's page
 * (Go to Definition) that peeks it on hover or focus (Peek Definition); the funnel at its
 * right, or ⇧↵, toggles the entity's Explorer filter.
 *
 * Keys: ↑/↓ move between rows, Home/End jump, → opens a tree node (then steps into it),
 * ← closes it (then steps out to its parent), `p` pins the peek, ⇧↵ filters.
 */
function EntityRowImpl({
	kind,
	slug,
	title,
	sub,
	count,
	total,
	mark,
	trailing,
	flat = false,
	depth = 0,
	litGuides,
	expandable = false,
	open = false,
	onOpenChange,
	parentSlug,
	filtered,
	onToggleFilter,
	current,
	muted = false,
	recordingKey,
}: EntityRowProps) {
	const store = useStore()
	const navigation = useVirtualListNavigation()
	const setHover = useSetAtom(explorerHoverAtom)
	const target = useMemo(() => ({ kind, key: slug }), [kind, slug])
	const { handlers, status } = usePeekTrigger<HTMLAnchorElement>(target)
	const meta = ENTITY_META[kind]
	const href = entityHref(kind, slug) ?? "#"
	const label = meta.label

	const hoverOn = () => setHover({ kind, slug })
	const hoverOff = () => {
		const h = store.get(explorerHoverAtom)
		if (h && h.kind === kind && h.slug === slug) setHover(null)
	}

	const onKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
		const el = e.currentTarget
		const plain = !e.altKey && !e.ctrlKey && !e.metaKey
		if (plain && e.shiftKey && e.key === "Enter") {
			// ⇧↵ filters (the peek would do the same; one owner, so it toggles once)
			e.preventDefault()
			onToggleFilter(kind, slug)
			return
		}
		if (plain && !e.shiftKey) {
			const rows = rowsOf(el)
			const i = rows.indexOf(el)
			const focus = (to: HTMLElement | undefined) => {
				if (!to) return
				e.preventDefault()
				to.focus()
				to.scrollIntoView({ block: "nearest" })
			}
			switch (e.key) {
				case "ArrowDown":
					return focus(rows[i + 1])
				case "ArrowUp":
					return focus(rows[i - 1])
				case "Home":
					return focus(rows[0])
				case "End":
					return focus(rows[rows.length - 1])
				case "ArrowRight":
					if (expandable && !open) {
						e.preventDefault()
						onOpenChange?.(slug, true)
					} else if (expandable) {
						if (navigation?.focusNext(el)) e.preventDefault()
						else focus(rows[i + 1])
					}
					return
				case "ArrowLeft":
					if (expandable && open) {
						e.preventDefault()
						onOpenChange?.(slug, false)
					} else if (parentSlug) {
						if (navigation?.focusKey(parentSlug)) e.preventDefault()
						else focus(rows.find((r) => r.dataset.slug === parentSlug))
					}
					return
			}
		}
		handlers.onKeyDown(e)
	}

	const narrowed = count !== total
	const indent = depth * INDENT_PX

	return (
		<div
			className={cn(
				"group/row relative flex items-center rounded-md",
				"transition-[background-color,opacity] duration-200",
				"hover:bg-white/[0.04] focus-within:bg-white/[0.05]",
				(current || status) && "bg-white/[0.06]",
				muted && "opacity-45"
			)}
		>
			{/* indent guides: hairlines on each ancestor column; the hovered node's column lights */}
			{Array.from({ length: depth }, (_, d) => (
				<span
					key={d}
					aria-hidden
					className={cn(
						"absolute top-0 bottom-0 w-px transition-colors duration-200",
						litGuides?.includes(d) ? "bg-[#fff2ca]/35" : "bg-white/[0.06]"
					)}
					style={{ left: 8 + d * INDENT_PX + 7 }}
				/>
			))}
			{current && (
				<motion.span
					layoutId="explorer-current-row"
					aria-hidden
					className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-brand"
					transition={{ type: "spring", stiffness: 500, damping: 40 }}
				/>
			)}

			{expandable ? (
				<button
					type="button"
					tabIndex={-1}
					onClick={() => onOpenChange?.(slug, !open)}
					aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
					className="absolute top-0 bottom-0 z-10 grid w-4 place-items-center text-white/40 hover:text-white"
					style={{ left: 8 + indent }}
				>
					<motion.svg
						width="6"
						height="6"
						viewBox="0 0 6 6"
						fill="none"
						aria-hidden
						initial={false}
						animate={{ rotate: open ? 90 : 0 }}
						transition={{ type: "spring", stiffness: 500, damping: 32 }}
					>
						<path
							d="M2 1L4 3L2 5"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</motion.svg>
				</button>
			) : null}

			<Link
				{...handlers}
				onPointerEnter={chain(handlers.onPointerEnter, hoverOn)}
				onPointerLeave={chain(handlers.onPointerLeave, hoverOff)}
				onFocus={chain(handlers.onFocus, hoverOn)}
				onBlur={chain(handlers.onBlur, hoverOff)}
				onKeyDown={onKeyDown}
				href={href}
				prefetch={meta.routeReady ? undefined : false}
				aria-current={current ? "page" : undefined}
				aria-expanded={expandable ? open : handlers["aria-expanded"]}
				aria-label={`${title}, ${label}, ${count} ${count === 1 ? "session" : "sessions"}${
					filtered ? ", filtered" : ""
				}`}
				data-explorer-row
				data-kind={kind}
				data-slug={slug}
				data-recording-key={recordingKey}
				data-peek-placement="right-start"
				className={cn(
					"flex flex-1 min-w-0 items-center gap-2 py-1.5 pr-1 rounded-md outline-none",
					"text-[13px] leading-4 [-webkit-touch-callout:none]",
					"focus-visible:ring-1 focus-visible:ring-white/25"
				)}
				style={{ paddingLeft: 8 + indent + (flat ? 0 : 18) }}
			>
				{mark}
				{/* one line that wraps: a secondary label with no room drops to the clipped second
				    line whole, rather than leaving a sliver, and the name keeps its room */}
				<span className="flex flex-wrap items-baseline min-w-0 h-4 overflow-hidden gap-x-1.5">
					<span
						className={cn(
							"max-w-full truncate transition-colors",
							current || filtered ? "text-white" : "text-white/60 group-hover/row:text-white"
						)}
					>
						{title}
					</span>
					{sub ? <span className="shrink-0 text-[11px] text-white/30">{sub}</span> : null}
				</span>
				<span className="flex-1" />
				{/* the chart steps aside for the funnel while the row is hovered or filtered */}
				<span
					className={cn(
						"flex justify-end w-[22px] shrink-0 transition-opacity duration-150",
						filtered ? "opacity-0" : "group-hover/row:opacity-0 group-focus-within/row:opacity-0"
					)}
				>
					{trailing}
				</span>
			</Link>

			<button
				type="button"
				tabIndex={-1}
				onClick={() => onToggleFilter(kind, slug)}
				aria-pressed={filtered}
				aria-label={`${filtered ? "Remove" : "Filter the Explorer by"} ${label} ${title}`}
				title={filtered ? "Remove filter (⇧↵)" : "Filter sessions (⇧↵)"}
				className={cn(
					"absolute right-[45px] top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded",
					"transition-[opacity,color,background-color] duration-150",
					"hover:bg-white/10 hover:text-white",
					filtered
						? "text-brand opacity-100"
						: "text-white/40 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
				)}
			>
				<Funnel size={11} strokeWidth={2.25} fill={filtered ? "currentColor" : "none"} />
			</button>
			<span
				className={cn(
					"w-10 pr-2 text-right text-[11px] tabular-nums shrink-0",
					filtered ? "text-brand/90" : "text-white/40 group-hover/row:text-white/70"
				)}
			>
				{count}
				{narrowed && <span className="text-white/20">/{total}</span>}
			</span>
		</div>
	)
}

const EntityRow = memo(EntityRowImpl)
export default EntityRow
