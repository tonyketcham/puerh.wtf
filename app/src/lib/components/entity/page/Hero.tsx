"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import Hatch from "@/lib/components/entity/Hatch"
import { cn } from "@/lib/utils/cn"
import type { EntityPageData } from "./data"
import DotMap, { type DotMapPoint } from "./DotMap"
import LeafGlyph, { leafSize } from "./LeafGlyph"
import type { EntityModel } from "./model"

const EASE = [0.22, 1, 0.36, 1] as const
const CREAM = "#fff2ca"

/**
 * The hero under the title (plan §3.2), per kind:
 * - origin: SLOT for the Phase 5 topographic map. Until then, what's surveyed: the point, its
 *   uncertainty circle, one ring per session, and the garden elevations on a scale.
 * - vendor: logo, city, links and a dot-map of the origins they sourced
 * - style / category: the category color as a field, with the description's lead as prose
 * - cultivar: hanzi and the leaf-size glyph beside the lead
 */
export default function Hero({
	data,
	model,
	lead,
	points,
}: {
	data: EntityPageData
	model: EntityModel
	lead?: ReactNode
	points: DotMapPoint[]
}) {
	switch (data.kind) {
		case "origin":
			return <OriginHero data={data} model={model} />
		case "vendor":
			return <VendorHero data={data} model={model} points={points} />
		case "style":
		case "category":
			return <ColorFieldHero data={data} model={model} lead={lead} />
		case "cultivar":
			return <CultivarHero data={data} lead={lead} points={points} model={model} />
	}
}

// ---------------------------------------------------------------------------
// Origin
// ---------------------------------------------------------------------------

const ELEV_MAX = 2600

function OriginHero({ data, model }: { data: EntityPageData; model: EntityModel }) {
	const reduce = useReducedMotion() ?? false
	const geo = data.geo
	const placed = !!geo && data.originKind !== "unknown"
	const rings = model.stats.liquor.slice(0, 14)

	return (
		<div
			data-slot="origin-hero-map"
			className="relative grid overflow-hidden rounded-lg ring-1 ring-inset ring-white/[0.07] sm:grid-cols-[minmax(0,1fr)_220px]"
		>
			{/* ── SLOT: topographic hero map (plan §3.2, §4.5 · Phase 5) ─────────────────────
			    Phase 5 mounts the zoomed contour frame here (Tanaka contours, liquor rings) and
			    morphs the peek inset into it. Until then: the surveyed point, honestly. */}
			<div className="relative h-52">
				{placed ? (
					<svg
						viewBox="0 0 400 208"
						preserveAspectRatio="xMidYMid slice"
						className="absolute inset-0 w-full h-full"
						aria-hidden
					>
						<g stroke={CREAM} strokeOpacity={0.05} strokeWidth={1}>
							{[40, 80, 120, 160, 200, 240, 280, 320, 360].map((x) => (
								<line
									key={x}
									x1={x}
									x2={x}
									y1={0}
									y2={208}
									strokeDasharray="1 4"
									vectorEffect="non-scaling-stroke"
								/>
							))}
							{[34, 69, 104, 139, 174].map((y) => (
								<line
									key={y}
									x1={0}
									x2={400}
									y1={y}
									y2={y}
									strokeDasharray="1 4"
									vectorEffect="non-scaling-stroke"
								/>
							))}
						</g>
						{/* uncertainty: radius_km, drawn to the hero's own 60 px = radius scale */}
						<motion.circle
							cx={200}
							cy={104}
							r={geo!.radius_km ? 64 : 4}
							fill={CREAM}
							fillOpacity={0.025}
							stroke={CREAM}
							strokeOpacity={0.28}
							strokeDasharray={data.originKind === "village" ? undefined : "3 4"}
							vectorEffect="non-scaling-stroke"
							style={{ transformBox: "fill-box", transformOrigin: "center" }}
							initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
						/>
						{rings.map((color, i) => (
							<motion.circle
								key={i}
								cx={200}
								cy={104}
								r={6 + i * Math.min(3.6, 46 / Math.max(1, rings.length))}
								fill="none"
								stroke={color}
								strokeWidth={1.25}
								strokeOpacity={0.9}
								vectorEffect="non-scaling-stroke"
								style={{ rotate: -90, transformBox: "fill-box", transformOrigin: "center" }}
								initial={reduce ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
								animate={reduce ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
								transition={{ duration: 0.45, ease: EASE, delay: 0.3 + i * 0.04 }}
							/>
						))}
						<circle cx={200} cy={104} r={2.2} fill={CREAM} />
						{/* scale bar */}
						{geo!.radius_km > 0 && (
							<g
								transform="translate(24 184)"
								fontSize={10}
								className="font-fira-code"
								fill="#ffffff"
								fillOpacity={0.4}
							>
								<line
									x1={0}
									x2={64}
									y1={0}
									y2={0}
									stroke={CREAM}
									strokeOpacity={0.5}
									vectorEffect="non-scaling-stroke"
								/>
								<line
									x1={0}
									x2={0}
									y1={-3}
									y2={3}
									stroke={CREAM}
									strokeOpacity={0.5}
									vectorEffect="non-scaling-stroke"
								/>
								<line
									x1={64}
									x2={64}
									y1={-3}
									y2={3}
									stroke={CREAM}
									strokeOpacity={0.5}
									vectorEffect="non-scaling-stroke"
								/>
								<text x={72} y={0} dy="0.35em">
									{geo!.radius_km} km
								</text>
							</g>
						)}
					</svg>
				) : (
					<>
						<Hatch className="absolute inset-0 w-full h-full" spacing={7} />
						<span className="absolute text-2xl -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 text-[#fff2ca]/40">
							?
						</span>
					</>
				)}
				<p className="absolute left-4 top-3 text-[10.5px] text-white/40">
					{placed
						? `// ${[data.hanzi, data.title].filter(Boolean).join(" ")} · map lands in phase 5`
						: "// terra incognita: no surveyed point"}
				</p>
			</div>

			<dl className="flex flex-col justify-center gap-3 px-5 py-4 border-t sm:border-t-0 sm:border-l border-white/[0.06] text-xs">
				{placed && (
					<HeroFact label="coords">
						<span className="tabular-nums">
							{fmtLat(geo!.lat)} {fmtLon(geo!.lon)}
						</span>
					</HeroFact>
				)}
				{geo && (
					<HeroFact label="precision">
						{geo.precision}
						{geo.radius_km ? <span className="text-white/40"> ±{geo.radius_km} km</span> : null}
						<span className="text-white/40"> · {geo.confidence}</span>
					</HeroFact>
				)}
				<HeroFact label="gardens">
					<ElevationScale range={geo?.elevation_m ?? null} color={model.accentText} />
				</HeroFact>
				{data.groups.length > 0 && (
					<HeroFact label="groups">
						{data.groups.map((g) => g.replace(/-/g, " ")).join(" · ")}
					</HeroFact>
				)}
			</dl>
		</div>
	)
}

/** 0 → 2,600 m as a vertical-ish ruler laid flat, the garden band lit. */
function ElevationScale({ range, color }: { range: [number, number] | null; color: string }) {
	const reduce = useReducedMotion() ?? false
	if (!range) return <span className="text-white/35">unrecorded</span>
	const [lo, hi] = range
	const left = (Math.min(lo, ELEV_MAX) / ELEV_MAX) * 100
	const width = Math.max(1.5, ((Math.min(hi, ELEV_MAX) - Math.min(lo, ELEV_MAX)) / ELEV_MAX) * 100)
	return (
		<span className="block space-y-1">
			<span className="tabular-nums">
				{lo.toLocaleString("en-US")}
				{hi !== lo && `–${hi.toLocaleString("en-US")}`} m
			</span>
			<span aria-hidden className="relative block h-1.5 rounded-full bg-white/[0.05]">
				{[1000, 2000].map((m) => (
					<span
						key={m}
						className="absolute inset-y-0 w-px bg-white/15"
						style={{ left: `${(m / ELEV_MAX) * 100}%` }}
					/>
				))}
				<motion.span
					className="absolute inset-y-0 rounded-full origin-left"
					style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
					initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
					animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
					transition={{ duration: 0.6, ease: EASE, delay: 0.4 }}
				/>
			</span>
		</span>
	)
}

// ---------------------------------------------------------------------------
// Vendor
// ---------------------------------------------------------------------------

function VendorHero({
	data,
	model,
	points,
}: {
	data: EntityPageData
	model: EntityModel
	points: DotMapPoint[]
}) {
	return (
		<div className="grid overflow-hidden rounded-lg ring-1 ring-inset ring-white/[0.07] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
			<div className="flex items-center gap-4 p-5">
				<Logo src={data.image} title={data.title} />
				<div className="min-w-0 space-y-1.5 text-xs">
					{data.place && <p className="text-white/70">{data.place}</p>}
					{data.links.length > 0 && (
						<ul className="flex flex-wrap gap-x-3 gap-y-1">
							{data.links.map((l) => (
								<li key={l.href}>
									<a
										href={l.href}
										target="_blank"
										rel="noopener"
										className="inline-flex items-center gap-1 rounded-sm outline-none text-white/45 transition-colors hover:text-white focus-visible:ring-1 focus-visible:ring-white/40"
									>
										<span aria-hidden className="text-white/30">
											↗
										</span>
										{l.label}
									</a>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
			<div className="relative border-t sm:border-t-0 sm:border-l border-white/[0.06] min-h-36">
				{points.length ? (
					<>
						<DotMap
							points={points}
							width={360}
							height={150}
							labels={4}
							accent={model.accentText}
							recordingKey="vendor-sourcing-map"
						/>
						<p className="absolute left-4 top-3 text-[10.5px] text-white/40">{"// sourcing"}</p>
					</>
				) : (
					<>
						<Hatch className="absolute inset-0 w-full h-full" spacing={7} />
						<p className="absolute left-4 top-3 text-[10.5px] text-white/45">
							{"// sourcing undisclosed"}
						</p>
					</>
				)}
			</div>
		</div>
	)
}

/** Vendor mark: the logo on a hairline ring, or its initial in Rock 3D when there's none. */
export function Logo({
	src,
	title,
	className,
}: {
	src: string | null
	title: string
	className?: string
}) {
	const [failed, setFailed] = useState<string | null>(null)
	const show = !!src && failed !== src
	return (
		<span
			aria-hidden
			className={cn(
				"grid overflow-hidden rounded-full place-items-center size-16 shrink-0 ring-1 ring-white/15 bg-white/[0.04] font-rock-3d text-3xl leading-none text-white/60",
				className
			)}
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

// ---------------------------------------------------------------------------
// Style / category
// ---------------------------------------------------------------------------

function ColorFieldHero({
	data,
	model,
	lead,
}: {
	data: EntityPageData
	model: EntityModel
	lead?: ReactNode
}) {
	const reduce = useReducedMotion() ?? false
	const color = data.color || model.node?.color || model.accent
	const category = data.kind === "style" ? data.ancestors[0] : null
	return (
		<div className="relative overflow-hidden rounded-lg ring-1 ring-inset ring-white/[0.07]">
			<motion.div
				aria-hidden
				className="absolute inset-0 origin-left"
				style={{
					background: `linear-gradient(100deg, color-mix(in oklab, ${color} 30%, transparent), color-mix(in oklab, ${color} 7%, transparent) 55%, transparent 85%)`,
				}}
				initial={reduce ? { opacity: 0 } : { scaleX: 0, opacity: 0.4 }}
				animate={reduce ? { opacity: 1 } : { scaleX: 1, opacity: 1 }}
				transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
			/>
			<span
				aria-hidden
				className="absolute inset-y-0 left-0 w-[3px]"
				style={{ backgroundColor: color }}
			/>
			<div className="relative px-6 py-5 space-y-3">
				<p className="flex items-center gap-2 text-[10.5px] text-white/50">
					<span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: color }} />
					{category ? (
						<>
							{category.title.toLowerCase()}{" "}
							<span className="text-white/30">· {color.toLowerCase()}</span>
						</>
					) : (
						<>
							{data.children.length} {data.children.length === 1 ? "style" : "styles"}
							<span className="text-white/30">· {color.toLowerCase()}</span>
						</>
					)}
				</p>
				{lead ? (
					<div className="text-[15px] leading-relaxed max-w-prose text-white/80">{lead}</div>
				) : (
					<p className="text-sm text-white/40">{"// no description yet"}</p>
				)}
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Cultivar
// ---------------------------------------------------------------------------

function CultivarHero({
	data,
	model,
	lead,
	points,
}: {
	data: EntityPageData
	model: EntityModel
	lead?: ReactNode
	points: DotMapPoint[]
}) {
	const size = leafSize(data.title)
	return (
		<div className="grid overflow-hidden rounded-lg ring-1 ring-inset ring-white/[0.07] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
			<div className="flex gap-5 px-6 py-5">
				<div className="flex flex-col items-center gap-2 shrink-0">
					{data.hanzi ? (
						<span
							lang="zh"
							className="text-3xl leading-none text-white/70 [writing-mode:vertical-rl]"
						>
							{data.hanzi}
						</span>
					) : null}
					<LeafGlyph size={size} color={model.accentText} className="w-10" />
					<span className="text-[10px] text-white/35">{size ? `${size} leaf` : "leaf ?"}</span>
				</div>
				<div
					className={cn(
						"min-w-0 text-[15px] leading-relaxed text-white/80",
						!lead && "text-sm text-white/40"
					)}
				>
					{lead ?? "// no description yet"}
				</div>
			</div>
			<div className="relative border-t sm:border-t-0 sm:border-l border-white/[0.06] min-h-32">
				{points.length ? (
					<>
						<DotMap points={points} width={300} height={140} labels={3} accent={model.accentText} />
						<p className="absolute left-4 top-3 text-[10.5px] text-white/40">{"// grown"}</p>
					</>
				) : (
					<>
						<Hatch className="absolute inset-0 w-full h-full" spacing={7} />
						<p className="absolute left-4 top-3 text-[10.5px] text-white/45">
							{"// no surveyed gardens"}
						</p>
					</>
				)}
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------

function HeroFact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-2">
			<dt className="text-[10.5px] text-white/35">{label}</dt>
			<dd className="min-w-0 text-white/80">{children}</dd>
		</div>
	)
}

const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}`
const fmtLon = (lon: number) => `${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`
