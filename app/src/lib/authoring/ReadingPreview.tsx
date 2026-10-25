"use client"
import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
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
export function Prose({ source }: { source: string }) {
	return (
		<div className="cms-prose">
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
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
	const data = doc.data,
		schema = SCHEMAS[doc.collection],
		refs = documentRelations(doc),
		images = recordImages(doc)
	const fields: readonly CmsField[] = [
		...schema.fields,
		...(typeof data.image === "string" || typeof before?.data.image === "string"
			? [{ name: "image_alt", label: "Image description", type: "text" as const }]
			: []),
	]
	const changed = fields.filter((field) => differs(data[field.name], before?.data[field.name]))
	const changes = lens === "changes",
		mediaChanged = !!before && differs(images, recordImages(before))
	return (
		<article className="cms-reading" data-preview-id={doc.id}>
			<p className="cms-eyebrow">
				{schema.singular}
				{!before ? " · New record" : ""}
			</p>
			<h2>{String(data.title || "Untitled " + schema.singular.toLowerCase())}</h2>
			{changes && (
				<p className="cms-change-line">
					{before
						? changed.length +
						  " " +
						  (changed.length === 1 ? "property changed" : "properties changed")
						: "New record"}
					{before?.body !== doc.body ? " · Notes revised" : ""}
				</p>
			)}
			{changes && before && differs(data.title, before.data.title) && (
				<details className="cms-details">
					<summary>Earlier name</summary>
					<p>{String(before.data.title || "Untitled")}</p>
				</details>
			)}
			{lens === "connections" ? (
				<section>
					<h3>Connections in this update</h3>
					{refs.length ? (
						<dl className="cms-reading-facts">
							{fields
								.filter((field) => field.type === "relation" && hasValue(data[field.name]))
								.map((field) => (
									<div key={field.name}>
										<dt>{field.label}</dt>
										<dd>
											<ReadingValue field={field} value={data[field.name]} documents={documents} />
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
					{images.length ? (
						images.map((im, i) => (
							<div key={i}>
								<ContentPicture image={im} urls={urls} />
								<p className="cms-muted">
									{im.alt ? "Image description: " + im.alt : "No image description yet."}
								</p>
							</div>
						))
					) : (
						<p className="cms-muted">No images in this record.</p>
					)}
				</section>
			) : (
				<>
					{(images.length > 0 || (changes && mediaChanged)) && (
						<section>
							<h3>Images{changes && mediaChanged ? " · Changed" : ""}</h3>
							{images.map((im, i) => (
								<div key={i}>
									<ContentPicture image={im} urls={urls} />
									<p className="cms-muted">
										{im.alt ? "Image description: " + im.alt : "No image description yet."}
									</p>
								</div>
							))}
							{!images.length && <p className="cms-muted">Images removed.</p>}
							{changes && mediaChanged && before && (
								<details className="cms-details">
									<summary>Earlier images and descriptions</summary>
									{recordImages(before).map((im, i) => (
										<div key={i}>
											<ContentPicture image={im} urls={urls} />
											<p className="cms-muted">{im.alt || "No earlier image description."}</p>
										</div>
									))}
								</details>
							)}
						</section>
					)}
					<dl className="cms-reading-facts">
						{fields
							.filter((field) => !["title", "image", "images", "image_alt"].includes(field.name))
							.map((field) => (
								<ReadingField
									key={field.name}
									field={field}
									value={data[field.name]}
									before={before?.data[field.name]}
									documents={documents}
									changes={changes}
								/>
							))}
					</dl>
					<section>
						<h3>Notes &amp; story{changes && before?.body !== doc.body ? " · Changed" : ""}</h3>
						{doc.body ? <Prose source={doc.body} /> : <p className="cms-muted">No notes.</p>}
					</section>
					{changes && before && before.body !== doc.body && (
						<details className="cms-details">
							<summary>Earlier wording</summary>
							<Prose source={before.body || "No earlier notes."} />
						</details>
					)}
				</>
			)}
		</article>
	)
}
