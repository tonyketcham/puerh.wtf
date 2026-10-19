"use client"

/**
 * Line work for every origin map (plan §4.1), drawn from precomputed band outlines:
 *
 * - ContourLines: hairline contours, every index contour (each fifth) a little brighter, rising
 *   low → high as they draw on. Insets in the Properties panel and the peek card.
 * - TanakaBands: Tanaka's illuminated contours. Each band, low to high, is stroked twice with
 *   offsets (a cream stroke nudged toward the NW light, a dark one toward the SE), then
 *   filled with the ground at its true position, which hides the inner half of both strokes
 *   and every lower line it covers. Slopes facing the light glow, lee slopes sink: hillshade
 *   from lines alone, no raster. The offset is screen-constant (var(--tanaka), see map.css).
 * - ContextLines: coast, rivers, lakes and dashed province lines. No national borders.
 *
 * Every stroke is `vector-effect: non-scaling-stroke`, so widths are pixels at any zoom.
 * Strokes of the plain (non-index) contours sit under data-contour="minor", so a container
 * can fade the map toward its index lines (the origin hero does as it scrolls away; map.css).
 */
import { memo, useRef, type CSSProperties } from "react"
import type { Band, MapContext } from "./geo"
import { CREAM, GROUND } from "./geo"
import { useDrawOn } from "./drawOn"
import { cn } from "@/lib/utils"

const NS = "non-scaling-stroke" as const

/** One hairline that draws on (screen-measured dash; see drawOn.ts). */
export function DrawPath({
	d,
	drawKey,
	delay,
	duration,
	reduce,
	play = true,
	...rest
}: {
	d: string
	drawKey: unknown
	delay?: number
	duration?: number
	reduce?: boolean
	play?: boolean
} & Omit<React.SVGProps<SVGPathElement>, "d" | "ref">) {
	const ref = useRef<SVGPathElement>(null)
	useDrawOn(ref, drawKey, { delay, duration, reduce, play })
	return <path ref={ref} d={d} fill="none" vectorEffect={NS} {...rest} />
}

export type DrawTiming = {
	/** changes when the lines should draw again (a new session, a new origin) */
	key: unknown
	/** ms before the lowest band starts */
	delay?: number
	/** ms across all bands, lowest first (plan: 400 ms for insets, 300 ms in a peek) */
	total?: number
	/** ms each line takes */
	duration?: number
	reduce?: boolean
	play?: boolean
}

/**
 * Plain contour hairlines. `highlight` re-strokes bands by elevation (a session's recorded
 * elevation in its liquor; a garden range in the accent).
 */
export const ContourLines = memo(function ContourLines({
	bands,
	draw,
	alpha = 1,
	highlight,
	indexClassName,
}: {
	bands: Band[]
	draw?: DrawTiming
	/** multiplies the line alphas (backdrops are fainter) */
	alpha?: number
	highlight?: (elev: number) => { color: string; width?: number; opacity?: number } | null
	/** extra class on index contours (the parallax layer) */
	indexClassName?: string
}) {
	const n = Math.max(1, bands.length)
	const total = draw?.total ?? 400
	const step = total / n
	const plain = bands.filter((b) => !b.index)
	const index = bands.filter((b) => b.index)
	const order = new Map(bands.map((b, i) => [b.elev, i] as const))
	const line = (b: Band) => (
		<DrawPath
			key={b.elev}
			d={b.d}
			drawKey={draw?.key}
			play={draw?.play ?? !!draw}
			reduce={draw?.reduce}
			delay={(draw?.delay ?? 0) + (order.get(b.elev) ?? 0) * step}
			duration={draw?.duration ?? 380}
			stroke={CREAM}
			strokeOpacity={(b.index ? 0.22 : 0.1) * alpha}
			strokeWidth={b.index ? 0.8 : 0.5}
		/>
	)
	const lit = highlight
		? bands.map((b) => [b, highlight(b.elev)] as const).filter(([, h]) => h)
		: []
	return (
		<g>
			<g data-contour="minor">{plain.map(line)}</g>
			<g className={indexClassName}>{index.map(line)}</g>
			{lit.map(([b, h]) => (
				<DrawPath
					key={`hl-${b.elev}`}
					d={b.d}
					drawKey={draw?.key}
					play={draw?.play ?? !!draw}
					reduce={draw?.reduce}
					delay={(draw?.delay ?? 0) + total + 80}
					duration={520}
					stroke={h!.color}
					strokeOpacity={h!.opacity ?? 1}
					strokeWidth={h!.width ?? 1.2}
					strokeLinejoin="round"
					// the caller finds these to set the elevation label on the line
					data-highlight={b.elev}
				/>
			))}
		</g>
	)
})

/**
 * Illuminated (Tanaka) contours. Needs var(--tanaka) on an ancestor: the offset in user units
 * that equals ~0.6 screen px at the current zoom (the camera keeps it current).
 */
export const TanakaBands = memo(function TanakaBands({
	bands,
	ground = GROUND,
	alpha = 1,
	draw,
	highlight,
}: {
	bands: Band[]
	ground?: string
	alpha?: number
	draw?: DrawTiming
	highlight?: (elev: number) => { color: string; width?: number; opacity?: number } | null
}) {
	const n = Math.max(1, bands.length)
	const step = (draw?.total ?? 600) / n
	return (
		<g>
			{bands.map((b, i) => {
				const h = highlight?.(b.elev) ?? null
				const delay = (draw?.delay ?? 0) + i * step
				// a plain band's strokes can fade; never its fill, which hides the lines beneath
				const minor = b.index || h ? undefined : "minor"
				return (
					<g key={b.elev}>
						<g data-contour={minor}>
							<path
								d={b.d}
								className="map-tanaka-dark"
								fill="none"
								stroke="#000"
								strokeOpacity={(b.index ? 0.8 : 0.6) * alpha}
								strokeWidth={b.index ? 1.4 : 1.1}
								vectorEffect={NS}
							/>
							<path
								d={b.d}
								className="map-tanaka-light"
								fill="none"
								stroke={h?.color ?? CREAM}
								strokeOpacity={(h ? 0.5 : b.index ? 0.3 : 0.15) * alpha}
								strokeWidth={b.index ? 1.1 : 0.85}
								vectorEffect={NS}
							/>
						</g>
						<path d={b.d} fill={ground} fillRule="evenodd" stroke="none" />
						<g data-contour={minor}>
							<DrawPath
								d={b.d}
								drawKey={draw?.key}
								play={draw?.play ?? !!draw}
								reduce={draw?.reduce}
								delay={delay}
								duration={draw?.duration ?? 420}
								stroke={h?.color ?? CREAM}
								strokeOpacity={(h ? h.opacity ?? 0.95 : b.index ? 0.26 : 0.1) * alpha}
								strokeWidth={h ? h.width ?? 1.2 : b.index ? 0.8 : 0.5}
							/>
						</g>
					</g>
				)
			})}
		</g>
	)
})

export type ContextLayers = { rivers?: boolean }

/** Coast, province lines (dashed, 6%), rivers and lakes (a cooler grey). */
export const ContextLines = memo(function ContextLines({
	context,
	layers = {},
	alpha = 1,
	className,
	style,
}: {
	context: MapContext
	layers?: ContextLayers
	alpha?: number
	className?: string
	style?: CSSProperties
}) {
	const rivers = layers.rivers !== false
	return (
		<g className={cn("pointer-events-none", className)} style={style} fill="none">
			{context.admin && (
				<path
					d={context.admin}
					stroke={CREAM}
					strokeOpacity={0.09 * alpha}
					strokeWidth={0.75}
					strokeDasharray="5 4"
					vectorEffect={NS}
				/>
			)}
			{context.coast && (
				<path
					d={context.coast}
					stroke="rgb(196 214 230)"
					strokeOpacity={0.4 * alpha}
					strokeWidth={0.8}
					vectorEffect={NS}
				/>
			)}
			<g
				className="transition-opacity duration-300"
				style={{ opacity: rivers ? 1 : 0 }}
				stroke="rgb(170 196 220)"
			>
				{context.lakes.map((l, i) => (
					<path
						key={`l${i}`}
						d={l.d}
						fill="rgb(170 196 220)"
						fillOpacity={0.03 * alpha}
						strokeOpacity={0.32 * alpha}
						strokeWidth={0.7}
						vectorEffect={NS}
					/>
				))}
				{context.rivers.map((r, i) => (
					<path
						key={`r${i}`}
						d={r.d}
						strokeOpacity={0.3 * alpha}
						strokeWidth={0.75}
						strokeLinejoin="round"
						strokeLinecap="round"
						vectorEffect={NS}
					>
						{r.name && <title>{r.name}</title>}
					</path>
				))}
			</g>
		</g>
	)
})
