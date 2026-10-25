"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useStore } from "jotai"
import { cmsAtom, useCms } from "./runtime"
import { fetchCatalog, type CmsSession } from "./client"
import { usePreviewAssets } from "./use-preview-assets"
import { SCHEMAS } from "./schema"
import { assetPublicPath } from "./documents"
import { isDraftDirty } from "./drafts"
import { Field } from "./Fields"
import ReadingPreview, { ContentPicture, Prose, recordImages, useAssetUrls } from "./ReadingPreview"
import DictationControl from "./voice/DictationControl"
import { optimizeImage } from "./media"
import type { CmsAsset, Collection } from "./types"

function accountIdentity(session: CmsSession | null) {
	return [session?.repository.owner, session?.repository.name, session?.user?.login].join("\u0000")
}

export default function WriteWorkspace() {
	const { state, editDraft, newDraft, review, update } = useCms(),
		store = useStore(),
		params = useSearchParams(),
		router = useRouter()
	const id = params.get("id"),
		draft = state.drafts.find((d) => d.id === id),
		textarea = useRef<HTMLTextAreaElement>(null)
	const latest = useRef(state)
	useLayoutEffect(() => {
		latest.current = state
	}, [state])
	const [preview, setPreview] = useState(false),
		[processing, setProcessing] = useState(""),
		[mediaError, setMediaError] = useState(""),
		abort = useRef<AbortController | null>(null)
	useEffect(() => () => abort.current?.abort(), [draft?.id])
	const sourceBranch = draft?.branch || state.source
	const source = state.catalogs[sourceBranch]
	const account = accountIdentity(state.session)
	const [catalogFailure, setCatalogFailure] = useState<{ branch: string; error: string } | null>(
		null
	)
	const [refreshingImages, setRefreshingImages] = useState(false)
	const catalogError = catalogFailure?.branch === sourceBranch ? catalogFailure.error : ""
	const hasSource = !!source
	useEffect(() => {
		if (state.phase !== "ready" || !id || hasSource) return
		let alive = true
		setCatalogFailure(null)
		fetchCatalog(sourceBranch)
			.then((catalog) => {
				if (!alive) return
				store.set(cmsAtom, (current) =>
					current.phase === "ready" && accountIdentity(current.session) === account
						? { ...current, catalogs: { ...current.catalogs, [catalog.branch]: catalog } }
						: current
				)
			})
			.catch((error: Error) => {
				if (alive) setCatalogFailure({ branch: sourceBranch, error: error.message })
			})
		return () => {
			alive = false
		}
	}, [state.phase, id, hasSource, sourceBranch, account, store])
	// The editor reads current source images; its default Read view does not render Earlier images.
	const previewMedia = usePreviewAssets(
		draft?.document,
		undefined,
		state.drafts,
		sourceBranch,
		source?.head
	)
	const urls = useAssetUrls(previewMedia.assets)
	const waitingForCatalog = !!draft && !hasSource && !catalogError
	const imagesUnavailable =
		waitingForCatalog || previewMedia.loading || !!previewMedia.error || !!catalogError
	const retryImages = async () => {
		if (!draft || refreshingImages || state.phase !== "ready") return
		const expectedAccount = account,
			branch = sourceBranch
		setRefreshingImages(true)
		setCatalogFailure(null)
		try {
			const catalog = await fetchCatalog(branch)
			if (accountIdentity(store.get(cmsAtom).session) !== expectedAccount) return
			store.set(cmsAtom, (current) =>
				current.phase === "ready" && accountIdentity(current.session) === expectedAccount
					? { ...current, catalogs: { ...current.catalogs, [catalog.branch]: catalog } }
					: current
			)
			previewMedia.retry()
		} catch (error) {
			setCatalogFailure({ branch, error: (error as Error).message })
		} finally {
			setRefreshingImages(false)
		}
	}
	const documents = [...(source?.documents || [])]
	for (const d of state.drafts)
		if (d.branch === (draft?.branch || state.source)) {
			const i = documents.findIndex((x) => x.id === d.id)
			if (i >= 0) documents[i] = d.document
			else documents.push(d.document)
		}
	if (state.phase !== "ready" && !state.session?.user)
		return (
			<div className="cms-state-message">
				<h1>Your notebook</h1>
				<p>
					{state.phase === "loading"
						? "Opening your drafts…"
						: "Enable editing with GitHub to write here. Your local drafts remain on this device."}
				</p>
			</div>
		)
	if (!draft)
		return (
			<div className="cms-state-message">
				<h1>Start a record</h1>
				<p>Follow a tea, place, or vendor to keep its context.</p>
				<div className="cms-actions">
					{Object.values(SCHEMAS).map((s) => (
						<button key={s.name} onClick={() => void newDraft(s.name)}>
							New {s.singular.toLowerCase()}
						</button>
					))}
				</div>
				<Link href="/working-changes/">Working changes</Link>
			</div>
		)
	const schema = SCHEMAS[draft.document.collection],
		data = draft.document.data
	const primary =
		draft.document.collection === "tastings"
			? ["title", "date", "vendor", "style", "production_year", "excerpt"]
			: ["title", "description", "hanzi", "kind", "parent", "category", "municipality", "country"]
	const change = (name: string, value: unknown) => editDraft(draft.id, { [name]: value })
	const createRelated = (collection: Collection, field: string) =>
		void newDraft(
			collection,
			{},
			{ id: draft.id, field, multiple: schema.fields.find((f) => f.name === field)?.multiple }
		)
	const upload = async (files: FileList | null) => {
		if (!files?.length) return
		setMediaError("")
		abort.current = new AbortController()
		try {
			for (const file of Array.from(files).slice(
				0,
				draft.document.collection === "tastings" ? undefined : 1
			)) {
				setProcessing("Preparing " + file.name)
				const image = await optimizeImage(
					file,
					(p) => setProcessing(typeof p === "string" ? p : p.message),
					abort.current.signal
				)
				const variants = image.variants,
					largest = variants[variants.length - 1]
				const asset: CmsAsset = {
					id: image.id,
					filename: image.originalName,
					path: largest.path,
					mime: largest.mime,
					width: largest.width,
					height: largest.height,
					blob: largest.blob,
					variants,
				}
				const current = latest.current.drafts.find((d) => d.id === draft.id) || draft
				const existing = recordImages(current.document)
				const item = {
					image: image.picture.src,
					alt: "",
					caption: "",
					width: image.picture.width,
					height: image.picture.height,
					variants: variants.map((v) => ({
						path: assetPublicPath(v.path),
						width: v.width,
						height: v.height,
						mime: v.mime,
					})),
				}
				let patch: Record<string, unknown>
				if (current.document.collection === "tastings") patch = { images: [...existing, item] }
				else patch = { image: item.image, image_variants: item.variants }
				editDraft(draft.id, patch, undefined, [
					...current.assets.filter((a) => a.id !== asset.id),
					asset,
				])
			}
		} catch (e) {
			if ((e as Error).name !== "AbortError") setMediaError((e as Error).message)
		} finally {
			setProcessing("")
			abort.current = null
		}
	}
	const back =
		typeof window !== "undefined"
			? sessionStorage.getItem("puerh:relation-return:" + draft.id)
			: null
	return (
		<div className="cms-workspace cms-write" data-cms-write>
			<div className="cms-page-top">
				<Link href="/working-changes/">← Working changes</Link>
				<span>{draft.prNumber ? "Draft PR #" + draft.prNumber : "Local draft"}</span>
			</div>
			<header>
				<p className="cms-eyebrow">
					{schema.singular} · {isDraftDirty(draft) ? "Editing" : "Pushed edition"}
				</p>
				<h1>{String(data.title || "A new " + schema.singular.toLowerCase())}</h1>
				<p className={state.errors[draft.id] ? "cms-error" : "cms-muted"} role="status">
					{state.errors[draft.id] ||
						(state.saving.includes(draft.id) ? "Saving on this device…" : "Saved on this device")}
				</p>
			</header>
			{back && (
				<button
					className="cms-return"
					onClick={() => {
						try {
							const target = JSON.parse(back) as { id: string; field: string; multiple: boolean }
							const parent = state.drafts.find((d) => d.id === target.id)
							if (parent) {
								const value = parent.document.data[target.field]
								editDraft(parent.id, {
									[target.field]: target.multiple
										? [
												...new Set([
													...(Array.isArray(value) ? value : value ? [value] : []),
													draft.id,
												]),
										  ]
										: draft.id,
								})
								sessionStorage.removeItem("puerh:relation-return:" + draft.id)
								router.push("/write/?id=" + encodeURIComponent(parent.id))
							}
						} catch {
							update({ error: "The originating draft could not be found." })
						}
					}}
				>
					Use this {schema.singular.toLowerCase()} and return to the record
				</button>
			)}
			<div className="cms-edit-grid">
				<section className="cms-writing">
					<div className="cms-fields">
						{schema.fields
							.filter((f) => primary.includes(f.name))
							.map((f) => (
								<Field
									key={f.name}
									field={f}
									value={data[f.name]}
									onChange={(v) => change(f.name, v)}
									documents={documents}
									onCreate={createRelated}
								/>
							))}
					</div>
					<div className="cms-writing-toolbar">
						<h2>{draft.document.collection === "tastings" ? "Session notes" : "Notes & story"}</h2>
						<div className="cms-actions">
							<button aria-pressed={!preview} onClick={() => setPreview(false)}>
								Write
							</button>
							<button aria-pressed={preview} onClick={() => setPreview(true)}>
								Read
							</button>
						</div>
					</div>
					{!preview ? (
						<>
							<DictationControl
								key={draft.id}
								value={draft.document.body}
								onChange={(body) => editDraft(draft.id, undefined, body)}
								textareaRef={textarea}
								label="notes"
							/>
							<label className="cms-sr" htmlFor="cms-body">
								Notes
							</label>
							<textarea
								id="cms-body"
								ref={textarea}
								className="cms-body"
								value={draft.document.body}
								onChange={(e) => editDraft(draft.id, undefined, e.target.value)}
								placeholder="The leaf, the water, and what follows. Write or dictate as the session unfolds…"
							/>
						</>
					) : imagesUnavailable ? (
						<div className="cms-reading">
							<p className="cms-muted" role="status">
								Image preview is{" "}
								{waitingForCatalog || previewMedia.loading || refreshingImages
									? "loading"
									: "unavailable"}
								. Your notes remain available.
							</p>
							<Prose source={draft.document.body} />
						</div>
					) : (
						<ReadingPreview
							document={draft.document}
							documents={documents}
							assets={previewMedia.assets}
							before={draft.base}
						/>
					)}
					<details className="cms-details">
						<summary>Record details</summary>
						<div className="cms-fields">
							{schema.fields
								.filter((f) => !primary.includes(f.name))
								.map((f) => (
									<Field
										key={f.name}
										field={f}
										value={data[f.name]}
										onChange={(v) => change(f.name, v)}
										documents={documents}
										onCreate={createRelated}
									/>
								))}
						</div>
						<p className="cms-muted">
							Existing source fields are preserved. File: {draft.document.path}
						</p>
					</details>
				</section>
				<aside className="cms-media-editor">
					<h2>Images</h2>
					<p className="cms-muted">
						Optimized on this device. Uploaded only with Commit &amp; push.
					</p>
					<label className="cms-upload">
						{draft.document.collection === "tastings"
							? "Add photos"
							: data.image
							? "Replace image"
							: "Add image"}
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp"
							multiple={draft.document.collection === "tastings"}
							disabled={!!processing}
							onChange={(e) => {
								void upload(e.target.files)
								e.target.value = ""
							}}
						/>
					</label>
					{processing && (
						<div className="cms-notice" role="status">
							<p>{processing}</p>
							<button onClick={() => abort.current?.abort()}>Cancel processing</button>
						</div>
					)}
					{mediaError && (
						<p className="cms-error" role="alert">
							{mediaError}
						</p>
					)}
					{(waitingForCatalog || previewMedia.loading || refreshingImages) && (
						<p className="cms-muted" role="status">
							Loading images from this repository edition… You can keep writing.
						</p>
					)}
					{!waitingForCatalog && !refreshingImages && (catalogError || previewMedia.error) && (
						<div className="cms-error" role="alert">
							<p>{catalogError || previewMedia.error}</p>
							<button onClick={() => void retryImages()}>Retry images</button>
						</div>
					)}
					{recordImages(draft.document).map((im, i) => (
						<div key={im.image + ":" + i} className="cms-image-entry">
							{!imagesUnavailable ? (
								<ContentPicture image={im} urls={urls} />
							) : (
								<p className="cms-muted">
									Image preview{" "}
									{waitingForCatalog || previewMedia.loading || refreshingImages
										? "loading…"
										: "unavailable"}
								</p>
							)}
							<label>
								Image description
								<input
									value={im.alt || ""}
									onChange={(e) => {
										if (draft.document.collection === "tastings") {
											const images = recordImages(draft.document).map((x, n) =>
												n === i ? { ...x, alt: e.target.value } : x
											)
											change("images", images)
										} else change("image_alt", e.target.value)
									}}
								/>
							</label>
							{draft.document.collection === "tastings" && (
								<label>
									Caption
									<input
										value={im.caption || ""}
										onChange={(e) =>
											change(
												"images",
												recordImages(draft.document).map((x, n) =>
													n === i ? { ...x, caption: e.target.value } : x
												)
											)
										}
									/>
								</label>
							)}
							<button
								className="cms-quiet"
								onClick={() => {
									if (draft.document.collection === "tastings")
										change(
											"images",
											recordImages(draft.document).filter((_, n) => n !== i)
										)
									else editDraft(draft.id, { image: undefined, image_variants: undefined })
								}}
							>
								Remove from this record
							</button>
						</div>
					))}
				</aside>
			</div>
			<footer className="cms-commit-bar">
				<p>{isDraftDirty(draft) ? "Your edits are local." : "This edition has been pushed."}</p>
				<button
					className="cms-primary"
					disabled={!!processing || !!state.errors[draft.id]}
					onClick={() => review(draft.id)}
				>
					Review in Working changes →
				</button>
			</footer>
		</div>
	)
}
