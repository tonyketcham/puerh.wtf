"use client"

/**
 * The shared frames as level-of-detail layers (plan §4.3, §4.5): locator → china-east →
 * yunnan → six-mountains (and japan), all in one projection so they register exactly. A finer
 * frame fades in over the coarser one as the camera zooms into it, each on its own ground, its
 * edge marked like a survey sheet: crop ticks and `yunnan.frame · 200 m`. Frames load the first
 * time the camera comes near them.
 */
import { memo, useEffect, useId, useMemo, useState } from "react"
import { motion, useMotionValueEvent, useTransform } from "motion/react"
import type { Camera } from "./camera"
import { ContextLines, TanakaBands } from "./Contours"
import { CREAM, FRAMES, GROUND, projectShared, type FrameJson, type FrameMeta } from "./geo"
import { useMapJson } from "./mapData"
import type { MapLayers } from "./mapState"

/** How present a frame is for a view: 0 off, 1 on (fades in from 1.45× its size to 1.05×). */
export function lodOpacity(meta: FrameMeta, [vx, vy, vw, vh]: [number, number, number, number]) {
	if (meta.id === "locator") return 1
	const [fx, fy, fw, fh] = meta.viewBox
	const ox = Math.min(vx + vw, fx + fw) - Math.max(vx, fx)
	const oy = Math.min(vy + vh, fy + fh) - Math.max(vy, fy)
	if (ox <= 0 || oy <= 0) return 0
	const z = Math.min(vw / fw, vh / fh)
	return Math.max(0, Math.min(1, (1.45 - z) / 0.4))
}

/** The finest frame fully present for a view (what the LOD label names). */
export function activeFrame(view: [number, number, number, number]): FrameMeta {
	let best = FRAMES[0]
	for (const f of FRAMES) if (lodOpacity(f, view) >= 0.5) best = f
	return best
}

export default function FrameLayers({ camera, layers }: { camera: Camera; layers: MapLayers }) {
	return (
		<g>
			{FRAMES.map((meta) => (
				<FrameLayer key={meta.id} meta={meta} camera={camera} layers={layers} />
			))}
		</g>
	)
}

function FrameLayer({
	meta,
	camera,
	layers,
}: {
	meta: FrameMeta
	camera: Camera
	layers: MapLayers
}) {
	const opacity = useTransform(
		[camera.cx, camera.cy, camera.lw, camera.width, camera.height],
		([cx, cy, lw, W, H]: number[]) => {
			const w = Math.exp(lw)
			const h = W > 0 && H > 0 ? (w * H) / W : w
			return lodOpacity(meta, [cx - w / 2, cy - h / 2, w, h])
		}
	)
	const visibility = useTransform(opacity, (o) => (o < 0.005 ? "hidden" : "visible"))
	// load the first time the camera comes near
	const [want, setWant] = useState(meta.id === "locator")
	useEffect(() => {
		if (opacity.get() > 0) setWant(true)
	}, [opacity])
	useMotionValueEvent(opacity, "change", (o) => {
		if (o > 0 && !want) setWant(true)
	})
	const data = useMapJson<FrameJson>(want ? meta.url : null)

	const [fx, fy, fw, fh] = meta.viewBox
	const clip = useId()
	return (
		<motion.g style={{ opacity, visibility }} data-frame={meta.id}>
			{/* the grids run a little past the sheet (contour closures): trim them to it */}
			<clipPath id={clip}>
				<rect x={fx} y={fy} width={fw} height={fh} />
			</clipPath>
			<rect x={fx} y={fy} width={fw} height={fh} fill={GROUND} />
			<g clipPath={`url(#${clip})`}>
				{data && layers.contours && <Bands bands={data.bands} />}
				{data && <ContextLines context={data.context} layers={{ rivers: layers.rivers }} />}
			</g>
			{meta.id !== "locator" && <FrameEdge meta={meta} interval={data?.interval ?? null} />}
		</motion.g>
	)
}

/** Memoized so camera moves never re-render a frame's (large) path data. */
const Bands = memo(function Bands({ bands }: { bands: FrameJson["bands"] }) {
	return <TanakaBands bands={bands} />
})

/** A survey sheet's edge: hairline border, crop ticks at the corners, a sheet name. */
function FrameEdge({ meta, interval }: { meta: FrameMeta; interval: number | null }) {
	const [x, y, w, h] = meta.viewBox
	const tick = 14
	const corners: [number, number, number, number][] = [
		[x, y, 1, 1],
		[x + w, y, -1, 1],
		[x, y + h, 1, -1],
		[x + w, y + h, -1, -1],
	]
	return (
		<g className="pointer-events-none">
			<rect
				x={x}
				y={y}
				width={w}
				height={h}
				fill="none"
				stroke={CREAM}
				strokeOpacity={0.07}
				strokeWidth={1}
				vectorEffect="non-scaling-stroke"
			/>
			{corners.map(([cx, cy, sx, sy], i) => (
				<g key={i} transform={`translate(${cx} ${cy})`}>
					<g className="map-px">
						<path
							d={`M${-sx * 4} 0H${sx * tick}M0 ${-sy * 4}V${sy * tick}`}
							stroke={CREAM}
							strokeOpacity={0.35}
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
					</g>
				</g>
			))}
			<g transform={`translate(${x} ${y})`}>
				<g className="map-px">
					<text
						x={8}
						y={-6}
						fontSize={9.5}
						className="font-fira-code"
						fill={CREAM}
						fillOpacity={0.3}
					>
						{`${meta.id}.frame${interval ? ` · ${interval} m` : ""}`}
					</text>
				</g>
			</g>
		</g>
	)
}

/** A 1° graticule in the shared projection (every 5° a little brighter); computed once. */
export const Graticule = memo(function Graticule() {
	const { minor, major } = useMemo(() => graticule(), [])
	return (
		<g fill="none" className="pointer-events-none">
			<path
				d={minor}
				stroke={CREAM}
				strokeOpacity={0.035}
				strokeWidth={1}
				strokeDasharray="1 4"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d={major}
				stroke={CREAM}
				strokeOpacity={0.07}
				strokeWidth={1}
				strokeDasharray="2 4"
				vectorEffect="non-scaling-stroke"
			/>
		</g>
	)
})

function graticule() {
	const r = (v: number) => Math.round(v * 10) / 10
	const line = (pts: [number, number][]) =>
		pts
			.map(([lon, lat], i) => {
				const [x, y] = projectShared(lon, lat)
				return `${i ? "L" : "M"}${r(x)} ${r(y)}`
			})
			.join("")
	let minor = ""
	let major = ""
	for (let lon = 94; lon <= 144; lon++) {
		const pts: [number, number][] = []
		for (let lat = 14; lat <= 42; lat += 0.5) pts.push([lon, lat])
		if (lon % 5 === 0) major += line(pts)
		else minor += line(pts)
	}
	for (let lat = 14; lat <= 42; lat++) {
		const pts: [number, number][] = []
		for (let lon = 94; lon <= 144; lon += 0.5) pts.push([lon, lat])
		if (lat % 5 === 0) major += line(pts)
		else minor += line(pts)
	}
	return { minor, major }
}
