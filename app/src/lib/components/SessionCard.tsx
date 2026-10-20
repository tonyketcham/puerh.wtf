import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"
import type { ExplorerSession, SessionPreviewWithFeatureImage } from "../types/session"
import { buildLink } from "../utils/BuildLinkToGivenCollectionNode"
import {
	clamp01,
	formatVintageAge,
	sessionAgeDays,
	vintageAgeAtSession,
	vintageAgeFactor,
	vintageAgeYears,
} from "../age"
import { getLiquorColor, liquorVarsFromColor } from "../liquor"
import { splitOriginTrail } from "../relations"
import { formatTemp, ratio } from "../steeps"
import { cn } from "../utils/cn"
import { radarAccent } from "./dataviz/radar/geometry"
import MiniRadar from "./dataviz/radar/MiniRadar"
import { TapedCard } from "./TornTape"

/**
 * Server component. Ages are computed here, once, from `now` (build/request time on the server)
 * and handed to the client shell as plain numbers, so hydration never sees a different Date.
 * Don't import this from a "use client" module without passing `now`.
 */

type CardSession = SessionPreviewWithFeatureImage & Partial<ExplorerSession>

/**
 * - row: one line of the log (entity pages, lists); folds its radar away when narrow
 * - tile: a wrapper on the shelf, photo on top
 * - wide: a tile in a wide slot; the photo moves beside the text once there's room
 * - hero: the lead session, with the whole spec sheet
 */
export type SessionCardVariant = "row" | "tile" | "wide" | "hero"

interface SessionCardProps {
	/** the Explorer's fields (rating, flavor, origin, brewing) fill the spec when present */
	session: CardSession
	variant?: SessionCardVariant
	/** a margin note in the log's voice, e.g. "first oolong in 5 months" */
	note?: string | null
	/** index in a freshly loaded list: plays the one-time staggered entrance */
	enterIndex?: number
	now?: Date
}

/** Tape yellowing saturates at ~5 years */
const TAPE_MAX_AGE_DAYS = 365.2425 * 5

/**
 * 0..1 tape age: a gentle, slightly eased-in curve (fresh tape stays fresh for a while) that keeps
 * the 3-5 year range distinguishable, which is where most of this log currently sits.
 */
function tapeAgeFactor(days: number | null): number {
	if (days == null) return 0
	return clamp01(days / TAPE_MAX_AGE_DAYS) ** 1.25
}

/** 2022-07-06T… → 2022.07.06 */
const stampDate = (date: string) => date.slice(0, 10).replace(/-/g, ".")

const trimNum = (n: number) => String(Math.round(n * 10) / 10)

/** Where it grew, as one label: the leaf origin, or the deepest place a blend's origins share. */
function originLabel(session: CardSession) {
	const { common, tails } = splitOriginTrail(session.origin)
	const at = common[common.length - 1]
	if (!at) return session.origin_note ? { title: session.origin_note } : null
	return { title: at.title, hanzi: at.hanzi, more: tails.length }
}

/** Everything a layout might show, derived once. */
function cardModel(session: CardSession) {
	const brewing = session.brewing
	const temp = formatTemp(brewing?.temperature)
	const grams = brewing?.material_amount
	const ml = brewing?.liquid_amount
	return {
		liquor: getLiquorColor(session._slug),
		photo: session.images?.[0]?.image ? session.images[0] : null,
		teaStyle: session.style?.[0] ?? null,
		origin: originLabel(session),
		leafAge: formatVintageAge(vintageAgeAtSession(session.production_year, session.date)),
		rating: typeof session.rating === "number" ? session.rating : null,
		flavor: session.flavor_axes ?? null,
		brew: [
			temp && `${temp.c}°C`,
			(grams || ml) &&
				[grams && `${trimNum(grams)}g`, ml && `${trimNum(ml)}ml`].filter(Boolean).join(" / "),
			ratio(grams, ml),
		].filter(Boolean) as string[],
		vessel: session.vessel?.[0]?.title ?? brewing?.vessel ?? null,
		vendor: session.vendor?.[0]?.title ?? null,
		cultivar: session.cultivar?.map((c) => c.title).join(", ") || null,
	}
}

type Model = ReturnType<typeof cardModel>

export default function SessionCard({
	session,
	variant = "row",
	note,
	enterIndex,
	now = new Date(),
}: SessionCardProps) {
	const m = cardModel(session)
	const age = tapeAgeFactor(sessionAgeDays(session.date, now))
	// Curl kicks in past a few years of age on the leaf (factor 0.45 ≈ 4 yrs) and is full by ~25.
	const vintage = vintageAgeFactor(vintageAgeYears(session.production_year, now))
	const curl = clamp01((vintage - 0.45) / 0.5)

	// --liquor-text: the text-safe accent (see liquorTextRgb)
	const style = liquorVarsFromColor(m.liquor) as CSSProperties
	const fill = variant !== "row"
	const props: LayoutProps = { session, m, note }

	return (
		<TapedCard
			enterIndex={enterIndex}
			className={cn(
				"box-border relative w-full border group rounded-xl border-white/[0.07]",
				fill && "h-full"
			)}
			style={style}
			tape={{
				seed: session.id,
				color: m.teaStyle?.category?.color,
				age: Math.round(age * 1000) / 1000,
				curl: Math.round(curl * 1000) / 1000,
			}}
		>
			<Link
				href={buildLink(session)}
				className={cn(
					"@container relative z-0 block overflow-hidden rounded-xl bg-[#171517] outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--liquor-text-rgb)/0.7)]",
					fill && "h-full"
				)}
			>
				{variant === "row" ? (
					<RowLayout {...props} />
				) : variant === "hero" ? (
					<HeroLayout {...props} />
				) : (
					<TileLayout {...props} />
				)}
			</Link>
		</TapedCard>
	)
}

type LayoutProps = { session: CardSession; m: Model; note?: string | null }

/* ---------------------------------------------------------------------------------------------- */

/** One line of the log: photo, the vintage tag over its edge, text, and a radar column when wide. */
function RowLayout({ session, m, note }: LayoutProps) {
	return (
		<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] @lg:grid-cols-[6.5rem_minmax(0,1fr)] @xl:grid-cols-[6.5rem_minmax(0,1fr)_7.5rem] min-h-[5.5rem] @lg:min-h-[6.5rem]">
			<div className="relative">
				<Photo m={m} className="absolute inset-0 border-r" />
				<YearTag
					year={session.production_year}
					className="bottom-2 -right-5 @lg:-right-6 text-[1.05rem] @lg:text-[1.35rem]"
				/>
			</div>

			<div className="flex flex-col min-w-0 gap-1 py-2.5 pl-8 pr-3 @lg:py-3 @lg:pl-10 @lg:pr-4">
				<Meta m={m}>
					<span className="flex-1" />
					{m.leafAge && (
						<span className="hidden @2xl:inline shrink-0 normal-case tracking-normal text-white/30">
							aged {m.leafAge} ·
						</span>
					)}
					<Stamp date={session.date} />
				</Meta>
				<Note note={note} />
				<Title session={session} className="text-base @lg:text-xl truncate" />
				<Excerpt session={session} className="text-xs @lg:text-[13px] line-clamp-2" />
			</div>

			{/* spec column: the cup's shape and the score */}
			<div className="hidden @xl:flex flex-col items-center justify-center gap-1.5 border-l border-dashed border-white/[0.07] px-3">
				<Radar m={m} className="size-[4.25rem]" />
				<Rating rating={m.rating} />
			</div>
		</div>
	)
}

/**
 * A wrapper on the shelf, in three sizes:
 * - on a phone (the home log's `log` container < @xl): a compact row, photo beside the text
 * - on the shelf: photo on top, the vintage tag pinned across its foot, then the label
 * - in a wide slot (the card ≥ @lg): photo beside the text again, the tag crossing that edge,
 *   and room for the brewing specs
 * Outside a `log` container (no home shelf) it stays the compact row.
 */
function TileLayout({ session, m, note }: LayoutProps) {
	return (
		<div className="grid h-full grid-cols-[6rem_minmax(0,1fr)] @xl/log:flex @xl/log:flex-col @xl/log:@lg:grid @xl/log:@lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
			<div className="relative shrink-0">
				<Photo
					m={m}
					className="absolute inset-0 border-r @xl/log:static @xl/log:aspect-[3/2] @xl/log:border-r-0 @xl/log:border-b @xl/log:@lg:absolute @xl/log:@lg:inset-0 @xl/log:@lg:aspect-auto @xl/log:@lg:border-b-0 @xl/log:@lg:border-r"
				/>
				<YearTag
					year={session.production_year}
					className="bottom-2 -right-5 text-[1.05rem] @xl/log:-bottom-3.5 @xl/log:right-auto @xl/log:left-4 @xl/log:text-[1.35rem] @xl/log:@lg:bottom-4 @xl/log:@lg:left-auto @xl/log:@lg:-right-7 @xl/log:@lg:text-[1.75rem]"
				/>
			</div>

			<div className="flex flex-col flex-1 min-w-0 gap-1 py-2.5 pl-8 pr-3 @xl/log:gap-1.5 @xl/log:px-4 @xl/log:pt-6 @xl/log:pb-3 @xl/log:@lg:min-h-[15rem] @xl/log:@lg:pl-12 @xl/log:@lg:pr-6 @xl/log:@lg:pt-5 @xl/log:@lg:pb-4">
				<Meta m={m} />
				<Note note={note} />
				<Title
					session={session}
					className="text-base leading-snug line-clamp-2 @xl/log:text-lg @xl/log:@lg:text-2xl"
				/>
				<Excerpt
					session={session}
					className="text-xs line-clamp-2 @xl/log:line-clamp-3 @xl/log:@lg:text-[13px] @xl/log:@lg:line-clamp-4"
				/>
				<Specs m={m} className="hidden pt-2 @xl/log:@lg:grid" />

				<div className="flex items-center gap-3 pt-2 mt-auto border-t border-dashed border-white/[0.07] @xl/log:pt-2.5">
					<Radar m={m} className="size-8 @xl/log:size-10 @xl/log:@lg:size-14" />
					<Rating rating={m.rating} />
					<span className="flex-1" />
					<span className="text-[10px] leading-none text-right tabular-nums text-white/30">
						{m.leafAge && <span className="block mb-1">aged {m.leafAge}</span>}
						<Stamp date={session.date} />
					</span>
				</div>
			</div>
		</div>
	)
}

/** The lead session: big photo, the vintage in Rock 3D, the excerpt in full, and the spec sheet. */
function HeroLayout({ session, m, note }: LayoutProps) {
	return (
		<div className="flex flex-col h-full @3xl:grid @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
			<div className="relative">
				<Photo
					m={m}
					className="aspect-[3/2] border-b @3xl:aspect-auto @3xl:absolute @3xl:inset-0 @3xl:border-b-0 @3xl:border-r"
				/>
			</div>

			<div className="flex flex-col min-w-0 gap-2 px-5 pt-4 pb-5 @3xl:px-8 @3xl:pt-6 @3xl:pb-6 @3xl:min-h-[24rem]">
				<Meta m={m} />
				{session.production_year && (
					<span
						aria-hidden
						className="block -ml-1 font-rock-3d leading-none text-[3.25rem] @3xl:text-[4.5rem] text-[var(--liquor-text)] origin-bottom-left transition-transform duration-300 ease-out group-hover:-rotate-2"
					>
						{session.production_year}
					</span>
				)}
				<Note note={note} />
				<Title session={session} className="text-2xl leading-tight @3xl:text-3xl" />
				<Excerpt session={session} className="text-[13px] @3xl:text-sm" />

				<div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 pt-4 mt-auto border-t border-dashed border-white/[0.07]">
					<div className="flex flex-col items-center gap-2">
						<Radar m={m} className="size-24 @3xl:size-28" />
						<Rating rating={m.rating} />
					</div>
					<Specs m={m} aged date={session.date} className="grid" />
				</div>
			</div>
		</div>
	)
}

/** The spec sheet: how it was brewed and where it came from, as label / value rows. */
function Specs({
	m,
	aged,
	date,
	className,
}: {
	m: Model
	/** include the leaf's age at tasting */
	aged?: boolean
	date?: string
	className?: string
}) {
	const rows = (
		[
			["aged", aged && m.leafAge && `${m.leafAge} at tasting`],
			["brew", m.brew.length > 0 && m.brew.join(" · ")],
			["vessel", m.vessel],
			["vendor", m.vendor],
			["cultivar", m.cultivar],
			["date", date && <Stamp key="date" date={date} />],
		] as [string, ReactNode][]
	).filter(([, value]) => !!value)
	if (!rows.length) return null
	return (
		<dl
			className={cn(
				"grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[11px] leading-4",
				className
			)}
		>
			{rows.map(([label, value]) => (
				<div key={label} className="contents">
					<dt className="text-white/30">{label}</dt>
					<dd className="truncate tabular-nums text-white/75">{value}</dd>
				</div>
			))}
		</dl>
	)
}

/* ---------------------------------------------------------------------------------------------- */

function Photo({ m, className }: { m: Model; className?: string }) {
	return (
		<div className={cn("relative overflow-hidden border-white/[0.07]", className)}>
			{m.photo ? (
				<img
					src={m.photo.image}
					alt={m.photo.alt}
					className="object-cover w-full h-full image-zoom"
				/>
			) : (
				// no photo: the cup seen from above, filled with this tea's liquor
				<div className="grid w-full h-full place-items-center bg-[rgb(var(--liquor-rgb)/0.07)]">
					<span
						aria-hidden
						className="rounded-full size-12 bg-[var(--liquor)] ring-4 ring-white/[0.07] shadow-[inset_0_0_0_6px_rgb(0_0_0/0.18)] transition-transform duration-500 ease-out group-hover:scale-105"
					/>
				</div>
			)}
			{/* the liquor, as a strip pulled along the photo's foot */}
			<span
				aria-hidden
				className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--liquor)] origin-left scale-x-[0.18] transition-transform duration-500 ease-out group-hover:scale-x-100"
			/>
		</div>
	)
}

/** The vintage on a soot tag, straddling an edge like a wrapper's year sticker. */
function YearTag({
	year,
	className,
}: {
	year: CardSession["production_year"]
	className?: string
}) {
	if (!year) return null
	return (
		<span
			aria-hidden
			className={cn(
				"absolute z-10 px-1.5 pt-1 pb-0.5 leading-none rounded-[3px] border border-[rgb(var(--liquor-text-rgb)/0.35)] bg-[#121012] font-rock-3d text-[var(--liquor-text)] pointer-events-none select-none shadow-[0_2px_8px_rgb(0_0_0/0.6)] transition-transform duration-300 ease-out group-hover:-translate-y-0.5",
				className
			)}
		>
			{year}
		</span>
	)
}

/** style · origin, as a small-caps strip; children trail it (date, age) */
function Meta({ m, children }: { m: Model; children?: ReactNode }) {
	const { teaStyle, origin } = m
	return (
		<p className="flex items-center min-w-0 gap-1.5 text-[10px] leading-4 tracking-[0.12em] uppercase text-white/40 whitespace-nowrap">
			{teaStyle && (
				<span className="flex items-center gap-1.5 shrink-0 text-white/60">
					<span
						aria-hidden
						className="w-[3px] h-2.5 rounded-[1px]"
						style={{ backgroundColor: teaStyle.category?.color || teaStyle.color }}
					/>
					{teaStyle.category?.title ?? teaStyle.title}
				</span>
			)}
			{origin && (
				<>
					<span aria-hidden className="text-white/20">
						·
					</span>
					<span className="truncate">
						{"hanzi" in origin && origin.hanzi && (
							<span className="mr-1 tracking-normal text-white/55">{origin.hanzi}</span>
						)}
						{origin.title}
						{"more" in origin && !!origin.more && (
							<span className="text-white/25"> +{origin.more}</span>
						)}
					</span>
				</>
			)}
			{children}
		</p>
	)
}

function Note({ note }: { note?: string | null }) {
	if (!note) return null
	return (
		<p className="truncate text-[10px] leading-4 text-[rgb(var(--liquor-text-rgb)/0.75)]">
			{`// ${note}`}
		</p>
	)
}

function Title({ session, className }: { session: CardSession; className?: string }) {
	return (
		<h3
			className={cn(
				"text-white/85 transition-colors duration-200 group-hover:text-[var(--liquor-text)] group-has-[:focus-visible]:text-[var(--liquor-text)]",
				className
			)}
		>
			{session.production_year && <span className="sr-only">{session.production_year} </span>}
			{session.title}
		</h3>
	)
}

function Excerpt({ session, className }: { session: CardSession; className?: string }) {
	return (
		<p
			className={cn(
				"leading-relaxed text-white/50 transition-colors duration-200 group-hover:text-white/70",
				className
			)}
		>
			{session.excerpt}
		</p>
	)
}

function Stamp({ date }: { date: string }) {
	return (
		<time dateTime={date} className="tracking-normal shrink-0 tabular-nums text-white/30">
			{stampDate(date)}
		</time>
	)
}

function Radar({ m, className }: { m: Model; className: string }) {
	return m.flavor ? (
		<MiniRadar
			data={m.flavor}
			color={radarAccent(m.liquor)}
			className={cn("shrink-0", className)}
		/>
	) : (
		<span className={cn("grid shrink-0 place-items-center text-[9px] text-white/20", className)}>
			{"// no profile"}
		</span>
	)
}

function Rating({ rating }: { rating: number | null }) {
	if (rating == null) return null
	return (
		<span className="text-[10px] leading-none tabular-nums text-white/25">
			<span className="text-sm text-white/80">{Math.round(rating)}</span>/100
		</span>
	)
}
