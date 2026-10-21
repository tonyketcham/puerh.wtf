"use client"

/**
 * "Unknown Pleasures" over the six ancient tea mountains (plan §4.1, §4.5 step 1): 36 stacked
 * west → east elevation profiles, north row at the back, each filled with the ground so it
 * hides the rows behind it. Same grid as the contours, registered onto the six-mountains frame.
 *
 * On load the rows draw top → bottom, 20 ms apart. `relief` (a motion value, 1 → 0) then
 * flattens every row onto its own baseline: the profiles sink into parallels and the plan-view
 * contours underneath take over at the same box. Driven by scroll on /origins, and by the
 * "ridges" layer toggle anywhere.
 */
import { memo, useEffect, useRef } from "react"
import { motion, useTransform, type MotionValue } from "motion/react"
import { drawOn } from "./drawOn"
import { CREAM, frameMeta, GROUND, RIDGES_URL, type Box, type RidgesJson } from "./geo"
import { useMapJson } from "./mapData"

/** Placement of the ridge grid (width × rows) on the six-mountains frame, in shared units. */
export function ridgePlacement(ridges: Pick<RidgesJson, "width" | "height" | "rows">) {
	const [fx, fy, fw, fh] = frameMeta("six-mountains").viewBox
	const first = ridges.rows[0]?.base ?? 0
	const last = ridges.rows[ridges.rows.length - 1]?.base ?? 1
	const sx = fw / ridges.width
	const sy = fh / Math.max(1, last - first)
	const tx = fx
	const ty = fy - first * sy
	// the whole picture, peaks included: what the hero frames
	const box: Box = [tx, ty, fw, ridges.height * sy]
	return { sx, sy, tx, ty, box }
}

export function useRidges() {
	return useMapJson<RidgesJson>(RIDGES_URL)
}

export default memo(function RidgeLayer({
	ridges,
	relief,
	reduce,
}: {
	ridges: RidgesJson
	/** 1 = full relief, 0 = flat (and gone) */
	relief: MotionValue<number>
	reduce: boolean
}) {
	const { sx, sy, tx, ty } = ridgePlacement(ridges)
	const opacity = useTransform(relief, [0, 0.12, 1], [0, 1, 1])
	const visibility = useTransform(relief, (r) => (r < 0.005 ? "hidden" : "visible"))
	const scale = useTransform(relief, (r) => Math.max(0.001, r))
	const rootRef = useRef<SVGGElement>(null)

	// draw on, top → bottom (north first), once
	useEffect(() => {
		const root = rootRef.current
		if (!root) return
		const lines = [...root.querySelectorAll<SVGPathElement>("path[data-ridge]")]
		const fills = [...root.querySelectorAll<SVGPathElement>("path[data-ridge-fill]")]
		const cancels = lines.map((el, i) => drawOn(el, { delay: 120 + i * 20, duration: 900, reduce }))
		const fades = fills.map((el, i) =>
			el.animate([{ opacity: 0 }, { opacity: 1 }], {
				duration: 300,
				delay: reduce ? 0 : 120 + i * 20,
				fill: "backwards",
			})
		)
		return () => {
			cancels.forEach((c) => c())
			fades.forEach((a) => a.cancel())
		}
	}, [ridges, reduce])

	return (
		<motion.g ref={rootRef} style={{ opacity, visibility }} className="pointer-events-none">
			<g transform={`translate(${tx} ${ty}) scale(${sx} ${sy})`}>
				{ridges.rows.map((row) => (
					<g key={row.lat} transform={`translate(0 ${row.base})`}>
						<motion.g style={{ scaleY: scale, originX: 0, originY: 0, transformBox: "view-box" }}>
							<g transform={`translate(0 ${-row.base})`}>
								<path
									data-ridge-fill=""
									d={`${row.d}L${ridges.width} ${row.base}L0 ${row.base}Z`}
									fill={GROUND}
								/>
								<path
									data-ridge=""
									d={row.d}
									fill="none"
									stroke={CREAM}
									strokeOpacity={0.62}
									strokeWidth={1}
									strokeLinejoin="round"
									vectorEffect="non-scaling-stroke"
								/>
							</g>
						</motion.g>
					</g>
				))}
			</g>
		</motion.g>
	)
})
