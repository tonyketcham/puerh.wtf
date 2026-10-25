"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useCms, currentPlan, selectedBranch } from "./runtime"
import { fetchCatalog, cmsRequest, type CmsCatalog, type CmsPullRequest } from "./client"
import { isDraftDirty } from "./drafts"
import { SCHEMAS, COLLECTIONS } from "./schema"
import ReadingPreview from "./ReadingPreview"
import ReconcileDraft from "./ReconcileDraft"
import { usePreviewAssets } from "./use-preview-assets"
import type { CmsDocument, Collection } from "./types"

export default function WorkingWorkspace() {
	const cms = useCms(),
		{ state, update, select, review, push, editDocument, newDraft } = cms
	const [collection, setCollection] = useState<Collection>("tastings"),
		[search, setSearch] = useState(""),
		[publication, setPublication] = useState<{
			pr: CmsPullRequest
			catalog: CmsCatalog
			base: CmsCatalog
			id: string
			head: string
		} | null>(null),
		[keepLocal, setKeepLocal] = useState(false),
		[publicationError, setPublicationError] = useState("")
	const [publicationLens, setPublicationLens] = useState<
		"read" | "changes" | "media" | "connections"
	>("read")
	const [reconcilingId, setReconcilingId] = useState<string | null>(null)
	const plan = useMemo(() => currentPlan(state), [state])
	const dirty = state.drafts.filter(isDraftDirty),
		branch = selectedBranch(state),
		target = state.catalogs[branch],
		browse = state.catalogs[state.source]
	const prs = [
		...new Map(
			Object.values(state.catalogs)
				.flatMap((c) => c.pullRequests)
				.concat(state.lastPR ? [state.lastPR] : [])
				.map((p) => [p.number, p])
		).values(),
	]
	const included = new Set(plan?.included.map((d) => d.id) || []),
		required = new Map(plan?.required.map((r) => [r.id, r.requiredBy]) || [])
	const active = state.drafts.find((d) => d.id === state.previewId),
		unselected = !!active && !included.has(active.id) && state.scope === "update"
	const previewDocs =
		state.scope === "pr"
			? plan?.documents.filter((d) => {
					const base = state.catalogs[
						state.session?.repository.defaultBranch || "main"
					]?.documents.find((x) => x.id === d.id)
					return !base || base.raw !== d.raw
			  }) || []
			: plan?.included.map((d) => d.document) || []
	const preview = unselected
		? active.document
		: previewDocs.find((d) => d.id === state.previewId) || previewDocs[0]
	const before = (
		state.scope === "pr"
			? state.catalogs[state.session?.repository.defaultBranch || "main"]
			: target
	)?.documents.find((d) => d.id === preview?.id)
	const reconciling = state.drafts.find((draft) => draft.id === reconcilingId),
		reconciliationCatalog = reconciling ? state.catalogs[reconciling.branch] : undefined,
		reconciliationRemote = reconciliationCatalog?.documents.find((doc) => doc.id === reconcilingId)
	const allSaved = (plan?.included || []).every(
		(d) => !state.errors[d.id] && !state.saving.includes(d.id)
	)
	const library = (browse?.documents || []).filter(
		(d) =>
			d.collection === collection &&
			String(d.data.title || "")
				.toLowerCase()
				.includes(search.toLowerCase())
	)
	const localPublication = publication
		? state.drafts.filter((d) => d.prNumber === publication.pr.number && isDraftDirty(d))
		: []
	const publicationVersions =
		publication?.catalog.documents.filter((d) => {
			const base = publication.base.documents.find((x) => x.id === d.id)
			return !base || base.raw !== d.raw
		}) || []
	const publicationPreview =
		publicationVersions.find((document) => document.id === publication?.id) ||
		publicationVersions[0]
	const previewMedia = usePreviewAssets(
		preview,
		before,
		state.drafts,
		unselected ? active.branch : branch,
		unselected ? state.catalogs[active.branch]?.head : target?.head
	)
	const publicationMedia = usePreviewAssets(
		publicationPreview,
		publication?.base.documents.find((document) => document.id === publicationPreview?.id),
		state.drafts,
		publication?.pr.branch,
		publication?.head,
		publication?.base.branch,
		publication?.base.head
	)
	const publicationDirtyKey = localPublication
		.map((draft) => draft.id + ":" + draft.revision)
		.join("|")
	useEffect(() => {
		setKeepLocal(false)
	}, [publicationDirtyKey, publication?.head])
	if (state.phase !== "ready" && !state.session?.user)
		return (
			<div className="cms-state-message">
				<h1>Working changes</h1>
				<p>
					{state.phase === "loading"
						? "Opening your notebook…"
						: "Enable editing with GitHub to restore your local work."}
				</p>
			</div>
		)
	const openReconciliation = async (id: string) => {
		const draft = state.drafts.find((item) => item.id === id)
		if (!draft || cms.hasPending) return
		update({ busy: true, error: "" })
		try {
			await cms.refreshCatalog(draft.branch)
			setReconcilingId(id)
			update({ busy: false })
			requestAnimationFrame(() =>
				document
					.getElementById("cms-reconcile")
					?.scrollIntoView({ behavior: "smooth", block: "start" })
			)
		} catch (error) {
			cms.reportFailure(error)
		}
	}
	const openPublication = async (pr: CmsPullRequest) => {
		if (cms.hasPending) {
			update({ notice: "Resume the pending push before reviewing publication." })
			return
		}
		update({ busy: true, error: "" })
		setPublicationError("")
		try {
			const [catalog, base] = await Promise.all([
				fetchCatalog(pr.branch),
				fetchCatalog(state.session?.repository.defaultBranch),
			])
			const first = catalog.documents.find(
				(document) => base.documents.find((old) => old.id === document.id)?.raw !== document.raw
			)
			setPublication({ pr, catalog, base, id: first?.id || "", head: catalog.head })
			setKeepLocal(false)
			update({ busy: false })
			requestAnimationFrame(() =>
				document
					.getElementById("cms-publication")
					?.scrollIntoView({ behavior: "smooth", block: "start" })
			)
		} catch (error) {
			setPublicationError((error as Error).message)
			cms.reportFailure(error)
		}
	}
	const publish = async () => {
		if (
			!publication ||
			(localPublication.length && !keepLocal) ||
			cms.hasPending ||
			publicationMedia.loading ||
			publicationMedia.error
		)
			return
		update({ busy: true, error: "" })
		setPublicationError("")
		try {
			const result = await cmsRequest<{ merged: boolean; sha?: string; message?: string }>(
				"publish",
				{
					method: "POST",
					csrf: state.session?.csrfToken,
					data: {
						number: publication.pr.number,
						head: publication.head,
						baseHead: publication.base.head,
					},
				}
			)
			if (!result.merged)
				throw new Error(
					result.message ||
						"The PR could not merge. Required checks or approvals may still be pending."
				)
			setPublication(null)
			await cms.reconcileAfterPublish(publication.pr.number, publication.pr.branch)
		} catch (error) {
			setPublicationError((error as Error).message)
			cms.reportFailure(error)
		}
	}
	return (
		<div className="cms-workspace cms-working" data-cms-working>
			<header className="cms-working-heading">
				<div>
					<p className="cms-eyebrow">Your editorial workspace</p>
					<h1>Working changes</h1>
					<p className="cms-muted">
						{dirty.length} local {dirty.length === 1 ? "edit" : "edits"} · {prs.length} unpublished{" "}
						{prs.length === 1 ? "PR" : "PRs"}
					</p>
				</div>
				<div className="cms-new">
					<label className="cms-sr" htmlFor="cms-new-record">
						New record
					</label>
					<select
						id="cms-new-record"
						disabled={state.phase !== "ready"}
						value=""
						onChange={(e) => {
							if (e.target.value) void newDraft(e.target.value as Collection)
						}}
					>
						<option value="">New record…</option>
						{COLLECTIONS.map((s) => (
							<option key={s.name} value={s.name}>
								{s.singular}
							</option>
						))}
					</select>
				</div>
			</header>
			{state.notice && (
				<div className="cms-notice" role="status">
					{state.notice}
					<button aria-label="Dismiss notice" onClick={() => update({ notice: "" })}>
						×
					</button>
				</div>
			)}
			{state.error && (
				<div className="cms-error" role="alert">
					{state.error}
				</div>
			)}
			{state.pendingOperation && (
				<section className="cms-notice" role="status">
					<h2>
						{state.pendingOperation.rejection
							? "This update was not committed"
							: "A previous push needs confirmation"}
					</h2>
					<p>
						{state.pendingOperation.rejection
							? state.pendingOperation.rejection.message +
							  " Return to review to prepare a corrected update; all local work is preserved."
							: "Resume the exact request for " +
							  state.pendingOperation.captured.length +
							  " records. Newer edits and current checkbox changes are not added to it."}
					</p>
					<ul>
						{state.pendingOperation.captured.map((draft) => (
							<li key={draft.id}>{String(draft.document.data.title || "Untitled")}</li>
						))}
					</ul>
				</section>
			)}
			<div className="cms-review-grid">
				<aside className="cms-selection">
					<div className="cms-section-heading">
						<h2>On this device</h2>
						<button
							className="cms-quiet"
							disabled={!state.selected.length}
							onClick={() => update({ selected: [], previewId: null })}
						>
							Clear selection
						</button>
					</div>
					{dirty.length ? (
						dirty.map((d) => (
							<div className="cms-record-row" key={d.id}>
								<label className="cms-select-label">
									<input
										type="checkbox"
										aria-label={"Include " + String(d.document.data.title || "Untitled")}
										checked={included.has(d.id) || state.selected.includes(d.id)}
										disabled={required.has(d.id) && !state.selected.includes(d.id)}
										onChange={(e) => select(d.id, e.target.checked)}
									/>
									<span>
										<button
											className="cms-record-title"
											type="button"
											onClick={(e) => {
												e.preventDefault()
												update({ previewId: d.id, scope: "update" })
											}}
										>
											{String(
												d.document.data.title ||
													"Untitled " + SCHEMAS[d.document.collection].singular.toLowerCase()
											)}
										</button>
										<small>
											{SCHEMAS[d.document.collection].singular} ·{" "}
											{d.prNumber ? "PR #" + d.prNumber : "Local draft"}
										</small>
									</span>
								</label>
								{required.get(d.id)?.map((id) => (
									<p key={id} className="cms-required">
										Required by{" "}
										{String(
											state.drafts.find((x) => x.id === id)?.document.data.title ||
												"a selected record"
										)}
									</p>
								))}
								<Link href={"/write/?id=" + encodeURIComponent(d.id)} className="cms-edit-link">
									Edit draft
								</Link>
								{state.errors[d.id] && <p className="cms-error">{state.errors[d.id]}</p>}
							</div>
						))
					) : (
						<p className="cms-muted">
							No local edits. Follow the site to a record, or start a new session.
						</p>
					)}
				</aside>
				<section className="cms-review-reading" aria-label="Editorial preview">
					<div className="cms-scope-tabs" aria-label="Review scope">
						<button
							aria-pressed={state.scope === "update"}
							onClick={() => update({ scope: "update" })}
						>
							This update · {plan?.included.length || 0}
						</button>
						<button
							aria-pressed={state.scope === "pr"}
							onClick={() => update({ scope: "pr", previewId: null })}
						>
							Full draft PR
						</button>
					</div>
					<p className="cms-destination">
						{plan?.destination.kind === "pr"
							? "Adds to PR #" + plan.destination.prNumber
							: plan?.destination.kind === "blocked"
							? "Review incompatible selections"
							: "Creates a new draft PR"}
						{target
							? " · Compared with " +
							  (branch === state.session?.repository.defaultBranch ? "main" : "the pushed PR")
							: " · Loading target…"}
					</p>
					{!!previewDocs.length && (
						<div className="cms-chips" aria-label="Preview records">
							{previewDocs.map((doc) => (
								<button
									key={doc.id}
									aria-pressed={preview?.id === doc.id}
									onClick={() => update({ previewId: doc.id })}
								>
									{String(doc.data.title || "Untitled")}
								</button>
							))}
						</div>
					)}
					<div className="cms-lenses" aria-label="Review lenses">
						{(["read", "changes", "media", "connections"] as const).map((lens) => (
							<button
								key={lens}
								aria-pressed={state.lens === lens}
								onClick={() => update({ lens })}
							>
								{lens[0].toUpperCase() + lens.slice(1)}
							</button>
						))}
					</div>
					{unselected && (
						<p className="cms-notice">Local preview · this record is staying on your device.</p>
					)}
					{previewMedia.loading ? (
						<p role="status">Loading images from this reviewed edition…</p>
					) : previewMedia.error ? (
						<p className="cms-error" role="alert">
							{previewMedia.error}
						</p>
					) : (
						<ReadingPreview
							document={preview}
							documents={plan?.documents || target?.documents || []}
							before={before}
							assets={previewMedia.assets}
							lens={state.lens}
						/>
					)}
					{!!plan?.errors.length && (
						<div className="cms-readiness" role="status">
							<h3>Before pushing</h3>
							{plan.errors.map((e, i) => (
								<div key={i}>
									<p>{e.message}</p>
									{e.code === "stale-base" && e.documentId && (
										<button
											disabled={state.busy || cms.hasPending}
											onClick={() => void openReconciliation(e.documentId!)}
										>
											Reconcile this record
										</button>
									)}
								</div>
							))}
						</div>
					)}
					{plan && (
						<details className="cms-details">
							<summary>Technical details</summary>
							<p>{plan.title}</p>
							<pre>{plan.summary}</pre>
							<p>Commit: {plan.commitMessage}</p>
							<p>Target revision: {target?.head}</p>
						</details>
					)}
				</section>
			</div>
			{reconciling && (
				<section id="cms-reconcile" className="cms-details">
					<div className="cms-section-heading">
						<h2>Reconcile {String(reconciling.document.data.title)}</h2>
						<button onClick={() => setReconcilingId(null)}>Close reconciliation</button>
					</div>
					{reconciliationRemote &&
					reconciliationCatalog &&
					(!reconciling.prNumber ||
						reconciliationCatalog.pullRequests.some((pr) => pr.number === reconciling.prNumber)) ? (
						<ReconcileDraft
							draft={reconciling}
							remote={reconciliationRemote}
							head={reconciliationCatalog.head}
							documents={reconciliationCatalog.documents}
							onApply={async (doc) => {
								await cms.reconcileLocal(
									reconciling.id,
									reconciliationRemote,
									reconciliationCatalog.head,
									reconciling.revision,
									doc
								)
								setReconcilingId(null)
							}}
						/>
					) : (
						<p className="cms-error">
							This record or its open PR is no longer available. Export its local draft from Draft
							recovery before choosing a new destination.
						</p>
					)}
				</section>
			)}
			<section className="cms-prs">
				<div className="cms-section-heading">
					<h2>Unpublished PRs</h2>
					<span>{prs.length}</span>
				</div>
				{prs.length ? (
					prs.map((pr) => (
						<article key={pr.number} className="cms-pr-card">
							<div>
								<small>Draft PR #{pr.number}</small>
								<h3>{pr.title}</h3>
							</div>
							<div className="cms-actions">
								<button disabled={state.busy} onClick={() => void cms.setSource(pr.branch)}>
									Browse edition
								</button>
								<button
									disabled={state.busy || cms.hasPending}
									onClick={() => void openPublication(pr)}
								>
									Review publication
								</button>
								<a href={pr.url} target="_blank" rel="noreferrer">
									GitHub ↗
								</a>
							</div>
						</article>
					))
				) : (
					<p className="cms-muted">
						Your first push will create a draft PR. Your writing stays local until then.
					</p>
				)}
			</section>
			{publication && (
				<section className="cms-publication" id="cms-publication">
					<div className="cms-section-heading">
						<h2>Publish the whole PR #{publication.pr.number}</h2>
						<button onClick={() => setPublication(null)}>Back to working edits</button>
					</div>
					<p className="cms-muted">
						{publicationVersions.length} cumulative records · pushed versions only
					</p>
					{!!localPublication.length && (
						<label className="cms-acknowledge">
							<input
								type="checkbox"
								checked={keepLocal}
								onChange={(e) => setKeepLocal(e.target.checked)}
							/>
							Publish the pushed versions and keep {localPublication.length} newer local edits on
							this device.
						</label>
					)}
					<div className="cms-lenses" aria-label="Publication review lenses">
						{(["read", "changes", "media", "connections"] as const).map((lens) => (
							<button
								key={lens}
								aria-pressed={publicationLens === lens}
								onClick={() => setPublicationLens(lens)}
							>
								{lens[0].toUpperCase() + lens.slice(1)}
							</button>
						))}
					</div>
					<div className="cms-chips">
						{publicationVersions.map((d) => (
							<button
								key={d.id}
								aria-pressed={
									(
										publicationVersions.find((x) => x.id === publication.id) ||
										publicationVersions[0]
									)?.id === d.id
								}
								onClick={() => setPublication({ ...publication, id: d.id })}
							>
								{String(d.data.title)}
							</button>
						))}
					</div>
					{publicationMedia.loading ? (
						<p role="status">Loading images from this reviewed edition…</p>
					) : publicationMedia.error ? (
						<p className="cms-error" role="alert">
							{publicationMedia.error}
						</p>
					) : (
						<ReadingPreview
							document={publicationPreview}
							documents={publication.catalog.documents}
							before={publication.base.documents.find(
								(document) => document.id === publicationPreview?.id
							)}
							assets={publicationMedia.assets}
							lens={publicationLens}
						/>
					)}
					{publicationError && (
						<p className="cms-error" role="alert">
							{publicationError}
						</p>
					)}
					<button
						className="cms-primary"
						disabled={
							state.phase !== "ready" ||
							state.busy ||
							cms.hasPending ||
							publicationMedia.loading ||
							!!publicationMedia.error ||
							(!!localPublication.length && !keepLocal)
						}
						onClick={() => void publish()}
					>
						{state.busy
							? "Checking publication…"
							: "Publish PR #" +
							  publication.pr.number +
							  " · " +
							  publicationVersions.length +
							  " records"}
					</button>
					<p className="cms-muted">
						Merges only this reviewed PR after required checks and repository rules pass.
					</p>
				</section>
			)}
			<details className="cms-library">
				<summary>Browse repository content</summary>
				<div className="cms-library-controls">
					<label>
						Edition
						<select value={state.source} onChange={(e) => void cms.setSource(e.target.value)}>
							<option value={state.session?.repository.defaultBranch}>Main</option>
							{prs.map((p) => (
								<option key={p.number} value={p.branch}>
									PR #{p.number} · {p.title}
								</option>
							))}
						</select>
					</label>
					<label>
						Collection
						<select
							value={collection}
							onChange={(e) => setCollection(e.target.value as Collection)}
						>
							{COLLECTIONS.map((s) => (
								<option key={s.name} value={s.name}>
									{s.label}
								</option>
							))}
						</select>
					</label>
					<label>
						Find content
						<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
					</label>
				</div>
				<div className="cms-library-list">
					{library.map((d) => (
						<button key={d.id} onClick={() => void editDocument(d)}>
							{String(d.data.title || d.id)}
							<small>{d.path.split("/").pop()}</small>
						</button>
					))}
				</div>
			</details>
			<details className="cms-details cms-recovery">
				<summary>Draft recovery</summary>
				<p>Back up the records and image variants stored for this GitHub account on this device.</p>
				<div className="cms-actions">
					<button onClick={() => void cms.recovery()}>Export local drafts</button>
					<button disabled={state.busy} onClick={() => void cms.signOut()}>
						Sign out of GitHub
					</button>
					<label className="cms-upload">
						Import draft backup
						<input
							type="file"
							accept="application/json"
							onChange={(e) => {
								if (e.target.files?.[0]) void cms.restore(e.target.files[0])
								e.target.value = ""
							}}
						/>
					</label>
				</div>
			</details>
			<footer className="cms-commit-bar">
				<p role="status">
					{cms.hasPending
						? "Previous push: " +
						  state.pendingOperation!.captured.length +
						  " records · newer work stays local"
						: (plan?.included.length || 0) +
						  " selected · " +
						  required.size +
						  " required · " +
						  (plan?.omitted.length ?? dirty.length) +
						  " staying local"}
				</p>
				<button
					className="cms-primary"
					disabled={
						state.phase !== "ready" ||
						state.busy ||
						(!cms.hasPending && (!plan?.included.length || !!plan.errors.length || !allSaved))
					}
					onClick={() =>
						cms.hasPending
							? state.pendingOperation?.rejection
								? void cms.returnToReview()
								: void cms.resumePending()
							: plan && void push(plan.reviewKey)
					}
				>
					{state.busy
						? "Confirming push…"
						: cms.hasPending
						? state.pendingOperation?.rejection
							? "Return to review"
							: "Resume pending push"
						: "Commit & push " +
						  (plan?.included.length || 0) +
						  (plan?.included.length === 1 ? " record" : " records")}
				</button>
			</footer>
		</div>
	)
}
