"use client"

import Link from "next/link"
import localFont from "next/font/local"
import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"
import TeawareDrawing, { type DrawnVessel } from "../teaware-drawing/TeawareDrawing"

/** 普洱茶記 only: a 1.4 KB subset of Noto Sans SC (scripts/hero-font.mjs) */
const heroSc = localFont({
	src: "../../../../static/fonts/Hero_SC/hero-sc.woff2",
	weight: "600",
	display: "block",
})

const EASE = [0.22, 1, 0.36, 1] as const

export interface HeroStats {
	sessions: number
	/** year of the first logged session */
	since: number | null
	/** latest session date, YYYY.MM.DD */
	lastSteeped: string | null
	vintages: [number, number] | null
	origins: number
	vendors: number
	vessels: number
}

/**
 * The home page's masthead, set like a wrapper laid on a drawing-office sheet: a fine-print strip
 * and ruler across the top, the hanzi title column in print red, the Rock 3D title breaking its
 * column, a turning teaware drawing, and a spec strip of what the log holds. Desktop gets the full
 * sheet (its column guides, registration marks); smaller screens stack the same parts.
 */
export default function Hero({ vessels, stats }: { vessels: DrawnVessel[]; stats: HeroStats }) {
	const reduce = useReducedMotion() ?? false
	const enter = (delay: number, y = 10) =>
		reduce
			? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25, delay } }
			: {
					initial: { opacity: 0, y },
					animate: { opacity: 1, y: 0 },
					transition: { duration: 0.7, ease: EASE, delay },
			  }
	const rule = (delay: number) =>
		reduce
			? {}
			: {
					initial: { scaleX: 0 },
					animate: { scaleX: 1 },
					transition: { duration: 0.9, ease: EASE, delay },
			  }

	const years = stats.vintages ? `${stats.vintages[0]}–${String(stats.vintages[1]).slice(2)}` : "—"

	return (
		<section aria-labelledby="hero-title" className="relative isolate pt-2 xl:pt-4">
			{/* registration marks at the sheet's corners */}
			<Reg className="-top-1 -left-3 hidden xl:block" />
			<Reg className="-top-1 -right-3 hidden xl:block" />
			<Reg className="-bottom-3 -left-3 hidden xl:block" />
			<Reg className="-bottom-3 -right-3 hidden xl:block" />

			{/* the fine-print strip, then a ruler */}
			<motion.div
				{...enter(0, 0)}
				className="flex items-baseline justify-between gap-6 pb-2 text-[10.5px] uppercase tracking-[0.16em] text-white/40"
			>
				<span className="flex items-baseline gap-2.5">
					<span aria-hidden className="inline-block w-1.5 h-1.5 translate-y-[-1px] bg-crimson" />
					<span className="text-white/70">puerh.wtf</span>
				</span>
				<span className="hidden md:inline">
					a tea log{stats.since ? <> · kept since {stats.since}</> : null}
				</span>
				<span className="tabular-nums">
					{stats.lastSteeped ? (
						<>
							<span className="hidden sm:inline">last steeped </span>
							{stats.lastSteeped}
						</>
					) : null}
				</span>
			</motion.div>
			<motion.div {...rule(0.05)} className="origin-left">
				<Ruler />
			</motion.div>

			<div className="relative grid grid-cols-1 gap-y-8 pt-6 pb-7 xl:grid-cols-12 xl:gap-x-6 xl:pt-8 xl:pb-8">
				{/* column guides: the sheet's grid, faint, that the title is allowed to break */}
				<div
					aria-hidden
					className="absolute inset-0 hidden pointer-events-none -z-10 xl:grid xl:grid-cols-12 xl:gap-x-6"
				>
					{Array.from({ length: 12 }, (_, i) => (
						<span key={i} className="border-x border-white/[0.028]" />
					))}
				</div>

				<div className="flex flex-col justify-between gap-8 xl:col-span-5">
					<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 xl:gap-x-6">
						{/* the wrapper's title column: 普洱茶記, "pu'er tea record" */}
						<p
							lang="zh-Hant"
							aria-label="普洱茶記, a pu'er tea record"
							className={cn(
								heroSc.className,
								// stacked upright, top to bottom, as a wrapper sets its title column
								"flex flex-col pt-1.5 pr-4 xl:pr-5 border-r border-crimson/40 text-crimson text-[34px] xl:text-[44px] leading-[1.08]"
							)}
						>
							{Array.from("普洱茶記").map((ch, i) => (
								<motion.span
									key={ch}
									className="block"
									initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.25 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={
										reduce
											? { duration: 0.2, delay: 0.1 + i * 0.05 }
											: { type: "spring", stiffness: 520, damping: 26, mass: 0.7, delay: 0.25 + i * 0.09 }
									}
								>
									{ch}
								</motion.span>
							))}
						</p>

						<div className="min-w-0">
							<motion.h2
								id="hero-title"
								{...enter(0.15, 14)}
								className="font-rock-3d text-shadow-lg leading-[0.92] text-[clamp(64px,6.4vw,124px)] [word-spacing:-0.6em] -ml-1"
							>
								<span className="block whitespace-nowrap">A tea</span>
								{/* the second line steps off the first, out past its column */}
								<span className="block whitespace-nowrap pl-[0.9em]">log</span>
							</motion.h2>
							<motion.p
								{...enter(0.35, 6)}
								className="mt-5 xl:mt-6 max-w-[36ch] text-[14px] leading-[1.65] text-white/65"
							>
								…for documenting tea sessions to learn complexities like terroir in retrospect,
								while focusing more on an individual tea.
							</motion.p>
						</div>
					</div>

					<motion.div {...enter(0.5, 0)} className="hidden xl:block space-y-4">
						<Legend />
						<p className="max-w-[46ch] text-[10.5px] leading-relaxed text-white/30">
						{"// every session logs the leaf, the water, the vessel, and a flavor radar read at the start and again at the finish"}
						</p>
					</motion.div>
				</div>

				<motion.div {...enter(0.2, 0)} className="min-w-0 xl:col-span-7">
					<TeawareDrawing vessels={vessels} stageClassName="xl:h-[380px]" />
				</motion.div>
			</div>

			{/* the spec strip: what the log holds */}
			<motion.div {...rule(0.3)} className="h-px origin-left bg-white/[0.09]" />
			<dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
				<Stat i={0} label="sessions" value={stats.sessions} note={stats.since ? `since ${stats.since}` : undefined} />
				<Stat i={1} label="vintages" value={years} note={vintageSpan(stats.vintages)} />
				<Stat i={2} label="origins" value={stats.origins} note="mapped" href="/origins" />
				<Stat i={3} label="vendors" value={stats.vendors} note="bought from" href="/vendors" />
				<Stat i={4} label="vessels" value={stats.vessels} note="on the tray" href="/teaware" />
			</dl>
			<motion.div {...rule(0.4)} className="h-px origin-left bg-white/[0.09]" />
		</section>
	)
}

function vintageSpan(v: [number, number] | null) {
	return v ? `${v[1] - v[0]} years of leaf` : undefined
}

function Stat({
	i,
	label,
	value,
	note,
	href,
}: {
	i: number
	label: string
	value: ReactNode
	note?: string
	href?: string
}) {
	const reduce = useReducedMotion() ?? false
	const body = (
		<>
			<dt className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-white/35">
				{label}
				{href && (
					<span
						aria-hidden
						className="text-white/0 -translate-x-1 transition-all duration-300 group-hover:text-crimson group-hover:translate-x-0"
					>
						→
					</span>
				)}
			</dt>
			<dd className="mt-2 text-[26px] leading-none tracking-tight tabular-nums text-white/85 transition-colors group-hover:text-white">
				{value}
			</dd>
			{note && <dd className="mt-1.5 text-[10.5px] text-white/30">{note}</dd>}
		</>
	)
	const cls = cn(
		"group relative block px-4 py-4 xl:py-5 border-white/[0.07]",
		// hairlines between cells, never on the sheet's outer edge
		i > 0 && "xl:border-l",
		href && "transition-colors hover:bg-white/[0.02]"
	)
	return (
		<motion.div
			initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: reduce ? 0.2 : 0.6, ease: EASE, delay: 0.45 + i * 0.06 }}
		>
			{href ? (
				<Link href={href} className={cls}>
					{body}
				</Link>
			) : (
				<div className={cls}>{body}</div>
			)}
		</motion.div>
	)
}

/** The drawing's line key, drawn with the renderer's own weights and dashes. */
function Legend() {
	const cream = (a: number) => `rgb(255 242 202 / ${a})`
	const rows: { label: string; stroke: string; width: number; dash?: string }[] = [
		{ label: "silhouette, in the body's colour", stroke: cream(0.9), width: 1.35 },
		{ label: "rim, foot, groove", stroke: cream(0.62), width: 0.9 },
		{ label: "lattice", stroke: cream(0.3), width: 0.7 },
		{ label: "hidden", stroke: cream(0.3), width: 0.7, dash: "2.5 3" },
		{ label: "axis", stroke: cream(0.35), width: 0.6, dash: "12 3 2 3" },
	]
	return (
		<dl className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-[10.5px] text-white/35">
			{rows.map((r) => (
				<div key={r.label} className="contents">
					<dt>
						<svg aria-hidden width={44} height={6} className="block">
							<line x1={0} x2={44} y1={3} y2={3} stroke={r.stroke} strokeWidth={r.width} strokeDasharray={r.dash} />
						</svg>
					</dt>
					<dd>{r.label}</dd>
				</div>
			))}
		</dl>
	)
}

/** A registration mark in print red: the sheet's corners, where a printer would line up plates. */
function Reg({ className }: { className?: string }) {
	return (
		<svg aria-hidden width={13} height={13} viewBox="0 0 13 13" className={cn("absolute text-crimson/70", className)}>
			<path d="M6.5 0V13M0 6.5H13" stroke="currentColor" strokeWidth={0.75} />
			<circle cx={6.5} cy={6.5} r={3} fill="none" stroke="currentColor" strokeWidth={0.75} />
		</svg>
	)
}

/** A millimetre ruler: minor ticks every 6 px, majors every 60, as one SVG pattern. */
function Ruler() {
	return (
		<svg aria-hidden className="block w-full h-[9px]">
			<defs>
				<pattern id="hero-ruler" width={60} height={9} patternUnits="userSpaceOnUse">
					<path
						d="M0.5 0V9M6.5 0V3M12.5 0V3M18.5 0V3M24.5 0V3M30.5 0V5.5M36.5 0V3M42.5 0V3M48.5 0V3M54.5 0V3"
						stroke="rgb(255 255 255 / 0.18)"
						strokeWidth={1}
					/>
				</pattern>
			</defs>
			<line x1={0} x2="100%" y1={0.5} y2={0.5} stroke="rgb(255 255 255 / 0.12)" />
			<rect width="100%" height={9} fill="url(#hero-ruler)" />
		</svg>
	)
}
