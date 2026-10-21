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
 * - ContextLines: the reference layers (plan §4.7.3): national borders, dashed province lines,
 *   coast, rivers and lakes. Their strength follows the zoom (--ref-a, see map.css): stronger
 *   zoomed out, where they carry the reading, quieter over the contours up close.
 *
 * Every stroke is `vector-effect: non-scaling-stroke`, so widths are pixels at any zoom.
 * Given the camera's `upp`, the intermediate contours are thinned where they bunch (contourThin.ts),
 * as the canvas thins them; the session's own line (`keep`) and the fills never are.
 * Strokes of the plain (non-index) contours sit under data-contour="minor", so a container
 * can fade the map toward its index lines (the origin hero does as it scrolls away; map.css).
 */
import { memo, useRef, type CSSProperties } from "react"
import type { Band, MapContext } from "./geo"
import { CREAM, GROUND } from "./geo"
import { useDrawOn } from "./drawOn"
import { thinPieces } from "./contourThin"
import { TONE, type HighlightStyle } from "./terrainCanvas"
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
	/** ms before the highlighted lines draw (default: after the last band, `delay + total + 80`) */
	litAt?: number
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
	upp,
}: {
	bands: Band[]
	draw?: DrawTiming
	/** multiplies the line alphas (backdrops are fainter) */
	alpha?: number
	highlight?: (elev: number) => HighlightStyle | null
	/** extra class on index contours (the parallax layer) */
	indexClassName?: string
	/** shared units per CSS px: thin the intermediates for this zoom */
	upp?: number | null
}) {
	const n = Math.max(1, bands.length)
	const total = draw?.total ?? 400
	const step = total / n
	const plain = bands.filter((b) => !b.index)
	const index = bands.filter((b) => b.index)
	const order = new Map(bands.map((b, i) => [b.elev, i] as const))
	const line = (b: Band) =>
		thinPieces(b, upp).map((piece, i) => (
			<DrawPath
				key={`${b.elev}-${i}`}
				d={piece.d}
				drawKey={draw?.key}
				play={draw?.play ?? !!draw}
				reduce={draw?.reduce}
				delay={(draw?.delay ?? 0) + (order.get(b.elev) ?? 0) * step}
				duration={draw?.duration ?? 380}
				stroke={CREAM}
				strokeOpacity={(b.index ? TONE.hairIndex : TONE.hair) * alpha * piece.a}
				strokeWidth={b.index ? 0.8 : 0.5}
			/>
		))
	const lit = highlight
		? bands.map((b) => [b, highlight(b.elev)] as const).filter(([, h]) => h)
		: []
	return (
		<g>
			<g data-contour="minor">{plain.map(line)}</g>
			<g className={indexClassName}>{index.map(line)}</g>
			{lit.flatMap(([b, h]) =>
				(h!.keep ? [{ d: b.d, a: 1 }] : thinPieces(b, upp)).map((piece, i) => (
					<DrawPath
						key={`hl-${b.elev}-${i}`}
						d={piece.d}
						drawKey={draw?.key}
						play={draw?.play ?? !!draw}
						reduce={draw?.reduce}
						delay={draw?.litAt ?? (draw?.delay ?? 0) + total + 80}
						duration={520}
						stroke={h!.color}
						strokeOpacity={(h!.opacity ?? 1) * piece.a}
						strokeWidth={h!.width ?? 1.2}
						strokeLinejoin="round"
						// the caller finds these to set the elevation label on the line
						data-highlight={b.elev}
					/>
				))
			)}
		</g>
	)
})

/**
 * Illuminated (Tanaka) contours. The light and dark strokes sit ~0.6 screen px apart at any zoom:
 * the camera writes the offset, in user units, on their groups (camera.ts, setSvgView).
 */
export const TanakaBands = memo(function TanakaBands({
	bands,
	ground = GROUND,
	alpha = 1,
	draw,
	highlight,
	upp,
}: {
	bands: Band[]
	ground?: string
	alpha?: number
	draw?: DrawTiming
	highlight?: (elev: number) => HighlightStyle | null
	/** shared units per CSS px: thin the intermediates for this zoom */
	upp?: number | null
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
				const ink = b.index ? TONE.tanakaIndex : TONE.tanaka
				// the strokes thin where contours bunch (the session's line never); the fill is whole
				const pieces = h?.keep ? [{ d: b.d, a: 1 }] : thinPieces(b, upp)
				return (
					<g key={b.elev}>
						<g data-contour={minor}>
							{/* one offset per band and side, not per piece: the camera writes it on
							    each rebase (camera.ts, setSvgView) */}
							<g className="map-tanaka-dark">
								{pieces.map((piece, j) => (
									<path
										key={j}
										d={piece.d}
										fill="none"
										stroke="#000"
										strokeOpacity={ink.dark * alpha * piece.a}
										strokeWidth={b.index ? 1.4 : 1.1}
										vectorEffect={NS}
									/>
								))}
							</g>
							<g className="map-tanaka-light">
								{pieces.map((piece, j) => (
									<path
										key={j}
										d={piece.d}
										fill="none"
										stroke={h?.color ?? CREAM}
										strokeOpacity={(h ? 0.5 : ink.light) * alpha * piece.a}
										strokeWidth={b.index ? 1.1 : 0.85}
										vectorEffect={NS}
									/>
								))}
							</g>
						</g>
						<path d={b.d} fill={ground} fillRule="evenodd" stroke="none" />
						<g data-contour={minor}>
							{pieces.map((piece, j) => (
								<DrawPath
									key={j}
									d={piece.d}
									drawKey={draw?.key}
									play={draw?.play ?? !!draw}
									reduce={draw?.reduce}
									delay={delay}
									duration={draw?.duration ?? 420}
									stroke={h?.color ?? CREAM}
									strokeOpacity={(h ? h.opacity ?? 0.95 : ink.line) * alpha * piece.a}
									strokeWidth={h ? h.width ?? 1.2 : b.index ? 0.8 : 0.5}
								/>
							))}
						</g>
					</g>
				)
			})}
		</g>
	)
})

export type ContextLayers = { rivers?: boolean }

/**
 * Borders (solid cream over a dark casing), province lines (dashed), coast, rivers and lakes (a
 * cooler grey). Stroke alphas live in map.css (.map-ref-*), scaled by --ref-a, so the camera can
 * lift them as it zooms out.
 */
export const ContextLines = memo(function ContextLines({
	context,
	layers = {},
	className,
	style,
}: {
	context: MapContext
	layers?: ContextLayers
	className?: string
	style?: CSSProperties
}) {
	const rivers = layers.rivers !== false
	return (
		<g className={cn("pointer-events-none", className)} style={style} fill="none">
			{context.admin && (
				<path d={context.admin} className="map-ref-admin" strokeDasharray="5 4" vectorEffect={NS} />
			)}
			{context.coast && <path d={context.coast} className="map-ref-coast" vectorEffect={NS} />}
			{context.borders && (
				<>
					<path d={context.borders} className="map-ref-border-casing" vectorEffect={NS} />
					<path d={context.borders} className="map-ref-border" vectorEffect={NS} />
				</>
			)}
			<g className="transition-opacity duration-300" style={{ opacity: rivers ? 1 : 0 }}>
				{context.lakes.map((l, i) => (
					<path key={`l${i}`} d={l.d} className="map-ref-lake" vectorEffect={NS} />
				))}
				{context.rivers.map((r, i) => (
					<path
						key={`r${i}`}
						d={r.d}
						className="map-ref-river"
						strokeLinejoin="round"
						strokeLinecap="round"
						vectorEffect={NS}
					/>
				))}
			</g>
		</g>
	)
})
