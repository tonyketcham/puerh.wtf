"use client"

import { Fragment, Suspense, useMemo, useState, type ReactNode } from "react"
import { useAtomValue } from "jotai"
import { motion, useReducedMotion, type Variants } from "motion/react"
import PanelSection from "@/lib/components/containers/PanelSection"
import EntityRef from "@/lib/components/entity/EntityRef"
import Hatch from "@/lib/components/entity/Hatch"
import OriginTrail, { originNoteLabel } from "@/lib/components/entity/OriginTrail"
import { relationIndexAtom, sessionAtom } from "@/lib/store/sessionAtom"
import { ratingRank, sessionColor, type RelationIndex } from "@/lib/relations"
import OriginMap, { hasDetail } from "@/lib/components/map/OriginMap"
import { entityHref } from "@/lib/entities"
import { LIQUOR_FALLBACK } from "@/lib/liquor"
import { formatRating } from "@/lib/sessionSort"
import { formatVintageAge, vintageAgeAtSession } from "@/lib/age"
import type { EntityKind } from "@/lib/entities"
import type { SessionFull } from "@/lib/types/session"
import type { OriginRef } from "@/lib/types/origin"
import { cn } from "@/lib/utils/cn"
import StorageTimeline from "./StorageTimeline"

/** Content ease from the plan's motion tokens (§3): 0.45s on [0.22, 1, 0.36, 1]. */
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * The Properties panel's relational sections (plan §3.4), replacing the old "Metadata" rows:
 *
 * - Provenance: where it grew (origin trail, contour inset, elevation, harvest, picking,
 *   style, cultivar, vintage, storage)
 * - Source: who sold it and what it was brewed in (vendor, listing, vessel)
 * - Record: how it went (rating + rank, author, tags as Explorer filters)
 *
 * Every row staggers in when the session changes (keyed by slug, like the title).
 */
export default function ProvenancePanels() {
	const session = useAtomValue(sessionAtom)
	const index = useAtomValue(relationIndexAtom)
	const reduce = useReducedMotion() ?? false

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

	if (!session) return null

	// Rows restagger per session (keyed by slug, like the title); the map inset is outside the
	// keyed groups so it persists and can pan from the last origin to the next.
	return (
		<div data-recording-key="session-relations">
			<Provenance session={session} index={index} row={row} />
			<Source session={session} index={index} row={row} />
			<Record session={session} index={index} row={row} />
		</div>
	)
}

type SectionProps = { session: SessionFull; index: RelationIndex; row: Variants }

/** A group of rows that stagger in; key it by session slug so it replays on every session. */
function Stagger({
	delay = 0,
	className,
	children,
}: {
	delay?: number
	className?: string
	children: ReactNode
}) {
	const reduce = useReducedMotion() ?? false
	return (
		<motion.div
			initial="hidden"
			animate="show"
			variants={{
				show: {
					transition: { staggerChildren: reduce ? 0 : 0.03, delayChildren: reduce ? 0 : delay },
				},
			}}
			className={className}
		>
			{children}
		</motion.div>
	)
}

const countOf = (index: RelationIndex, kind: EntityKind) => (slug: string) =>
	index.nodes[kind].get(slug)?.all.length

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

function Provenance({ session, index, row }: SectionProps) {
	const origins = (session.origin || []).filter((o): o is OriginRef => !!o)
	// "It's a mystery" and friends: an origin node that only says which region
	const placed = origins.filter((o) => o.kind !== "unknown")
	const region = origins.find((o) => o.kind === "unknown")?.parent?.title
	const style = session.style || []
	const cultivars = session.cultivar || []
	const year = session.production_year ? Math.trunc(Number(session.production_year)) : null
	const ageThen = vintageAgeAtSession(year, session.date)

	return (
		<PanelSection title="Provenance">
			<div className="space-y-4">
				<Stagger key={`trail-${session._slug}`} className="space-y-4 empty:hidden">
					{origins.length > 0 && (
						<motion.div variants={row}>
							<OriginTrail
								origins={origins}
								variant="tree"
								countOf={countOf(index, "origin")}
								recordingKey="provenance-trail"
							/>
						</motion.div>
					)}
					{placed.length === 0 && (
						<motion.div variants={row}>
							<TerraIncognita
								label={
									origins.length
										? `unknown · somewhere in ${region ?? "the region"}`
										: originNoteLabel(session.origin_note)
								}
							/>
						</motion.div>
					)}
				</Stagger>

				{/* origin map inset (plan §3.4, §4.5): between the trail and the property rows */}
				<OriginInset session={session} index={index} origins={placed} />

				<Stagger key={`rows-${session._slug}`} delay={0.06}>
					<dl className="space-y-1.5">
						{session.elevation ? (
							<Prop label="elevation" row={row}>
								{formatMeters(session.elevation)}
								<Dim> ≈ {formatFeet(session.elevation)}</Dim>
							</Prop>
						) : null}
						{harvestText(session) && (
							<Prop label="harvest" row={row} title={session.season_note ?? undefined}>
								{harvestText(session)}
							</Prop>
						)}
						{session.picking && (
							<Prop label="picking" row={row}>
								{session.picking}
							</Prop>
						)}
						{style.length > 0 && (
							<Prop label="style" row={row}>
								<Refs>
									{style.map((st) => (
										<Fragment key={st.id}>
											<EntityRef
												kind="style"
												slug={st._slug || st.id}
												label={st.title}
												color={st.color || st.category?.color}
												count={countOf(index, "style")(st._slug || st.id)}
											/>
											{st.category && (
												<EntityRef
													kind="category"
													slug={st.category._slug}
													label={`‹${st.category.title}›`}
													color={st.category.color}
													variant="crumb"
													glyph={false}
													className="text-[11px]"
												/>
											)}
										</Fragment>
									))}
								</Refs>
							</Prop>
						)}
						{cultivars.length > 0 && (
							<Prop label="cultivar" row={row}>
								<Refs>
									{cultivars.map((c) => (
										<EntityRef
											key={c.id}
											kind="cultivar"
											slug={c._slug}
											label={c.title}
											count={countOf(index, "cultivar")(c._slug)}
										/>
									))}
								</Refs>
							</Prop>
						)}
						{year && (
							<Prop label="vintage" row={row}>
								<Refs>
									<FilterRefs>
										<EntityRef
											kind="year"
											slug={String(year)}
											label={String(year)}
											count={countOf(index, "year")(String(year))}
											recordingKey="provenance-vintage"
										/>
									</FilterRefs>
									{ageThen != null && <Dim>{formatVintageAge(ageThen)} at tasting</Dim>}
								</Refs>
							</Prop>
						)}
						{(session.storage?.length || session.aging_conditions) && (
							<Prop label="storage" row={row}>
								<StorageTimeline
									stints={session.storage}
									vintage={year}
									tasted={session.date}
									raw={session.aging_conditions}
									recordingKey="provenance-storage"
								/>
							</Prop>
						)}
					</dl>
				</Stagger>
			</div>
		</PanelSection>
	)
}

/**
 * The terrain where this tea grew (plan §3.4, §4.5, §4.7): contours draw on low → high, the
 * line at the session's recorded elevation is re-stroked in its liquor and labelled, the point
 * carries its precision marker and the session's ring. The map pans and zooms out to the region
 * (and expands to full screen); arrowing through the Explorer flies between origins (OriginMap
 * keeps one instance across sessions); its caption grows the map into the origin page's hero.
 * Nothing when no placed origin has a detail patch.
 */
function OriginInset({
	session,
	index,
	origins,
}: {
	session: SessionFull
	index: RelationIndex
	origins: OriginRef[]
}) {
	const reduce = useReducedMotion() ?? false
	const mapped = useMemo(
		() => origins.map((o) => ({ slug: o._slug, title: o.title, hanzi: o.hanzi ?? null })),
		[origins]
	)
	if (!hasDetail(mapped)) return null
	const listed = index.bySlug.get(session._slug)
	const color = listed ? sessionColor(listed) : LIQUOR_FALLBACK.hex
	const primary = mapped.find((o) => hasDetail([o])) ?? mapped[0]
	return (
		<motion.div
			initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
		>
			<OriginMap
				origins={[primary, ...mapped.filter((o) => o !== primary)]}
				rings={[color]}
				elevation={session.elevation ?? null}
				accent={color}
				variant="panel"
				drawKey={session._slug}
				href={entityHref("origin", primary.slug)}
				className="w-full aspect-[7/4] rounded-md ring-1 ring-inset ring-white/[0.07]"
				recordingKey="provenance-inset"
			/>
		</motion.div>
	)
}

/**
 * No surveyed origin: the cartographer's hatched "terra incognita" plate with a dotted
 * unknown-area ring (the §4.1 marker for province / unknown precision). The hatch wipes in.
 */
function TerraIncognita({ label }: { label: string }) {
	const reduce = useReducedMotion() ?? false
	return (
		<div
			className="relative h-14 overflow-hidden rounded-md ring-1 ring-inset ring-white/[0.07]"
			data-recording-key="provenance-terra-incognita"
		>
			<motion.div
				aria-hidden
				className="absolute inset-0"
				initial={reduce ? { opacity: 0 } : { clipPath: "inset(0 100% 0 0)" }}
				animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0% 0 0)" }}
				transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
			>
				<Hatch className="w-full h-full" spacing={6} />
			</motion.div>
			<svg
				aria-hidden
				viewBox="0 0 40 40"
				className="absolute -translate-y-1/2 right-3 top-1/2 size-10 text-[#fff2ca]"
				fill="none"
			>
				<motion.circle
					cx={20}
					cy={20}
					r={15}
					stroke="currentColor"
					strokeOpacity={0.35}
					strokeWidth={1}
					strokeDasharray="1.5 3"
					initial={reduce ? false : { pathLength: 0, rotate: -90 }}
					animate={{ pathLength: 1, rotate: 0 }}
					transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
				/>
				<text
					x={20}
					y={24.5}
					textAnchor="middle"
					className="font-fira-code"
					fontSize={13}
					fill="currentColor"
					fillOpacity={0.5}
				>
					?
				</text>
			</svg>
			<div className="absolute inset-y-0 left-0 flex flex-col justify-center pl-3 pr-16">
				<span className="text-[10px] uppercase tracking-[0.14em] text-white/30">
					terra incognita
				</span>
				<span className="text-xs text-white/80">{label}</span>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

function Source({ session, index, row }: SectionProps) {
	const vendors = session.vendor || []
	const listing = session.purchase_link ? parseListing(session.purchase_link) : null
	const vessels = (session.vessel || []).filter((v) => !!v?._slug)
	// the free-text note, for a session whose vessel isn't in the collection
	const note = session.brewing?.vessel?.trim()
	if (!vendors.length && !listing && !vessels.length && !note) return null

	return (
		<PanelSection title="Source">
			<Stagger key={session._slug} delay={0.12}>
				<dl className="space-y-1.5">
					{vendors.length > 0 && (
						<Prop label="vendor" row={row}>
							<Refs>
								{vendors.map((v) => (
									<span key={v._slug} className="inline-flex items-center max-w-full gap-2">
										<VendorLogo src={v.image} title={v.title} />
										<EntityRef
											kind="vendor"
											slug={v._slug}
											label={v.title}
											count={countOf(index, "vendor")(v._slug)}
											recordingKey="source-vendor"
										/>
									</span>
								))}
							</Refs>
						</Prop>
					)}
					{listing && (
						<Prop label="listing" row={row}>
							<a
								href={listing.href}
								target="_blank"
								rel="noopener"
								title={session.purchase_link ?? undefined}
								className="inline-flex items-center max-w-full gap-1 text-white/80 underline decoration-white/20 underline-offset-[3px] transition-colors hover:text-white hover:decoration-white/60 outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded-sm"
							>
								<span aria-hidden className="text-white/40">
									↗
								</span>
								<span className="truncate">{listing.host}</span>
								{listing.archived && <Dim>(archived)</Dim>}
							</a>
						</Prop>
					)}
					{(vessels.length > 0 || note) && (
						<Prop label="vessel" row={row} title={note && vessels.length ? note : undefined}>
							{vessels.length ? (
								<Refs>
									{vessels.map((v) => (
										<EntityRef
											key={v._slug}
											kind="vessel"
											slug={v._slug}
											label={v.title}
											count={countOf(index, "vessel")(v._slug)}
											recordingKey="source-vessel"
										/>
									))}
								</Refs>
							) : (
								note
							)}
						</Prop>
					)}
				</dl>
			</Stagger>
		</PanelSection>
	)
}

/** Vendor mark: a small round logo on a hairline ring. */
function VendorLogo({ src, title }: { src?: string | null; title: string }) {
	// vendors without a logo (or with a dead legacy URL) get their initial, set like a maker's mark
	const [failed, setFailed] = useState<string | null>(null)
	const show = !!src && failed !== src
	return (
		<span
			aria-hidden
			className="grid overflow-hidden rounded-full place-items-center size-5 shrink-0 ring-1 ring-white/15 bg-white/[0.04] text-[10px] leading-none text-white/55"
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
// Record
// ---------------------------------------------------------------------------

function Record({ session, index, row }: SectionProps) {
	const rank = useMemo(() => ratingRank(index, session._slug), [index, session._slug])
	const authors = session.author || []
	const tags = session.tags || []
	const rating = typeof session.rating === "number" ? session.rating : null

	return (
		<PanelSection title="Record">
			<Stagger key={session._slug} delay={0.18}>
				<dl className="space-y-1.5">
					{rating != null && (
						<Prop label="rating" row={row}>
							<span className="flex items-center gap-2.5" data-recording-key="record-rating">
								<span className="text-sm tabular-nums text-white">{formatRating(rating)}</span>
								<RatingMeter value={rating} />
								{rank && (
									<Dim>
										#{rank.rank}
										<span className="text-white/20">/{rank.of}</span>
									</Dim>
								)}
							</span>
						</Prop>
					)}
					{authors.length > 0 && (
						<Prop label="by" row={row}>
							{authors[0].title}
							{authors.length > 1 && (
								<Dim>
									{" "}
									(+
									{authors
										.slice(1)
										.map((a) => a.title)
										.join(", ")}
									)
								</Dim>
							)}
						</Prop>
					)}
					{tags.length > 0 && (
						<Prop label="tags" row={row}>
							<FilterRefs>
								<Refs>
									{tags.map((t) => (
										<EntityRef
											key={t._slug}
											kind="tag"
											slug={t._slug}
											label={t.title}
											color={t.color}
											recordingKey={`record-tag-${t._slug}`}
										/>
									))}
								</Refs>
							</FilterRefs>
						</Prop>
					)}
				</dl>
			</Stagger>
		</PanelSection>
	)
}

const METER_CELLS = 10

/**
 * Ten cells, one per ten points, filled in the liquor's text-safe accent; the last cell fills
 * fractionally (89.96 → eight full, the ninth 99.6%). Cells fill left to right on mount.
 */
function RatingMeter({ value }: { value: number }) {
	const reduce = useReducedMotion() ?? false
	const filled = Math.max(0, Math.min(METER_CELLS, value / (100 / METER_CELLS)))
	return (
		<span
			role="meter"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={value}
			aria-label={`Rating ${formatRating(value)} of 100`}
			className="flex items-center gap-[2px]"
		>
			{Array.from({ length: METER_CELLS }, (_, i) => {
				const fill = Math.max(0, Math.min(1, filled - i))
				return (
					<span
						key={i}
						className="relative block w-[5px] h-2.5 rounded-[1px] bg-white/[0.08] overflow-hidden"
					>
						{fill > 0 && (
							<motion.span
								className="absolute inset-0 origin-left bg-[var(--liquor-text,#edc446)]"
								initial={reduce ? { opacity: 0, scaleX: fill } : { scaleX: 0 }}
								animate={{ opacity: 1, scaleX: fill }}
								transition={
									reduce
										? { duration: 0.2 }
										: { type: "spring", stiffness: 520, damping: 38, delay: 0.15 + i * 0.03 }
								}
							/>
						)}
					</span>
				)
			})}
		</span>
	)
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** One property: dim key on the left, value on the right (rows align to the 24px chip height). */
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
			className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-x-3"
			title={title}
		>
			<dt className="text-[11px] leading-6 text-white/35">{label}</dt>
			<dd className="min-w-0 text-xs leading-6 text-white/80">{children}</dd>
		</motion.div>
	)
}

function Refs({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn("flex flex-wrap items-center gap-1", className)}>{children}</span>
}

/** Filter chips read the URL (useSearchParams), which needs a Suspense boundary in a static export. */
function FilterRefs({ children }: { children: ReactNode }) {
	return <Suspense fallback={null}>{children}</Suspense>
}

function Dim({ children }: { children: ReactNode }) {
	return <span className="text-white/35">{children}</span>
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const formatMeters = (m: number) => `${Math.round(m).toLocaleString("en-US")} m`
const formatFeet = (m: number) =>
	`${(Math.round((m * 3.28084) / 10) * 10).toLocaleString("en-US")} ft`

/** "Spring · Apr · 2018 & 2019", else the raw season note. */
function harvestText(session: SessionFull): string | null {
	const h = session.harvest
	const parts = [
		h?.season ? h.season[0].toUpperCase() + h.season.slice(1) : null,
		h?.month && h.month >= 1 && h.month <= 12 ? MONTHS[h.month - 1] : null,
		h?.years?.length ? h.years.join(" & ") : null,
	].filter(Boolean)
	return parts.length ? parts.join(" · ") : session.season_note || null
}

/** A purchase link as host + href (with the site's ref tag); Wayback links name the original shop. */
function parseListing(url: string): { href: string; host: string; archived: boolean } | null {
	try {
		const parsed = new URL(url)
		const archived = parsed.hostname === "web.archive.org"
		const original = archived ? url.match(/\/web\/[^/]+\/(https?:\/\/.+)$/)?.[1] : null
		const host = new URL(original ?? url).hostname.replace(/^www\./, "")
		if (!archived) parsed.searchParams.set("ref", "puerhwtf")
		return { href: archived ? url : parsed.toString(), host, archived }
	} catch {
		return null
	}
}
