"use client"

import { Suspense, useCallback, useMemo, type ReactNode } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { motion, useReducedMotion, type Variants } from "motion/react"
import PanelSection from "@/lib/components/containers/PanelSection"
import PhaseScrubber from "@/lib/components/dataviz/radar/PhaseScrubber"
import RadarChart, { type RadarCompare } from "@/lib/components/dataviz/radar/RadarChart"
import { withAlpha } from "@/lib/components/dataviz/radar/geometry"
import EntityRef from "@/lib/components/entity/EntityRef"
import { NoteStageIcon } from "@/lib/components/icons/TeaIcons"
import { replaceFilters, currentFilters } from "@/lib/filters"
import { NOTE_STAGE_META } from "@/lib/noteStages"
import { peekFilter, type PageKind } from "@/lib/peek"
import {
	descriptorAtom,
	flavorPhaseAtom,
	flavorPhaseMotion,
	flavorPhaseSourceAtom,
	relationIndexAtom,
} from "@/lib/store/sessionAtom"
import { cn } from "@/lib/utils/cn"
import { buildEntityModel, topDescriptors, type EntityModel } from "./model"
import { entityPageAtom, useHydrated } from "./state"

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * The Properties panel on entity pages (plan §3.2):
 * - Flavor centroid: the mean radar of its sessions, diffed against its parent's (or the whole
 *   log's), with the start ⇄ finish scrubber working on the averaged ends
 * - Metadata: kind, parent, coordinates and precision, source; city and site for vendors
 * - Top descriptors: the words its sessions share; clicking one finds its references inside
 *   this entity (Explorer filtered to the entity + the descriptor pinned)
 *
 * Lives in the per-kind layout, so the radar morphs from one entity to the next.
 */
export default function EntityProperties({ kind, slug }: { kind: PageKind; slug: string }) {
	const index = useAtomValue(relationIndexAtom)
	const page = useAtomValue(entityPageAtom)
	// the page streams in after this layout chrome, so the server never has its data: render
	// without it until hydrated (no mismatch), then the rows stagger in
	const hydrated = useHydrated()
	const data = hydrated && page && page.kind === kind && page.slug === slug ? page.data : null
	const reduce = useReducedMotion() ?? false
	const parentSlug = data?.ancestors[data.ancestors.length - 1]?.slug ?? null
	const model = useMemo(
		() => buildEntityModel(index, kind, slug, { color: data?.color, parentSlug }),
		[index, kind, slug, data?.color, parentSlug]
	)

	const row: Variants = useMemo(
		() =>
			reduce
				? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
				: {
						hidden: { opacity: 0, y: 6 },
						show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
				  },
		[reduce]
	)

	return (
		<div data-recording-key="entity-properties">
			<CentroidPanel model={model} />
			<motion.div
				key={`${kind}:${slug}:${data ? "data" : "bare"}`}
				initial="hidden"
				animate="show"
				variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.03 } } }}
			>
				<PanelSection title="Metadata">
					<dl className="space-y-1.5">
						<Prop label="kind" row={row}>
							<span style={{ color: model.accentText }}>{kind}</span>
							{data?.originKind && <span className="text-white/40"> · {data.originKind}</span>}
						</Prop>
						{(data?.facts ?? []).map((f) => (
							<Prop key={f.label} label={f.label} row={row} title={f.title}>
								{f.ref ? (
									<EntityRef kind={f.ref.kind} slug={f.ref.slug} label={f.ref.title} />
								) : f.href ? (
									<a
										href={f.href}
										target="_blank"
										rel="noopener"
										className="inline-flex items-center gap-1 max-w-full rounded-sm outline-none text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
									>
										<span aria-hidden className="text-white/30">
											↗
										</span>
										<span className="truncate">{f.value}</span>
									</a>
								) : (
									f.value
								)}
							</Prop>
						))}
						<Prop label="refs" row={row}>
							{model.stats.count}
							{model.direct > 0 && model.direct < model.stats.count && (
								<span className="text-white/40"> · {model.direct} direct</span>
							)}
						</Prop>
					</dl>
				</PanelSection>

				<Descriptors model={model} row={row} />
			</motion.div>
		</div>
	)
}

/** Flavor centroid with the scrubber, diffed against the reference (its parent / the log). */
function CentroidPanel({ model }: { model: EntityModel }) {
	const phase = useAtomValue(flavorPhaseAtom)
	const setSource = useSetAtom(flavorPhaseSourceAtom)
	const onScrubStart = useCallback(() => setSource("scrub"), [setSource])
	const accent = model.accentText
	const refColor = "oklch(0.9 0.05 90)"

	const compare: RadarCompare | null = useMemo(() => {
		const ref = model.reference.stats.centroid
		if (!ref || !model.stats.centroid) return null
		return { key: `ref:${model.reference.node?.slug ?? "log"}`, data: ref, color: refColor }
	}, [model.reference, model.stats.centroid])

	return (
		<PanelSection
			title="Flavor centroid"
			rightSlot={
				model.stats.centroid ? (
					<PhaseScrubber
						phase={flavorPhaseMotion}
						value={phase}
						color={accent}
						onScrubStart={onScrubStart}
					/>
				) : undefined
			}
		>
			{model.stats.centroid ? (
				<div className="relative">
					<RadarChart
						data={model.stats.centroid}
						phase={flavorPhaseMotion}
						color={accent}
						compare={compare}
					/>
					<div
						aria-hidden
						className="absolute inset-x-3 bottom-1 flex items-center justify-between text-[10px] leading-none text-white/45 pointer-events-none"
					>
						<Swatch color={accent} label={`mean of ${model.stats.count}`} />
						{compare && <Swatch color={refColor} label={`vs ${model.reference.label}`} dashed />}
					</div>
				</div>
			) : (
				<p className="py-6 text-xs text-center text-white/35">{"// no flavor profiles yet"}</p>
			)}
		</PanelSection>
	)
}

function Descriptors({ model, row }: { model: EntityModel; row: Variants }) {
	const reduce = useReducedMotion() ?? false
	const setDescriptor = useSetAtom(descriptorAtom)
	const words = useMemo(() => topDescriptors(model.sessions), [model.sessions])
	if (!words.length) return null
	const max = words[0].count
	const filter = peekFilter(
		{ kind: model.kind, key: model.node?.slug ?? model.slug },
		model.node?.title ?? model.slug
	)

	// find references inside this entity: its Explorer filter on, the word pinned
	const find = (term: string) => {
		if (filter && !filter.active(currentFilters())) replaceFilters((s) => filter.toggle(s))
		setDescriptor({ term, pinned: true })
	}

	return (
		<PanelSection
			title="Top descriptors"
			rightSlot={<span className="text-[10px] text-white/30">in {model.stats.count}</span>}
		>
			<ul className="space-y-0.5">
				{words.map((w, i) => (
					<motion.li key={w.term} variants={row}>
						<button
							type="button"
							onClick={() => find(w.term)}
							title={`Find ‘${w.term}’ in ${model.node?.title ?? "these"} sessions`}
							className="group/word grid w-full grid-cols-[minmax(0,1fr)_auto_3.5rem_1.5rem] items-center gap-2 h-6 px-1.5 -mx-1.5 text-left text-xs rounded-[4px] outline-none text-white/75 hover:bg-white/[0.05] hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
						>
							<span className="truncate">{w.term}</span>
							<span aria-hidden className="flex gap-px opacity-50 group-hover/word:opacity-90">
								{w.stages.slice(0, 3).map((stage) => (
									<NoteStageIcon key={stage} stage={stage} className="size-3" />
								))}
							</span>
							<span
								aria-hidden
								className="relative h-1 rounded-full bg-white/[0.05] overflow-hidden"
							>
								<motion.span
									className="absolute inset-y-0 left-0 origin-left rounded-full"
									style={{
										width: `${(w.count / max) * 100}%`,
										backgroundColor: withAlpha(model.accentText, 80),
									}}
									initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
									animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
									transition={
										reduce
											? { duration: 0.2 }
											: { type: "spring", stiffness: 520, damping: 38, delay: 0.2 + i * 0.03 }
									}
								/>
							</span>
							<span className="text-[11px] text-right tabular-nums text-white/35">{w.count}</span>
						</button>
						<span className="sr-only">
							{w.stages.map((s) => NOTE_STAGE_META[s].title).join(", ")}
						</span>
					</motion.li>
				))}
			</ul>
		</PanelSection>
	)
}

function Prop({
	label,
	row,
	title,
	children,
}: {
	label: string
	row: Variants
	title?: string
	children: ReactNode
}) {
	return (
		<motion.div
			variants={row}
			className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-x-3"
			title={title}
		>
			<dt className="text-[11px] leading-6 text-white/35">{label}</dt>
			<dd className="min-w-0 text-xs leading-6 truncate text-white/80">
				<Suspense fallback={null}>{children}</Suspense>
			</dd>
		</motion.div>
	)
}

function Swatch({
	color,
	label,
	dashed = false,
}: {
	color: string
	label: string
	dashed?: boolean
}) {
	return (
		<span className={cn("inline-flex items-center gap-1 min-w-0")}>
			<span
				className="size-2 rounded-[2px] shrink-0"
				style={{
					background: withAlpha(color, 40),
					outline: `1px ${dashed ? "dashed" : "solid"} ${withAlpha(color, 85)}`,
					outlineOffset: -1,
				}}
			/>
			<span className="truncate">{label}</span>
		</span>
	)
}
