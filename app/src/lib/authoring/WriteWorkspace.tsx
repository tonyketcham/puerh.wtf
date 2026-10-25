"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { useStore } from "jotai"
import { cmsAtom, useCms } from "./runtime"
import { fetchCatalog, type CmsSession } from "./client"
import { usePreviewAssets } from "./use-preview-assets"
import { SCHEMAS } from "./schema"
import PanelSection from "@/lib/components/containers/PanelSection"
import { FlavorEditor, BrewingEditor } from "./SessionEditorPanels"
import CoverPreview from "./CoverPreview"
import type { RecordImage } from "./preview-media"
import "./writer.css"
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
	const {
			state,
			editDraft,
			newDraft,
			createRelatedDraft,
			review,
			discardDraft,
			revertDraft,
			undoLocalChange,
			update,
			hasPending,
		} = useCms(),
		store = useStore(),
		params = useSearchParams()
	const urlId = params.get("id"),
		pendingWriteId = state.pendingWriteId,
		id = pendingWriteId ?? urlId,
		draft = state.drafts.find((d) => d.id === id),
		textarea = useRef<HTMLTextAreaElement>(null)
	useLayoutEffect(() => {
		if (state.phase !== "ready" || pendingWriteId === null) return
		if (store.get(cmsAtom).pendingWriteId !== pendingWriteId) return
		// A restored static route can replay its old canonical query during navigation.
		// Keep the requested record until Next and the address bar agree on its identity.
		const url = new URL(window.location.href)
		if (url.searchParams.get("id") !== pendingWriteId || urlId !== pendingWriteId) {
			url.searchParams.set("id", pendingWriteId)
			window.history.replaceState(null, "", url.pathname + url.search + url.hash)
		}
		if (urlId === pendingWriteId)
			store.set(cmsAtom, (current) =>
				current.pendingWriteId === pendingWriteId ? { ...current, pendingWriteId: null } : current
			)
	}, [state.phase, pendingWriteId, urlId, store])
	const latest = useRef(state)
	useLayoutEffect(() => {
		latest.current = state
	}, [state])
	const [preview, setPreview] = useState(false),
		[processing, setProcessing] = useState(""),
		[mediaError, setMediaError] = useState(""),
		abort = useRef<AbortController | null>(null)
	const writingPosition = useRef({ start: 0, end: 0, scroll: 0, page: 0 })
	const [removedImage, setRemovedImage] = useState<{
		draftId: string
		image: RecordImage
		index: number
	} | null>(null)
	useEffect(() => {
		setPreview(false)
		setRemovedImage(null)
		writingPosition.current = { start: 0, end: 0, scroll: 0, page: 0 }
	}, [draft?.id])
	const togglePreview = (read: boolean) => {
		if (read && textarea.current)
			writingPosition.current = {
				start: textarea.current.selectionStart,
				end: textarea.current.selectionEnd,
				scroll: textarea.current.scrollTop,
				page: window.scrollY,
			}
		setPreview(read)
		if (!read)
			requestAnimationFrame(() => {
				const el = textarea.current,
					position = writingPosition.current
				if (el) {
					el.focus({ preventScroll: true })
					el.setSelectionRange(position.start, position.end)
					el.scrollTop = position.scroll
				}
				window.scrollTo({ top: position.page })
			})
	}
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
	const documents = [...(source?.documents || [])]
	for (const d of state.drafts)
		if (d.branch === (draft?.branch || state.source)) {
			const i = documents.findIndex((x) => x.id === d.id)
			if (i >= 0) documents[i] = d.document
			else documents.push(d.document)
		}
	// The editor reads current source images; its default Read view does not render Earlier images.
	const previewMedia = usePreviewAssets(
		draft?.document,
		undefined,
		state.drafts,
		sourceBranch,
		source?.head,
		sourceBranch,
		source?.head,
		{ documents }
	)
	const urls = useAssetUrls(previewMedia.assets)
	const waitingForCatalog = !!draft && !hasSource && !catalogError
	const imagesUnavailable =
		waitingForCatalog ||
		previewMedia.loading ||
		!!previewMedia.error ||
		!!catalogError ||
		previewMedia.assets.some((asset) => !urls[assetPublicPath(asset.path)])
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
	const isSession = draft.document.collection === "tastings"
	const hasPhotos = isSession || schema.fields.some((field) => field.type === "image")
	const identity = isSession ? ["title", "date"] : ["title", "hanzi"]
	const context = isSession
		? ["vendor", "style", "origin", "cultivar", "vessel", "author", "production_year", "tags"]
		: ["description", "kind", "parent", "category", "municipality", "country"]
	const specialized = isSession ? ["flavor_axes", "brewing", "notes", "images"] : ["image"]
	const change = (name: string, value: unknown) => editDraft(draft.id, { [name]: value })
	const createRelated = async (
		collection: Collection,
		field: string,
		seed: Record<string, unknown>
	) =>
		!!(await createRelatedDraft(
			collection,
			seed,
			draft.id,
			field,
			!!schema.fields.find((f) => f.name === field)?.multiple
		))
	const renderField = (name: string) => {
		const f = schema.fields.find((field) => field.name === name)
		if (f?.name === "date" && isSession) {
			const date = new Date(String(data.date || ""))
			return (
				<details key="date" className="cms-date-editor">
					<summary>
						<span>Session date</span>
						<strong>
							{Number.isFinite(date.getTime())
								? date.toLocaleDateString(undefined, {
										month: "short",
										day: "numeric",
										year: "numeric",
								  })
								: "Choose a date"}
							<span aria-hidden> ▾</span>
						</strong>
					</summary>
					<div>
						<Field
							field={{ ...f, hint: undefined }}
							value={data.date}
							onChange={(v) => change("date", v)}
							documents={documents}
							onCreate={createRelated}
						/>
					</div>
				</details>
			)
		}
		return f ? (
			<Field
				key={f.name}
				field={f.name === "date" ? { ...f, hint: undefined } : f}
				value={data[f.name]}
				onChange={(v) => change(f.name, v)}
				documents={documents}
				onCreate={createRelated}
			/>
		) : null
	}
	const moveImage = (from: number, to: number) => {
		const images = recordImages(draft.document)
		const [image] = images.splice(from, 1)
		images.splice(to, 0, image)
		change("images", images)
	}
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
	return (
		<div className="cms-workspace cms-write cms-editorial @container/log" data-cms-write>
			<div className="cms-page-top">
				<Link href="/working-changes/">← Working changes</Link>
				<span>
					{draft.prNumber
						? "Unpublished · PR #" + draft.prNumber
						: isDraftDirty(draft)
						? "On this device"
						: "Published record"}
				</span>
			</div>
			<header className="cms-editor-heading">
				<div>
					<p className="cms-eyebrow">{schema.singular}</p>
					<h1>{String(data.title || "A new " + schema.singular.toLowerCase())}</h1>
				</div>
				<p className={state.errors[draft.id] ? "cms-error" : "cms-muted"} role="status">
					{state.errors[draft.id] ||
						(state.saving.includes(draft.id)
							? "Saving on this device…"
							: isDraftDirty(draft)
							? "Saved on this device"
							: draft.prNumber
							? "This edition is saved to GitHub."
							: "Published · ready to write")}
				</p>
			</header>
			{state.notice && (
				<div className="cms-notice" role="status">
					<p>{state.notice}</p>
					{!!state.localRecoveries.length && (
						<button
							type="button"
							disabled={state.busy || hasPending}
							onClick={() => void undoLocalChange()}
						>
							Undo
						</button>
					)}
					<button type="button" aria-label="Dismiss notice" onClick={() => update({ notice: "" })}>
						×
					</button>
				</div>
			)}
			{state.error && (
				<p className="cms-error" role="alert">
					{state.error}
				</p>
			)}
			<div className={"cms-editor-layout" + (preview || !hasPhotos ? " is-reading" : "")}>
				<section className="cms-writing">
					<div className="cms-editor-identity cms-fields" hidden={preview}>
						{identity.map(renderField)}
					</div>
					<section className="cms-editor-panel surface-plate cms-notes-panel">
						<PanelSection
							title={isSession ? "Session notes" : "Notes & story"}
							rightSlot={
								<div className="cms-phase-keys">
									<button
										type="button"
										aria-pressed={!preview}
										onClick={() => togglePreview(false)}
									>
										Write
									</button>
									<button type="button" aria-pressed={preview} onClick={() => togglePreview(true)}>
										Read
									</button>
								</div>
							}
						>
							<div hidden={preview}>
								<DictationControl
									key={draft.id}
									value={draft.document.body}
									onChange={(body) => editDraft(draft.id, undefined, body)}
									textareaRef={textarea}
									label="notes"
									active={!preview}
								/>
								<label className="cms-sr" htmlFor="cms-body">
									Notes
								</label>
								<textarea
									id="cms-body"
									ref={textarea}
									className="cms-body shadow-well"
									value={draft.document.body}
									onChange={(e) => editDraft(draft.id, undefined, e.target.value)}
									placeholder={
										isSession
											? "The leaf, the water, and what follows. Write or dictate as the session unfolds…"
											: "Tell the story in your own words…"
									}
								/>
							</div>
							{preview &&
								(imagesUnavailable ? (
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
								))}
						</PanelSection>
					</section>
					<div hidden={preview} className="cms-editor-sections">
						<section className="cms-editor-panel surface-plate">
							<PanelSection
								title={
									isSession ? "The tea & its people" : "About this " + schema.singular.toLowerCase()
								}
							>
								<div className="cms-fields">{context.map(renderField)}</div>
							</PanelSection>
						</section>
						{isSession && (
							<>
								<FlavorEditor
									key={draft.id + "-flavor"}
									value={data.flavor_axes}
									onChange={(v) => change("flavor_axes", v)}
								/>
								<BrewingEditor
									key={draft.id + "-brewing"}
									value={data.brewing}
									onChange={(v) => change("brewing", v)}
									documents={documents}
									onCreate={createRelated}
								/>
								<section className="cms-editor-panel surface-plate">
									<PanelSection title="Sensory notes">
										<p className="cms-muted">
											From dry leaf to the empty cup. Add the impressions you want to remember.
										</p>
										<div className="cms-fields">
											{schema.fields
												.find((f) => f.name === "notes")
												?.fields?.map((f) => (
													<Field
														key={f.name}
														field={f}
														value={(data.notes as Record<string, unknown>)?.[f.name]}
														onChange={(v) =>
															change("notes", {
																...((data.notes as Record<string, unknown>) || {}),
																[f.name]: v,
															})
														}
														documents={documents}
														onCreate={createRelated}
													/>
												))}
										</div>
									</PanelSection>
								</section>
							</>
						)}
						<details className="cms-details">
							<summary>More details</summary>
							<div className="cms-fields">
								{schema.fields
									.filter(
										(f) =>
											![...identity, ...context, ...specialized].includes(f.name) &&
											f.type !== "image"
									)
									.map((f) => renderField(f.name))}
							</div>
						</details>
					</div>
				</section>
				{hasPhotos && (
					<aside
						className="cms-editor-panel surface-plate cms-photo-panel"
						hidden={preview}
						aria-label="Photo editor"
					>
						<PanelSection title={isSession ? "Photos" : "Portrait"}>
							<p className="cms-muted">
								Prepared on this device. Added to your edition when you commit.
							</p>
							<label className="cms-upload shadow-key">
								{isSession ? "Add photos" : data.image ? "Replace image" : "Add image"}
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp"
									multiple={isSession}
									disabled={!!processing}
									onChange={(e) => {
										void upload(e.target.files)
										e.target.value = ""
									}}
								/>
							</label>
							{isSession && !imagesUnavailable && (
								<CoverPreview document={draft.document} documents={documents} urls={urls} />
							)}
							{processing && (
								<div className="cms-notice" role="status">
									<p>{processing}</p>
									<button type="button" onClick={() => abort.current?.abort()}>
										Cancel processing
									</button>
								</div>
							)}
							{mediaError && (
								<p className="cms-error" role="alert">
									{mediaError}
								</p>
							)}
							{(waitingForCatalog || previewMedia.loading || refreshingImages) && (
								<p className="cms-muted" role="status">
									Loading photos… You can keep writing.
								</p>
							)}
							{!waitingForCatalog && !refreshingImages && (catalogError || previewMedia.error) && (
								<div className="cms-error" role="alert">
									<p>{catalogError || previewMedia.error}</p>
									<button type="button" onClick={() => void retryImages()}>
										Retry images
									</button>
								</div>
							)}
							{removedImage?.draftId === draft.id && (
								<div className="cms-photo-undo" role="status">
									Photo removed.{" "}
									<button
										type="button"
										onClick={() => {
											if (isSession) {
												const images = recordImages(draft.document)
												images.splice(
													Math.min(removedImage.index, images.length),
													0,
													removedImage.image
												)
												change("images", images)
											} else
												editDraft(draft.id, {
													image: removedImage.image.image,
													image_variants: removedImage.image.variants,
												})
											setRemovedImage(null)
										}}
									>
										Undo removal
									</button>
								</div>
							)}
							{recordImages(draft.document).map((im, i, images) => (
								<div key={im.image + ":" + i} className="cms-image-entry">
									<div className="cms-photo-heading">
										<span>{i === 0 ? "Cover photo" : "Photo " + (i + 1)}</span>
										{isSession && i > 0 && (
											<button type="button" className="cms-quiet" onClick={() => moveImage(i, 0)}>
												Make cover
											</button>
										)}
									</div>
									{!imagesUnavailable ? (
										<ContentPicture
											image={isSession ? im : { ...im, alt: String(data.title || "") }}
											urls={urls}
										/>
									) : (
										<p className="cms-muted">
											Image preview{" "}
											{waitingForCatalog || previewMedia.loading || refreshingImages
												? "loading…"
												: "unavailable"}
										</p>
									)}
									{isSession && (
										<label>
											Image description
											<input
												value={im.alt || ""}
												onChange={(e) =>
													change(
														"images",
														recordImages(draft.document).map((x, n) =>
															n === i ? { ...x, alt: e.target.value } : x
														)
													)
												}
											/>
										</label>
									)}
									{isSession ? (
										<small>Describe the scene for someone who cannot see it.</small>
									) : (
										<small>
											The portrait is described by this {schema.singular.toLowerCase()}’s name.
										</small>
									)}
									{isSession && (
										<label>
											Caption
											<input
												value={im.caption || ""}
												placeholder="A thought to accompany this photo…"
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
									{isSession && <small>Shown beside the photo in the journal.</small>}
									<div className="cms-photo-actions">
										{isSession && images.length > 1 && (
											<>
												<button
													type="button"
													disabled={i === 0}
													aria-label={"Move photo " + (i + 1) + " earlier"}
													onClick={() => moveImage(i, i - 1)}
												>
													← Earlier
												</button>
												<button
													type="button"
													disabled={i === images.length - 1}
													aria-label={"Move photo " + (i + 1) + " later"}
													onClick={() => moveImage(i, i + 1)}
												>
													Later →
												</button>
											</>
										)}
										<button
											type="button"
											className="cms-quiet"
											onClick={() => {
												setRemovedImage({ draftId: draft.id, image: im, index: i })
												if (isSession)
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
								</div>
							))}
						</PanelSection>
					</aside>
				)}
			</div>
			<footer className="cms-commit-bar">
				<div>
					<p>
						{isDraftDirty(draft)
							? "On this device"
							: draft.prNumber
							? "Committed edition"
							: "Published version"}
					</p>
					{isDraftDirty(draft) && (
						<div className="cms-actions">
							{draft.base ? (
								<button
									type="button"
									className="cms-quiet"
									disabled={
										!isDraftDirty(draft) ||
										!!processing ||
										state.saving.includes(draft.id) ||
										state.busy ||
										hasPending
									}
									onClick={() => void revertDraft(draft.id)}
								>
									Revert local edits
								</button>
							) : (
								<button
									type="button"
									className="cms-quiet"
									disabled={
										!!processing || state.saving.includes(draft.id) || state.busy || hasPending
									}
									onClick={async () => {
										if (await discardDraft(draft.id)) review()
									}}
								>
									Discard this draft
								</button>
							)}
						</div>
					)}
				</div>
				<button
					type="button"
					className="cms-primary shadow-key"
					disabled={!!processing || !!state.errors[draft.id]}
					onClick={() => review(isDraftDirty(draft) ? draft.id : undefined)}
				>
					{isDraftDirty(draft) ? "Review in Working changes →" : "Working changes →"}
				</button>
			</footer>
		</div>
	)
}
