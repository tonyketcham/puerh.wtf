"use client"

import Link from "next/link"
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type PointerEvent,
} from "react"
import { useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"
import type { VesselModel } from "./geometry"
import { DEFAULT_PITCH, DEFAULT_YAW, PITCH_MAX, PITCH_MIN, Renderer, type ViewState } from "./render"
import { MOVE_MS, ease, lerpPose, runtime, type Pose } from "./sequence"
import { DRAWINGS } from "./vessels"

/** What the log knows about a drawn vessel (from its content file). */
export interface DrawnVessel {
	slug: string
	title: string
	hanzi: string | null
	kind: string | null
	material: string | null
	volume_ml: number | null
	/** sessions brewed in it, and the latest one's date (YYYY.MM.DD) */
	sessions: number
	lastBrewed: string | null
}

const OUT_MS = 220
const REVEAL_MS = 1300
/** after a drag, a key or a click, the drawing is yours this long before its sequence resumes */
const IDLE_MS = 4000
/** rad/s the turntable always turns at, under the moves between shots */
const DRIFT = 0.09

/** models are deterministic: build each once per page */
const built = new Map<string, VesselModel>()
function modelOf(id: string): VesselModel {
	let m = built.get(id)
	if (!m) {
		m = DRAWINGS.find((d) => d.id === id)!.build()
		built.set(id, m)
	}
	return m
}

/**
 * Wireframe drawings of the log's teaware, traced from session photos. Each runs its turntable
 * (sequence.ts): quick, eased moves between set views, a lid lifting and seating, and then the
 * next drawing takes the stage, its tab's hairline filling as the sequence runs. Drag to turn one,
 * click to lift its lid; it waits for you, then picks its sequence back up.
 */
export default function TeawareDrawing({
	vessels,
	className,
	stageClassName,
}: {
	vessels: DrawnVessel[]
	className?: string
	/** sizes the drawing's stage (its height) */
	stageClassName?: string
}) {
	const reduce = useReducedMotion() ?? false
	const [active, setActive] = useState(0)
	const [lifted, setLifted] = useState(false)
	const [pxPerMm, setPxPerMm] = useState(0)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const boxRef = useRef<HTMLDivElement>(null)
	const barRef = useRef<HTMLSpanElement>(null)

	const spec = DRAWINGS[active]
	const model = useMemo(() => modelOf(spec.id), [spec.id])
	const vessel = vessels.find((v) => v.slug === spec.slug)
	const info = vessel
		? { ...vessel, facts: [vessel.kind, vessel.material, vessel.volume_ml ? `${vessel.volume_ml} ml` : null] }
		: { slug: null, title: spec.info?.title ?? spec.short, hanzi: spec.info?.hanzi ?? null, facts: spec.info?.facts ?? [] }

	// everything the animation loop reads lives in one mutable ref
	const live = useRef({
		view: { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, explode: 0, reveal: 0, alpha: 1 } as ViewState,
		vel: 0,
		lastInput: -Infinity,
		lifted: false,
		hovered: false,
		target: null as VesselModel | null,
		shots: spec.shots,
		accent: spec.accent,
		phase: "in" as "out" | "in" | "still",
		phaseAt: 0,
		/** the sequence: which shot, moving into it or holding it, since when, from where */
		seq: { i: 0, moving: false, at: 0, from: null as Pose | null, paused: false, done: false, drift: 0 },
		dirty: true,
		reduce,
	})
	useEffect(() => {
		live.current.lifted = lifted
		live.current.reduce = reduce
	}, [lifted, reduce])

	// a new vessel: fade the old one out, then draw the new one on from its foot up
	useEffect(() => {
		const l = live.current
		l.target = model
		l.shots = spec.shots
		l.accent = spec.accent
		l.phase = "out"
		l.phaseAt = performance.now()
		l.dirty = true
		setLifted(false)
	}, [model, spec.shots, spec.accent])

	useEffect(() => {
		const canvas = canvasRef.current
		const box = boxRef.current
		if (!canvas || !box) return
		const font = () => `10px ${getComputedStyle(canvas).fontFamily}`
		const renderer = new Renderer(canvas, { accent: live.current.accent, cream: "255 242 202", font: font() })
		let shown: VesselModel | null = null
		let raf = 0
		let last = performance.now()
		let onScreen = true
		let reportedScale = 0

		const size = () => {
			const r = box.getBoundingClientRect()
			renderer.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1))
			live.current.dirty = true
		}
		const ro = new ResizeObserver(size)
		ro.observe(box)
		size()
		const io = new IntersectionObserver(([e]) => {
			onScreen = e.isIntersecting
			if (onScreen) kick()
		})
		io.observe(box)
		document.fonts?.ready.then(() => {
			renderer.setInk({ accent: live.current.accent, cream: "255 242 202", font: font() })
			live.current.dirty = true
		})

		/**
		 * Advances the turntable; returns true while it's driving the camera. The camera never
		 * stops: a steady drift turns it through every hold and every move (and the draw-on), and
		 * the eased moves between shots ride on top of it as accelerations.
		 */
		const run = (now: number, dt: number): boolean => {
			const l = live.current
			const v = l.view
			const s = l.seq
			const shots = l.shots
			if (l.reduce || s.done || l.phase === "out") return false
			if (now - l.lastInput < IDLE_MS) {
				s.paused = true
				return false
			}
			s.drift += DRIFT * dt
			const pose = (p: Pose) => {
				v.yaw = p.yaw + s.drift
				v.pitch = p.pitch
				v.explode = p.explode
			}
			if (s.paused) {
				// pick the sequence back up from wherever the visitor left it
				s.paused = false
				s.moving = true
				s.at = now
				s.from = { yaw: v.yaw - s.drift, pitch: v.pitch, explode: v.explode }
				setLifted(false)
			}
			const shot = shots[s.i]
			// drawing on: drift in the first shot; its hold starts once it's drawn
			if (l.phase === "in") {
				pose(shot)
				return true
			}
			if (s.moving) {
				const dur = shot.move ?? MOVE_MS
				const t = Math.min(1, (now - s.at) / dur)
				pose(lerpPose(s.from!, shot, ease(t)))
				if (t >= 1) {
					s.moving = false
					s.at = now
				}
				progress(now)
				return true
			}
			pose(shot)
			if (now - s.at >= shot.hold) {
				if (s.i === shots.length - 1) {
					// the last view drifts on while the pointer is over the drawing
					if (l.hovered) return true
					s.done = true
					setActive((i) => (i + 1) % DRAWINGS.length)
					return true
				}
				s.i++
				s.moving = true
				s.at = now
				s.from = { yaw: shot.yaw, pitch: shot.pitch, explode: shot.explode }
				return true
			}
			progress(now)
			return true
		}

		/** fills the active tab's hairline with how far through its sequence the drawing is */
		const progress = (now: number) => {
			const bar = barRef.current
			const l = live.current
			if (!bar || l.reduce) return
			const s = l.seq
			const shots = l.shots
			let done = 0
			for (let k = 0; k < s.i; k++) done += shots[k].hold + (k ? shots[k].move ?? MOVE_MS : 0)
			const shot = shots[s.i]
			const move = s.i ? shot.move ?? MOVE_MS : 0
			done += s.moving ? Math.min(move, now - s.at) : move + Math.min(shot.hold, now - s.at)
			bar.style.width = `${Math.min(100, (done / runtime(shots)) * 100)}%`
		}

		const tick = (now: number) => {
			raf = 0
			const l = live.current
			const v = l.view
			const dt = Math.min(0.05, (now - last) / 1000)
			last = now
			let moving = false

			if (l.phase === "out") {
				const t = shown ? (now - l.phaseAt) / OUT_MS : 1
				v.alpha = 1 - Math.min(1, t)
				if (t >= 1 || l.reduce) {
					shown = l.target
					if (shown) renderer.setModel(shown)
					renderer.setInk({ accent: l.accent, cream: "255 242 202", font: font() })
					// each drawing enters in its first shot
					const first = l.shots[0]
					v.yaw = first.yaw
					v.pitch = first.pitch
					v.explode = first.explode
					l.vel = 0
					l.seq = { i: 0, moving: false, at: now, from: null, paused: false, done: false, drift: 0 }
					v.alpha = 1
					v.reveal = l.reduce ? 1.15 : 0
					l.phase = l.reduce ? "still" : "in"
					l.phaseAt = now
					if (barRef.current && !l.reduce) barRef.current.style.width = "0%"
				}
				moving = true
			} else if (l.phase === "in") {
				const t = Math.min(1, (now - l.phaseAt) / REVEAL_MS)
				v.reveal = 1.15 * (1 - (1 - t) ** 3)
				if (t >= 1) {
					l.phase = "still"
					// the first shot's hold starts once it has drawn on
					l.seq.at = now
				}
				moving = true
			}

			// a throw from a drag carries on and dies away
			if (Math.abs(l.vel) > 0.0005) {
				v.yaw += l.vel * dt
				l.vel *= Math.exp(-dt * 3.2)
				moving = true
			} else l.vel = 0

			if (run(now, dt)) moving = true
			else if (l.seq.paused || l.reduce) {
				// in the visitor's hands: the lid follows their click
				const goal = l.lifted ? 1 : 0
				if (Math.abs(v.explode - goal) > 0.001) {
					v.explode += (goal - v.explode) * Math.min(1, dt * (l.reduce ? 60 : 9))
					moving = true
				} else v.explode = goal
				// keep ticking until the sequence can resume
				if (!l.reduce && l.phase === "still" && !l.seq.done) moving = true
			} else if (l.phase === "still" && !l.seq.done && !l.reduce) moving = true

			if (moving || l.dirty) {
				// labels still easing into their lanes keep the loop alive
				l.dirty = renderer.draw(v, !l.reduce)
				// the scale bar follows the fitted scale, without a render per frame
				const scale = renderer.pxPerMm
				if (Math.abs(scale - reportedScale) / (reportedScale || 1) > 0.03 || (!moving && scale !== reportedScale)) {
					reportedScale = scale
					setPxPerMm(scale)
				}
			}
			moving ||= l.dirty
			if (moving) schedule()
		}
		const schedule = () => {
			if (!raf && onScreen) raf = requestAnimationFrame(tick)
		}
		const kick = () => {
			last = performance.now()
			schedule()
		}
		live.current.dirty = true
		kickRef.current = kick
		kick()
		return () => {
			cancelAnimationFrame(raf)
			ro.disconnect()
			io.disconnect()
			kickRef.current = () => {}
		}
	}, [])
	const kickRef = useRef<() => void>(() => {})
	useEffect(() => kickRef.current(), [lifted, model])

	/* ------------------------------------------------------------ input */

	/** the visitor has the drawing: the sequence waits for them */
	const takeOver = () => {
		live.current.lastInput = performance.now()
		live.current.dirty = true
		kickRef.current()
	}
	const drag = useRef<{ x: number; y: number; moved: number; t: number } | null>(null)
	const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId)
		drag.current = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() }
		live.current.vel = 0
		takeOver()
	}
	const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
		const d = drag.current
		if (!d) return
		const dx = e.clientX - d.x
		const dy = e.clientY - d.y
		const now = performance.now()
		const l = live.current
		l.view.yaw += dx * 0.011
		l.view.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, l.view.pitch + dy * 0.006))
		l.vel = (dx * 0.011) / Math.max(0.008, (now - d.t) / 1000)
		d.moved += Math.abs(dx) + Math.abs(dy)
		d.x = e.clientX
		d.y = e.clientY
		d.t = now
		takeOver()
	}
	const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
		const d = drag.current
		drag.current = null
		if (!d) return
		// a release that lingered kills the throw
		if (performance.now() - d.t > 90) live.current.vel = 0
		if (d.moved < 5 && spec.action) {
			// lift from wherever the sequence had the lid
			setLifted(live.current.view.explode < 0.5)
		}
		takeOver()
		e.currentTarget.releasePointerCapture(e.pointerId)
	}
	const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
		const l = live.current
		const step = { ArrowLeft: [-0.2, 0], ArrowRight: [0.2, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[
			e.key
		]
		if (step) {
			e.preventDefault()
			l.view.yaw += step[0]
			l.view.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, l.view.pitch + step[1]))
			takeOver()
		} else if ((e.key === "Enter" || e.key === " ") && spec.action) {
			e.preventDefault()
			setLifted(l.view.explode < 0.5)
			takeOver()
		}
	}

	const dims = model.dims
	const facts = [
		...info.facts,
		model.capacity ? `Ø≈${Math.round(dims.diameter)} H≈${Math.round(dims.height)} mm` : null,
	].filter(Boolean)

	return (
		<figure
			className={cn("relative flex flex-col min-w-0 select-none", className)}
			onPointerEnter={() => (live.current.hovered = true)}
			onPointerLeave={() => {
				live.current.hovered = false
				kickRef.current()
			}}
			data-recording-key="teaware-drawing"
		>
			<div className="flex items-center justify-between gap-3 text-[10.5px]">
				<span className="hidden sm:inline shrink-0 whitespace-nowrap text-white/30 tabular-nums">
					{`// fig. ${String(active + 1).padStart(2, "0")}/${String(DRAWINGS.length).padStart(2, "0")}`}
				</span>
				<div role="tablist" aria-label="Teaware drawings" className="flex min-w-0 gap-3 overflow-x-auto">
					{DRAWINGS.map((d, i) => {
						const on = i === active
						return (
							<button
								key={d.id}
								type="button"
								role="tab"
								aria-selected={on}
								onClick={() => setActive(i)}
								className={cn(
									"relative pb-1 whitespace-nowrap transition-colors",
									on ? "text-white/85" : "text-white/35 hover:text-white/60"
								)}
							>
								{d.short}
								<span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-white/[0.06]" />
								{on && (
									<span
										ref={barRef}
										aria-hidden
										// the loop fills it with the sequence; reduced motion shows it full and stays put
										className="absolute bottom-0 left-0 w-0 h-px motion-reduce:w-full"
										style={{ background: d.accent }}
									/>
								)}
							</button>
						)
					})}
				</div>
			</div>

			<div ref={boxRef} className={cn("relative w-full h-[260px] md:h-[300px] mt-2", stageClassName)}>
				{/* crop marks: the sheet's corners, nothing else of a frame */}
				{["top-0 left-0 border-t border-l", "top-0 right-0 border-t border-r", "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"].map(
					(c) => (
						<span key={c} aria-hidden className={cn("absolute w-2.5 h-2.5 border-white/20", c)} />
					)
				)}
				<canvas
					ref={canvasRef}
					tabIndex={0}
					role="img"
					aria-label={`Wireframe drawing of the ${info.title}${
						spec.action ? ". Drag or use the arrow keys to turn it; press Enter to lift the lid." : ". Drag or use the arrow keys to turn it."
					}`}
					className="absolute inset-0 w-full h-full font-fira-code cursor-grab active:cursor-grabbing touch-pan-y outline-none focus-visible:ring-1 focus-visible:ring-white/20 rounded-sm"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={() => (drag.current = null)}
					onKeyDown={onKeyDown}
				/>
			</div>

			<figcaption className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline mt-2 text-xs gap-x-4 gap-y-1">
				<span className="flex items-baseline min-w-0 gap-2">
					{info.slug ? (
						<Link
							href={`/teaware/${info.slug}`}
							className="text-white/85 hover:text-white underline decoration-white/20 underline-offset-4 hover:decoration-white/50"
						>
							{info.title}
						</Link>
					) : (
						<span className="text-white/85">{info.title}</span>
					)}
					{info.hanzi && <span className="text-white/45">{info.hanzi}</span>}
				</span>
				<ScaleBar pxPerMm={pxPerMm} />
				<span className="col-span-2 tabular-nums text-white/40">{facts.join(" · ")}</span>
				<span className="col-span-2 sm:col-span-1 text-[10.5px] text-white/30">
					{`// ${
						vessel?.sessions
							? `${vessel.sessions} ${vessel.sessions === 1 ? "session" : "sessions"}${
									vessel.lastBrewed ? ` · last brewed ${vessel.lastBrewed}` : ""
							  }`
							: spec.note ?? ""
					}`}
				</span>
				<span className="col-span-2 sm:col-span-1 text-[10.5px] sm:text-right text-white/30">
					{`drag to turn${spec.action ? ` · tap to ${spec.action}` : ""}`}
				</span>
			</figcaption>
		</figure>
	)
}

/**
 * A drawing-office scale bar at the view's fitted scale: the longest round length that stays
 * short, in alternating blocks. Every size here is estimated, so it reads "≈".
 */
function ScaleBar({ pxPerMm }: { pxPerMm: number }) {
	if (!pxPerMm) return <span />
	const mm = [100, 50, 20, 10, 5].find((l) => l * pxPerMm <= 128) ?? 5
	const w = mm * pxPerMm
	const blocks = 5
	return (
		<span className="flex items-center gap-2 text-[10.5px] tabular-nums text-white/40" aria-label={`scale bar: about ${mm} mm`}>
			<svg width={w + 1} height={7} aria-hidden className="block overflow-visible">
				{Array.from({ length: blocks }, (_, i) => (
					<rect
						key={i}
						x={0.5 + (i * w) / blocks}
						y={1.5}
						width={w / blocks}
						height={4}
						fill={i % 2 ? "transparent" : "rgb(255 242 202 / 0.35)"}
						stroke="rgb(255 242 202 / 0.45)"
						strokeWidth={0.75}
					/>
				))}
			</svg>
			{`≈${mm} mm`}
		</span>
	)
}
