"use client"
import { useEffect, useId, useRef, useState } from "react"
import type { CmsDocument, CmsField, Collection } from "./types"
import { SCHEMAS } from "./schema"
import { ENTITY_META, type EntityKind } from "@/lib/entities"
export type CreateRelated = (
	collection: Collection,
	field: string,
	seed: Record<string, unknown>
) => Promise<boolean>

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
	onCreate: CreateRelated
}) {
	const id = useId()
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
	if (field.type === "relation" && field.collection)
		return (
			<RelationPicker
				field={field}
				value={value}
				onChange={onChange}
				documents={documents}
				onCreate={onCreate}
			/>
		)
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

function RelationPicker({
	field,
	value,
	onChange,
	documents,
	onCreate,
}: {
	field: CmsField
	value: unknown
	onChange(value: unknown): void
	documents: CmsDocument[]
	onCreate: CreateRelated
}) {
	const id = useId(),
		input = useRef<HTMLInputElement>(null),
		creation = useRef<HTMLDivElement>(null)
	const [query, setQuery] = useState(""),
		[open, setOpen] = useState(false),
		[active, setActive] = useState(0)
	const [creating, setCreating] = useState(false),
		[seed, setSeed] = useState<Record<string, unknown>>({}),
		[busy, setBusy] = useState(false),
		[error, setError] = useState("")
	const collection = field.collection!,
		schema = SCHEMAS[collection]
	const ids = (Array.isArray(value) ? value : value ? [value] : []).map(String)
	const options = documents
		.filter(
			(d) =>
				d.collection === collection &&
				!ids.includes(d.id) &&
				String(d.data.title || "")
					.toLowerCase()
					.includes(query.toLowerCase())
		)
		.sort((a, b) => String(a.data.title).localeCompare(String(b.data.title)))
	const kind = (
		{
			vendors: "vendor",
			origins: "origin",
			styles: "style",
			categories: "category",
			cultivars: "cultivar",
			vessels: "vessel",
			tags: "tag",
		} as Partial<Record<Collection, EntityKind>>
	)[collection]
	const glyph = kind ? ENTITY_META[kind].glyph : "@"
	useEffect(() => {
		if (creating) creation.current?.querySelector("input")?.focus()
	}, [creating])
	useEffect(() => {
		if (open) document.getElementById(id + "-" + active)?.scrollIntoView({ block: "nearest" })
	}, [open, active, id])
	const choose = (key: string) => {
		onChange(field.multiple ? [...ids, key] : key)
		setQuery("")
		setOpen(false)
		setActive(0)
		input.current?.focus()
	}
	const beginCreate = () => {
		setCreating(true)
		setSeed({ title: query })
		setOpen(false)
		setError("")
	}
	return (
		<div
			className="cms-field cms-relation-picker"
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
			}}
		>
			<label htmlFor={id}>
				{field.label}
				{field.required && <span aria-label="required"> *</span>}
			</label>
			{!!ids.length && (
				<div className="cms-chips">
					{ids.map((key) => {
						const doc = documents.find((d) => d.id === key)
						return (
							<button
								key={key}
								type="button"
								className="shadow-key"
								aria-label={"Remove " + String(doc?.data.title || "missing relation")}
								onClick={() => onChange(field.multiple ? ids.filter((x) => x !== key) : undefined)}
							>
								<span
									className="cms-entity-glyph"
									aria-hidden
									style={{
										color: typeof doc?.data.color === "string" ? doc.data.color : undefined,
									}}
								>
									{glyph}
								</span>
								{String(doc?.data.title || "Missing relation")} <span aria-hidden>×</span>
							</button>
						)
					})}
				</div>
			)}
			{!creating && (
				<>
					<input
						id={id}
						ref={input}
						role="combobox"
						aria-autocomplete="list"
						aria-expanded={open}
						aria-required={field.required}
						aria-controls={id + "-options"}
						aria-activedescendant={open && options[active] ? id + "-" + active : undefined}
						value={query}
						onFocus={() => setOpen(true)}
						onChange={(e) => {
							setQuery(e.target.value)
							setOpen(true)
							setActive(0)
						}}
						placeholder={"Find " + schema.label.toLowerCase()}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown" || e.key === "ArrowUp") {
								e.preventDefault()
								setOpen(true)
								setActive((n) =>
									Math.max(0, Math.min(options.length - 1, n + (e.key === "ArrowDown" ? 1 : -1)))
								)
							}
							if (e.key === "Escape") {
								e.preventDefault()
								setOpen(false)
							}
							if (e.key === "Enter" && open && options[active]) {
								e.preventDefault()
								choose(options[active].id)
							}
						}}
					/>
					{open && (
						<div
							className="cms-relation-options surface-plate"
							role="listbox"
							id={id + "-options"}
							aria-label={field.label}
						>
							{options.length ? (
								options.map((doc, i) => (
									<button
										type="button"
										role="option"
										tabIndex={-1}
										aria-selected={i === active}
										key={doc.id}
										id={id + "-" + i}
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => choose(doc.id)}
									>
										<span className="cms-entity-glyph" aria-hidden>
											{glyph}
										</span>
										<span>
											{String(doc.data.title || "Untitled")}
											<small>
												{String(
													doc.data.hanzi ||
														doc.data.municipality ||
														doc.data.country ||
														doc.data.kind ||
														""
												)}
											</small>
										</span>
									</button>
								))
							) : (
								<p>No matching {schema.label.toLowerCase()}.</p>
							)}
						</div>
					)}
					<button type="button" className="cms-quiet" onClick={beginCreate}>
						New {schema.singular.toLowerCase()}
					</button>
				</>
			)}
			{creating && (
				<div
					ref={creation}
					className="cms-inline-create shadow-well"
					role="group"
					aria-label={"New " + schema.singular.toLowerCase()}
				>
					<p>Create a {schema.singular.toLowerCase()} without leaving your notes.</p>
					{schema.fields
						.filter(
							(f) =>
								f.required || ["description", "hanzi", "municipality", "country"].includes(f.name)
						)
						.map((f) => (
							<Field
								key={f.name}
								field={f}
								value={seed[f.name]}
								documents={documents}
								onCreate={onCreate}
								onChange={(v) => setSeed((s) => ({ ...s, [f.name]: v }))}
							/>
						))}
					{error && (
						<p className="cms-error" role="alert">
							{error}
						</p>
					)}
					<div className="cms-actions">
						<button
							type="button"
							className="cms-primary shadow-key"
							disabled={
								busy || schema.fields.some((f) => f.required && !String(seed[f.name] ?? "").trim())
							}
							onClick={async () => {
								setBusy(true)
								setError("")
								try {
									if (await onCreate(collection, field.name, seed)) {
										setCreating(false)
										setQuery("")
										requestAnimationFrame(() => input.current?.focus())
									} else
										setError(
											"Could not save this " +
												schema.singular.toLowerCase() +
												". Your notes are safe; try again."
										)
								} catch (e) {
									setError((e as Error).message)
								} finally {
									setBusy(false)
								}
							}}
						>
							{busy ? "Saving…" : "Create & use " + schema.singular.toLowerCase()}
						</button>
						<button
							type="button"
							disabled={busy}
							onClick={() => {
								setCreating(false)
								setSeed({})
								setQuery("")
								setError("")
								requestAnimationFrame(() => input.current?.focus())
							}}
						>
							Cancel
						</button>
					</div>
				</div>
			)}
		</div>
	)
}
