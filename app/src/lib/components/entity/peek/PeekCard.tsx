"use client"

import { isRated } from "@/lib/sessionScores"

import Link from "next/link"
import { useMemo, useState, type ReactNode } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { motion, useReducedMotion, type Variants } from "motion/react"
import { ArrowLeft, GitCompareArrows, Pin, X as CloseIcon } from "lucide-react"
import FlavorGlyph from "@/lib/components/command/FlavorGlyph"
import Hatch from "@/lib/components/entity/Hatch"
import { NoteStageIcon } from "@/lib/components/icons/TeaIcons"
import { descriptorRegex, extractDescriptors, findDescriptorMatches } from "@/lib/descriptors"
import type { EntityDetails, OriginPeekDetail, VesselPeekDetail } from "@/lib/entityDetails"
import { brewFacts, brewProfile, timeDomain } from "@/lib/components/entity/vessel/brew"
import UseStrip from "@/lib/components/entity/vessel/UseStrip"
import VesselPhoto from "@/lib/components/entity/vessel/VesselPhoto"
import { useFilterActive } from "@/lib/store/useFilterActive"
import { lexiconHref, lexiconPageOf } from "@/lib/lexicon"
import { LIQUOR_FALLBACK } from "@/lib/liquor"
import { entityHref } from "@/lib/entities"
import OriginMap, { hasDetail } from "@/lib/components/map/OriginMap"
import { NOTE_STAGES, NOTE_STAGE_META } from "@/lib/noteStages"
import {
	isPageKind,
	PEEK_META,
	peekFileName,
	peekFilter,
	peekHref,
	peekRouteReady,
	type PeekTarget,
} from "@/lib/peek"
import { related, sessionColor, type EntityNode, type RelationIndex } from "@/lib/relations"
import { setSessionDragData } from "@/lib/dnd"
import { formatRating } from "@/lib/sessionSort"
import {
	compareSlugAtom,
	descriptorAtom,
	openCommandBarAtom,
	sessionSlugAtom,
} from "@/lib/store/sessionAtom"
import type { PeekState } from "@/lib/store/peekAtom"
import type { ExplorerSession, NoteStage } from "@/lib/types/session"
import { buildLink } from "@/lib/utils/BuildLinkToGivenCollectionNode"
import { cn } from "@/lib/utils/cn"
import { stripMarks } from "@/lib/utils/stripMarks"
import type { PeekController } from "./controller"
import { dominantAxes, featuredSessions, type PeekModel } from "./model"
import { PEEK_CARD_ID } from "./usePeekTrigger"
import { useMorphClick } from "../page/viewTransition"

/** Content ease from the plan's motion tokens (§3). */
const EASE = [0.22, 1, 0.36, 1] as const
const CREAM = "#fff2ca"

export interface PeekCardProps {
	model: PeekModel
	state: PeekState
	index: RelationIndex
	details: EntityDetails
	peek: PeekController
	/** pointer is on the card: the centroid breathes into the finish */
	engaged: boolean
}

/**
 * The card's content (plan §3.1): kind + count header, name, a kind-specific body, the
 * description, the flavor centroid, three sessions and the Open / Filter / Compare actions.
 * Rows stagger in; marks draw on. The chrome, position and morph live in EntityPeekHost.
 */
export default function PeekCard({ model, state, index, details, peek, engaged }: PeekCardProps) {
	const reduce = useReducedMotion() ?? false
	const { target, stats } = model
	const meta = PEEK_META[target.kind]
	const detail = isPageKind(target.kind)
		? (details[target.kind][model.node?.slug ?? target.key] as PeekDetail | undefined)
		: undefined
	const hanzi = model.node?.hanzi || detail?.hanzi
	const accent = model.node?.color || stats.liquor[0] || LIQUOR_FALLBACK.hex

	const row: Variants = useMemo(
		() =>
			reduce
				? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.16 } } }
				: {
						hidden: { opacity: 0, y: 4 },
						show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
				  },
		[reduce]
	)

	const count = stats.count
	// Rock 3D has no tone marks (Dà Yè Zhòng): set it bare and keep the toned spelling beneath
	const display = target.kind === "descriptor" ? `‘${model.title}’` : stripMarks(model.title)
	const toned = display !== model.title && target.kind !== "descriptor" ? model.title : null
	const rolledUp = model.direct > 0 && model.direct < count

	return (
		<motion.div
			initial="hidden"
			animate="show"
			variants={{
				show: { transition: { staggerChildren: reduce ? 0 : 0.035, delayChildren: 0.02 } },
			}}
			className="flex flex-col gap-3 p-3"
		>
			{/* ┌ ^ origin ──────────── 10 sessions ┐ */}
			<motion.div variants={row} className="flex items-center h-5 gap-2 text-[10px] text-white/40">
				{state.history.length > 0 && (
					<IconButton label="Back" onClick={peek.back} className="-ml-1">
						<ArrowLeft size={12} strokeWidth={2} />
					</IconButton>
				)}
				<span className="flex items-center gap-1.5 shrink-0">
					<span aria-hidden className="text-[11px] leading-none" style={{ color: accent }}>
						{meta.glyph}
					</span>
					<span className="tracking-[0.12em] uppercase">{meta.label}</span>
				</span>
				<span aria-hidden className="flex-1 h-px bg-[#fff2ca]/[0.08]" />
				<span className="tabular-nums shrink-0 text-white/50">
					{count} {count === 1 ? "session" : "sessions"}
					{rolledUp && <span className="text-white/30"> · {model.direct} direct</span>}
				</span>
				{state.pinned ? (
					<IconButton
						label="Close (Esc)"
						onClick={() => peek.close({ restoreFocusTo: state.anchor })}
						className="-mr-1"
					>
						<CloseIcon size={12} strokeWidth={2} />
					</IconButton>
				) : (
					<span
						aria-hidden
						title="⌥-click or p to pin"
						className="grid -mr-0.5 size-5 place-items-center text-white/20"
					>
						<Pin size={10} strokeWidth={2} />
					</span>
				)}
			</motion.div>

			{/* 易武  Yiwu                     ⌐ 2000–2020 */}
			<motion.div variants={row} className="flex items-end min-w-0 gap-3 -mt-1">
				<h2 className="flex items-baseline min-w-0 gap-2" data-peek-title>
					{hanzi && (
						<span lang="zh" className="text-lg leading-none shrink-0 text-white/45">
							{hanzi}
						</span>
					)}
					<span
						className={cn(
							"min-w-0 text-white break-words line-clamp-2",
							target.kind === "descriptor"
								? "font-fira-code text-lg leading-tight"
								: "font-rock-3d text-[22px] leading-[1.05]"
						)}
					>
						{display}
					</span>
					{toned && <span className="sr-only">{toned}</span>}
				</h2>
				<span className="flex-1" />
				{stats.years && (
					<span
						className="mb-0.5 text-[10px] tabular-nums whitespace-nowrap text-white/40"
						title="vintages"
					>
						⌐{" "}
						{stats.years[0] === stats.years[1]
							? stats.years[0]
							: `${stats.years[0]}–${stats.years[1]}`}
					</span>
				)}
			</motion.div>

			{toned && (
				<motion.p variants={row} aria-hidden className="-mt-2 text-[11px] text-white/40">
					{toned}
				</motion.p>
			)}

			<KindBody model={model} index={index} detail={detail} peek={peek} row={row} accent={accent} />

			{detail?.description && (
				<motion.p
					variants={row}
					className="text-[11px] leading-[1.55] text-white/60 line-clamp-3"
					title={detail.description}
				>
					{detail.description}
				</motion.p>
			)}

			{count > 0 && <Centroid model={model} engaged={engaged} row={row} />}

			{count > 0 && <Sessions model={model} peek={peek} row={row} />}

			<Actions model={model} peek={peek} row={row} index={index} />
		</motion.div>
	)
}

// ---------------------------------------------------------------------------
// Kind bodies
// ---------------------------------------------------------------------------

/** Any kind's details, as the card reads them (each kind fills its own fields). */
type PeekDetail = OriginPeekDetail &
	Omit<VesselPeekDetail, "description"> & { place?: string; website?: string }

type BodyProps = {
	model: PeekModel
	index: RelationIndex
	detail: PeekDetail | undefined
	peek: PeekController
	row: Variants
	accent: string
}

function KindBody(props: BodyProps) {
	switch (props.model.target.kind) {
		case "origin":
			return <OriginBody {...props} />
		case "vendor":
			return <VendorBody {...props} />
		case "style":
			return <StyleBody {...props} />
		case "category":
			return <CategoryBody {...props} />
		case "cultivar":
			return <CultivarBody {...props} />
		case "descriptor":
			return <DescriptorBody {...props} />
		case "vessel":
			return <VesselBody {...props} />
	}
}

/** Xishuangbanna › Mengla · 1,100–1,900 m, then the map inset slot. */
function OriginBody({ model, detail, peek, row }: BodyProps) {
	const trail = model.ancestors.slice(-2)
	const elevation = detail?.elevation
	return (
		<>
			{(trail.length > 0 || elevation || model.node?.pinyin) && (
				<motion.div
					variants={row}
					className="flex flex-wrap items-center -mt-2 gap-x-1 gap-y-0.5 text-[11px] text-white/45"
				>
					{trail.map((node, i) => (
						<span key={node.slug} className="inline-flex items-center gap-1">
							{i > 0 && <Sep />}
							<WalkButton node={node} peek={peek} kind="origin" />
						</span>
					))}
					{model.node?.pinyin && (
						<span className="text-white/30">
							{trail.length > 0 && <Dot />}
							{model.node.pinyin}
						</span>
					)}
					{elevation && (
						<span className="tabular-nums text-white/45">
							<Dot />
							{formatRange(elevation)} m
						</span>
					)}
				</motion.div>
			)}
			<motion.div variants={row}>
				<OriginInset model={model} detail={detail} />
			</motion.div>
		</>
	)
}

/**
 * The origin's map strip (plan §3.1, §4.5, §4.7): a preview of the terrain map on the origin's
 * detail patch (`/maps/detail/[slug].json`, fetched on first open) with contours drawing on 12 ms
 * per band, borders and atlas labels, the §4.1 precision marker and one ring per session in its
 * liquor. No gestures here: a click grows it into the origin page's hero, which pans and zooms.
 * Origins too coarse for a patch (provinces, countries) keep the surveyed point alone: the
 * marker, the rings and the coordinate as a comment.
 */
function OriginInset({
	model,
	detail,
}: {
	model: PeekModel
	detail: OriginPeekDetail | undefined
}) {
	const reduce = useReducedMotion() ?? false
	const W = 296
	const H = 84
	const cx = W / 2
	const cy = H / 2 - 4
	const placed = detail?.lat != null && detail?.lon != null && model.node?.originKind !== "unknown"
	const rings = model.stats.liquor.slice(0, 12)
	// concentric, one per session: a 12-ring target fits the 84 px inset with air between rings
	const ringStep = Math.min(3.4, 30 / Math.max(1, rings.length))
	const precision = detail?.precision ?? model.node?.originKind ?? "unknown"
	const label = [model.node?.hanzi, model.title].filter(Boolean).join(" ")
	const slug = model.node?.slug ?? model.target.key
	const caption = placed ? (
		<div className="absolute inset-x-2.5 bottom-1.5 flex items-end justify-between gap-2 text-[9.5px] leading-none text-white/40 pointer-events-none">
			<span className="truncate map-label">
				{`// ${label}`}
				{detail?.elevation ? ` · ${formatRange(detail.elevation)} m` : ""}
			</span>
			<span className="tabular-nums shrink-0 text-white/30">
				{formatLatLon(detail!.lat!, detail!.lon!)}
				{detail?.radius_km ? ` ±${detail.radius_km} km` : ""}
			</span>
		</div>
	) : null

	if (placed && hasDetail([{ slug }])) {
		return (
			<div
				data-slot="origin-map-inset"
				className="relative overflow-hidden rounded-[5px] ring-1 ring-inset ring-white/[0.07]"
			>
				<OriginMap
					origins={[{ slug, title: model.title, hanzi: model.node?.hanzi ?? null }]}
					rings={rings}
					gardens={detail?.elevation ?? null}
					accent={rings[0] ?? LIQUOR_FALLBACK.hex}
					variant="peek"
					drawKey={slug}
					href={entityHref("origin", slug)}
					className="w-full h-[84px]"
					recordingKey="peek-origin-inset"
				>
					{caption}
				</OriginMap>
			</div>
		)
	}

	if (!placed) {
		return (
			<div
				data-slot="origin-map-inset"
				className="relative h-[52px] overflow-hidden rounded-[5px] ring-1 ring-inset ring-white/[0.07]"
			>
				<Hatch className="absolute inset-0 w-full h-full" spacing={6} />
				<span className="absolute inset-y-0 left-3 flex items-center text-[10px] text-white/45">
					{"// unsurveyed · no point on the map"}
				</span>
				<span className="absolute inset-y-0 flex items-center right-4 text-[13px] text-[#fff2ca]/50">
					?
				</span>
			</div>
		)
	}

	const draw = (i: number) =>
		reduce
			? { initial: { opacity: 0 }, animate: { opacity: 1 } }
			: {
					initial: { pathLength: 0, opacity: 0 },
					animate: { pathLength: 1, opacity: 1 },
					transition: { duration: 0.3, ease: EASE, delay: 0.08 + i * 0.012 },
			  }

	return (
		<div
			data-slot="origin-map-inset"
			className="relative overflow-hidden rounded-[5px] ring-1 ring-inset ring-white/[0.07]"
		>
			<svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden>
				{/* graticule through the point */}
				<g stroke={CREAM} strokeOpacity={0.06} strokeWidth={1} strokeDasharray="2 3">
					<line x1={0} x2={W} y1={cy} y2={cy} vectorEffect="non-scaling-stroke" />
					<line x1={cx} x2={cx} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
				</g>
				{/* precision marker (§4.1) */}
				{precision === "village" ? (
					<circle cx={cx} cy={cy} r={2} fill={CREAM} fillOpacity={0.85} />
				) : precision === "province" || precision === "country" ? (
					<motion.ellipse
						cx={cx}
						cy={cy}
						rx={64}
						ry={30}
						fill="none"
						stroke={CREAM}
						strokeOpacity={0.3}
						strokeDasharray="1 3"
						{...draw(0)}
					/>
				) : (
					<motion.circle
						cx={cx}
						cy={cy}
						r={precision === "county" || precision === "prefecture" ? 34 : 28}
						fill="none"
						stroke={CREAM}
						strokeOpacity={0.28}
						strokeDasharray="3 3"
						{...draw(0)}
					/>
				)}
				{/* one ring per session, in its liquor */}
				{rings.map((color, i) => (
					<motion.circle
						key={i}
						cx={cx}
						cy={cy}
						r={4 + i * ringStep}
						fill="none"
						stroke={color}
						strokeWidth={1}
						strokeOpacity={0.9}
						style={{ rotate: -90, transformOrigin: `${cx}px ${cy}px` }}
						{...draw(i + 1)}
					/>
				))}
			</svg>
			{caption}
		</div>
	)
}

/** Logo, city, site; what they sell (category mix) and where they source. */
function VendorBody({ model, index, detail, peek, row }: BodyProps) {
	const categories = useMemo(
		() => related(index, "vendor", model.target.key, "category"),
		[index, model.target.key]
	)
	const origins = useMemo(
		() => related(index, "vendor", model.target.key, "origin", { rollup: false }).slice(0, 3),
		[index, model.target.key]
	)
	const site = detail?.website ? hostOf(detail.website) : null
	const total = categories.reduce((n, c) => n + c.count, 0)

	return (
		<>
			<motion.div variants={row} className="flex items-center gap-3 -mt-1">
				<Logo src={model.node?.image} title={model.title} />
				<div className="flex flex-col min-w-0 gap-0.5 text-[11px]">
					{detail?.place && <span className="truncate text-white/60">{detail.place}</span>}
					{site && detail?.website && (
						<a
							href={detail.website}
							target="_blank"
							rel="noopener"
							className="inline-flex items-center gap-1 truncate rounded-sm outline-none text-white/45 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
						>
							<span aria-hidden className="text-white/30">
								↗
							</span>
							{site}
						</a>
					)}
				</div>
			</motion.div>
			{total > 0 && (
				<motion.div variants={row} className="space-y-1.5">
					<MixBar
						parts={categories.map((c) => ({ key: c.node.slug, color: c.node.color, n: c.count }))}
						total={total}
					/>
					<div className="flex flex-wrap gap-1">
						{categories.slice(0, 4).map((c) => (
							<WalkChip key={c.node.slug} node={c.node} count={c.count} peek={peek} />
						))}
					</div>
				</motion.div>
			)}
			{origins.length > 0 && (
				<motion.div variants={row} className="flex flex-wrap items-center gap-1 text-[10px]">
					<span className="mr-1 text-white/30">sources</span>
					{origins.map((o) => (
						<WalkChip key={o.node.slug} node={o.node} count={o.count} peek={peek} />
					))}
				</motion.div>
			)}
		</>
	)
}

/** Category stripe, then the cultivars it's made from. */
function StyleBody({ model, index, peek, row, accent }: BodyProps) {
	const category = model.ancestors[model.ancestors.length - 1]
	const cultivars = useMemo(
		() => related(index, "style", model.target.key, "cultivar").slice(0, 4),
		[index, model.target.key]
	)
	return (
		<>
			{category && (
				<motion.div variants={row}>
					<Stripe color={category.color || accent}>
						<WalkButton node={category} peek={peek} kind="category" />
					</Stripe>
				</motion.div>
			)}
			{cultivars.length > 0 && (
				<motion.div variants={row} className="flex flex-wrap items-center gap-1 text-[10px]">
					<span className="mr-1 text-white/30">cultivars</span>
					{cultivars.map((c) => (
						<WalkChip key={c.node.slug} node={c.node} count={c.count} peek={peek} />
					))}
				</motion.div>
			)}
		</>
	)
}

/** Color stripe and the styles within it, by sessions. */
function CategoryBody({ model, index, peek, row, accent }: BodyProps) {
	const styles = useMemo(
		() =>
			(index.children.category.get(model.target.key) ?? [])
				.map((slug) => index.nodes.style.get(slug))
				.filter((n): n is EntityNode => !!n)
				.sort((a, b) => b.all.length - a.all.length || a.title.localeCompare(b.title)),
		[index, model.target.key]
	)
	return (
		<>
			<motion.div variants={row}>
				<Stripe color={accent}>
					<span className="text-white/60">
						{styles.length} {styles.length === 1 ? "style" : "styles"} tasted
					</span>
				</Stripe>
			</motion.div>
			{styles.length > 0 && (
				<motion.div variants={row} className="flex flex-wrap gap-1">
					{styles.slice(0, 6).map((st) => (
						<WalkChip key={st.slug} node={st} count={st.all.length} peek={peek} />
					))}
					{styles.length > 6 && (
						<span className="self-center text-[10px] text-white/30">+{styles.length - 6}</span>
					)}
				</motion.div>
			)}
		</>
	)
}

/** Styles it makes and where it grows. */
function CultivarBody({ model, index, peek, row }: BodyProps) {
	const styles = useMemo(
		() => related(index, "cultivar", model.target.key, "style").slice(0, 4),
		[index, model.target.key]
	)
	const origins = useMemo(
		() => related(index, "cultivar", model.target.key, "origin", { rollup: false }).slice(0, 3),
		[index, model.target.key]
	)
	return (
		<>
			{styles.length > 0 && (
				<motion.div variants={row} className="flex flex-wrap items-center gap-1 text-[10px]">
					<span className="mr-1 text-white/30">styles</span>
					{styles.map((s) => (
						<WalkChip key={s.node.slug} node={s.node} count={s.count} peek={peek} />
					))}
				</motion.div>
			)}
			{origins.length > 0 && (
				<motion.div variants={row} className="flex flex-wrap items-center gap-1 text-[10px]">
					<span className="mr-1 text-white/30">grown</span>
					{origins.map((o) => (
						<WalkChip key={o.node.slug} node={o.node} count={o.count} peek={peek} />
					))}
				</motion.div>
			)}
		</>
	)
}

/**
 * The 7-stage bar: in how many sessions the word turns up at each stage (dry leaf → cha qi),
 * plus the words it keeps company with (each one walks the card).
 */
function DescriptorBody({ model, peek, row, accent }: BodyProps) {
	const reduce = useReducedMotion() ?? false
	const term = model.target.key
	const { stages, companions } = useMemo(() => {
		// the term's own plural / singular spellings aren't company
		const self = descriptorRegex(term, "iu")
		const stages = Object.fromEntries(NOTE_STAGES.map((s) => [s, 0])) as Record<NoteStage, number>
		const company = new Map<string, number>()
		for (const s of model.sessions) {
			const fields = new Set(findDescriptorMatches({ notes: s.notes }, term).map((m) => m.field))
			for (const stage of NOTE_STAGES) if (fields.has(stage)) stages[stage]++
			for (const d of extractDescriptors(s.notes)) {
				if (d.term === term || self?.test(d.term) || d.term.length < 3 || /^\d/.test(d.term))
					continue
				company.set(d.term, (company.get(d.term) ?? 0) + 1)
			}
		}
		const companions = [...company]
			.filter(([, n]) => n >= 2)
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, 5)
		return { stages, companions }
	}, [model.sessions, term])
	const max = Math.max(1, ...Object.values(stages))

	return (
		<>
			<motion.div
				variants={row}
				className="grid grid-cols-7 gap-1"
				role="list"
				aria-label="By stage"
			>
				{NOTE_STAGES.map((stage, i) => {
					const n = stages[stage]
					return (
						<div
							key={stage}
							role="listitem"
							className="flex flex-col items-center gap-1"
							title={`${NOTE_STAGE_META[stage].title}: ${n} ${n === 1 ? "session" : "sessions"}`}
						>
							<div className="relative w-full h-9 rounded-[2px] bg-white/[0.04] overflow-hidden">
								{n > 0 && (
									<motion.div
										className="absolute inset-x-0 bottom-0 origin-bottom rounded-[2px]"
										style={{
											height: `${(n / max) * 100}%`,
											backgroundColor: accent,
											opacity: 0.75,
										}}
										initial={reduce ? { opacity: 0 } : { scaleY: 0 }}
										animate={reduce ? { opacity: 0.75 } : { scaleY: 1 }}
										transition={
											reduce
												? { duration: 0.2 }
												: { type: "spring", stiffness: 520, damping: 38, delay: 0.1 + i * 0.03 }
										}
									/>
								)}
							</div>
							<NoteStageIcon
								stage={stage}
								className={cn("size-3", n > 0 ? "text-white/55" : "text-white/20")}
							/>
						</div>
					)
				})}
			</motion.div>
			{companions.length > 0 && (
				<motion.div variants={row} className="flex flex-wrap items-center gap-1 text-[10px]">
					<span className="mr-1 text-white/30">often with</span>
					{companions.map(([word, n]) => (
						<Chip
							key={word}
							label={word}
							count={n}
							onClick={() => peek.retarget({ kind: "descriptor", key: word })}
							title={`Peek ‘${word}’`}
						/>
					))}
				</motion.div>
			)}
		</>
	)
}

/**
 * A vessel (plan §3.5): the vessel in use beside its shape, body and volume; the mean brew of
 * every session poured from it; and when it was in rotation, on the whole log's timeline.
 */
function VesselBody({ model, index, detail, row, accent }: BodyProps) {
	const profile = useMemo(() => brewProfile(model.sessions), [model.sessions])
	const domain = useMemo(() => timeDomain(index.sessions), [index.sessions])
	const facts = brewFacts(profile)
	const spec = [detail?.kind, detail?.material, detail?.volume_ml ? `${detail.volume_ml} ml` : null]
		.filter(Boolean)
		.join(" · ")
	return (
		<>
			<motion.div variants={row} className="flex items-center gap-3 -mt-1">
				<VesselPhoto
					src={detail?.image ?? model.node?.image}
					kind={detail?.kind}
					title={model.title}
					color={accent}
					glyphClassName="w-4/5"
					className="rounded-[5px] size-11 shrink-0"
				/>
				{spec && <span className="min-w-0 text-[11px] leading-snug text-white/60">{spec}</span>}
			</motion.div>
			{facts.length > 0 && (
				<motion.dl variants={row} className="grid grid-cols-4 gap-1">
					{facts.map((f) => (
						<div
							key={f.k}
							title={f.title}
							className="px-2 py-1.5 rounded-[4px] bg-black/20 shadow-well"
						>
							<dt className="text-[9px] uppercase tracking-[0.12em] text-white/30">{f.k}</dt>
							<dd className="text-[11px] tabular-nums text-white/75">{f.v}</dd>
						</div>
					))}
				</motion.dl>
			)}
			{domain && model.sessions.length > 0 && (
				<motion.div variants={row} className="space-y-1">
					<span className="text-[10px] text-white/30">in rotation</span>
					<UseStrip sessions={model.sessions} domain={domain} recordingKey="peek-vessel-use" />
				</motion.div>
			)}
		</>
	)
}

// ---------------------------------------------------------------------------
// Centroid, sessions, actions
// ---------------------------------------------------------------------------

/** ◔ what this entity tastes like: the mean radar of its sessions, and the mean rating. */
function Centroid({ model, engaged, row }: { model: PeekModel; engaged: boolean; row: Variants }) {
	const { stats } = model
	const axes = dominantAxes(stats)
	const color = stats.liquor[0] ?? LIQUOR_FALLBACK.hex
	return (
		<motion.div
			variants={row}
			className="flex items-center gap-3 py-2 pl-1 pr-2 rounded-md bg-black/20 shadow-well"
		>
			<span className="text-[#fff2ca]/70" title={engaged ? "finish" : "start"}>
				<FlavorGlyph axes={stats.centroid} color={color} active={engaged} size={52} />
			</span>
			<div className="flex flex-col min-w-0 gap-1 text-[10px]">
				<span className="tracking-[0.12em] uppercase text-white/30">
					flavor centroid
					{stats.count > 1 && <span className="normal-case tracking-normal"> · {stats.count}</span>}
				</span>
				<span className="truncate text-[11px] text-white/70">
					{axes.length
						? axes.map((a) => a.replace(/_/g, " ")).join(" · ")
						: "quiet across the board"}
				</span>
			</div>
			<span className="flex-1" />
			{stats.avgRating != null && (
				<span className="flex flex-col items-end gap-0.5 shrink-0">
					<span className="text-[9px] uppercase tracking-[0.12em] text-white/30">avg</span>
					<span className="text-sm leading-none tabular-nums text-white">
						{formatRating(Math.round(stats.avgRating * 10) / 10)}
					</span>
				</span>
			)}
		</motion.div>
	)
}

/** ▪ up to three sessions, liquor swatch first; draggable onto the radar to compare. */
function Sessions({ model, peek, row }: { model: PeekModel; peek: PeekController; row: Variants }) {
	const current = useAtomValue(sessionSlugAtom)
	const setCompare = useSetAtom(compareSlugAtom)
	const { shown, more } = featuredSessions(model.sessions, current)
	return (
		<motion.ul variants={row} className="-mx-1 space-y-px">
			{shown.map((s) => {
				const href = buildLink(s)
				const year = s.production_year ? Math.trunc(Number(s.production_year)) : null
				const isCurrent = s._slug === current
				return (
					<li key={s._slug} className="relative group/row">
						<Link
							href={href}
							draggable
							onDragStart={(e) => setSessionDragData(e.dataTransfer, s._slug, href)}
							className="flex items-center h-7 gap-2 pl-1 pr-8 text-[11px] rounded-[4px] outline-none text-white/75 hover:bg-white/[0.05] hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
							title={current && !isCurrent ? "Open · drag onto the radar to compare" : "Open"}
						>
							<span
								aria-hidden
								className="w-1.5 h-4 rounded-[2px] shrink-0 ring-1 ring-inset ring-black/20"
								style={{ backgroundColor: sessionColor(s) }}
							/>
							<span className="w-8 tabular-nums shrink-0 text-white/35">{year ?? "—"}</span>
							<span className="min-w-0 truncate">{s.title}</span>
							{isCurrent && <span className="shrink-0 text-white/30">· this</span>}
							<span className="flex-1" />
							{isRated(s.rating) && (
								<span className="tabular-nums shrink-0 text-white/35 transition-opacity group-hover/row:opacity-0 group-focus-within/row:opacity-0">
									{formatRating(Math.round(s.rating * 10) / 10)}
								</span>
							)}
						</Link>
						{current && !isCurrent && (
							<button
								type="button"
								aria-label={`Compare with ${s.title}`}
								title="Compare on the radar"
								onClick={() => setCompare(s._slug)}
								className="absolute grid -translate-y-1/2 rounded right-1 top-1/2 size-6 place-items-center text-white/50 opacity-0 transition-opacity outline-none hover:text-white hover:bg-white/10 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-white/40 group-hover/row:opacity-100"
							>
								<GitCompareArrows size={12} strokeWidth={2} />
							</button>
						)}
					</li>
				)
			})}
			{more > 0 && (
				<li>
					<button
						type="button"
						onClick={() => peek.filter(model.target)}
						className="h-6 px-1 text-[10px] rounded-[4px] outline-none text-white/35 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40 disabled:hover:text-white/35"
						disabled={!peekFilter(model.target, model.node?.id)}
					>
						+{more} more{peekFilter(model.target, model.node?.id) ? " · show in Explorer" : ""}
					</button>
				</li>
			)}
		</motion.ul>
	)
}

const cardTitle = (el: HTMLElement) =>
	el.closest(`#${PEEK_CARD_ID}`)?.querySelector("[data-peek-title]")

/** [Open yiwu.origin ↵]  [Filter ⇧↵]  [Compare] */
function Actions({
	model,
	peek,
	row,
	index,
}: {
	model: PeekModel
	peek: PeekController
	row: Variants
	index: RelationIndex
}) {
	const { target } = model
	const current = useAtomValue(sessionSlugAtom)
	const setCompare = useSetAtom(compareSlugAtom)
	const setDescriptor = useSetAtom(descriptorAtom)
	const openCommandBar = useSetAtom(openCommandBarAtom)
	// a word listed in two or more sessions has a lexicon page; rarer ones find references
	const word = useMemo(
		() => (target.kind === "descriptor" ? lexiconPageOf(index.sessions, target.key) : null),
		[target, index.sessions]
	)
	const href = word ? lexiconHref(word.slug) : peekHref(target)
	const fileName = word ? `${word.slug}.${PEEK_META.descriptor.label}` : peekFileName(target)
	const filter = peekFilter(target, model.node?.id)
	// Open morphs the card's name (not the button) into the page title
	const openMorph = useMorphClick(
		word ? "descriptor" : isPageKind(target.kind) ? target.kind : "origin",
		word ? word.slug : target.key,
		word || isPageKind(target.kind) ? href : null,
		cardTitle
	)
	const filtered = useFilterActive(target, model.node?.id)
	const candidates = model.sessions.filter((s) => s._slug !== current)

	const compare = () => {
		if (!current || !candidates.length) return
		// Descriptors and vessels go straight to their best-rated session (intended): the compare
		// picker matches teas by name, so a query can't narrow it to "sessions that say ‘camphor’"
		// or "brewed in this gaiwan", and an unfiltered picker would drop the card's context.
		if (candidates.length === 1 || !isPageKind(target.kind) || target.kind === "vessel") {
			setCompare(featuredSessions(candidates, current, 1).shown[0]._slug)
		} else {
			// pick among them with the command bar's own compare picker
			openCommandBar({ scope: "compare", query: model.title })
		}
		peek.close()
	}

	return (
		<motion.div variants={row} className="flex items-center gap-1.5 pt-0.5">
			{href ? (
				<Link
					href={href}
					prefetch={word || peekRouteReady(target) ? undefined : false}
					className={actionClass("primary")}
					title={`Open ${fileName}`}
					// the card's name grows into the page title (route view transition)
					onClick={openMorph}
				>
					<span className="min-w-0 truncate">
						Open <span className="text-white/55">{fileName}</span>
					</span>
					<Kbd>↵</Kbd>
				</Link>
			) : target.kind === "descriptor" ? (
				<button
					type="button"
					className={actionClass("primary")}
					onClick={() => {
						setDescriptor({ term: target.key, pinned: true })
						peek.close()
					}}
					title="Find references (pin across sessions)"
				>
					<span className="truncate">Find refs</span>
					<Kbd>↵</Kbd>
				</button>
			) : null}
			{filter && (
				<button
					type="button"
					aria-pressed={filtered}
					onClick={() => peek.filter(target)}
					className={cn(actionClass(), filtered && "text-white ring-white/30 bg-white/[0.08]")}
					title={filtered ? "Remove the Explorer filter" : "Filter the Explorer"}
				>
					{filtered ? "Filtered" : "Filter"}
					<Kbd>⇧↵</Kbd>
				</button>
			)}
			<button
				type="button"
				disabled={!current || !candidates.length}
				onClick={compare}
				className={actionClass()}
				title={
					current
						? candidates.length
							? "Overlay on this session's radar"
							: "Nothing else to compare"
						: "Open a session to compare"
				}
			>
				<GitCompareArrows size={11} strokeWidth={2} aria-hidden />
				Compare
			</button>
		</motion.div>
	)
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

function actionClass(variant: "primary" | "plain" = "plain") {
	return cn(
		"inline-flex items-center min-w-0 h-7 gap-1.5 px-2 text-[11px] rounded-[5px] outline-none whitespace-nowrap",
		"ring-1 ring-inset shadow-key active:shadow-well transition-[color,background-color,box-shadow] duration-150",
		"focus-visible:ring-white/50 disabled:opacity-35 disabled:pointer-events-none",
		variant === "primary"
			? "flex-1 justify-between text-white ring-[#fff2ca]/15 bg-[#fff2ca]/[0.06] hover:bg-[#fff2ca]/[0.1] hover:ring-[#fff2ca]/25"
			: "shrink-0 text-white/65 ring-white/[0.08] hover:text-white hover:bg-white/[0.06] hover:ring-white/20"
	)
}

function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="font-fira-code text-[9px] leading-none px-1 py-0.5 rounded-[3px] text-white/40 bg-white/[0.05] shadow-key">
			{children}
		</kbd>
	)
}

function IconButton({
	label,
	onClick,
	className,
	children,
}: {
	label: string
	onClick: () => void
	className?: string
	children: ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className={cn(
				"grid rounded size-5 place-items-center shrink-0 text-white/45 outline-none hover:text-white hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-white/40",
				className
			)}
		>
			{children}
		</button>
	)
}

/** An entity inside the card: clicking walks the card to it (Back returns). */
function WalkChip({
	node,
	count,
	peek,
}: {
	node: EntityNode
	count?: number
	peek: PeekController
}) {
	return (
		<Chip
			label={node.title}
			count={count}
			color={node.color}
			glyph={PEEK_META[node.kind as PeekTarget["kind"]]?.glyph}
			onClick={() => peek.retarget({ kind: node.kind as PeekTarget["kind"], key: node.slug })}
			title={`Peek ${node.title}`}
		/>
	)
}

function Chip({
	label,
	count,
	color,
	glyph,
	onClick,
	title,
}: {
	label: string
	count?: number
	color?: string | null
	glyph?: string
	onClick: () => void
	title?: string
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className="inline-flex items-center h-5 max-w-full gap-1 px-1.5 text-[10px] rounded-[4px] outline-none text-white/70 ring-1 ring-inset ring-white/[0.06] bg-white/[0.025] shadow-key-soft transition-colors hover:text-white hover:ring-white/20 hover:bg-white/[0.06] focus-visible:ring-white/50"
		>
			{glyph && (
				<span aria-hidden className="text-white/35" style={color ? { color } : undefined}>
					{glyph}
				</span>
			)}
			<span className="truncate">{label}</span>
			{count !== undefined && count > 1 && (
				<span className="tabular-nums text-white/30">{count}</span>
			)}
		</button>
	)
}

/** A crumb inside the card (parent origin, a style's category): walks the card to it. */
function WalkButton({
	node,
	peek,
	kind,
}: {
	node: EntityNode
	peek: PeekController
	kind: PeekTarget["kind"]
}) {
	return (
		<button
			type="button"
			onClick={() => peek.retarget({ kind, key: node.slug })}
			title={`Peek ${node.title}`}
			className="rounded-sm outline-none text-white/55 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
		>
			{node.title}
		</button>
	)
}

/** A category's color as a field with a hairline edge, label set on it. */
function Stripe({ color, children }: { color: string; children: ReactNode }) {
	const reduce = useReducedMotion() ?? false
	return (
		<div className="relative flex items-center h-7 px-2.5 overflow-hidden text-[11px] rounded-[5px] ring-1 ring-inset ring-white/[0.06]">
			<motion.span
				aria-hidden
				className="absolute inset-0 origin-left"
				style={{
					background: `linear-gradient(90deg, color-mix(in oklab, ${color} 34%, transparent), color-mix(in oklab, ${color} 6%, transparent) 70%)`,
				}}
				initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
				animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
				transition={{ duration: 0.45, ease: EASE, delay: 0.06 }}
			/>
			<span
				aria-hidden
				className="relative w-[3px] h-3.5 mr-2 rounded-full"
				style={{ backgroundColor: color }}
			/>
			<span className="relative min-w-0 truncate">{children}</span>
		</div>
	)
}

/** Share of sessions per category, as one segmented bar in category colors. */
function MixBar({
	parts,
	total,
}: {
	parts: { key: string; color?: string | null; n: number }[]
	total: number
}) {
	const reduce = useReducedMotion() ?? false
	return (
		<div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-white/[0.04]" aria-hidden>
			{parts.map((p, i) => (
				<motion.span
					key={p.key}
					className="h-full origin-left first:rounded-l-full last:rounded-r-full"
					style={{
						width: `${(p.n / total) * 100}%`,
						backgroundColor: p.color || LIQUOR_FALLBACK.hex,
					}}
					initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
					animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
					transition={{ duration: 0.4, ease: EASE, delay: 0.08 + i * 0.04 }}
				/>
			))}
		</div>
	)
}

/** Vendor mark: logo on a hairline ring, or its initial set like a maker's mark. */
function Logo({ src, title }: { src?: string | null; title: string }) {
	const [failed, setFailed] = useState<string | null>(null)
	const show = !!src && failed !== src
	return (
		<span
			aria-hidden
			className="grid overflow-hidden rounded-full place-items-center size-9 shrink-0 ring-1 ring-white/15 bg-white/[0.04] text-sm leading-none text-white/55"
		>
			{show ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={src}
					alt=""
					loading="lazy"
					onError={() => setFailed(src)}
					className="object-cover w-full h-full"
				/>
			) : (
				title.trim()[0]?.toUpperCase()
			)}
		</span>
	)
}

const Sep = () => (
	<span aria-hidden className="text-white/20">
		›
	</span>
)
const Dot = () => (
	<span aria-hidden className="mx-1 text-white/20">
		·
	</span>
)

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US")

function formatRange([min, max]: [number, number]): string {
	return min === max ? fmtInt(min) : `${fmtInt(min)}–${fmtInt(max)}`
}

function formatLatLon(lat: number, lon: number): string {
	const ns = lat >= 0 ? "N" : "S"
	const ew = lon >= 0 ? "E" : "W"
	return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`
}

function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname.replace(/^www\./, "")
	} catch {
		return null
	}
}
