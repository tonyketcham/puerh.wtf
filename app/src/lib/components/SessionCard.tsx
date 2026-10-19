import Link from "next/link"
import type { CSSProperties } from "react"
import type { SessionPreviewWithFeatureImage } from "../types/session"
import { buildLink } from "../utils/BuildLinkToGivenCollectionNode"
import { clamp01, sessionAgeDays, vintageAgeFactor, vintageAgeYears } from "../age"
import { getLiquorColor, liquorVarsFromColor } from "../liquor"
import { TapedCard } from "./TornTape"

/**
 * Server component. Ages are computed here, once, from `now` (build/request time on the server)
 * and handed to the client shell as plain numbers, so hydration never sees a different Date.
 * Don't import this from a "use client" module without passing `now`.
 */

interface SessionCardProps {
	session: SessionPreviewWithFeatureImage
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

export default function SessionCard({ session, enterIndex, now = new Date() }: SessionCardProps) {
	const liquor = getLiquorColor(session._slug)
	const age = tapeAgeFactor(sessionAgeDays(session.date, now))
	// Curl kicks in past a few years of age on the leaf (factor 0.45 ≈ 4 yrs) and is full by ~25.
	const vintage = vintageAgeFactor(vintageAgeYears(session.production_year, now))
	const curl = clamp01((vintage - 0.45) / 0.5)

	// --liquor-text: the text-safe accent (see liquorTextRgb)
	const style = liquorVarsFromColor(liquor) as CSSProperties
	// a session without photos gets a liquor swatch, never a broken <img>
	const photo = session.images?.[0]?.image ? session.images[0] : null

	return (
		<TapedCard
			enterIndex={enterIndex}
			className="box-border relative w-full border group rounded-2xl border-heicha-500"
			style={style}
			tape={{
				seed: session.id,
				color: session?.style?.[0]?.category?.color,
				age: Math.round(age * 1000) / 1000,
				curl: Math.round(curl * 1000) / 1000,
			}}
		>
			<Link
				href={buildLink(session)}
				className="relative z-0 flex flex-col overflow-hidden divide-y-2 rounded-2xl bg-heicha-700 bg-opacity-40 lg:flex-row lg:divide-y-0 lg:divide-x-2 divide-white/5 outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--liquor-text-rgb)/0.7)]"
			>
				<div className="relative shrink-0 w-full h-32 overflow-hidden lg:w-40">
					{photo ? (
						<img
							src={photo.image}
							alt={photo.alt}
							className="object-cover w-full h-full image-zoom"
						/>
					) : (
						// no photo: the cup seen from above, filled with this tea's liquor
						<div className="grid w-full h-full place-items-center bg-[rgb(var(--liquor-rgb)/0.07)]">
							<span
								aria-hidden
								className="rounded-full size-16 bg-[var(--liquor)] ring-[5px] ring-white/[0.07] shadow-[inset_0_0_0_7px_rgb(0_0_0/0.18)] transition-transform duration-500 ease-out group-hover:scale-105"
							/>
							<span className="absolute text-[10px] left-3 bottom-2 font-fira-code text-white/30">
								{"// no photo"}
							</span>
						</div>
					)}
				</div>
				<div className="p-5">
					<h3 className="space-x-3 text-xl lg:text-2xl">
						{session.production_year && (
							<span className="opacity-80 transition-[color,opacity] duration-200 group-hover:opacity-100 group-hover:text-white group-has-[:focus-visible]:opacity-100 group-has-[:focus-visible]:text-white">
								{session.production_year}
							</span>
						)}
						<span className="opacity-80 transition-[color,opacity] duration-200 group-hover:opacity-100 group-hover:text-[var(--liquor-text)] group-has-[:focus-visible]:opacity-100 group-has-[:focus-visible]:text-[var(--liquor-text)]">
							{session.title}
						</span>
					</h3>
					<p className="mt-2 text-bai-cha-200 opacity-60 transition-opacity duration-200 group-hover:opacity-80 line-clamp-3">
						{session.excerpt}
					</p>
				</div>
			</Link>
		</TapedCard>
	)
}
