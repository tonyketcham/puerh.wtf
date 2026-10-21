"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { entityHref } from "@/lib/entities"
import { cn } from "@/lib/utils/cn"

const CREAM = "#fff2ca"
const EASE = [0.22, 1, 0.36, 1] as const

export type DotMapPoint = {
	slug: string
	title: string
	lat: number
	lon: number
	/** sessions behind the point */
	count: number
	color?: string
}

/**
 * Where an entity's teas come from, as dots on a graticule (plan §3.3 "small dot-map of the
 * origins they sourced from"). Not a map: no coastlines, just the surveyed points in a
 * cos(lat)-corrected plate carrée fitted to them, ringed by how many sessions each holds.
 * The contour maps arrive in Phase 5; this stays the index-card glyph.
 */
export default function DotMap({
	points,
	width = 280,
	height = 120,
	labels = 3,
	accent = CREAM,
	className,
	interactive = true,
	recordingKey,
}: {
	points: DotMapPoint[]
	width?: number
	height?: number
	/** how many of the biggest points get a `// name` label */
	labels?: number
	accent?: string
	className?: string
	/** dots link to their origin pages */
	interactive?: boolean
	recordingKey?: string
}) {
	const reduce = useReducedMotion() ?? false
	const [hover, setHover] = useState<string | null>(null)

	const layout = useMemo(() => fit(points, width, height), [points, width, height])
	if (!points.length) return null
	// biggest first; a label that would sit on one already placed is dropped (hover still shows it)
	const ranked = [...layout.dots].sort((a, b) => b.p.count - a.p.count)
	const labelled = new Set<string>()
	const boxes: { x0: number; x1: number; y: number }[] = []
	for (const d of ranked) {
		if (labelled.size >= labels) break
		const w = (d.p.title.length + 3) * 5.8
		const right = d.x > width * 0.72
		const box = { x0: right ? d.x - w - 12 : d.x, x1: right ? d.x : d.x + w + 12, y: d.y }
		if (boxes.some((b) => Math.abs(b.y - box.y) < 12 && b.x0 < box.x1 && box.x0 < b.x1)) continue
		boxes.push(box)
		labelled.add(d.p.slug)
	}
	const max = Math.max(1, ...points.map((p) => p.count))

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className={cn("block w-full", className)}
			role="img"
			aria-label={`Origins: ${points.map((p) => p.title).join(", ")}`}
			data-recording-key={recordingKey}
		>
			{/* graticule */}
			<g stroke={CREAM} strokeOpacity={0.06} strokeWidth={1}>
				{layout.meridians.map((x) => (
					<line
						key={`m${x}`}
						x1={x}
						x2={x}
						y1={0}
						y2={height}
						vectorEffect="non-scaling-stroke"
						strokeDasharray="1 3"
					/>
				))}
				{layout.parallels.map((y) => (
					<line
						key={`p${y}`}
						x1={0}
						x2={width}
						y1={y}
						y2={y}
						vectorEffect="non-scaling-stroke"
						strokeDasharray="1 3"
					/>
				))}
			</g>

			{layout.dots.map(({ p, x, y }, i) => {
				const r = 2.5 + Math.sqrt(p.count / max) * 7
				const lit = hover === p.slug
				const dot = (
					<g
						key={p.slug}
						onPointerEnter={() => setHover(p.slug)}
						onPointerLeave={() => setHover((h) => (h === p.slug ? null : h))}
					>
						<motion.circle
							cx={x}
							cy={y}
							r={r}
							fill="none"
							stroke={p.color || accent}
							strokeOpacity={lit ? 1 : 0.7}
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
							style={{ rotate: -90, transformBox: "fill-box", transformOrigin: "center" }}
							initial={reduce ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
							animate={reduce ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
							transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : 0.15 + i * 0.05 }}
						/>
						<motion.circle
							cx={x}
							cy={y}
							r={1.6}
							fill={p.color || accent}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.2, delay: reduce ? 0 : 0.1 + i * 0.05 }}
						/>
						{(labelled.has(p.slug) || lit) && (
							<motion.text
								x={x + r + 4}
								y={y}
								dy="0.35em"
								fontSize={9.5}
								className="font-fira-code"
								fill="#ffffff"
								fillOpacity={lit ? 0.9 : 0.45}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.25, delay: reduce || lit ? 0 : 0.5 + i * 0.05 }}
								textAnchor={x > width * 0.72 ? "end" : "start"}
								dx={x > width * 0.72 ? -2 * (r + 4) : 0}
								pointerEvents="none"
							>
								{`// ${p.title}`}
							</motion.text>
						)}
						<title>{`${p.title} · ${p.count} ${p.count === 1 ? "session" : "sessions"}`}</title>
					</g>
				)
				const href = entityHref("origin", p.slug)
				return interactive && href ? (
					<Link
						key={p.slug}
						href={href}
						className="outline-none focus-visible:[&_circle]:stroke-white"
					>
						{dot}
					</Link>
				) : (
					dot
				)
			})}
		</svg>
	)
}

/** Fit points into the box (cos(lat)-corrected lon/lat), with a floor on the span so one or two
 * close points don't fill the frame like a continent. */
function fit(points: DotMapPoint[], width: number, height: number) {
	if (!points.length) return { dots: [], meridians: [], parallels: [] }
	const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length
	const k = Math.cos((lat0 * Math.PI) / 180)
	const xs = points.map((p) => p.lon * k)
	const ys = points.map((p) => -p.lat)
	const MIN_SPAN = 3
	let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
	const grow = (a: number, b: number, span: number): [number, number] => {
		const mid = (a + b) / 2
		const half = Math.max(span, b - a) / 2
		return [mid - half, mid + half]
	}
	;[x0, x1] = grow(x0, x1, MIN_SPAN)
	;[y0, y1] = grow(y0, y1, MIN_SPAN * (height / width))
	const pad = 18
	const scale = Math.min((width - pad * 2) / (x1 - x0), (height - pad * 2) / (y1 - y0))
	const ox = (width - (x1 - x0) * scale) / 2
	const oy = (height - (y1 - y0) * scale) / 2
	const px = (x: number) => ox + (x - x0) * scale
	const py = (y: number) => oy + (y - y0) * scale

	// a graticule line every 1°, 2°, 5° or 10°, whichever gives a handful
	const spanDeg = Math.max(x1 - x0, y1 - y0)
	const step = [1, 2, 5, 10, 20].find((s) => spanDeg / s <= 6) ?? 20
	const meridians: number[] = []
	for (let lon = Math.ceil(x0 / k / step) * step; lon * k <= x1; lon += step)
		meridians.push(round(px(lon * k)))
	const parallels: number[] = []
	for (let lat = Math.ceil(-y1 / step) * step; -lat >= y0; lat += step)
		parallels.push(round(py(-lat)))

	return {
		dots: points.map((p, i) => ({ p, x: round(px(xs[i])), y: round(py(ys[i])) })),
		meridians,
		parallels,
	}
}

const round = (n: number) => Math.round(n * 10) / 10
