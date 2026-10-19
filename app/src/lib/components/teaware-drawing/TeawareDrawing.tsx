"use client"

import Link from "next/link"
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
} from "react"
import { useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils/cn"
import type { VesselModel } from "./geometry"
import { DEFAULT_PITCH, DEFAULT_YAW, PITCH_MAX, PITCH_MIN, Renderer, type ViewState } from "./render"
import { DRAWINGS } from "./vessels"

/** What the log knows about a drawn vessel (from its content file). */
export interface DrawnVessel {
	slug: string
	title: string
	hanzi: string | null
	kind: string | null
	material: string | null
	volume_ml: number | null
}

/** how long each drawing holds the stage before the next one draws on */
const DWELL_MS = 14000
const SPIN = 0.2 // rad/s while idle
const OUT_MS = 220
const REVEAL_MS = 1300

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
 * Wireframe drawings of the log's teaware, traced from session photos and turning slowly on the
 * page. Drag to turn one, click to lift its lid; they take turns on their own, each tab's hairline
 * filling as its turn runs out (paused while the pointer is over the drawing).
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
	const [hovered, setHovered] = useState(false)
	const [lifted, setLifted] = useState(false)
	const [pxPerMm, setPxPerMm] = useState(0)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const boxRef = useRef<HTMLDivElement>(null)

	const spec = DRAWINGS[active]
	const model = useMemo(() => modelOf(spec.id), [spec.id])
	const vessel = vessels.find((v) => v.slug === spec.slug)
	const info = vessel
		? { ...vessel, facts: [vessel.kind, vessel.material, vessel.volume_ml ? `${vessel.volume_ml} ml` : null] }
		: { slug: null, title: spec.info?.title ?? spec.short, hanzi: spec.info?.hanzi ?? null, facts: spec.info?.facts ?? [] }

	// everything the animation loop reads lives in one mutable ref
	const live = useRef({
		view: { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, explode: 0, reveal: 0, alpha: 1 } as ViewState,
		spin: 0,
		vel: 0,
		lastInput: -Infinity,
		lifted: false,
		target: null as VesselModel | null,
		accent: spec.accent,
		phase: "in" as "out" | "in" | "still",
		phaseAt: 0,
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
		l.accent = spec.accent
		l.phase = "out"
		l.phaseAt = performance.now()
		l.dirty = true
		setLifted(false)
	}, [model, spec.accent])

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

		const size = () => {
			const r = box.getBoundingClientRect()
			renderer.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1))
			setPxPerMm(renderer.pxPerMm)
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
					setPxPerMm(renderer.pxPerMm)
					renderer.setInk({ accent: l.accent, cream: "255 242 202", font: font() })
					// each drawing enters in its own best pose
					v.explode = 0
					v.yaw = DEFAULT_YAW
					v.pitch = shown?.pitch ?? DEFAULT_PITCH
					l.vel = 0
					v.alpha = 1
					v.reveal = l.reduce ? 1.15 : 0
					l.phase = l.reduce ? "still" : "in"
					l.phaseAt = now
				}
				moving = true
			} else if (l.phase === "in") {
				const t = Math.min(1, (now - l.phaseAt) / REVEAL_MS)
				v.reveal = 1.15 * (1 - (1 - t) ** 3)
				if (t >= 1) l.phase = "still"
				moving = true
			}

			// turning: inertia from a drag, else an idle spin that eases back in
			if (Math.abs(l.vel) > 0.0005) {
				v.yaw += l.vel * dt
				l.vel *= Math.exp(-dt * 3.2)
				moving = true
			} else l.vel = 0
			if (!l.reduce) {
				const idle = now - l.lastInput > 2600
				l.spin += ((idle ? SPIN : 0) - l.spin) * Math.min(1, dt * 1.5)
				if (Math.abs(l.spin) > 0.001) {
					v.yaw += l.spin * dt
					moving = true
				}
			}

			const goal = l.lifted ? 1 : 0
			if (Math.abs(v.explode - goal) > 0.001) {
				v.explode += (goal - v.explode) * Math.min(1, dt * (l.reduce ? 60 : 7))
				moving = true
			} else v.explode = goal

			if (moving || l.dirty) {
				// labels still easing into their lanes keep the loop alive
				l.dirty = renderer.draw(v, !l.reduce)
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

	const drag = useRef<{ x: number; y: number; moved: number; t: number } | null>(null)
	const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId)
		drag.current = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() }
		live.current.vel = 0
		live.current.lastInput = performance.now()
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
		l.lastInput = now
		l.dirty = true
		d.moved += Math.abs(dx) + Math.abs(dy)
		d.x = e.clientX
		d.y = e.clientY
		d.t = now
		kickRef.current()
	}
	const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
		const d = drag.current
		drag.current = null
		if (!d) return
		// a release that lingered kills the throw
		if (performance.now() - d.t > 90) live.current.vel = 0
		if (d.moved < 5 && spec.action) setLifted((x) => !x)
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
			l.lastInput = performance.now()
			l.dirty = true
			kickRef.current()
		} else if ((e.key === "Enter" || e.key === " ") && spec.action) {
			e.preventDefault()
			setLifted((x) => !x)
		}
	}

	const next = () => setActive((i) => (i + 1) % DRAWINGS.length)
	const dims = model.dims
	const facts = [
		...info.facts,
		model.capacity ? `Ø≈${Math.round(dims.diameter)} H≈${Math.round(dims.height)} mm` : null,
	].filter(Boolean)

	return (
		<figure
			className={cn("relative flex flex-col min-w-0 select-none", className)}
			onPointerEnter={() => setHovered(true)}
			onPointerLeave={() => setHovered(false)}
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
										key={`${active}`}
										aria-hidden
										// CSS, not the motion hook, decides reduced motion here: no hydration
										// mismatch, and no animation means no animationend, so no auto-advance
										className="absolute bottom-0 left-0 w-0 h-px animate-teaware-dwell motion-reduce:w-full motion-reduce:animate-none"
										style={
											{
												background: d.accent,
												"--dwell": `${DWELL_MS}ms`,
												animationPlayState: hovered || lifted ? "paused" : "running",
											} as CSSProperties
										}
										onAnimationEnd={next}
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
				<span className="col-span-2 sm:col-span-1 text-[10.5px] text-white/30">{`// ${spec.source}`}</span>
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
