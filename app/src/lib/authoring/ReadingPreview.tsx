"use client"
import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import JournalPreview from "./JournalPreview"
import { revisedPassages, remarkEditorialChanges } from "./editorial-diff"
import type { CmsAsset, CmsDocument, CmsField } from "./types"
import { SCHEMAS, documentRelations } from "./schema"
import { assetPublicPath } from "./documents"

const EMPTY_ASSETS: readonly CmsAsset[] = []
import {
	createAssetUrlSet,
	EMPTY_ASSET_URLS as EMPTY_URLS,
	recordImages,
	type RecordImage,
} from "./preview-media"
export { recordImages } from "./preview-media"

export function useAssetUrls(assets: readonly CmsAsset[] = EMPTY_ASSETS) {
	const stableAssets = assets.length ? assets : EMPTY_ASSETS
	const [urls, setUrls] = useState<Record<string, string>>(EMPTY_URLS)
	useEffect(() => {
		const owned = createAssetUrlSet(stableAssets)
		setUrls(owned.urls)
		return owned.dispose
	}, [stableAssets])
	return urls
}
export function Prose({ source, previousSource }: { source: string; previousSource?: string }) {
	return (
		<div className="cms-prose">
			<ReactMarkdown
				remarkPlugins={
					previousSource === undefined
						? [remarkGfm]
						: [remarkGfm, [remarkEditorialChanges, { before: previousSource, after: source }]]
				}
			>
				{source}
			</ReactMarkdown>
		</div>
	)
}
export function ContentPicture({
	image,
	urls = EMPTY_URLS,
}: {
	image: RecordImage
	urls?: Record<string, string>
}) {
	const source = (p: string) => urls[assetPublicPath(p)] || assetPublicPath(p)
	const variants =
		image.variants?.filter((v) => typeof v.path === "string" || typeof v.image === "string") || []
	const srcSet = variants
		.map((v) => source(v.path || v.image || "") + " " + v.width + "w")
		.join(", ")
	return (
		<figure className="cms-picture">
			<picture>
				{srcSet && (
					<source type="image/webp" srcSet={srcSet} sizes="(max-width: 700px) 100vw, 700px" />
				)}
				<img
					src={source(image.image)}
					alt={image.alt || ""}
					width={image.width}
					height={image.height}
					loading="lazy"
				/>
			</picture>
			{image.caption && <figcaption>{image.caption}</figcaption>}
		</figure>
	)
}

const passageText = (before: string, after: string) =>
	before.replace(/\r\n/g, "\n").trimEnd() !== after.replace(/\r\n/g, "\n").trimEnd()

const hasValue = (value: unknown): boolean => {
	if (value == null || value === "") return false
	if (Array.isArray(value)) return value.some(hasValue)
	if (typeof value === "object") return Object.values(value).some(hasValue)
	return true
}
const differs = (value: unknown, before: unknown) =>
	JSON.stringify(value) !== JSON.stringify(before)
const objectValue = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {}
const fieldChange = (value: unknown, before: unknown) =>
	!hasValue(value) ? "Removed" : !hasValue(before) ? "Added" : "Changed"

function ReadingValue({
	field,
	value,
	documents,
}: {
	field: CmsField
	value: unknown
	documents: readonly CmsDocument[]
}) {
	if (!hasValue(value)) return <span className="cms-muted">Not set</span>
	if (field.type === "relation") {
		const ids = Array.isArray(value) ? value : [value]
		return (
			<>
				{ids
					.map(
						(id) =>
							documents.find((d) => d.id === id && d.collection === field.collection)?.data.title ||
							"Missing " + SCHEMAS[field.collection!].singular.toLowerCase()
					)
					.map(String)
					.join(", ")}
			</>
		)
	}
	if (field.type === "object")
		return (
			<dl className="cms-reading-facts">
				{(field.fields || [])
					.filter((child) => hasValue(objectValue(value)[child.name]))
					.map((child) => (
						<div key={child.name}>
							<dt>{child.label}</dt>
							<dd>
								<ReadingValue
									field={child}
									value={objectValue(value)[child.name]}
									documents={documents}
								/>
							</dd>
						</div>
					))}
			</dl>
		)
	if (field.type === "list") {
		const items = Array.isArray(value) ? value : []
		return field.fields ? (
			<ol>
				{items.map((item, index) => (
					<li key={index}>
						<dl className="cms-reading-facts">
							{field
								.fields!.filter((child) => hasValue(objectValue(item)[child.name]))
								.map((child) => (
									<div key={child.name}>
										<dt>{child.label}</dt>
										<dd>
											<ReadingValue
												field={child}
												value={objectValue(item)[child.name]}
												documents={documents}
											/>
										</dd>
									</div>
								))}
						</dl>
					</li>
				))}
			</ol>
		) : (
			<>{items.map(String).join(", ")}</>
		)
	}
	if (field.type === "datetime") {
		const date = new Date(String(value))
		return (
			<>
				{Number.isFinite(date.getTime())
					? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
					: "Invalid date: " + String(value)}
			</>
		)
	}
	if (field.type === "textarea") return <Prose source={String(value)} />
	return <>{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</>
}

/** The schema supplies editorial labels and nested groups; raw IDs and source bookkeeping stay out. */
function ReadingField({
	field,
	value,
	before,
	documents,
	changes,
}: {
	field: CmsField
	value: unknown
	before: unknown
	documents: readonly CmsDocument[]
	changes: boolean
}) {
	const changed = changes && differs(value, before)
	if (changes && !changed) return null
	if (!hasValue(value) && !(changed && hasValue(before))) return null
	const nested = field.type === "object" && field.fields
	return (
		<div data-reading-field={field.name}>
			<dt>
				{field.label}
				{changed && <small className="cms-change-line"> · {fieldChange(value, before)}</small>}
			</dt>
			<dd>
				{nested && hasValue(value) ? (
					<dl className="cms-reading-facts">
						{field.fields!.map((child) => (
							<ReadingField
								key={child.name}
								field={child}
								value={objectValue(value)[child.name]}
								before={objectValue(before)[child.name]}
								documents={documents}
								changes={changes}
							/>
						))}
					</dl>
				) : (
					<ReadingValue field={field} value={value} documents={documents} />
				)}
				{changed && hasValue(before) && (
					<details className="cms-details">
						<summary>Earlier {field.label.toLowerCase()}</summary>
						<ReadingValue field={field} value={before} documents={documents} />
					</details>
				)}
			</dd>
		</div>
	)
}

export default function ReadingPreview({
	document: doc,
	documents,
	assets = EMPTY_ASSETS,
	lens = "read",
	before,
}: {
	document?: CmsDocument
	documents: CmsDocument[]
	assets?: readonly CmsAsset[]
	lens?: "read" | "changes" | "media" | "connections"
	before?: CmsDocument | null
}) {
	const urls = useAssetUrls(assets)
	if (!doc)
		return (
			<div className="cms-preview-empty">
				<span aria-hidden>☷</span>
				<h2>Choose what to share</h2>
				<p>Select records to read the exact update. Unchecked work stays on this device.</p>
			</div>
		)
	if (lens === "read") {
		if (assets.some((asset) => !urls[assetPublicPath(asset.path)]))
			return (
				<p className="cms-muted" role="status">
					Preparing the reading preview…
				</p>
			)
		return <JournalPreview document={doc} documents={documents} urls={urls} />
	}
	const schema = SCHEMAS[doc.collection],
		data = doc.data,
		images = recordImages(doc)
	const fields: readonly CmsField[] = [
		...schema.fields,
		...(typeof data.image === "string" || typeof before?.data.image === "string"
			? [{ name: "image_alt", label: "Image description", type: "text" as const }]
			: []),
	]
	const changed = fields.filter((f) => differs(data[f.name], before?.data[f.name]))
	const bodyChanged = !!passageText(before?.body || "", doc.body),
		mediaChanged = differs(images, before ? recordImages(before) : [])
	const passages = revisedPassages(before?.body || "", doc.body)
	return (
		<article className="cms-reading surface-card cms-editorial-review" data-preview-id={doc.id}>
			<header>
				<p className="cms-eyebrow">
					{schema.singular}
					{!before ? " · New record" : ""}
				</p>
				<h2>{String(data.title || "Untitled " + schema.singular.toLowerCase())}</h2>
				{lens === "changes" && (
					<p className="cms-change-line">
						{before
							? changed.length +
							  " " +
							  (changed.length === 1 ? "property changed" : "properties changed")
							: "New record"}
						{bodyChanged ? " · Notes revised" : ""}
					</p>
				)}
			</header>
			{lens === "connections" ? (
				<section>
					<h3>Connections in this update</h3>
					{documentRelations(doc).length ? (
						<dl className="cms-reading-facts">
							{fields
								.filter((f) => f.type === "relation" && hasValue(data[f.name]))
								.map((f) => (
									<div key={f.name}>
										<dt>{f.label}</dt>
										<dd>
											<ReadingValue field={f} value={data[f.name]} documents={documents} />
										</dd>
									</div>
								))}
						</dl>
					) : (
						<p className="cms-muted">No linked records.</p>
					)}
				</section>
			) : lens === "media" ? (
				<section>
					<h3>Included images</h3>
					<div className="cms-review-photos">
						{images.map((im, i) => (
							<div key={im.image + ":" + i}>
								<p className="cms-eyebrow">
									{i === 0 ? "Cover · " : "Photo "}
									{i + 1}
								</p>
								<ContentPicture image={im} urls={urls} />
								<p className="cms-muted">
									{im.alt ? "Image description: " + im.alt : "No image description yet."}
								</p>
							</div>
						))}
					</div>
					{!images.length && <p className="cms-muted">No images in this record.</p>}
				</section>
			) : (
				<>
					{bodyChanged && (
						<section className="cms-revised-passage">
							<h3>Notes &amp; story · {before ? "Revised passage" : "Added"}</h3>
							{passages.after ? (
								<Prose source={passages.after} previousSource={passages.before} />
							) : (
								<p className="cms-muted">This passage was removed.</p>
							)}
							{passages.before && (
								<details className="cms-details">
									<summary>Earlier wording</summary>
									<Prose source={passages.before} />
								</details>
							)}
						</section>
					)}
					{mediaChanged && (
						<section>
							<h3>Images · Changed</h3>
							<div className="cms-review-photos">
								{images.map((im, i) => (
									<div key={im.image + ":" + i}>
										<ContentPicture image={im} urls={urls} />
										<p className="cms-muted">{im.alt || "No image description yet."}</p>
									</div>
								))}
							</div>
							{!images.length && <p>Images removed.</p>}
							{before && (
								<details className="cms-details">
									<summary>Earlier images and descriptions</summary>
									<div className="cms-review-photos">
										{recordImages(before).map((im, i) => (
											<ContentPicture key={i} image={im} urls={urls} />
										))}
									</div>
								</details>
							)}
						</section>
					)}
					<dl className="cms-reading-facts">
						{changed
							.filter((f) => !["images", "image", "image_alt", "image_variants"].includes(f.name))
							.map((f) => (
								<ReadingField
									key={f.name}
									field={f}
									value={data[f.name]}
									before={before?.data[f.name]}
									documents={documents}
									changes
								/>
							))}
					</dl>
					{!bodyChanged && !changed.length && (
						<p className="cms-muted">No changes in this record.</p>
					)}
					{before && (
						<p className="cms-muted">
							Unchanged content is omitted here. Read shows the complete edition.
						</p>
					)}
				</>
			)}
		</article>
	)
}
