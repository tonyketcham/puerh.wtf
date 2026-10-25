"use client"

import { memo, type PointerEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
	BookA,
	Check,
	ChevronRight,
	Coffee,
	CornerDownLeft,
	Dices,
	FunnelX,
	GitCompareArrows,
	House,
	Layers,
	Mountain,
	Sparkles,
	Sprout,
	Store,
	Timer,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { liquorTextRgb, rgbCss } from "@/lib/liquor"
import { formatSeconds, formatTemp } from "@/lib/steeps"
import { NOTE_STAGE_META } from "@/lib/noteStages"
import { NoteStageIcon } from "@/lib/components/icons/TeaIcons"
import FlavorGlyph from "./FlavorGlyph"
import { Highlight, LiquorSwatch } from "./parts"
import { ENTITY_META } from "@/lib/entities"
import { facetOpens, glyphOf, type ArgCommand, type CommandId, type Item } from "./items"

export const PILL_SPRING = { type: "spring", stiffness: 600, damping: 44, mass: 0.7 } as const

const COMMAND_ICON: Record<CommandId, typeof Timer> = {
	"cms-enable": Store, "cms-disable": House, "cms-working": Layers, "cms-new": Coffee, "cms-edit": BookA, "cms-session": Timer,
	brew: Timer,
	compare: GitCompareArrows,
	random: Dices,
	clear: FunnelX,
	home: House,
	origins: Mountain,
	vendors: Store,
	styles: Layers,
	cultivars: Sprout,
	teaware: Coffee,
	lexicon: BookA,
}

type RowProps = {
	item: Item
	index: number
	active: boolean
	argCommand: ArgCommand | null
	/** random-tea roll in progress: label to flash, or null */
	rolling: string | null
	reduceMotion: boolean
	onHover: (index: number) => void
	/** `filter`: ⇧-click, which filters by an entity instead of opening it */
	onRun: (index: number, filter: boolean) => void
}

/** Indent per origin-tree level when an empty `^` lists the tree. */
const TREE_INDENT_PX = 12

function accentOf(item: Item): string {
	// text-safe lift: the accent draws the active bar and the flavor glyph strokes
	if (item.kind === "tea") return rgbCss(liquorTextRgb(item.tea.liquor))
	if (item.kind === "facet" && item.facet.color) return item.facet.color
	if (item.kind === "flavor") return "#edc446"
	return "rgba(255,255,255,0.5)"
}

function ResultRowImpl({
	item,
	index,
	active,
	argCommand,
	rolling,
	reduceMotion,
	onHover,
	onRun,
}: RowProps) {
	const accent = accentOf(item)
	const tall = item.kind === "tea"
	return (
		<div
			id={`cmd-opt-${index}`}
			role="option"
			aria-selected={active}
			data-index={index}
			onPointerMove={(e: PointerEvent) => {
				if (e.pointerType !== "touch" && !active) onHover(index)
			}}
			onClick={(e) => onRun(index, e.shiftKey)}
			className={cn(
				"relative flex items-center gap-3 px-3 mx-2 rounded-lg cursor-pointer select-none scroll-my-8",
				tall ? "h-12" : "h-10",
				active ? "text-white" : "text-white/75"
			)}
			style={{ ["--row-accent" as string]: accent }}
		>
			{active && (
				<motion.div
					layoutId="commandbar-active-pill"
					aria-hidden
					transition={reduceMotion ? { duration: 0 } : PILL_SPRING}
					className="absolute inset-0 rounded-lg bg-white/[0.065] shadow-key"
				>
					<span className="absolute left-0 w-[2px] rounded-full top-2 bottom-2 bg-[var(--row-accent)] shadow-[0_0_8px_var(--row-accent)]" />
				</motion.div>
			)}
			<div className="relative flex items-center flex-1 min-w-0 gap-3">
				<RowBody
					item={item}
					active={active}
					argCommand={argCommand}
					rolling={rolling}
					reduceMotion={reduceMotion}
				/>
			</div>
			<AnimatePresence initial={false}>
				{active && (
					<motion.span
						key="enter"
						aria-hidden
						initial={{ opacity: 0, x: -4 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: -4, transition: { duration: 0.08 } }}
						transition={
							reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 34 }
						}
						className="relative flex items-center text-white/40"
					>
						{item.kind === "command" && item.command.arg ? (
							<ChevronRight size={14} />
						) : (
							<CornerDownLeft size={13} />
						)}
					</motion.span>
				)}
			</AnimatePresence>
		</div>
	)
}

export const ResultRow = memo(ResultRowImpl)

function RowBody({
	item,
	active,
	argCommand,
	rolling,
	reduceMotion,
}: {
	item: Item
	active: boolean
	argCommand: ArgCommand | null
	rolling: string | null
	reduceMotion: boolean
}) {
	switch (item.kind) {
		case "tea": {
			const { tea } = item
			const brewing = tea.session.brewing
			const temp = formatTemp(brewing?.temperature)
			const first = brewing?.first_infusion_duration
			return (
				<>
					<LiquorSwatch liquor={tea.liquor} />
					<div className="flex flex-col min-w-0 flex-1 gap-0.5">
						<Highlight
							text={tea.title}
							indices={item.hl}
							className="text-[13px] leading-tight truncate"
						/>
						<span className="flex items-center gap-1.5 text-[11px] leading-tight text-white/40 truncate">
							{tea.category && (
								<span
									aria-hidden
									className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
									style={{ backgroundColor: tea.category.color }}
								/>
							)}
							<span className="truncate">
								{[tea.category?.title, tea.vendor].filter(Boolean).join(" · ") || "—"}
							</span>
						</span>
					</div>
					{argCommand === "brew" && (first || temp) ? (
						<span className="text-[11px] text-white/45 tabular-nums shrink-0">
							{[first ? `1st ${formatSeconds(first)}` : null, temp ? `${temp.c}°C` : null]
								.filter(Boolean)
								.join(" · ")}
						</span>
					) : (
						<span className="shrink-0 text-white/70">
							<FlavorGlyph
								axes={tea.session.flavor_axes}
								color={rgbCss(liquorTextRgb(tea.liquor))}
								active={active}
							/>
						</span>
					)}
					<span className="w-9 text-right text-[12px] font-bold tabular-nums text-white/80 shrink-0">
						{tea.year ?? ""}
					</span>
				</>
			)
		}
		case "flavor": {
			const { flavor } = item
			return (
				<>
					<span className="flex items-center justify-center w-[14px] shrink-0 text-[#edc446]/80">
						<Sparkles size={13} aria-hidden />
					</span>
					<span className="flex items-baseline min-w-0 gap-2 flex-1">
						<Highlight text={flavor.term} indices={item.hl} className="text-[13px] truncate" />
						<span className="text-[11px] text-white/35 shrink-0">
							· {flavor.count} {flavor.count === 1 ? "tea" : "teas"}
						</span>
					</span>
					<span
						className="flex gap-1 shrink-0 text-white/60"
						aria-label={flavor.stages.map((s) => NOTE_STAGE_META[s].title).join(", ")}
					>
						{flavor.stages.slice(0, 4).map((s) => (
							<span key={s} title={NOTE_STAGE_META[s].title}>
								<NoteStageIcon stage={s} className="size-3" />
							</span>
						))}
					</span>
					{item.active && <StateBadge>pinned</StateBadge>}
				</>
			)
		}
		case "facet": {
			const { facet } = item
			const opens = facetOpens(facet)
			// in a tree (an empty ^ or ~) the rows above already say where it sits
			const sub = item.depth !== undefined ? facet.hanzi : facet.sub
			return (
				<>
					{item.depth ? (
						<span aria-hidden className="shrink-0" style={{ width: item.depth * TREE_INDENT_PX }} />
					) : null}
					<span className="flex items-center justify-center w-[14px] shrink-0 text-white/40">
						{facet.kind === "category" ? (
							<span
								className="w-2 h-2 rounded-[2px]"
								style={{ backgroundColor: facet.color, boxShadow: `0 0 6px -1px ${facet.color}` }}
								aria-hidden
							/>
						) : (
							// the entity's kind glyph, which is also its quick-open prefix
							<span
								aria-hidden
								className="text-[13px] leading-none"
								style={facet.color ? { color: facet.color } : undefined}
							>
								{glyphOf(facet.kind)}
							</span>
						)}
					</span>
					<span className="flex items-baseline flex-1 min-w-0 gap-2">
						<Highlight
							text={facet.label}
							indices={item.hl}
							className="text-[13px] truncate shrink-0 max-w-[60%]"
						/>
						<span className="text-[11px] text-white/35 shrink-0">
							· {facet.count} {facet.count === 1 ? "tea" : "teas"}
						</span>
						{sub && <span className="min-w-0 text-[11px] text-white/25 truncate">{sub}</span>}
					</span>
					{item.active ? (
						<StateBadge>
							<Check size={10} aria-hidden /> filtered
						</StateBadge>
					) : (
						<span className="text-[10px] uppercase tracking-[0.14em] text-white/25 shrink-0">
							{active ? (opens ? ENTITY_META[facet.kind].label : "filter") : ""}
						</span>
					)}
				</>
			)
		}
		case "command": {
			const { command } = item
			const Icon = COMMAND_ICON[command.id]
			const isRandom = command.id === "random"
			return (
				<>
					<motion.span
						className="flex items-center justify-center w-[14px] shrink-0 text-white/55"
						animate={
							reduceMotion || !isRandom
								? undefined
								: rolling
								? { rotate: [0, -25, 200, 380, 360], y: [0, -4, 0, -1, 0], scale: [1, 1.1, 1, 1] }
								: active
								? { rotate: [0, -12, 8, 0] }
								: { rotate: 0 }
						}
						transition={
							rolling
								? { duration: 0.5, ease: [0.22, 1, 0.36, 1], repeat: Infinity, repeatDelay: 0 }
								: { duration: 0.42, ease: "easeOut" }
						}
					>
						<Icon size={14} aria-hidden />
					</motion.span>
					<span className="flex items-baseline flex-1 min-w-0 gap-2">
						<Highlight text={command.label} indices={item.hl} className="text-[13px] shrink-0" />
						<span
							className={cn(
								"text-[11px] truncate",
								rolling ? "text-white/70 tabular-nums" : "text-white/35"
							)}
						>
							{rolling ? `→ ${rolling}` : command.hint}
						</span>
					</span>
				</>
			)
		}
	}
}

function StateBadge({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded-[5px] text-[10px] text-[#edc446] bg-[#edc446]/10 border border-[#edc446]/20 shrink-0">
			{children}
		</span>
	)
}
