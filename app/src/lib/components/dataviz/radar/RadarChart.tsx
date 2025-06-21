"use client"

import type { SessionFlavorAxes } from "../../../types/session"

interface RadarChartProps {
	data: SessionFlavorAxes
}

export default function RadarChart({ data }: RadarChartProps) {
	const width = 300
	const height = 200
	const centerX = width / 2
	const centerY = height / 2
	const radius = Math.min(width, height) / 2 - 40

	const axes = Object.keys(data)
	const angleSlice = (Math.PI * 2) / axes.length

	// Convert data to points for the radar chart
	const points = axes.map((axis, i) => {
		const angle = angleSlice * i - Math.PI / 2
		const value = data[axis as keyof SessionFlavorAxes]?.start || 0
		const normalizedValue = (value / 10) * radius // Assuming max value is 10

		return {
			x: centerX + normalizedValue * Math.cos(angle),
			y: centerY + normalizedValue * Math.sin(angle),
			label: axis,
			angle,
			value,
		}
	})

	// Create SVG path for the radar shape
	const pathData =
		points
			.map((point, i) => {
				return `${i === 0 ? "M" : "L"} ${point.x} ${point.y}`
			})
			.join(" ") + "Z"

	return (
		<div className="w-full h-48">
			<svg width={width} height={height} className="w-full h-full">
				{/* Background circles */}
				<circle
					cx={centerX}
					cy={centerY}
					r={radius}
					fill="none"
					stroke="#666"
					strokeWidth="1"
					opacity="0.3"
				/>
				<circle
					cx={centerX}
					cy={centerY}
					r={radius / 2}
					fill="none"
					stroke="#666"
					strokeWidth="1"
					opacity="0.3"
				/>

				{/* Axis lines */}
				{axes.map((axis, i) => {
					const angle = angleSlice * i - Math.PI / 2
					const x2 = centerX + radius * 1.1 * Math.cos(angle)
					const y2 = centerY + radius * 1.1 * Math.sin(angle)

					return (
						<line
							key={axis}
							x1={centerX}
							y1={centerY}
							x2={x2}
							y2={y2}
							stroke="#666"
							strokeWidth="1"
							opacity="0.5"
						/>
					)
				})}

				{/* Radar shape */}
				<path d={pathData} fill="#f2c94c" fillOpacity="0.3" stroke="#f2c94c" strokeWidth="2" />

				{/* Data points */}
				{points.map((point, i) => (
					<circle
						key={i}
						cx={point.x}
						cy={point.y}
						r="3"
						fill="#f2c94c"
						stroke="#fff"
						strokeWidth="1"
					/>
				))}

				{/* Labels */}
				{axes.map((axis, i) => {
					const angle = angleSlice * i - Math.PI / 2
					const labelRadius = radius * 1.25
					const x = centerX + labelRadius * Math.cos(angle)
					const y = centerY + labelRadius * Math.sin(angle)

					let textAnchor = "middle"
					if (i === 0 || i === axes.length / 2) {
						textAnchor = "middle"
					} else if (i < axes.length / 2) {
						textAnchor = "start"
					} else {
						textAnchor = "end"
					}

					return (
						<text
							key={axis}
							x={x}
							y={y}
							textAnchor={textAnchor}
							fontSize="12px"
							fill="#e5e5e5"
							opacity="0.8"
							dy="0.35em"
						>
							{axis}
						</text>
					)
				})}
			</svg>
		</div>
	)
}
