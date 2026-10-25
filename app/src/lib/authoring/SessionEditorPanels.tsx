"use client"

import { useState } from "react"
import { useMotionValue } from "motion/react"
import PanelSection from "@/lib/components/containers/PanelSection"
import RadarChart from "@/lib/components/dataviz/radar/RadarChart"
import {
	CENTER,
	VIEWBOX,
	RADIUS,
	axisAngle,
	polar,
	type RadarAxisData,
} from "@/lib/components/dataviz/radar/geometry"
import { formatTemp, ratio, formatSeconds } from "@/lib/steeps"
import { AXIS_FIELDS, SCHEMAS } from "./schema"
import { Field, type CreateRelated } from "./Fields"
import type { CmsDocument } from "./types"

const object = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {}
const axisLabel = (axis: string) => axis.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
const axisValue = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : 0

export function FlavorEditor({
	value,
	onChange,
}: {
	value: unknown
	onChange(value: Record<string, unknown>): void
}) {
	const [stage, setStage] = useState<"start" | "finish">("start"),
		[selected, setSelected] = useState("floral")
	const [dragValue, setDragValue] = useState<{ axis: string; value: number } | null>(null)
	const phase = useMotionValue(0),
		source = object(value)
	const data: RadarAxisData = Object.fromEntries(
		AXIS_FIELDS.map((axis) => [
			axis,
			{
				start: axisValue(object(source[axis]).start),
				finish: axisValue(object(source[axis]).finish),
			},
		])
	)
	if (dragValue) data[dragValue.axis] = { ...data[dragValue.axis], [stage]: dragValue.value }
	const updateAxis = (axis: string, next: number | undefined) =>
		onChange({ ...source, [axis]: { ...object(source[axis]), [stage]: next } })
	return (
		<section className="cms-editor-panel surface-plate" aria-label="Edit flavor profile">
			<PanelSection
				title="Flavor profile"
				rightSlot={
					<div className="cms-phase-keys">
						{(["start", "finish"] as const).map((p) => (
							<button
								type="button"
								key={p}
								aria-pressed={stage === p}
								onClick={() => {
									setStage(p)
									phase.set(p === "start" ? 0 : 1)
								}}
							>
								{p}
							</button>
						))}
					</div>
				}
			>
				<p className="cms-muted">
					Shape the tea as it opens and as it leaves. Drag a point, or choose a flavor below.
				</p>
				<div className="cms-flavor-chart">
					<RadarChart data={data} phase={phase} recordingKey="editor-flavor" />
					<svg
						className="cms-flavor-handles"
						viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
						aria-hidden="true"
					>
						{AXIS_FIELDS.map((axis, i) => {
							const pt = polar(i, AXIS_FIELDS.length, data[axis][stage])
							return (
								<circle
									key={axis}
									cx={pt.x}
									cy={pt.y}
									r={selected === axis ? 10 : 8}
									className={selected === axis ? "is-selected" : undefined}
									onPointerDown={(e) => {
										e.preventDefault()
										setSelected(axis)
										e.currentTarget.setPointerCapture(e.pointerId)
									}}
									onPointerMove={(e) => {
										if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
										const bounds = e.currentTarget.ownerSVGElement!.getBoundingClientRect(),
											x = ((e.clientX - bounds.left) / bounds.width) * VIEWBOX - CENTER,
											y = ((e.clientY - bounds.top) / bounds.height) * VIEWBOX - CENTER,
											angle = axisAngle(i, AXIS_FIELDS.length)
										setDragValue({
											axis,
											value:
												Math.round(
													Math.min(
														10,
														Math.max(0, ((x * Math.cos(angle) + y * Math.sin(angle)) / RADIUS) * 10)
													) * 2
												) / 2,
										})
									}}
									onPointerUp={(e) => {
										if (dragValue?.axis === axis) updateAxis(axis, dragValue.value)
										setDragValue(null)
										if (e.currentTarget.hasPointerCapture(e.pointerId))
											e.currentTarget.releasePointerCapture(e.pointerId)
									}}
									onPointerCancel={() => setDragValue(null)}
								/>
							)
						})}
					</svg>
				</div>
				<div className="cms-flavor-palette" aria-label="Choose a flavor">
					{AXIS_FIELDS.map((axis) => (
						<button
							type="button"
							key={axis}
							aria-pressed={axis === selected}
							onClick={() => setSelected(axis)}
						>
							{axisLabel(axis)}
						</button>
					))}
				</div>
				<div className="cms-flavor-value">
					<label htmlFor="cms-flavor-intensity">
						{axisLabel(selected)} · {stage}
					</label>
					<input
						id="cms-flavor-intensity"
						aria-label={`${axisLabel(selected)} ${stage} intensity`}
						type="range"
						min={0}
						max={10}
						step={0.5}
						value={data[selected][stage]}
						onChange={(e) => updateAxis(selected, Number(e.target.value))}
					/>
					<input
						aria-label={`${axisLabel(selected)} ${stage} value`}
						type="number"
						min={0}
						max={10}
						step={0.5}
						value={String(object(source[selected])[stage] ?? "")}
						placeholder="—"
						onChange={(e) =>
							updateAxis(selected, e.target.value === "" ? undefined : Number(e.target.value))
						}
					/>
				</div>
			</PanelSection>
		</section>
	)
}

export function BrewingEditor({
	value,
	documents,
	onCreate,
	onChange,
}: {
	value: unknown
	documents: CmsDocument[]
	onCreate: CreateRelated
	onChange(value: Record<string, unknown>): void
}) {
	const data = object(value),
		[unit, setUnit] = useState<"C" | "F">("C")
	const temperature = typeof data.temperature === "number" ? data.temperature : undefined
	const temp = formatTemp(temperature),
		brewRatio = ratio(
			typeof data.material_amount === "number" ? data.material_amount : null,
			typeof data.liquid_amount === "number" ? data.liquid_amount : null
		)
	const set = (name: string, next: unknown) => onChange({ ...data, [name]: next })
	const fields = SCHEMAS.tastings.fields.find((f) => f.name === "brewing")!.fields!
	return (
		<section className="cms-editor-panel surface-plate" aria-label="Edit brewing">
			<PanelSection
				title="At the tea table"
				rightSlot={<span>{brewRatio || "Brew your way"}</span>}
			>
				<div className="cms-fields">
					<div className="cms-field">
						<label htmlFor="cms-temperature">Water temperature (°{unit})</label>
						<div className="cms-temperature-control">
							<input
								id="cms-temperature"
								type="number"
								min={unit === "C" ? -17.8 : 0}
								max={unit === "C" ? 373.9 : 705}
								step="any"
								value={
									temperature === undefined
										? ""
										: unit === "F"
										? temperature
										: Math.round((((temperature - 32) * 5) / 9) * 10) / 10
								}
								onChange={(e) =>
									set(
										"temperature",
										e.target.value === ""
											? undefined
											: unit === "F"
											? Number(e.target.value)
											: (Number(e.target.value) * 9) / 5 + 32
									)
								}
							/>
							<button
								type="button"
								aria-label={
									"Show temperature in degrees " + (unit === "C" ? "Fahrenheit" : "Celsius")
								}
								onClick={() => setUnit(unit === "C" ? "F" : "C")}
							>
								°{unit === "C" ? "F" : "C"}
							</button>
						</div>
						{temp && <small>{temp.label}</small>}
					</div>
					{fields
						.filter((f) => f.name !== "temperature")
						.map((f) => (
							<Field
								key={f.name}
								field={f}
								value={data[f.name]}
								onChange={(v) => set(f.name, v)}
								documents={documents}
								onCreate={onCreate}
							/>
						))}
				</div>
				<p className="cms-brew-description">
					{[
						temp && `${temp.c}°C water`,
						typeof data.material_amount === "number" && `${data.material_amount}g leaf`,
						typeof data.liquid_amount === "number" && `${data.liquid_amount}mL water`,
						typeof data.first_infusion_duration === "number" &&
							`${formatSeconds(data.first_infusion_duration)} first infusion`,
						typeof data.infusion_increment === "number" &&
							`+${formatSeconds(data.infusion_increment)} each steep`,
					]
						.filter(Boolean)
						.join(" · ") || "A little leaf, a little water. Record what works for this tea."}
				</p>
			</PanelSection>
		</section>
	)
}
