"use client"
import { useId, useRef } from "react"
import type { SessionInfusion } from "@/lib/types/session"
import { infusionIssues } from "@/lib/session-journal.mjs"

export default function InfusionEditor({
	value,
	onChange,
	recordingKey,
}: {
	value: unknown
	onChange: (value: SessionInfusion[]) => void
	recordingKey?: string
}) {
	const rows = (Array.isArray(value) ? value : []) as SessionInfusion[]
	const root = useRef<HTMLDetailsElement>(null)
	const id = useId()
	const change = (index: number, patch: Partial<SessionInfusion>) =>
		onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
	return (
		<details ref={root} className="cms-steep-log" data-recording-key={recordingKey}>
			<summary>Steep log{rows.length ? ` · ${rows.length}` : ""}</summary>
			<p className="cms-muted">
				A time and a few words for each cup. Saved on this device as you go.
			</p>
			{rows.map((row, index) => (
				<fieldset key={index} className="cms-steep-entry">
					<legend>Steep {row.number}</legend>
					<div className="cms-fields cms-steep-timing">
						<label>
							Steep number
							<input
								type="number"
								min={1}
								step={1}
								value={row.number ?? ""}
								onChange={(e) =>
									change(index, {
										number: e.target.value === "" ? undefined : Number(e.target.value),
									})
								}
							/>
						</label>
						<label>
							Duration (s)
							<input
								type="number"
								min={0}
								step="any"
								inputMode="decimal"
								data-steep-duration
								value={row.duration_seconds ?? ""}
								onChange={(e) =>
									change(index, {
										duration_seconds: e.target.value === "" ? undefined : Number(e.target.value),
									})
								}
							/>
						</label>
					</div>
					<div className="cms-field">
						<label htmlFor={id + "-note-" + index}>Steep note</label>
						<textarea
							id={id + "-note-" + index}
							rows={2}
							value={row.note ?? ""}
							onChange={(e) => change(index, { note: e.target.value })}
						/>
					</div>
					<details className="cms-steep-date">
						<summary>Date &amp; time (optional)</summary>
						<label>
							Steep date
							<input
								type="datetime-local"
								value={row.at ? localDate(row.at) : ""}
								onChange={(e) =>
									change(index, {
										at: e.target.value ? new Date(e.target.value).toISOString() : undefined,
									})
								}
							/>
						</label>
					</details>
					<button
						type="button"
						className="cms-quiet"
						onClick={() => onChange(rows.filter((_, i) => i !== index))}
					>
						Remove steep {row.number}
					</button>
				</fieldset>
			))}
			{infusionIssues(rows).map((issue) => (
				<p key={issue} className="cms-error" role="status">
					{issue}
				</p>
			))}
			<button
				type="button"
				onClick={() => {
					onChange([
						...rows,
						{
							number:
								Math.max(0, ...rows.map((row) => (Number.isFinite(row.number) ? row.number! : 0))) +
								1,
						},
					])
					requestAnimationFrame(() =>
						root.current
							?.querySelectorAll<HTMLInputElement>("[data-steep-duration]")
							[rows.length]?.focus()
					)
				}}
			>
				Add steep
			</button>
		</details>
	)
}

function localDate(value: string) {
	const date = new Date(value)
	return Number.isFinite(date.getTime())
		? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
		: ""
}
