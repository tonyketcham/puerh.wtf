"use client"

import Link from "next/link"
import { useMemo, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import Hatch from "@/lib/components/entity/Hatch"
import { formatRating } from "@/lib/sessionSort"
import { flavorPhaseMotion } from "@/lib/store/sessionAtom"
import { sessionColor, type RelationIndex } from "@/lib/relations"
import { FLAVOR_AXES, type FlavorAxis, type SessionFlavorAxes } from "@/lib/types/session"
import { buildLink } from "@/lib/utils/BuildLinkToGivenCollectionNode"
import { cn } from "@/lib/utils/cn"
import CentroidRadar from "./CentroidRadar"
import { byVintage, type EntityModel } from "./model"

const EASE = [0.22, 1, 0.36, 1] as const
const CREAM = "#fff2ca"

/**
 * ── At a glance ── (plan §3.2): how many, how old, how good, what color, and what it tastes
 * like against its parent (Yiwu over Xishuangbanna, a style over its category, a vendor over
 * the whole log). The radar follows the Properties scrubber.
 */
export default function AtAGlance({
	model,
	index,
	title,
}: {
	model: EntityModel
	index: RelationIndex
	title: string
}) {
	const { stats, reference } = model
	const deltas = useMemo(
		() => axisDeltas(stats.centroid, reference.stats.centroid),
		[stats.centroid, reference.stats.centroid]
	)
	const lit = deltas.slice(0, 3).map((d) => d.axis)

	if (!stats.count) {
		return (
			<div className="relative flex items-center h-20 overflow-hidden rounded-md ring-1 ring-inset ring-white/[0.06]">
				<Hatch className="absolute inset-0 w-full h-full" spacing={7} />
				<p className="relative px-5 text-sm text-white/55">
					{"// not tasted yet: no session points at "}
					<span className="text-white/80">{title}</span>
				</p>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<dl className="grid grid-cols-2 @2xl/editor:grid-cols-4 gap-px overflow-hidden rounded-md bg-white/[0.06] ring-1 ring-inset ring-white/[0.06]">
				<Stat
					label="sessions"
					value={stats.count}
					sub={
						model.direct && model.direct < stats.count
							? `${model.direct} direct · ${stats.count - model.direct} below`
							: model.direct === 0
							? "all from below"
							: "find all references ↓"
					}
				/>
				<Stat
					label="vintages"
					value={
						stats.years
							? stats.years[0] === stats.years[1]
								? stats.years[0]
								: `${stats.years[0]}–${String(stats.years[1]).slice(2)}`
							: "—"
					}
					sub={
						stats.years && stats.years[1] > stats.years[0]
							? `${stats.years[1] - stats.years[0]} years apart`
							: "one vintage"
					}
				/>
				<Stat
					label="avg rating"
					value={
						stats.avgRating != null ? formatRating(Math.round(stats.avgRating * 10) / 10) : "—"
					}
					sub={
						reference.stats.avgRating != null && stats.avgRating != null
							? `${signed(stats.avgRating - reference.stats.avgRating)} vs ${short(
									reference.label
							  )}`
							: undefined
					}
				/>
				<Stat
					label="liquor"
					value={
						<span className="inline-flex items-center gap-2">
							<span
								aria-hidden
								className="size-3.5 rounded-[3px] ring-1 ring-inset ring-white/20"
								style={{ backgroundColor: model.accent }}
							/>
							<span className="uppercase">{model.accent.slice(1)}</span>
						</span>
					}
					sub={`${stats.count === 1 ? "one cup" : `${stats.count} cups`} blended`}
				/>
			</dl>

			<div className="grid grid-cols-1 items-center gap-x-8 gap-y-6 @xl/editor:grid-cols-[minmax(0,1fr)_minmax(200px,260px)]">
				<div className="min-w-0 space-y-6">
					<VintageStrip model={model} index={index} />

					<LiquorTimeline model={model} />

					{deltas.length > 0 && (
						<div className="space-y-2">
							<p className="text-[11px] text-white/35">
								{"// leans, vs "}
								{reference.label}
							</p>
							<ul className="flex flex-wrap gap-1.5">
								{deltas.slice(0, 5).map((d, i) => (
									<motion.li
										key={d.axis}
										initial={{ opacity: 0, y: 4 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ duration: 0.35, ease: EASE, delay: 0.5 + i * 0.05 }}
										className={cn(
											"inline-flex items-center h-6 gap-1.5 px-2 text-xs rounded-[4px] ring-1 ring-inset",
											i < 3 ? "ring-white/[0.12] text-white/85" : "ring-white/[0.06] text-white/50"
										)}
									>
										<span>{d.axis.replace(/_/g, " ")}</span>
										<span
											className="tabular-nums"
											style={{ color: d.delta > 0 ? model.accentText : "rgb(255 255 255 / 0.45)" }}
										>
											{signed(d.delta)}
										</span>
									</motion.li>
								))}
							</ul>
						</div>
					)}
				</div>

				<figure className="relative self-start max-w-[300px] w-full mx-auto">
					<CentroidRadar
						centroid={stats.centroid}
						reference={reference.stats.centroid}
						color={model.accentText}
						phase={flavorPhaseMotion}
						highlight={lit}
						className="block w-full"
						recordingKey="entity-centroid-radar"
					/>
					<figcaption className="flex items-center justify-center gap-4 -mt-2 text-[10px] text-white/40">
						<span className="inline-flex items-center gap-1.5">
							<span
								aria-hidden
								className="w-3 h-[2px] rounded-full"
								style={{ background: model.accentText }}
							/>
							{short(title, 18)}
						</span>
						<span className="inline-flex items-center gap-1.5">
							<svg aria-hidden width="12" height="2" className="overflow-visible">
								<line
									x1="0"
									y1="1"
									x2="12"
									y2="1"
									stroke={CREAM}
									strokeOpacity={0.5}
									strokeDasharray="1.5 2.5"
									strokeLinecap="round"
								/>
							</svg>
							{short(reference.label, 18)}
						</span>
					</figcaption>
				</figure>
			</div>
		</div>
	)
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
	return (
		<div className="flex flex-col gap-1 px-4 py-3 bg-[#141214]">
			<dt className="text-[10px] tracking-[0.12em] uppercase text-white/35">{label}</dt>
			<dd className="text-2xl leading-none tabular-nums text-white">{value}</dd>
			{sub && <dd className="text-[10.5px] truncate text-white/35">{sub}</dd>}
		</div>
	)
}

/**
 * Sessions per vintage across the whole log's span: this entity's bars in its liquor over the
 * log's own bars as hairline ghosts, so a cluster of old teas reads at once.
 */
function VintageStrip({ model, index }: { model: EntityModel; index: RelationIndex }) {
	const reduce = useReducedMotion() ?? false
	const { years, counts, all, max } = useMemo(() => {
		const yearOf = (y: unknown) => {
			const n = Math.trunc(Number(y))
			return Number.isFinite(n) && n > 0 ? n : null
		}
		const all = new Map<number, number>()
		for (const s of index.sessions) {
			const y = yearOf(s.production_year)
			if (y) all.set(y, (all.get(y) ?? 0) + 1)
		}
		const counts = new Map<number, number>()
		for (const s of model.sessions) {
			const y = yearOf(s.production_year)
			if (y) counts.set(y, (counts.get(y) ?? 0) + 1)
		}
		const known = [...all.keys()]
		if (!known.length) return { years: [], counts, all, max: 1 }
		const lo = Math.min(...known)
		const hi = Math.max(...known)
		const years = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
		return { years, counts, all, max: Math.max(1, ...all.values()) }
	}, [index.sessions, model.sessions])

	if (years.length < 2) return null
	const H = 36

	return (
		<div className="space-y-1.5" aria-label="Sessions by vintage">
			<div className="flex items-end gap-[2px]" style={{ height: H }}>
				{years.map((y, i) => {
					const n = counts.get(y) ?? 0
					const ghost = all.get(y) ?? 0
					return (
						<div
							key={y}
							className="relative flex-1 h-full"
							title={`${y}: ${n} of ${ghost} ${ghost === 1 ? "session" : "sessions"}`}
						>
							{ghost > 0 && (
								<span
									aria-hidden
									className="absolute inset-x-0 bottom-0 rounded-[1px] bg-white/[0.06]"
									style={{ height: `${(ghost / max) * 100}%` }}
								/>
							)}
							{n > 0 && (
								<motion.span
									aria-hidden
									className="absolute inset-x-0 bottom-0 origin-bottom rounded-[1px]"
									style={{
										height: `${Math.max(14, (n / max) * 100)}%`,
										backgroundColor: model.accentText,
									}}
									initial={reduce ? { opacity: 0 } : { scaleY: 0 }}
									animate={reduce ? { opacity: 1 } : { scaleY: 1 }}
									transition={
										reduce
											? { duration: 0.2 }
											: { type: "spring", stiffness: 520, damping: 38, delay: 0.2 + i * 0.012 }
									}
								/>
							)}
						</div>
					)
				})}
			</div>
			<div className="flex justify-between text-[10px] tabular-nums text-white/30">
				<span>{years[0]}</span>
				<span className="text-white/20">vintage</span>
				<span>{years[years.length - 1]}</span>
			</div>
		</div>
	)
}

/** One swatch per session, oldest vintage first; each opens its session. */
function LiquorTimeline({ model }: { model: EntityModel }) {
	const reduce = useReducedMotion() ?? false
	const ordered = useMemo(() => byVintage(model.sessions), [model.sessions])
	return (
		<ol className="flex h-5 gap-[3px]" aria-label="Liquor of each session, oldest vintage first">
			{ordered.map((s, i) => (
				<motion.li
					key={s._slug}
					className="flex-1 min-w-[6px] max-w-12"
					initial={reduce ? { opacity: 0 } : { opacity: 0, scaleY: 0.2 }}
					animate={{ opacity: 1, scaleY: 1 }}
					transition={
						reduce
							? { duration: 0.2 }
							: { type: "spring", stiffness: 520, damping: 34, delay: 0.3 + i * 0.018 }
					}
				>
					<Link
						href={buildLink(s)}
						title={`${s.production_year ? `${Math.trunc(Number(s.production_year))} ` : ""}${
							s.title
						}`}
						className="block h-full rounded-[2px] ring-1 ring-inset ring-black/25 outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-white/60"
						style={{ backgroundColor: sessionColor(s) }}
					>
						<span className="sr-only">{s.title}</span>
					</Link>
				</motion.li>
			))}
		</ol>
	)
}

// ---------------------------------------------------------------------------

/** Per-axis difference of the mean of start and finish, largest first. */
function axisDeltas(
	own: SessionFlavorAxes | null,
	ref: SessionFlavorAxes | null
): { axis: FlavorAxis; delta: number }[] {
	if (!own || !ref) return []
	const mid = (f: SessionFlavorAxes, a: FlavorAxis) => (f[a].start + f[a].finish) / 2
	return FLAVOR_AXES.map((axis) => ({ axis, delta: mid(own, axis) - mid(ref, axis) }))
		.filter((d) => Math.abs(d.delta) >= 0.3)
		.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

function signed(n: number): string {
	const r = Math.round(n * 10) / 10
	if (Math.abs(r) < 0.05) return "±0"
	return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(1).replace(/\.0$/, "")}`
}

function short(text: string, max = 22): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
