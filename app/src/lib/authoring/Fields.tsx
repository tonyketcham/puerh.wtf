"use client"
import { useId, useState } from "react"
import type { CmsDocument, CmsField, Collection } from "./types"
import { SCHEMAS } from "./schema"

export function Field({
	field,
	value,
	onChange,
	documents,
	onCreate,
}: {
	field: CmsField
	value: unknown
	onChange: (value: unknown) => void
	documents: CmsDocument[]
	onCreate: (collection: Collection, field: string) => void
}) {
	const id = useId(),
		[query, setQuery] = useState("")
	const label = (
		<label htmlFor={id}>
			{field.label}
			{field.required ? <span aria-label="required"> *</span> : null}
		</label>
	)
	if (field.type === "object") {
		const values = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
		return (
			<details className="cms-property-group">
				<summary>{field.label}</summary>
				<div className="cms-fields">
					{field.fields?.map((f) => (
						<Field
							key={f.name}
							field={f}
							value={values[f.name]}
							documents={documents}
							onCreate={onCreate}
							onChange={(v) => onChange({ ...values, [f.name]: v })}
						/>
					))}
				</div>
			</details>
		)
	}
	if (field.type === "list") {
		const values = Array.isArray(value) ? value : []
		return (
			<details className="cms-property-group">
				<summary>
					{field.label} <span>{values.length || ""}</span>
				</summary>
				{values.map((item, i) => (
					<div key={i} className="cms-list-item">
						{field.fields ? (
							<div className="cms-fields">
								{field.fields.map((f) => (
									<Field
										key={f.name}
										field={f}
										value={item?.[f.name]}
										documents={documents}
										onCreate={onCreate}
										onChange={(v) =>
											onChange(values.map((x, n) => (n === i ? { ...x, [f.name]: v } : x)))
										}
									/>
								))}
							</div>
						) : (
							<input
								aria-label={field.label + " " + (i + 1)}
								type={field.itemType === "number" ? "number" : "text"}
								value={String(item ?? "")}
								onChange={(e) =>
									onChange(
										values.map((x, n) =>
											n === i
												? field.itemType === "number"
													? Number(e.target.value)
													: e.target.value
												: x
										)
									)
								}
							/>
						)}
						<button
							type="button"
							className="cms-quiet"
							onClick={() => onChange(values.filter((_, n) => n !== i))}
						>
							Remove item {i + 1}
						</button>
					</div>
				))}
				<button
					type="button"
					onClick={() =>
						onChange([...values, field.fields ? {} : field.itemType === "number" ? 0 : ""])
					}
				>
					Add {field.label.toLowerCase()} item
				</button>
			</details>
		)
	}
	if (field.type === "relation" && field.collection) {
		const ids = (Array.isArray(value) ? value : value ? [value] : []).map(String)
		const options = documents.filter(
			(d) =>
				d.collection === field.collection &&
				!ids.includes(d.id) &&
				String(d.data.title || "")
					.toLowerCase()
					.includes(query.toLowerCase())
		)
		return (
			<div className="cms-field">
				{label}
				{!!ids.length && (
					<div className="cms-chips">
						{ids.map((key) => (
							<button
								key={key}
								type="button"
								onClick={() => onChange(field.multiple ? ids.filter((x) => x !== key) : undefined)}
								aria-label={
									"Remove " + String(documents.find((d) => d.id === key)?.data.title || key)
								}
							>
								{String(documents.find((d) => d.id === key)?.data.title || "Missing relation")}{" "}
								<span aria-hidden>×</span>
							</button>
						))}
					</div>
				)}
				<div className="cms-relation-controls">
					<input
						id={id}
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={"Find " + SCHEMAS[field.collection].label.toLowerCase()}
					/>
					<select
						aria-label={"Choose " + field.label}
						value=""
						onChange={(e) => {
							if (e.target.value)
								onChange(field.multiple ? [...ids, e.target.value] : e.target.value)
							setQuery("")
						}}
					>
						<option value="">Choose…</option>
						{options.map((d) => (
							<option key={d.id} value={d.id}>
								{String(d.data.title || "Untitled")}
							</option>
						))}
					</select>
				</div>
				<button
					type="button"
					className="cms-quiet"
					onClick={() => onCreate(field.collection!, field.name)}
				>
					New {SCHEMAS[field.collection].singular.toLowerCase()}
				</button>
			</div>
		)
	}
	const common = { id, name: field.name, required: field.required }
	return (
		<div className="cms-field">
			{label}
			{field.type === "textarea" ? (
				<textarea
					{...common}
					rows={3}
					value={String(value ?? "")}
					onChange={(e) => onChange(e.target.value)}
				/>
			) : field.type === "boolean" ? (
				<input
					{...common}
					type="checkbox"
					checked={value === true}
					onChange={(e) => onChange(e.target.checked)}
				/>
			) : field.type === "select" ? (
				<select
					{...common}
					value={String(value ?? "")}
					onChange={(e) => onChange(e.target.value || undefined)}
				>
					<option value="">Not set</option>
					{value && !field.options?.includes(String(value)) ? (
						<option value={String(value)}>{String(value)}</option>
					) : null}
					{field.options?.map((v) => (
						<option key={v}>{v}</option>
					))}
				</select>
			) : field.type === "datetime" ? (
				<input
					{...common}
					type="datetime-local"
					value={localDate(value)}
					onChange={(e) =>
						onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)
					}
				/>
			) : (
				<input
					{...common}
					type={field.type === "number" ? "number" : "text"}
					inputMode={field.type === "number" ? "decimal" : undefined}
					min={field.min}
					max={field.max}
					step={field.step || "any"}
					value={String(value ?? "")}
					onChange={(e) =>
						onChange(
							e.target.value === ""
								? undefined
								: field.type === "number"
								? Number(e.target.value)
								: e.target.value
						)
					}
				/>
			)}
			{field.hint && <small>{field.hint}</small>}
		</div>
	)
}
function localDate(value: unknown) {
	if (!value) return ""
	const date = new Date(String(value))
	if (!Number.isFinite(date.getTime())) return ""
	return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
