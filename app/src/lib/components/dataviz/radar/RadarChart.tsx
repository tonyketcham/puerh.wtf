"use client"

import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SessionFlavorAxes } from "../../../types/session"

interface RadarChartProps {
	data: Record<
		string,
		{
			start: number
			finish: number
		}
	>
	recordingKey?: string
}

export default function RadarChart({ data, recordingKey }: RadarChartProps) {
	// Use viewBox for responsive SVG - increased size to accommodate labels
	const viewBoxSize = 380
	const centerX = viewBoxSize / 2
	const centerY = viewBoxSize / 2
	const radius = viewBoxSize / 2 - 90

	const axes = Object.keys(data)
	const angleSlice = (Math.PI * 2) / axes.length
	const svgRef = useRef<SVGSVGElement>(null)

	// Generate randomized delay sequence for data points
	const randomizedDelays = useMemo(() => {
		const baseDelay = 1.0
		const staggerIncrement = 0.1 // Faster than 0.15
		const delays = axes.map((_, i) => baseDelay + i * staggerIncrement)

		// Fisher-Yates shuffle
		for (let i = delays.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1))
			;[delays[i], delays[j]] = [delays[j], delays[i]]
		}
		return delays
	}, [axes.length])

	// Track animation completion
	const [completedAnimations, setCompletedAnimations] = useState(new Set<string>())

	// Calculate total number of animations:
	// 5 graph circles + axes.length axis lines + 1 radar path + axes.length data points + axes.length labels
	const totalAnimations = 5 + axes.length * 3 + 1

	const handleAnimationComplete = useCallback((animationId: string) => {
		setCompletedAnimations((prev) => {
			const newSet = new Set(prev)
			newSet.add(animationId)
			return newSet
		})
	}, [])

	// Reset animation tracking when data changes
	useEffect(() => {
		setCompletedAnimations(new Set())
		if (svgRef.current) {
			svgRef.current.removeAttribute("data-animations-complete")
		}

		const maxDelay = Math.max(...randomizedDelays)
		const lastLabelAnimationEnd = maxDelay + 0.4 + (axes.length - 1) * 0.03 + 0.4
		const fallbackTimer = window.setTimeout(() => {
			svgRef.current?.setAttribute("data-animations-complete", "true")
		}, (lastLabelAnimationEnd + 0.1) * 1000)

		return () => window.clearTimeout(fallbackTimer)
	}, [axes.length, data, randomizedDelays])

	// Set data attribute when all animations are complete
	useEffect(() => {
		if (completedAnimations.size === totalAnimations && svgRef.current) {
			svgRef.current.setAttribute("data-animations-complete", "true")
		}
	}, [completedAnimations.size, totalAnimations])

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
				ref={svgRef}
				viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
				className="w-full h-full"
				preserveAspectRatio="xMidYMid meet"
				data-recording-key={recordingKey}
			>
				{/* Background circles - multiple concentric circles */}
				{[0.2, 0.4, 0.6, 0.8, 1.0].map((scale, i) => (
					<motion.circle
						key={i}
						cx={centerX}
						cy={centerY}
						r={radius * scale}
						fill="none"
						stroke="#374151"
						strokeWidth="1"
						opacity="0.4"
						initial={{
							opacity: 0,
							scale: 0.8,
						}}
						animate={{
							opacity: 0.4,
							scale: 1,
						}}
						transition={{
							duration: 0.5,
							ease: "easeOut",
							delay: i * 0.05, // Subtle stagger from inside out
						}}
						onAnimationComplete={() => handleAnimationComplete(`background-circle-${i}`)}
						style={{
							transformOrigin: `${centerX}px ${centerY}px`,
							willChange: "transform, opacity",
						}}
					/>
				))}

				{/* Axis lines */}
				{axes.map((axis, i) => {
					const angle = angleSlice * i - Math.PI / 2
					const x2 = centerX + radius * 1.15 * Math.cos(angle)
					const y2 = centerY + radius * 1.15 * Math.sin(angle)

					return (
						<motion.line
							key={axis}
							x1={centerX}
							y1={centerY}
							x2={x2}
							y2={y2}
							stroke="#4B5563"
							strokeWidth="1"
							opacity="0.6"
							initial={{
								pathLength: 0,
								opacity: 0,
							}}
							animate={{
								pathLength: 1,
								opacity: 0.6,
							}}
							transition={{
								duration: 0.4,
								ease: "easeOut",
								delay: 0.3 + i * 0.08, // Staggered draw-on effect
							}}
							onAnimationComplete={() => handleAnimationComplete(`axis-line-${i}`)}
							style={{
								willChange: "opacity",
							}}
						/>
					)
				})}

				{/* Radar shape */}
				<motion.path
					d={pathData}
					fill="#F59E0B"
					fillOpacity="0.15"
					stroke="#F59E0B"
					strokeWidth="2"
					initial={{
						scale: 0,
						opacity: 0,
					}}
					animate={{
						scale: 1,
						opacity: 1,
					}}
					transition={{
						duration: 0.8,
						ease: [0.25, 0.1, 0.25, 1], // Sharp but smooth easing
						delay: 0.2,
					}}
					onAnimationComplete={() => handleAnimationComplete("radar-path")}
					style={{
						transformOrigin: `${centerX}px ${centerY}px`,
						willChange: "transform, opacity",
					}}
				/>

				{/* Data points */}
				{points.map((point, i) => (
					<motion.circle
						key={i}
						cx={point.x}
						cy={point.y}
						r="4"
						fill="#F59E0B"
						stroke="#1F2937"
						strokeWidth="2"
						initial={{
							scale: 0,
							opacity: 0,
						}}
						animate={{
							scale: [0, 1.3, 1], // Slight overshoot for impact
							opacity: [0, 0.4, 1, 0.8, 1], // Flicker effect
						}}
						transition={{
							duration: 0.4, // Faster flicker (was 0.6)
							ease: [0.34, 1.56, 0.64, 1], // Cyberpunk bounce
							delay: randomizedDelays[i], // Randomized activation order
						}}
						onAnimationComplete={() => handleAnimationComplete(`data-point-${i}`)}
						style={{
							transformOrigin: `${point.x}px ${point.y}px`,
							willChange: "transform, opacity",
						}}
					/>
				))}

				{/* Labels */}
				{axes.map((axis, i) => {
					const angle = angleSlice * i - Math.PI / 2
					const labelRadius = radius * 1.25
					const x = centerX + labelRadius * Math.cos(angle)
					const y = centerY + labelRadius * Math.sin(angle)

					// Better text anchor positioning
					let textAnchor: "start" | "middle" | "end" = "middle"
					const normalizedAngle = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)

					if (normalizedAngle > Math.PI / 4 && normalizedAngle < (3 * Math.PI) / 4) {
						textAnchor = "start"
					} else if (normalizedAngle > (5 * Math.PI) / 4 && normalizedAngle < (7 * Math.PI) / 4) {
						textAnchor = "end"
					}

					return (
						<motion.text
							key={axis}
							x={x}
							y={y}
							textAnchor={textAnchor}
							fontSize="13"
							fill="#D1D5DB"
							opacity="0.9"
							dy="0.35em"
							className="font-medium"
							initial={{
								opacity: 0,
								y: 10, // Use transform y instead of SVG y
							}}
							animate={{
								opacity: 0.9,
								y: 0,
							}}
							transition={{
								duration: 0.4,
								ease: "easeOut",
								delay: Math.max(...randomizedDelays) + 0.4 + i * 0.03, // After all points appear, faster stagger
							}}
							onAnimationComplete={() => handleAnimationComplete(`label-${i}`)}
							style={{
								willChange: "opacity, transform",
							}}
						>
							{axis}
						</motion.text>
					)
				})}
			</svg>
		</div>
	)
}
