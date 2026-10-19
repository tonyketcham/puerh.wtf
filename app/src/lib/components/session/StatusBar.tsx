"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { AnimatePresence, motion, useReducedMotion, useTransform } from "motion/react"
import {
	activeSteepAtom,
	currentLiquorAtom,
	flavorPhaseAtom,
	flavorPhaseMotion,
	flavorPhaseSourceAtom,
	openCommandBarAtom,
	sessionAtom,
	steepsAtom,
} from "@/lib/store/sessionAtom"
import { formatSeconds, formatTemp, ratio } from "@/lib/steeps"
import { vintageAgeYears } from "@/lib/age"
import { cn } from "@/lib/utils/cn"
import SlidingText from "./SlidingText"
import { requestSteepAtom } from "./readingState"

const PHASE_TICKS = 5

/**
 * VS Code-style status bar fixed to the bottom of the viewport on session pages.
 * Height is var(--statusbar-h) (28px while [data-statusbar-layout] is in the DOM); the
 * Explorer, Properties panel and main content already inset themselves by that var.
 *
 * Left:  [liquor block: active steep · planned time] [brewing: °C / °F · g / ml · ratio · vessel]
 * Right: [vintage age] [session date] [flavor phase start ▸▸▸ finish] [liquor swatch + hex] [⌘K]
 */
export default function StatusBar() {
	const session = useAtomValue(sessionAtom)
	const liquor = useAtomValue(currentLiquorAtom)
	const steeps = useAtomValue(steepsAtom)
	const active = useAtomValue(activeSteepAtom)
	const requestSteep = useSetAtom(requestSteepAtom)
	const openCommandBar = useSetAtom(openCommandBarAtom)
	const reduce = useReducedMotion() ?? false

	// vintage age depends on "now": compute after mount so SSR and hydration agree
	const [now, setNow] = useState<Date | null>(null)
	const [isMac, setIsMac] = useState(true)
	useEffect(() => {
		setNow(new Date())
		setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
	}, [])

	const brewing = session?.brewing
	const temp = formatTemp(brewing?.temperature)
	const leafRatio = ratio(brewing?.material_amount, brewing?.liquid_amount)
	const grams = brewing?.material_amount
	const ml = brewing?.liquid_amount
	const vessel = brewing?.vessel?.trim()

	const activeSteep = steeps.find((s) => s.n === active) ?? null
	const total = steeps.reduce((max, s) => Math.max(max, s.n), 0)
	const age = now ? vintageAgeYears(session?.production_year, now) : null
	const date = useMemo(() => formatDate(session?.date), [session?.date])

	const brewParts = [
		temp && `${temp.c}°C / ${temp.f}°F`,
		(grams || ml) && [grams && `${trimNum(grams)}g`, ml && `${trimNum(ml)}ml`].filter(Boolean).join(" / "),
		leafRatio,
		vessel,
	].filter(Boolean) as string[]

	return (
		<footer
			className={cn(
				"fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-between h-[var(--statusbar-h)]",
				"border-t border-white/[0.07] bg-[#161416] font-fira-code text-[11px] leading-none text-white/55",
				"overflow-hidden"
			)}
			aria-label="Session status"
		>
			<AnimatePresence initial={false}>
				{session && (
					<motion.div
						key="status"
						className="flex items-stretch justify-between flex-1 min-w-0"
						initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
						transition={{ type: "spring", stiffness: 420, damping: 34 }}
					>
						<div className="flex items-stretch min-w-0">
							{/* liquor block: the debugger-mode corner of an IDE, tinted with this tea */}
							<Segment
								as="button"
								title={steeps.length ? "Next steep  ( ] )" : "No steeps for this session"}
								onClick={() => requestSteep({ kind: "step", delta: 1 })}
								disabled={!steeps.length}
								className="pl-3 pr-3 font-medium text-[var(--liquor-ink,#121012)] bg-[var(--liquor,#8a8a8a)] transition-[background-color,color] duration-500 hover:brightness-110 hover:bg-[var(--liquor,#8a8a8a)]"
							>
								<SteepIcon />
								{activeSteep == null ? (
									<span>steep —</span>
								) : activeSteep.n === 0 ? (
									<span>rinse</span>
								) : (
									<span className="inline-flex items-center">
										steep&nbsp;
										<SlidingText value={activeSteep.n} />
										<span className="opacity-60">/{total}</span>
										{activeSteep.seconds > 0 && (
											<>
												<span className="opacity-60">&nbsp;·&nbsp;</span>
												<SlidingText
													value={activeSteep.seconds}
													text={formatSeconds(activeSteep.seconds)}
												/>
											</>
										)}
									</span>
								)}
							</Segment>

							{brewParts.length > 0 && (
								<Segment title="Brewing parameters" className="min-w-0">
									<span className="truncate">
										{brewParts.map((part, i) => (
											<span key={i}>
												{i > 0 && <Sep />}
												{part}
											</span>
										))}
									</span>
								</Segment>
							)}
						</div>

						<div className="flex items-stretch shrink-0">
							{age != null && (
								<Segment title={`Vintage ${session.production_year}`}>
									aged {formatAge(age)}
								</Segment>
							)}
							{date && <Segment title="Session date">{date}</Segment>}
							<PhaseSegment />
							<LiquorSegment hex={liquor.hex} measured={liquor.measured} />
							<Segment
								as="button"
								title="Command bar"
								onClick={() => openCommandBar({})}
								className="pr-3 text-white/35"
							>
								<kbd className="font-fira-code">{isMac ? "⌘K" : "Ctrl K"}</kbd>
							</Segment>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</footer>
	)
}

// ---------------------------------------------------------------------------

function Segment({
	as = "div",
	children,
	className,
	title,
	onClick,
	disabled,
}: {
	as?: "div" | "button"
	children: ReactNode
	className?: string
	title?: string
	onClick?: () => void
	disabled?: boolean
}) {
	const base = cn(
		"relative flex items-center gap-1.5 px-2.5 whitespace-nowrap transition-colors duration-150",
		as === "button" &&
			"cursor-pointer outline-none hover:bg-white/[0.06] hover:text-white/85 focus-visible:bg-white/[0.08] focus-visible:text-white disabled:cursor-default disabled:hover:bg-transparent",
		className
	)
	if (as === "button") {
		return (
			<button type="button" className={base} title={title} onClick={onClick} disabled={disabled}>
				{children}
			</button>
		)
	}
	return (
		<div className={cn(base, "hover:bg-white/[0.03] hover:text-white/75")} title={title}>
			{children}
		</div>
	)
}

function Sep() {
	return <span className="px-1.5 text-white/20">·</span>
}

function SteepIcon() {
	// a tiny gaiwan: lid, bowl, saucer
	return (
		<svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0" fill="none" stroke="currentColor">
			<path d="M4.5 2.5h3M3 4.5h6M2.5 4.5c0 2.4 1.6 4 3.5 4s3.5-1.6 3.5-4M3.5 10h5" strokeLinecap="round" />
		</svg>
	)
}

/** start ▸▸▸▸▸ finish — each tick lights as the radar's phase passes it (motion value, no re-render). */
function PhaseSegment() {
	const phase = useAtomValue(flavorPhaseAtom)
	const source = useAtomValue(flavorPhaseSourceAtom)
	return (
		<div
			role="meter"
			aria-label="Flavor phase"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(phase * 100)}
			title={`Flavor phase ${Math.round(phase * 100)}% · driven by ${source}`}
			className="relative flex items-center gap-1.5 px-2.5 whitespace-nowrap transition-colors duration-150 hover:bg-white/[0.03] hover:text-white/75"
		>
			<span className="text-white/40">start</span>
			<span className="flex" aria-hidden>
				{Array.from({ length: PHASE_TICKS }, (_, i) => (
					<PhaseTick key={i} i={i} />
				))}
			</span>
			<span className="text-white/40">finish</span>
		</div>
	)
}

function PhaseTick({ i }: { i: number }) {
	const lo = i / PHASE_TICKS
	const hi = (i + 1) / PHASE_TICKS
	const opacity = useTransform(flavorPhaseMotion, [lo, hi], [0.18, 1])
	return (
		<motion.span className="text-[var(--liquor-text,#8a8a8a)] -mx-px" style={{ opacity }}>
			▸
		</motion.span>
	)
}

function LiquorSegment({ hex, measured }: { hex: string; measured: boolean }) {
	const [copied, setCopied] = useState(false)
	useEffect(() => {
		if (!copied) return
		const t = window.setTimeout(() => setCopied(false), 1200)
		return () => window.clearTimeout(t)
	}, [copied])
	return (
		<Segment
			as="button"
			title={measured ? "Liquor color, measured from the cup photo · click to copy" : "Liquor color (no cup photo; amber fallback) · click to copy"}
			onClick={() => {
				navigator.clipboard?.writeText(hex).then(
					() => setCopied(true),
					() => {}
				)
			}}
		>
			<span
				aria-hidden
				className="size-2.5 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] transition-colors duration-500"
				style={{ backgroundColor: hex }}
			/>
			<span className="relative inline-grid overflow-hidden">
				<AnimatePresence initial={false} mode="popLayout">
					<motion.span
						key={copied ? "copied" : hex}
						initial={{ y: "100%", opacity: 0 }}
						animate={{ y: "0%", opacity: 1 }}
						exit={{ y: "-100%", opacity: 0 }}
						transition={{ type: "spring", stiffness: 480, damping: 36, mass: 0.6 }}
						className={cn(!copied && "uppercase", !copied && !measured && "italic")}
					>
						{copied ? "copied" : hex}
					</motion.span>
				</AnimatePresence>
			</span>
		</Segment>
	)
}

// ---------------------------------------------------------------------------

function trimNum(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "")
}

function formatAge(years: number): string {
	if (years < 1) return `${Math.max(1, Math.round(years * 12))}mo`
	return `${Math.floor(years)}y`
}

/** "2022-07-06" from an ISO timestamp (date part as logged, no timezone drift). */
function formatDate(date: string | null | undefined): string | null {
	if (!date) return null
	const m = String(date).match(/^(\d{4}-\d{2}-\d{2})/)
	if (m) return m[1]
	const d = new Date(date)
	return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
