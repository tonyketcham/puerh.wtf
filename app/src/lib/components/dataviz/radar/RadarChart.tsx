"use client"

import type { SessionFlavorAxes } from "../../../types/session"

interface RadarChartProps {
	data: SessionFlavorAxes
}

export default function RadarChart({ data }: RadarChartProps) {
	// Use viewBox for responsive SVG - increased size to accommodate labels
	const viewBoxSize = 380
	const centerX = viewBoxSize / 2
	const centerY = viewBoxSize / 2
	const radius = viewBoxSize / 2 - 90

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
		<div className="w-full h-full">
			<svg
				viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
				className="w-full h-full"
				preserveAspectRatio="xMidYMid meet"
			>
				{/* Background circles - multiple concentric circles */}
				{[0.2, 0.4, 0.6, 0.8, 1.0].map((scale, i) => (
					<circle
						key={i}
						cx={centerX}
						cy={centerY}
						r={radius * scale}
						fill="none"
						stroke="#374151"
						strokeWidth="1"
						opacity="0.4"
					/>
				))}

				{/* Axis lines */}
				{axes.map((axis, i) => {
					const angle = angleSlice * i - Math.PI / 2
					const x2 = centerX + radius * 1.15 * Math.cos(angle)
					const y2 = centerY + radius * 1.15 * Math.sin(angle)

					return (
						<line
							key={axis}
							x1={centerX}
							y1={centerY}
							x2={x2}
							y2={y2}
							stroke="#4B5563"
							strokeWidth="1"
							opacity="0.6"
						/>
					)
				})}

				{/* Radar shape */}
				<path d={pathData} fill="#F59E0B" fillOpacity="0.15" stroke="#F59E0B" strokeWidth="2" />

				{/* Data points */}
				{points.map((point, i) => (
					<circle
						key={i}
						cx={point.x}
						cy={point.y}
						r="4"
						fill="#F59E0B"
						stroke="#1F2937"
						strokeWidth="2"
					/>
				))}

				{/* Labels */}
				{axes.map((axis, i) => {
					const angle = angleSlice * i - Math.PI / 2
					const labelRadius = radius * 1.25
					const x = centerX + labelRadius * Math.cos(angle)
					const y = centerY + labelRadius * Math.sin(angle)

					// Better text anchor positioning
					let textAnchor = "middle"
					const normalizedAngle = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)

					if (normalizedAngle > Math.PI / 4 && normalizedAngle < (3 * Math.PI) / 4) {
						textAnchor = "start"
					} else if (normalizedAngle > (5 * Math.PI) / 4 && normalizedAngle < (7 * Math.PI) / 4) {
						textAnchor = "end"
					}

					return (
						<text
							key={axis}
							x={x}
							y={y}
							textAnchor={textAnchor}
							fontSize="13"
							fill="#D1D5DB"
							opacity="0.9"
							dy="0.35em"
							className="font-medium"
						>
							{axis}
						</text>
					)
				})}
			</svg>
		</div>
	)
}
