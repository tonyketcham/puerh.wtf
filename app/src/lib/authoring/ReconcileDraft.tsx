"use client"
import { useId, useMemo, useState } from "react"
import Link from "next/link"
import { useCms } from "./runtime"
import { usePreviewAssets } from "./use-preview-assets"
import ReadingPreview, { ContentPicture, Prose, useAssetUrls } from "./ReadingPreview"
import {
	editorialLabel,
	reconcileDraft,
	reconciliationKey,
	type ReconciliationChoices,
	type ReconciliationConflict,
} from "./reconciliation"
import type { RecordImage } from "./preview-media"
import type { CmsDocument, CmsDraft, CmsField } from "./types"

export interface ReconcileDraftProps {
	draft: CmsDraft
	remote: CmsDocument
	head: string
	documents: CmsDocument[]
	onApply(document: CmsDocument): void | Promise<void>
}

function ConflictValue({
	value,
	field,
	body = false,
	documents,
	urls,
}: {
	value: unknown
	field?: CmsField
	body?: boolean
	documents: CmsDocument[]
	urls: Record<string, string>
}) {
	if (value === undefined) return <p className="cms-muted">Removed</p>
	if (value === null || value === "") return <p className="cms-muted">Empty</p>
	if (body || field?.type === "textarea") return <Prose source={String(value)} />
	if (field?.type === "relation")
		return (
			<p>
				{(Array.isArray(value) ? value : [value])
					.map((id) =>
						String(
							documents.find(
								(document) => document.id === id && document.collection === field.collection
							)?.data.title || "Missing linked record"
						)
					)
					.join(", ")}
			</p>
		)
	if (field?.type === "image" && typeof value === "string")
		return <ContentPicture image={{ image: value }} urls={urls} />
	if (field?.type === "image" && typeof value === "object" && !Array.isArray(value)) {
		const picture = value as Record<string, unknown>
		if (typeof picture.image !== "string" || !picture.image)
			return <p className="cms-muted">Image removed</p>
		const variants = Array.isArray(picture.image_variants)
			? (picture.image_variants as RecordImage["variants"])
			: undefined
		return (
			<div>
				<ContentPicture image={{ image: picture.image, variants }} urls={urls} />
				<p className="cms-muted">
					{variants?.length
						? "Responsive image · " + variants.length + " sizes kept together"
						: "Image without responsive variants"}
				</p>
			</div>
		)
	}
	if (Array.isArray(value))
		return (
			<div>
				{value.length ? (
					value.map((item, index) => (
						<div key={index} className="cms-list-item">
							<small>Item {index + 1}</small>
							<ConflictValue
								value={item}
								field={
									field
										? {
												...field,
												type: field.fields
													? "object"
													: field.itemType === "number"
													? "number"
													: "text",
										  }
										: undefined
								}
								documents={documents}
								urls={urls}
							/>
						</div>
					))
				) : (
					<p className="cms-muted">Empty list</p>
				)}
			</div>
		)
	if (typeof value === "object")
		return (
			<dl className="cms-reading-facts">
				{Object.entries(value)
					.filter(([name]) => !["id", "image_variants", "variants"].includes(name))
					.map(([name, item]) => {
						const child = field?.fields?.find((candidate) => candidate.name === name)
						return (
							<div key={name}>
								<dt>{child?.label || editorialLabel(name)}</dt>
								<dd>
									<ConflictValue value={item} field={child} documents={documents} urls={urls} />
								</dd>
							</div>
						)
					})}
			</dl>
		)
	return (
		<p style={{ overflowWrap: "anywhere" }}>
			{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
		</p>
	)
}

function Conflict({
	conflict,
	choices,
	choose,
	documents,
	urls,
	prefix,
}: {
	conflict: ReconciliationConflict
	choices: ReconciliationChoices
	choose(id: string, value: "local" | "latest"): void
	documents: CmsDocument[]
	urls: Record<string, string>
	prefix: string
}) {
	return (
		<fieldset className="cms-details" style={{ minWidth: 0 }} data-reconcile-conflict={conflict.id}>
			<legend>{conflict.label}</legend>
			<p>Both versions changed this field. Choose the wording or value to keep.</p>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
					gap: "1rem",
					marginTop: "1rem",
				}}
			>
				{(["local", "latest"] as const).map((choice) => (
					<div key={choice} className="cms-list-item">
						<label
							htmlFor={prefix + choice}
							style={{
								display: "flex",
								alignItems: "center",
								gap: ".65rem",
								minHeight: 44,
								cursor: "pointer",
							}}
						>
							<input
								id={prefix + choice}
								type="radio"
								name={prefix}
								checked={choices[conflict.id] === choice}
								onChange={() => choose(conflict.id, choice)}
							/>
							<strong>
								{choice === "local" ? "Keep my local edit" : "Use latest repository version"}
							</strong>
						</label>
						<ConflictValue
							value={choice === "local" ? conflict.local : conflict.remote}
							field={conflict.field}
							body={conflict.body}
							documents={documents}
							urls={urls}
						/>
					</div>
				))}
			</div>
			<details className="cms-details">
				<summary>Earlier version of {conflict.label.toLowerCase()}</summary>
				<ConflictValue
					value={conflict.base}
					field={conflict.field}
					body={conflict.body}
					documents={documents}
					urls={urls}
				/>
			</details>
		</fieldset>
	)
}

/** A new exact snapshot remounts the choices so old acknowledgements never apply to new content. */
export default function ReconcileDraft(props: ReconcileDraftProps) {
	return (
		<ReconciliationSession
			key={reconciliationKey(props.draft, props.remote, props.head)}
			{...props}
		/>
	)
}

function ReconciliationSession({ draft, remote, head, documents, onApply }: ReconcileDraftProps) {
	const [choices, setChoices] = useState<ReconciliationChoices>({}),
		[applying, setApplying] = useState(false),
		[error, setError] = useState("")
	const prefix = useId(),
		{ state } = useCms()
	const result = useMemo(() => reconcileDraft(draft, remote, choices), [draft, remote, choices])
	const previewDocuments = result.document
		? documents.filter((document) => document.id !== draft.id).concat(result.document)
		: documents
	const media = usePreviewAssets(
		result.document || undefined,
		remote,
		state.drafts,
		draft.branch,
		head,
		draft.branch,
		head,
		{ documents: previewDocuments, beforeDocuments: documents }
	)
	const urls = useAssetUrls(media.assets)
	return (
		<section
			className="cms-reconciliation"
			aria-label="Reconcile this draft"
			data-reconcile-draft={draft.id}
		>
			<h2>Keep your edits and the latest version</h2>
			<p className="cms-muted">
				The repository changed while you were writing. Nonoverlapping edits are kept automatically.
				Nothing is pushed by this step.
			</p>
			{result.error ? (
				<div className="cms-error" role="alert">
					<p>{result.error}</p>
					<p>
						<Link href="/working-changes/">
							Export local drafts in Working changes → Draft recovery
						</Link>
					</p>
				</div>
			) : (
				<>
					<p className="cms-muted" role="status">
						{result.unresolved.length
							? result.unresolved.length +
							  " " +
							  (result.unresolved.length === 1 ? "choice remaining" : "choices remaining")
							: "All fields are resolved. Read the result before applying it."}
					</p>
					{result.conflicts.map((conflict, index) => (
						<Conflict
							key={conflict.id}
							prefix={prefix + "-" + index + "-"}
							conflict={conflict}
							choices={choices}
							choose={(id, value) => setChoices((current) => ({ ...current, [id]: value }))}
							documents={documents}
							urls={urls}
						/>
					))}
					{media.error && (
						<p className="cms-error" role="alert">
							{media.error}{" "}
							<button type="button" onClick={media.retry}>
								Retry images
							</button>
						</p>
					)}
					{result.document && !media.loading && !media.error && (
						<div style={{ marginTop: "1.5rem" }}>
							<h3>Reconciled reading preview</h3>
							<ReadingPreview
								document={result.document}
								documents={previewDocuments}
								assets={media.assets}
								before={remote}
							/>
						</div>
					)}
					{error && (
						<p className="cms-error" role="alert">
							{error}
						</p>
					)}
					<div className="cms-actions" style={{ marginTop: "1.25rem" }}>
						<button
							className="cms-primary"
							disabled={!head || !result.document || !!result.unresolved.length || applying}
							onClick={async () => {
								if (!result.document || result.unresolved.length || !head) return
								setApplying(true)
								setError("")
								try {
									await onApply(result.document)
								} catch (failure) {
									setError(
										failure instanceof Error
											? failure.message
											: "The reconciled draft could not be saved. Your earlier local work is retained."
									)
								} finally {
									setApplying(false)
								}
							}}
						>
							{applying ? "Applying on this device…" : "Apply reconciled draft"}
						</button>
						<span className="cms-muted">Then review the update before Commit &amp; push.</span>
					</div>
				</>
			)}
		</section>
	)
}
