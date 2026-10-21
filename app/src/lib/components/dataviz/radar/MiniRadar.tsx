import { FLAVOR_AXES, type SessionFlavorAxes } from "@/lib/types/session"
import { CENTER, RADIUS, polar, polygonPoints, seriesFor, type RadarAxisData } from "./geometry"

/** the radar's own square, without the room RadarChart keeps for axis labels */
const PAD = 6
const BOX = `${CENTER - RADIUS - PAD} ${CENTER - RADIUS - PAD} ${(RADIUS + PAD) * 2} ${(RADIUS + PAD) * 2}`
const RINGS = [5, 10].map((v) => polygonPoints(FLAVOR_AXES.map(() => v)))

/**
 * A thumbnail flavor radar for cards: static SVG, server-renderable, no labels. The start
 * shape is filled and the finish shape is a dashed outline; while an ancestor `.group` is
 * hovered or focused they trade places, so the cup steeps through the session.
 */
export default function MiniRadar({
	data,
	color,
	className,
}: {
	data: SessionFlavorAxes
	/** stroke / fill accent (radarAccent of the liquor) */
	color: string
	className?: string
}) {
	const { s, f } = seriesFor([...FLAVOR_AXES], data as unknown as RadarAxisData)
	const start = polygonPoints(s)
	const finish = polygonPoints(f)

	return (
		<svg aria-hidden viewBox={BOX} className={className} style={{ color }}>
			{RINGS.map((points, i) => (
				<polygon
					key={i}
					points={points}
					fill="none"
					stroke="rgb(255 255 255 / 0.08)"
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
			))}
			{FLAVOR_AXES.map((_, i) => {
				const p = polar(i, FLAVOR_AXES.length, 10)
				return (
					<line
						key={i}
						x1={CENTER}
						y1={CENTER}
						x2={p.x}
						y2={p.y}
						stroke="rgb(255 255 255 / 0.05)"
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
				)
			})}
			<polygon
				points={start}
				stroke="currentColor"
				strokeWidth={1.25}
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
				className="transition-[fill-opacity,stroke-opacity,stroke-dasharray] duration-500 ease-out fill-current [fill-opacity:0.28] group-hover:[fill-opacity:0] group-hover:[stroke-opacity:0.45] group-hover:[stroke-dasharray:2_2] group-has-[:focus-visible]:[fill-opacity:0] group-has-[:focus-visible]:[stroke-dasharray:2_2]"
			/>
			<polygon
				points={finish}
				stroke="currentColor"
				strokeWidth={1.25}
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
				className="transition-[fill-opacity,stroke-opacity,stroke-dasharray] duration-500 ease-out fill-current [fill-opacity:0] [stroke-opacity:0.45] [stroke-dasharray:2_2] group-hover:[fill-opacity:0.28] group-hover:[stroke-opacity:1] group-hover:[stroke-dasharray:none] group-has-[:focus-visible]:[fill-opacity:0.28] group-has-[:focus-visible]:[stroke-opacity:1] group-has-[:focus-visible]:[stroke-dasharray:none]"
			/>
		</svg>
	)
}
