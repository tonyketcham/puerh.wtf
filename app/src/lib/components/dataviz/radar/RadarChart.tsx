"use client"

import { hasFinishProfile } from "@/lib/sessionScores"

import {
	AnimatePresence,
	animate,
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
	type AnimationPlaybackControls,
	type MotionValue,
} from "motion/react"
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { FLAVOR_AXES } from "@/lib/types/session"
import {
	CENTER,
	RADIUS,
	VIEWBOX,
	axisAngle,
	clamp,
	formatAxisLabel,
	formatDelta,
	lerpArray,
	pathFor,
	pointsFor,
	polar,
	polygonPoints,
	seriesFor,
	valuesAtPhase,
	withAlpha,
	type Point,
	type RadarAxisData,
	type RadarSeries,
} from "./geometry"

export type { RadarAxisData } from "./geometry"

/** A second tea overlaid as a diff. */
export type RadarCompare = {
	/** stable identity (session slug) — changing it cross-fades to the new shape */
	key: string
	data: RadarAxisData
	/** CSS color for the other tea (see radarCompareAccent) */
	color: string
}

interface RadarChartProps {
	data: RadarAxisData
	recordingKey?: string
	/**
	 * Start → finish blend (0 = start, 1 = finish). The chart springs toward it; never
	 * re-renders per frame. Defaults to a static 0 (start), which is what standalone uses.
	 */
	phase?: MotionValue<number>
	/** Accent for fill/stroke. Defaults to the session liquor (falls back to amber). */
	color?: string
	/** Overlay another tea as a diff at the same phase. */
	compare?: RadarCompare | null
	/** Dashed outline of whichever end (start/finish) is not current. Default true. */
	showGhost?: boolean
}

const DEFAULT_COLOR = "var(--liquor, #F59E0B)"
// light, near-critical follow: the phase writers (gutter, scrubber glide) already spring, so this
// only smooths hard jumps (finger drags, session resets) without stacking a second slow spring
const PHASE_SPRING = { stiffness: 520, damping: 44, mass: 0.9 }
const MORPH_SPRING = { type: "spring", stiffness: 150, damping: 22, mass: 1 } as const
const COMPARE_IN = { type: "spring", stiffness: 170, damping: 22, mass: 1 } as const
const COMPARE_OUT = { type: "spring", stiffness: 320, damping: 34, restDelta: 0.002 } as const
const INSPECT_SPRING = { type: "spring", stiffness: 420, damping: 32 } as const

export default function RadarChart({
	data,
	recordingKey,
	phase,
	color = DEFAULT_COLOR,
	compare = null,
	showGhost = true,
}: RadarChartProps) {
	const reduce = useReducedMotion() ?? false
	const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
	const svgRef = useRef<SVGSVGElement>(null)

	// ------------------------------------------------------------------ axes + data
	const keysSig = Object.keys(data).join(",")
	const axes = useMemo(() => (keysSig ? keysSig.split(",") : [...FLAVOR_AXES]), [keysSig])
	const count = axes.length

	const target = useMemo(() => seriesFor(axes, data), [axes, data])
	const hasFinish = hasFinishProfile(data)
	const targetSig = `${target.s.join(",")}|${target.f.join(",")}`
	const hasChange = target.s.some((s, i) => Math.abs(s - target.f[i]) >= 0.25)

	// ------------------------------------------------------------------ phase (spring-follows the source)
	const fallbackPhase = useMotionValue(0)
	const rawPhase = phase ?? fallbackPhase
	const springPhase = useSpring(rawPhase, PHASE_SPRING)
	const p = reduce ? rawPhase : springPhase

	// ------------------------------------------------------------------ morph between data sets (session → session)
	const morph = useMotionValue(1)
	const fromRef = useRef<RadarSeries>(target)
	const toRef = useRef<RadarSeries>(target)
	const lastSig = useRef(targetSig)
	const morphCtl = useRef<AnimationPlaybackControls | null>(null)

	useEffect(() => {
		if (targetSig === lastSig.current) return
		lastSig.current = targetSig
		morphCtl.current?.stop()
		// snapshot whatever is on screen right now so an interrupted morph continues smoothly
		const m = morph.get()
		const from = toRef.current
		const prev = fromRef.current
		fromRef.current = { s: lerpArray(prev.s, from.s, m), f: lerpArray(prev.f, from.f, m) }
		toRef.current = target
		morph.jump(0)
		if (reduce) {
			morph.jump(1)
			return
		}
		morphCtl.current = animate(morph, 1, MORPH_SPRING)
	}, [targetSig, target, morph, reduce])

	useEffect(() => () => morphCtl.current?.stop(), [])

	const seriesAt = (m: number): RadarSeries =>
		m === 1
			? toRef.current
			: {
					s: lerpArray(fromRef.current.s, toRef.current.s, m),
					f: lerpArray(fromRef.current.f, toRef.current.f, m),
			  }
	const valuesA = (pv: number, m: number) => valuesAtPhase(seriesAt(m), pv)

	const ptsA = useTransform([p, morph], ([pv, m]: number[]) => pointsFor(valuesA(pv, m)))
	const dA = useTransform(ptsA, pathFor)

	// ------------------------------------------------------------------ compare (grows out of the current shape)
	const mix = useMotionValue(0)
	const [shown, setShown] = useState<RadarCompare | null>(compare)
	const shownRef = useRef<RadarCompare | null>(compare)
	const latestCompare = useRef(compare)
	const compareCtl = useRef<AnimationPlaybackControls | null>(null)
	const compareToken = useRef(0)
	const compareKey = compare?.key ?? null

	useEffect(() => {
		latestCompare.current = compare
	})

	useEffect(() => {
		const token = ++compareToken.current
		compareCtl.current?.stop()
		const next = latestCompare.current
		const cur = shownRef.current
		const show = (c: RadarCompare | null) => {
			shownRef.current = c
			setShown(c)
		}
		const go = (to: number, spring: typeof COMPARE_IN | typeof COMPARE_OUT): Promise<void> => {
			if (reduce) {
				mix.jump(to)
				return Promise.resolve()
			}
			const ctl = animate(mix, to, spring)
			compareCtl.current = ctl
			return ctl.then(() => undefined)
		}

		if (next && (!cur || cur.key === next.key)) {
			show(next)
			void go(1, COMPARE_IN)
		} else if (next && cur) {
			void go(0, COMPARE_OUT).then(() => {
				if (token !== compareToken.current) return
				show(next)
				void go(1, COMPARE_IN)
			})
		} else if (!next && cur) {
			void go(0, COMPARE_OUT).then(() => {
				if (token !== compareToken.current) return
				show(null)
			})
		}
	}, [compareKey, reduce, mix])

	useEffect(() => () => compareCtl.current?.stop(), [])

	const compareSeries = useMemo(() => (shown ? seriesFor(axes, shown.data) : null), [axes, shown])
	const ptsB = useTransform([p, morph, mix], ([pv, m, x]: number[]) => {
		const a = valuesA(pv, m)
		if (!compareSeries) return pointsFor(a)
		return pointsFor(lerpArray(a, valuesAtPhase(compareSeries, pv), x))
	})
	const dB = useTransform(ptsB, pathFor)
	const mainFillOpacity = useTransform(mix, [0, 1], [0.15, 0])
	const overlayOpacity = useTransform(mix, [0, 0.35], [0, 1])
	const compareColor = shown?.color ?? color

	// ------------------------------------------------------------------ ghost of the non-current end
	const ghostStart = useTransform(morph, (m) => polygonPoints(seriesAt(m).s))
	const ghostFinish = useTransform(morph, (m) => polygonPoints(seriesAt(m).f))
	// near finish → show where it started; near start → show where it's going
	const ghostStartOpacity = useTransform(
		[p, mix],
		([pv, x]: number[]) => clamp((pv - 0.3) / 0.4, 0, 1) * 0.7 * (1 - x)
	)
	const ghostFinishOpacity = useTransform(
		[p, mix],
		([pv, x]: number[]) => clamp((0.7 - pv) / 0.4, 0, 1) * 0.7 * (1 - x)
	)

	// ------------------------------------------------------------------ intro bookkeeping (data-animations-complete)
	const randomizedDelays = useMemo(() => {
		const baseDelay = 1.0
		const staggerIncrement = 0.1
		const delays = axes.map((_, i) => baseDelay + i * staggerIncrement)
		for (let i = delays.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1))
			;[delays[i], delays[j]] = [delays[j], delays[i]]
		}
		return delays
	}, [axes])
	const maxDelay = Math.max(...randomizedDelays)

	const [completedAnimations, setCompletedAnimations] = useState(new Set<string>())
	// 5 graph circles + axes.length axis lines + 1 radar path + axes.length data points + axes.length labels
	const totalAnimations = 5 + count * 3 + 1

	const handleAnimationComplete = useCallback((animationId: string) => {
		setCompletedAnimations((prev) => {
			if (prev.has(animationId)) return prev
			const next = new Set(prev)
			next.add(animationId)
			return next
		})
	}, [])

	useEffect(() => {
		setCompletedAnimations(new Set())
		svgRef.current?.removeAttribute("data-animations-complete")
		const lastLabelAnimationEnd = maxDelay + 0.4 + (count - 1) * 0.03 + 0.4
		// morphs between sessions settle in well under a second
		const settle = reduce ? 0 : lastLabelAnimationEnd + 0.1
		const fallbackTimer = window.setTimeout(() => {
			svgRef.current?.setAttribute("data-animations-complete", "true")
		}, settle * 1000)
		return () => window.clearTimeout(fallbackTimer)
	}, [count, targetSig, maxDelay, reduce])

	useEffect(() => {
		if (completedAnimations.size >= totalAnimations && svgRef.current) {
			svgRef.current.setAttribute("data-animations-complete", "true")
		}
	}, [completedAnimations.size, totalAnimations])

	// ------------------------------------------------------------------ axis inspector (hover / roving focus)
	const [hoverAxis, setHoverAxis] = useState<number | null>(null)
	const [focusAxis, setFocusAxis] = useState<number | null>(null)
	const [rovingIndex, setRovingIndex] = useState(0)
	const labelRefs = useRef<(SVGGElement | null)[]>([])
	const activeAxis = hoverAxis ?? focusAxis
	const safeActive = activeAxis !== null && activeAxis < count ? activeAxis : null

	const onLabelKeyDown = (e: ReactKeyboardEvent<SVGGElement>, i: number) => {
		let next: number | null = null
		if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % count
		else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + count) % count
		else if (e.key === "Home") next = 0
		else if (e.key === "End") next = count - 1
		else if (e.key === "Escape") {
			e.currentTarget.blur()
			return
		}
		if (next === null) return
		e.preventDefault()
		setRovingIndex(next)
		labelRefs.current[next]?.focus()
	}

	const compareValueAt = useCallback(
		(pv: number, i: number) => (compareSeries ? valuesAtPhase(compareSeries, pv)[i] : null),
		[compareSeries]
	)

	const intro = !reduce

	return (
		<div className="w-full h-full">
			<svg
				ref={svgRef}
				viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
				className="w-full h-full"
				preserveAspectRatio="xMidYMid meet"
				data-recording-key={recordingKey}
				role="group"
				aria-roledescription="radar chart"
				aria-label="Flavor profile"
			>
				{shown && (
					<defs>
						<clipPath id={`${uid}-in-a`}>
							<motion.path d={dA} />
						</clipPath>
						<mask
							id={`${uid}-out-a`}
							maskUnits="userSpaceOnUse"
							x="0"
							y="0"
							width={VIEWBOX}
							height={VIEWBOX}
						>
							<rect x="0" y="0" width={VIEWBOX} height={VIEWBOX} fill="white" />
							<motion.path d={dA} fill="black" />
						</mask>
						<mask
							id={`${uid}-out-b`}
							maskUnits="userSpaceOnUse"
							x="0"
							y="0"
							width={VIEWBOX}
							height={VIEWBOX}
						>
							<rect x="0" y="0" width={VIEWBOX} height={VIEWBOX} fill="white" />
							<motion.path d={dB} fill="black" />
						</mask>
					</defs>
				)}

				{/* Background circles - multiple concentric circles */}
				{[0.2, 0.4, 0.6, 0.8, 1.0].map((scale, i) => (
					<motion.circle
						key={i}
						cx={CENTER}
						cy={CENTER}
						r={RADIUS * scale}
						fill="none"
						stroke="#374151"
						strokeWidth="1"
						opacity="0.4"
						initial={intro ? { opacity: 0, scale: 0.8 } : false}
						animate={{ opacity: 0.4, scale: 1 }}
						transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.05 }}
						onAnimationComplete={() => handleAnimationComplete(`background-circle-${i}`)}
						style={{
							transformBox: "view-box",
							transformOrigin: `${CENTER}px ${CENTER}px`,
							willChange: "transform, opacity",
						}}
					/>
				))}

				{/* Axis lines */}
				{axes.map((axis, i) => {
					const angle = axisAngle(i, count)
					return (
						<motion.line
							key={axis}
							x1={CENTER}
							y1={CENTER}
							x2={CENTER + RADIUS * 1.15 * Math.cos(angle)}
							y2={CENTER + RADIUS * 1.15 * Math.sin(angle)}
							stroke="#4B5563"
							strokeWidth="1"
							opacity="0.6"
							initial={intro ? { pathLength: 0, opacity: 0 } : false}
							animate={{ pathLength: 1, opacity: 0.6 }}
							transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 + i * 0.08 }}
							onAnimationComplete={() => handleAnimationComplete(`axis-line-${i}`)}
							style={{ willChange: "opacity" }}
						/>
					)
				})}

				{/* Ghost: the end of the session that isn't current (dashed) */}
				{showGhost && hasChange && (
					<motion.g
						initial={intro ? { opacity: 0 } : false}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.6, ease: "easeOut", delay: intro ? maxDelay + 0.3 : 0 }}
						aria-hidden
						pointerEvents="none"
					>
						<motion.polygon
							points={ghostStart}
							fill="none"
							strokeWidth="1.25"
							strokeDasharray="2 4"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ stroke: color, opacity: ghostStartOpacity }}
							data-radar-ghost="start"
						/>
						<motion.polygon
							points={ghostFinish}
							fill="none"
							strokeWidth="1.25"
							strokeDasharray="2 4"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ stroke: color, opacity: ghostFinishOpacity }}
							data-radar-ghost="finish"
						/>
					</motion.g>
				)}

				{/* Diff fills: current-only, other-only, shared */}
				{shown && (
					<motion.g style={{ opacity: overlayOpacity }} aria-hidden pointerEvents="none">
						<motion.path
							d={dA}
							mask={`url(#${uid}-out-b)`}
							style={{ fill: color }}
							fillOpacity={0.34}
						/>
						<motion.path
							d={dB}
							mask={`url(#${uid}-out-a)`}
							style={{ fill: compareColor }}
							fillOpacity={0.3}
						/>
						<motion.path d={dB} clipPath={`url(#${uid}-in-a)`} fill="#ffffff" fillOpacity={0.07} />
					</motion.g>
				)}

				{/* Radar shape */}
				<motion.path
					d={dA}
					fillOpacity={mainFillOpacity}
					strokeWidth="2"
					strokeLinejoin="round"
					initial={intro ? { scale: 0, opacity: 0 } : false}
					animate={{ scale: 1, opacity: 1 }}
					transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
					onAnimationComplete={() => handleAnimationComplete("radar-path")}
					style={{
						fill: color,
						stroke: color,
						transformBox: "view-box",
						transformOrigin: `${CENTER}px ${CENTER}px`,
						willChange: "transform, opacity",
					}}
					data-radar-shape="current"
				/>

				{/* Compared tea outline + vertices */}
				{shown && (
					<motion.g style={{ opacity: overlayOpacity }} aria-hidden pointerEvents="none">
						<motion.path
							d={dB}
							fill="none"
							strokeWidth="1.5"
							strokeDasharray="5 3"
							strokeLinejoin="round"
							style={{ stroke: compareColor }}
							data-radar-shape="compare"
						/>
						{axes.map((axis, i) => (
							<Vertex key={axis} pts={ptsB} i={i} r={2.5} color={compareColor} />
						))}
					</motion.g>
				)}

				{/* Axis inspector: start → finish rail (+ compare delta) */}
				<AnimatePresence>
					{safeActive !== null && (
						<AxisInspector
							key={axes[safeActive]}
							i={safeActive}
							count={count}
							start={target.s[safeActive]}
							finish={target.f[safeActive]}
							hasFinish={hasFinish}
							color={color}
							compareColor={shown ? compareColor : null}
							phase={p}
							morph={morph}
							currentAt={(pv, m) => valuesA(pv, m)[safeActive]}
							otherAt={compareSeries ? (pv) => compareValueAt(pv, safeActive) : null}
							reduce={reduce}
						/>
					)}
				</AnimatePresence>

				{/* Data points */}
				{axes.map((axis, i) => (
					<DataPoint
						key={axis}
						pts={ptsA}
						i={i}
						color={color}
						intro={intro}
						delay={randomizedDelays[i]}
						onDone={handleAnimationComplete}
					/>
				))}

				{/* Labels (hover / focus to inspect an axis) */}
				{axes.map((axis, i) => {
					const angle = axisAngle(i, count)
					const labelRadius = RADIUS * 1.25
					const x = CENTER + labelRadius * Math.cos(angle)
					const y = CENTER + labelRadius * Math.sin(angle)
					const textAnchor = anchorFor(angle)
					const isActive = safeActive === i
					const dim = safeActive !== null && !isActive
					const w = axis.length * 7.9 + 10
					const rx =
						textAnchor === "middle" ? x - w / 2 : textAnchor === "start" ? x - 5 : x - w + 5
					const s = target.s[i]
					const f = target.f[i]

					return (
						<motion.g
							key={axis}
							ref={(el: SVGGElement | null) => {
								labelRefs.current[i] = el
							}}
							tabIndex={rovingIndex === i ? 0 : -1}
							role="img"
							aria-label={
								hasFinish
									? `${formatAxisLabel(axis)}: start ${s}, finish ${f} (${formatDelta(f - s)})`
									: `${formatAxisLabel(axis)}: ${s}`
							}
							onPointerEnter={() => setHoverAxis(i)}
							onPointerLeave={() => setHoverAxis((h) => (h === i ? null : h))}
							onFocus={() => {
								setFocusAxis(i)
								setRovingIndex(i)
							}}
							onBlur={() => setFocusAxis((h) => (h === i ? null : h))}
							onKeyDown={(e) => onLabelKeyDown(e, i)}
							initial={false}
							animate={{ opacity: dim ? 0.38 : 1 }}
							transition={{ duration: 0.18, ease: "easeOut" }}
							style={{ outline: "none", cursor: "default" }}
						>
							<rect
								x={rx}
								y={y - 11}
								width={w}
								height={22}
								rx={5}
								fill="transparent"
								stroke={focusAxis === i ? withAlpha("#ffffff", 35) : "transparent"}
								strokeWidth="1"
							/>
							<motion.text
								x={x}
								y={y}
								textAnchor={textAnchor}
								fontSize="13"
								fill="#D1D5DB"
								opacity="0.9"
								dy="0.35em"
								className="font-medium"
								initial={intro ? { opacity: 0, y: 10 } : false}
								animate={{ opacity: 0.9, y: 0 }}
								transition={{
									duration: 0.4,
									ease: "easeOut",
									delay: maxDelay + 0.4 + i * 0.03,
								}}
								onAnimationComplete={() => handleAnimationComplete(`label-${i}`)}
								style={{
									willChange: "opacity, transform",
									fill: isActive ? "#ffffff" : undefined,
									transition: "fill 160ms ease-out",
								}}
							>
								{axis}
							</motion.text>
						</motion.g>
					)
				})}
			</svg>
		</div>
	)
}

// ---------------------------------------------------------------------------

function anchorFor(angle: number): "start" | "middle" | "end" {
	const n = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)
	if (n > Math.PI / 4 && n < (3 * Math.PI) / 4) return "start"
	if (n > (5 * Math.PI) / 4 && n < (7 * Math.PI) / 4) return "end"
	return "middle"
}

function DataPoint({
	pts,
	i,
	color,
	intro,
	delay,
	onDone,
}: {
	pts: MotionValue<Point[]>
	i: number
	color: string
	intro: boolean
	delay: number
	onDone: (id: string) => void
}) {
	const cx = useTransform(pts, (ps: Point[]) => ps[i]?.x ?? CENTER)
	const cy = useTransform(pts, (ps: Point[]) => ps[i]?.y ?? CENTER)
	return (
		<motion.circle
			cx={cx}
			cy={cy}
			r="4"
			stroke="#1F2937"
			strokeWidth="2"
			initial={intro ? { scale: 0, opacity: 0 } : false}
			animate={{ scale: [0, 1.3, 1], opacity: [0, 0.4, 1, 0.8, 1] }}
			transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1], delay }}
			onAnimationComplete={() => onDone(`data-point-${i}`)}
			style={{
				fill: color,
				transformBox: "fill-box",
				transformOrigin: "center",
				willChange: "transform, opacity",
			}}
		/>
	)
}

function Vertex({
	pts,
	i,
	r,
	color,
}: {
	pts: MotionValue<Point[]>
	i: number
	r: number
	color: string
}) {
	const cx = useTransform(pts, (ps: Point[]) => ps[i]?.x ?? CENTER)
	const cy = useTransform(pts, (ps: Point[]) => ps[i]?.y ?? CENTER)
	return (
		<motion.circle
			cx={cx}
			cy={cy}
			r={r}
			stroke="#121012"
			strokeWidth="1.5"
			style={{ fill: color }}
		/>
	)
}

function AxisInspector({
	i,
	count,
	start,
	finish,
	hasFinish,
	color,
	compareColor,
	phase,
	morph,
	currentAt,
	otherAt,
	reduce,
}: {
	i: number
	count: number
	start: number
	finish: number
	hasFinish: boolean
	color: string
	compareColor: string | null
	phase: MotionValue<number>
	morph: MotionValue<number>
	currentAt: (pv: number, m: number) => number
	otherAt: ((pv: number) => number | null) | null
	reduce: boolean
}) {
	const angle = axisAngle(i, count)
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	const rim = polar(i, count, 10 * 1.15)
	const a = polar(i, count, start)
	const b = polar(i, count, finish)
	// perpendicular unit vector for the end ticks
	const nx = -sin
	const ny = cos
	const tick = (pt: Point, len: number) =>
		`M ${pt.x - nx * len} ${pt.y - ny * len} L ${pt.x + nx * len} ${pt.y + ny * len}`
	const moves = Math.abs(finish - start) >= 0.05
	// arrowhead at finish pointing along the direction of change
	const dir = finish >= start ? 1 : -1
	const ax = cos * dir
	const ay = sin * dir
	const arrow = moves
		? `M ${b.x - ax * 5 + nx * 3.5} ${b.y - ay * 5 + ny * 3.5} L ${b.x} ${b.y} L ${
				b.x - ax * 5 - nx * 3.5
		  } ${b.y - ay * 5 - ny * 3.5}`
		: ""

	// label-side readout
	const labelR = RADIUS * 1.25
	const lx = CENTER + labelR * cos
	const ly = CENTER + labelR * sin
	const above = sin < -0.2
	const ty = above ? ly - 17 : ly + 18
	const anchor = anchorFor(angle)

	const vsDelta = useTransform([phase, morph], ([pv, m]: number[]) => {
		if (!otherAt) return ""
		const o = otherAt(pv)
		return o === null ? "" : formatDelta(currentAt(pv, m) - o)
	})

	const spring = reduce ? { duration: 0 } : INSPECT_SPRING

	return (
		<motion.g
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: reduce ? 0 : 0.14, ease: "easeOut" }}
			pointerEvents="none"
			aria-hidden
		>
			{/* highlighted axis */}
			<path
				d={`M ${CENTER} ${CENTER} L ${rim.x} ${rim.y}`}
				stroke="#E5E7EB"
				strokeOpacity="0.45"
				strokeWidth="1"
			/>
			{/* start → finish rail: the blended data point rides on it */}
			<motion.path
				d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
				fill="none"
				strokeWidth="5"
				strokeLinecap="round"
				style={{ stroke: withAlpha(color, 30) }}
				initial={{ pathLength: 0 }}
				animate={{ pathLength: 1 }}
				transition={spring}
			/>
			<motion.path
				d={`${tick(a, 4)} ${moves ? tick(b, 4) : ""} ${arrow}`}
				fill="none"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				style={{ stroke: color }}
				initial={{ opacity: 0, scale: 0.6 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={spring}
			/>
			<motion.text
				x={lx}
				y={ty}
				textAnchor={anchor}
				fontSize="11"
				dy="0.35em"
				className="font-medium tabular-nums"
				initial={{ opacity: 0, y: above ? 4 : -4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={spring}
				style={{ fill: color }}
			>
				{hasFinish ? formatDelta(finish - start) : start}
				<tspan fill="#9CA3AF" fontSize="9.5" dx="4">
					{hasFinish ? (otherAt ? "s→f" : "start→finish") : "recorded"}
				</tspan>
			</motion.text>
			{otherAt && compareColor && (
				<motion.text
					x={lx}
					y={above ? ty - 14 : ty + 14}
					textAnchor={anchor}
					fontSize="11"
					dy="0.35em"
					className="font-medium tabular-nums"
					initial={{ opacity: 0, y: above ? 4 : -4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={spring}
					style={{ fill: compareColor }}
				>
					<motion.tspan>{vsDelta}</motion.tspan>
					<tspan fill="#9CA3AF" fontSize="9.5" dx="4">
						vs other
					</tspan>
				</motion.text>
			)}
		</motion.g>
	)
}
