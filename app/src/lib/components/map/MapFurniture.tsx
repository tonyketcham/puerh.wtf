"use client"

/**
 * Map furniture computed at runtime (plan §4.7.5): what makes contour art read as a place.
 *
 * - Graticule: meridians and parallels at a step that suits the zoom (10° down to 3′), straight
 *   lines in Mercator, with their degrees printed along the top and left edges
 * - ScaleBar: a cartographer's bar, re-measured every frame at the view's latitude
 * - Readout: the cursor's latitude and longitude (or the map's own coordinate at rest)
 * - Minimap: the East Asia locator in a corner, the view as a rectangle; click to go there
 *
 * Everything here follows the camera without re-rendering: lines live in shared space, edge
 * ticks are pinned to it (camera.ts), and the bar, readout and rectangle are written straight to
 * the DOM. React only hears about it when the graticule's step or extent changes.
 */
import { memo, useEffect, useRef, useState, type RefObject } from "react"
import { motion, type MotionValue } from "motion/react"
import { cn } from "@/lib/utils"
import type { Camera, PinWrite, ViewTick } from "./camera"
import {
	CREAM,
	FRAMES,
	OVERVIEW,
	niceKm,
	SHARED,
	unprojectShared,
	type Box,
	type FrameJson,
	type Point,
} from "./geo"
import { useMapJson } from "./mapData"
import type { Rect } from "./MapLabels"
import type { Graticule } from "./terrainCanvas"

// ---------------------------------------------------------------------------
// Graticule
// ---------------------------------------------------------------------------

const STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
/** shared units per degree of longitude (constant in Mercator) */
const UNITS_PER_DEG = SHARED.forward(103, 25)[0] - SHARED.forward(102, 25)[0]

type Grid = { step: number; ext: Box; lons: number[]; lats: number[] }

function gridFor({ view: [vx, vy, vw, vh], W, upp }: ViewTick): Grid {
	const minPx = W < 420 ? 72 : 120
	const step = STEPS.find((s) => (s * UNITS_PER_DEG) / upp >= minPx) ?? 10
	// a generous extent, so panning a while needs no new lines
	const ext: Box = [vx - vw, vy - vh, vw * 3, vh * 3]
	const [lon0, lat1] = unprojectShared(ext[0], ext[1])
	const [lon1, lat0] = unprojectShared(ext[0] + ext[2], ext[1] + ext[3])
	const range = (a: number, b: number) => {
		const out: number[] = []
		for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(4))
		return out
	}
	return { step, ext, lons: range(lon0, lon1), lats: range(lat0, lat1) }
}

/** 101°30′E · 22°N */
export function fmtDeg(v: number, step: number, pos: string, neg: string) {
	const a = Math.abs(v)
	let d = Math.floor(a + 1e-9)
	let m = Math.round((a - d) * 60)
	if (m === 60) {
		d += 1
		m = 0
	}
	const mins = step < 1 && m ? `${String(m).padStart(2, "0")}′` : ""
	return `${d}°${mins}${v >= 0 ? pos : neg}`
}

export function useGraticule(camera: Camera): Grid | null {
	const [grid, setGrid] = useState<Grid | null>(null)
	const cur = useRef<Grid | null>(null)
	useEffect(() => {
		return camera.subscribe((t) => {
			if (!t.W) return
			const g = cur.current
			const [vx, vy, vw, vh] = t.view
			const inside =
				g &&
				vx >= g.ext[0] &&
				vy >= g.ext[1] &&
				vx + vw <= g.ext[0] + g.ext[2] &&
				vy + vh <= g.ext[1] + g.ext[3]
			const next = gridFor(t)
			if (g && inside && g.step === next.step) return
			cur.current = next
			setGrid(next)
		})
	}, [camera])
	return grid
}

/**
 * The lines themselves, for the area a terrain render covers: they are drawn on the terrain canvas
 * (terrainCanvas.ts), at the step the degree ticks use.
 */
export function graticuleFor(t: { W: number; upp: number }, [ax, ay, aw, ah]: Box): Graticule {
	const { step } = gridFor({ ...t, view: [ax, ay, aw, ah], H: 0 })
	const [lon0, lat1] = unprojectShared(ax, ay)
	const [lon1, lat0] = unprojectShared(ax + aw, ay + ah)
	const xs: number[] = []
	const ys: number[] = []
	for (let v = Math.ceil(lon0 / step) * step; v <= lon1 + 1e-9; v += step)
		xs.push(SHARED.forward(+v.toFixed(4), 25)[0])
	for (let v = Math.ceil(lat0 / step) * step; v <= lat1 + 1e-9; v += step)
		ys.push(SHARED.forward(102, +v.toFixed(4))[1])
	return { step, xs, ys }
}

/** A longitude tick: just right of its meridian, along the top edge */
const lonTick: PinWrite = (s, sx) => {
	s.transform = `translateX(${sx + 3}px)`
}
/** A latitude tick: just above its parallel, along the left edge */
const latTick: PinWrite = (s, _sx, sy) => {
	s.transform = `translateY(calc(${sy - 2}px - 100%))`
}

/**
 * Degrees along the top (longitude) and left (latitude) edges. Ticks under the map's chrome
 * hide (checked a few times a second; they slide with the camera in between).
 */
export function GraticuleTicks({
	camera,
	reserved,
}: {
	camera: Camera
	reserved?: () => Rect[]
}) {
	// its own state: a new grid (a zoom changing the step, a pan past the extent) re-renders the
	// ticks only, not the whole map around them
	const grid = useGraticule(camera)
	// Live pins move along the edge while keeping the other screen coordinate fixed.
	const ref = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		const el = ref.current
		if (!el || !grid) return
		let last = 0
		let timer = 0
		const run = () => {
			last = performance.now()
			const t = camera.tick()
			const [vx, vy] = t.view
			const rects = reserved?.() ?? []
			for (const tick of Array.from(el.children) as HTMLElement[]) {
				const v = Number(tick.dataset.v)
				let r: Rect
				if (tick.dataset.axis === "lon") {
					const sx = (SHARED.forward(v, 25)[0] - vx) / t.upp
					r = [sx, 2, sx + 64, 14]
				} else {
					const sy = (SHARED.forward(102, v)[1] - vy) / t.upp
					r = [2, sy - 14, 56, sy]
				}
				const off =
					r[0] < 2 ||
					r[1] < 1 ||
					r[2] > t.W - 2 ||
					r[3] > t.H - 2 ||
					rects.some((q) => r[0] < q[2] && q[0] < r[2] && r[1] < q[3] && q[1] < r[3])
				tick.style.visibility = off ? "hidden" : "visible"
			}
		}
		const onTick = () => {
			window.clearTimeout(timer)
			if (performance.now() - last > 120) run()
			timer = window.setTimeout(run, 120)
		}
		const off = camera.subscribe(onTick)
		return () => {
			off()
			window.clearTimeout(timer)
		}
	}, [grid, camera, reserved])
	if (!grid) return null
	return (
		<div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
			<div ref={ref} className="absolute inset-0">
				{grid.lons.map((lon) => (
					<span
						key={`x${lon}`}
						ref={(el) => (el ? camera.pin(el, SHARED.forward(lon, 25)[0], 0, lonTick, true) : undefined)}
						data-axis="lon"
						data-v={lon}
						className="map-tick"
						style={{ left: 0, top: 4 }}
					>
						{fmtDeg(lon, grid.step, "E", "W")}
					</span>
				))}
				{grid.lats.map((lat) => (
					<span
						key={`y${lat}`}
						ref={(el) => (el ? camera.pin(el, 0, SHARED.forward(102, lat)[1], latTick, true) : undefined)}
						data-axis="lat"
						data-v={lat}
						className="map-tick"
						style={{ left: 4, top: 0 }}
					>
						{fmtDeg(lat, grid.step, "N", "S")}
					</span>
				))}
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Scale bar
// ---------------------------------------------------------------------------

/** |———— 5 km, re-measured each frame at the view's latitude. */
export function ScaleBar({ camera, target = 64 }: { camera: Camera; target?: number }) {
	const svgRef = useRef<SVGSVGElement>(null)
	const barRef = useRef<SVGPathElement>(null)
	const midRef = useRef<SVGPathElement>(null)
	const textRef = useRef<HTMLSpanElement>(null)
	useEffect(() => {
		let lastText = ""
		let lastW = -1
		return camera.subscribe(({ view: [, vy, , vh], upp, W }) => {
			if (!W) return
			const pxPerKm = SHARED.unitsPerKmAtY(vy + vh / 2) / upp
			const km = niceKm(pxPerKm, target)
			const w = Math.round(km * pxPerKm)
			if (w !== lastW && svgRef.current && barRef.current && midRef.current) {
				lastW = w
				svgRef.current.setAttribute("width", `${w + 2}`)
				barRef.current.setAttribute("d", `M1 1V6H${w + 1}V1`)
				midRef.current.setAttribute("d", `M${Math.round(w / 2) + 1} 3.5V6`)
			}
			const text = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString("en-US")} km`
			if (text !== lastText && textRef.current) {
				lastText = text
				textRef.current.textContent = text
			}
		})
	}, [camera, target])
	return (
		<span className="flex items-center gap-1.5">
			<svg ref={svgRef} width={2} height={7} aria-hidden className="overflow-visible">
				<path
					ref={barRef}
					fill="none"
					stroke={CREAM}
					strokeOpacity={0.45}
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
				<path
					ref={midRef}
					stroke={CREAM}
					strokeOpacity={0.3}
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<span ref={textRef} className="tabular-nums whitespace-nowrap" />
		</span>
	)
}

// ---------------------------------------------------------------------------
// Cursor readout
// ---------------------------------------------------------------------------

const fmtCoord = ([lon, lat]: Point) =>
	`${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(3)}°${
		lon >= 0 ? "E" : "W"
	}`

/** The pointer's coordinate over the map; `rest` (or nothing) when it's elsewhere. */
export function Readout({
	camera,
	rootRef,
	rest,
	className,
}: {
	camera: Camera
	rootRef: RefObject<HTMLElement | null>
	rest?: string | null
	className?: string
}) {
	const ref = useRef<HTMLSpanElement>(null)
	useEffect(() => {
		const root = rootRef.current
		const el = ref.current
		if (!root || !el) return
		let pointer: Point | null = null
		const show = () => {
			el.textContent = pointer ? fmtCoord(unprojectShared(...camera.toMap(...pointer))) : rest ?? ""
			if (pointer) el.dataset.live = ""
			else delete el.dataset.live
		}
		const onMove = (e: PointerEvent) => {
			if (e.pointerType !== "mouse") return
			pointer = [e.clientX, e.clientY]
			show()
		}
		const onLeave = () => {
			pointer = null
			show()
		}
		show()
		root.addEventListener("pointermove", onMove)
		root.addEventListener("pointerleave", onLeave)
		// the ground moves under a still pointer while the camera glides
		const off = camera.subscribe(() => pointer && show())
		return () => {
			root.removeEventListener("pointermove", onMove)
			root.removeEventListener("pointerleave", onLeave)
			off()
		}
	}, [camera, rootRef, rest])
	return (
		<span
			ref={ref}
			className={cn("tabular-nums whitespace-nowrap truncate data-[live]:text-white/60", className)}
		/>
	)
}

// ---------------------------------------------------------------------------
// Locator minimap
// ---------------------------------------------------------------------------

/** the locator sheet (its land and coast), shown over the East Asia overview box */
const LOCATOR_URL = FRAMES[0].url

/**
 * The East Asia locator, small, with the view drawn on it (a reticle when the view is too small
 * to see as a box). Loads the locator sheet the first time it's shown, and shows the overview box
 * of it (the origins and a few degrees around them): the sheet runs on to India and the Pacific
 * for the widest views, which may run past the minimap's edge.
 */
export function Minimap({
	camera,
	active,
	width = 76,
	reduce,
	onJump,
	className,
	fade,
}: {
	camera: Camera
	/** load and draw (false keeps it empty and unfetched) */
	active: boolean
	width?: number
	reduce: boolean
	onJump?: () => void
	className?: string
	fade?: MotionValue<number>
}) {
	const data = useMapJson<FrameJson>(active ? LOCATOR_URL : null)
	const [x, y, w, h] = OVERVIEW
	const height = Math.round((width * h) / w)
	const rectRef = useRef<SVGRectElement>(null)
	const crossRef = useRef<SVGPathElement>(null)
	const svgRef = useRef<SVGSVGElement>(null)
	useEffect(() => {
		return camera.subscribe(({ view: [vx, vy, vw, vh] }) => {
			const r = rectRef.current
			const c = crossRef.current
			if (!r || !c) return
			// at least ~4 px on the minimap
			const min = (w / width) * 4
			const rw = Math.max(vw, min)
			const rh = Math.max(vh, min)
			const cx = vx + vw / 2
			const cy = vy + vh / 2
			r.setAttribute("x", `${cx - rw / 2}`)
			r.setAttribute("y", `${cy - rh / 2}`)
			r.setAttribute("width", `${rw}`)
			r.setAttribute("height", `${rh}`)
			const small = vw < min * 3
			c.setAttribute(
				"d",
				small
					? `M${x} ${cy}H${cx - rw}M${cx + rw} ${cy}H${x + w}M${cx} ${y}V${cy - rh}M${cx} ${
							cy + rh
					  }V${y + h}`
					: ""
			)
		})
	}, [camera, w, x, y, h, width])
	const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
		const r = e.currentTarget.getBoundingClientRect()
		const px = x + ((e.clientX - r.left) / r.width) * w
		const py = y + ((e.clientY - r.top) / r.height) * h
		const [, , vw, vh] = camera.view()
		onJump?.()
		void camera.fly([px - vw / 2, py - vh / 2, vw, vh], { reduce })
	}
	return (
		<motion.div
			data-map-ui=""
			className={cn(
				"overflow-hidden rounded-[3px] bg-[#0b0b0e] ring-1 ring-inset ring-white/[0.12]",
				className
			)}
			style={{ width, height, opacity: fade }}
		>
			<svg
				ref={svgRef}
				viewBox={`${x} ${y} ${w} ${h}`}
				width={width}
				height={height}
				className="block cursor-pointer"
				onClick={onClick}
				role="img"
				aria-label="Locator: click to move the map there"
			>
				{data && <path d={data.context.land} fill="#29242a" fillRule="evenodd" stroke="none" />}
				{data && (
					<path
						d={data.context.coast}
						fill="none"
						stroke="rgb(160 188 214)"
						strokeOpacity={0.35}
						strokeWidth={0.6}
						vectorEffect="non-scaling-stroke"
					/>
				)}
				<path
					ref={crossRef}
					fill="none"
					stroke={CREAM}
					strokeOpacity={0.3}
					strokeWidth={0.6}
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					ref={rectRef}
					fill={CREAM}
					fillOpacity={0.12}
					stroke={CREAM}
					strokeOpacity={0.85}
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
		</motion.div>
	)
}
