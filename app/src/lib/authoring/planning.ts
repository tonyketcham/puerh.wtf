import type {
	CmsAsset,
	CmsDocument,
	CmsDraft,
	CmsFieldChange,
	CmsIssue,
	CmsPlan,
	CmsPlanInput,
} from "./types"
import { COLLECTION_NAMES } from "./types"
import {
	assetPublicPath,
	isDraftDirty,
	isRecord,
	parseDocument,
	stableStringify,
} from "./documents"
import { documentRelations, SCHEMAS, validateDocument } from "./schema"

const titleOf = (doc: CmsDocument) =>
	typeof doc.data.title === "string" && doc.data.title.trim()
		? doc.data.title.trim().replace(/[\r\n]+/g, " ")
		: "Untitled " + SCHEMAS[doc.collection].singular.toLowerCase()
const order = (a: CmsDocument, b: CmsDocument) =>
	COLLECTION_NAMES.indexOf(a.collection) - COLLECTION_NAMES.indexOf(b.collection) ||
	a.id.localeCompare(b.id, "en")

/** Source paths only; blob previews must never enter content or an outgoing commit. */
export function documentMedia(document: CmsDocument): string[] {
	const paths = new Set<string>()
	const walk = (value: unknown, key = "") => {
		if (
			typeof value === "string" &&
			(key === "image" || key === "src" || (key === "path" && /^\/images\//.test(value)))
		)
			paths.add(value)
		else if (Array.isArray(value)) value.forEach((item) => walk(item, key))
		else if (isRecord(value)) Object.entries(value).forEach(([name, item]) => walk(item, name))
	}
	walk(document.data)
	for (const match of document.body.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g))
		paths.add(match[1])
	return [...paths].sort()
}

function changedPaths(before: unknown, after: unknown, path = ""): string[] {
	if (stableStringify(before) === stableStringify(after)) return []
	if (isRecord(before) && isRecord(after)) {
		return [...new Set([...Object.keys(before), ...Object.keys(after)])]
			.sort()
			.flatMap((key) => changedPaths(before[key], after[key], path ? path + "." + key : key))
	}
	return [path || "record"]
}
function catalogChanges(
	before: readonly CmsDocument[],
	after: readonly CmsDocument[]
): CmsFieldChange[] {
	const previous = new Map(before.map((doc) => [doc.id, doc]))
	const next = new Map(after.map((doc) => [doc.id, doc]))
	return [...new Set([...previous.keys(), ...next.keys()])]
		.map((id) => {
			const a = previous.get(id),
				b = next.get(id),
				doc = b || a!
			const fields =
				!a || !b
					? ["record"]
					: [
							...changedPaths(a.data, b.data),
							...(a.body !== b.body ? ["body"] : []),
							...(a.path !== b.path ? ["path"] : []),
					  ]
			if (a && b && !fields.length && a.raw !== b.raw) fields.push("source formatting")
			return {
				documentId: id,
				collection: doc.collection,
				title: titleOf(doc),
				operation: !a ? ("add" as const) : !b ? ("delete" as const) : ("edit" as const),
				fields,
			}
		})
		.filter((change) => change.fields.length)
		.sort(
			(a, b) =>
				COLLECTION_NAMES.indexOf(a.collection) - COLLECTION_NAMES.indexOf(b.collection) ||
				a.documentId.localeCompare(b.documentId, "en")
		)
}
function describe(changes: readonly CmsFieldChange[]): string {
	if (!changes.length) return "No content changes"
	if (changes.length === 1)
		return (
			{ add: "Add ", edit: "Update ", delete: "Remove " }[changes[0].operation] + changes[0].title
		)
	const counts = new Map<string, number>()
	for (const change of changes) {
		const name = SCHEMAS[change.collection].singular.toLowerCase()
		counts.set(name, (counts.get(name) || 0) + 1)
	}
	return (
		"Update " +
		[...counts].map(([kind, count]) => count + " " + kind + (count === 1 ? "" : "s")).join(", ")
	)
}

export function planChanges(input: CmsPlanInput): CmsPlan {
	const errors: CmsIssue[] = []
	const add = (code: string, message: string, documentId?: string, field?: string) =>
		errors.push({ code, message, documentId, field })
	const byDraft = new Map(input.drafts.map((draft) => [draft.id, draft]))
	const roots = [...new Set(input.selectedIds)]
		.map((id) => {
			const draft = byDraft.get(id)
			if (!draft) add("missing-draft", "A selected draft is no longer available.", id)
			return draft
		})
		.filter((draft): draft is CmsDraft => !!draft)
		.sort((a, b) => order(a.document, b.document))
	if (!roots.length) add("empty-selection", "Select at least one changed record.")
	for (const root of roots)
		if (!isDraftDirty(root))
			add("unchanged-record", titleOf(root.document) + " has no unpushed changes.", root.id)
	const owners = new Map<number, string>()
	for (const root of roots) {
		if (root.prNumber) {
			const branch = owners.get(root.prNumber)
			if (branch && branch !== root.branch)
				add("pr-identity", "Selected records disagree about their PR branch.", root.id)
			owners.set(root.prNumber, root.branch)
		} else if (root.branch !== "main")
			add(
				"unknown-owner",
				"This draft has a branch without a verified open PR context. Reconcile it first.",
				root.id
			)
	}
	const owner = owners.size === 1 ? [...owners][0] : undefined
	let destination: CmsPlan["destination"] =
		owners.size > 1
			? { kind: "blocked" }
			: owner
			? { kind: "pr", prNumber: owner[0], branch: owner[1] }
			: { kind: "new", branch: "main" }
	if (owners.size > 1)
		add("multiple-prs", "These records belong to different PRs. Commit separate selections.")
	const expectedBranch = destination.kind === "pr" ? destination.branch : "main"
	if (
		destination.kind !== "blocked" &&
		(input.branch !== expectedBranch ||
			(destination.kind === "pr" ? input.prNumber !== destination.prNumber : !!input.prNumber))
	)
		add(
			"target-context",
			"Load the inferred " +
				(destination.kind === "pr" ? "PR #" + destination.prNumber : "Live") +
				" snapshot before reviewing this selection."
		)
	if (!input.head) add("missing-head", "The target revision has not loaded.")

	const target = new Map<string, CmsDocument>()
	const paths = new Map<string, string>()
	for (const document of input.documents) {
		if (target.has(document.id))
			add("duplicate-id", "The target contains duplicate content IDs.", document.id)
		if (paths.has(document.path))
			add("duplicate-path", "The target contains duplicate source paths.", document.id)
		target.set(document.id, document)
		paths.set(document.path, document.id)
	}
	const included = new Map(roots.map((draft) => [draft.id, draft]))
	const reasons = new Map<string, Set<string>>()
	const queue = [...roots]
	for (let i = 0; i < queue.length; i++) {
		const draft = queue[i]
		if (draft.deleted) continue
		for (const ref of documentRelations(draft.document)) {
			if (included.has(ref.id) || target.has(ref.id)) continue
			const dependency = byDraft.get(ref.id)
			if (!dependency || dependency.deleted || dependency.document.collection !== ref.collection)
				continue
			if (
				dependency.prNumber &&
				(destination.kind !== "pr" || dependency.prNumber !== destination.prNumber)
			) {
				add(
					"dependency-owner",
					titleOf(draft.document) +
						" needs " +
						titleOf(dependency.document) +
						", which belongs to PR #" +
						dependency.prNumber +
						". Select compatible records separately or reconcile their ownership.",
					draft.id,
					ref.field
				)
				continue
			}
			if (dependency.base) {
				add(
					"missing-target-record",
					"The existing related record " +
						titleOf(dependency.document) +
						" is absent from the target. Reconcile the target before pushing.",
					dependency.id
				)
				continue
			}
			const requiredBy = reasons.get(dependency.id) || new Set<string>()
			requiredBy.add(draft.id)
			reasons.set(dependency.id, requiredBy)
			included.set(dependency.id, dependency)
			queue.push(dependency)
		}
	}
	// Record every direct dependency reason, including when another root already discovered it.
	for (const draft of included.values()) {
		if (draft.deleted) continue
		for (const ref of documentRelations(draft.document)) {
			if (reasons.has(ref.id)) reasons.get(ref.id)!.add(draft.id)
		}
	}
	for (const draft of included.values()) {
		const current = target.get(draft.id)
		if (draft.base) {
			if (!current || current.path !== draft.base.path || current.raw !== draft.base.raw)
				add(
					"stale-base",
					titleOf(draft.document) +
						" differs from its recorded base in the target. Reconcile before pushing.",
					draft.id
				)
		} else if (
			current ||
			(paths.has(draft.document.path) && paths.get(draft.document.path) !== draft.id)
		)
			add("source-collision", "A new record collides with the target's ID or path.", draft.id)
		if (
			draft.base &&
			(draft.document.path !== draft.base.path || draft.document.id !== draft.base.id)
		)
			add("identity-change", "Existing IDs and paths cannot be changed implicitly.", draft.id)
		try {
			const parsed = parseDocument({
				path: draft.document.path,
				sha: draft.document.sha,
				content: draft.document.raw,
			})
			if (
				parsed.id !== draft.id ||
				stableStringify(parsed.data) !== stableStringify(draft.document.data) ||
				parsed.body !== draft.document.body
			)
				add(
					"source-mismatch",
					"The reviewed fields do not match the raw source. Save the document again.",
					draft.id
				)
		} catch (error) {
			add(
				"invalid-source",
				error instanceof Error ? error.message : "Invalid source document.",
				draft.id
			)
		}
	}
	const proposed = new Map(target)
	for (const draft of included.values()) {
		if (draft.deleted) proposed.delete(draft.id)
		else proposed.set(draft.id, draft.document)
	}
	const documents = [...proposed.values()].sort(order)
	for (const draft of included.values())
		if (!draft.deleted) errors.push(...validateDocument(draft.document, documents))
	// A deletion must not leave an otherwise unchanged target record dangling.
	const deleted = new Set(
		[...included.values()].filter((draft) => draft.deleted).map((draft) => draft.id)
	)
	for (const document of documents) {
		for (const ref of documentRelations(document))
			if (deleted.has(ref.id))
				add(
					"referenced-deletion",
					titleOf(document) + " still references a selected deleted record.",
					document.id,
					ref.field
				)
	}
	const availableAssets = new Map<string, CmsAsset>()
	for (const draft of included.values()) {
		for (const asset of draft.assets) {
			if (
				!asset.path.startsWith("app/public/images/uploads/") ||
				asset.path.includes("..") ||
				asset.path.includes("\\")
			) {
				add("invalid-asset-path", "An attachment has an invalid repository path.", draft.id)
				continue
			}
			availableAssets.set(assetPublicPath(asset.path), asset)
			for (const variant of asset.variants || []) {
				if (
					!variant.path.startsWith("app/public/images/uploads/") ||
					variant.path.includes("..") ||
					variant.path.includes("\\")
				)
					add("invalid-asset-path", "An image variant has an invalid repository path.", draft.id)
				else availableAssets.set(assetPublicPath(variant.path), asset)
			}
		}
	}
	const targetMedia = new Set(input.documents.flatMap(documentMedia))
	const usedAssets = new Map<string, CmsAsset>()
	const previewAssets = new Map<string, CmsAsset>()
	for (const draft of included.values()) {
		if (draft.deleted) continue
		for (const path of documentMedia(draft.document)) {
			if (/^(blob:|data:)/i.test(path))
				add(
					"local-media-url",
					"Replace the temporary image preview with its saved attachment reference.",
					draft.id,
					"images"
				)
			const asset = availableAssets.get(path)
			if (asset) {
				if (!(asset.blob instanceof Blob) || !asset.blob.size)
					add(
						"missing-asset-bytes",
						"The selected image is not safely stored on this device.",
						draft.id,
						"images"
					)
				previewAssets.set(asset.id, asset)
				if (!targetMedia.has(path)) usedAssets.set(asset.id, asset)
			} else if (path.startsWith("/images/uploads/authoring/") && !targetMedia.has(path)) {
				add(
					"missing-asset",
					"A new image reference has no selected stored attachment.",
					draft.id,
					"images"
				)
			}
		}
	}
	const changes = catalogChanges(input.documents, documents)
	const fullChanges = input.productionDocuments
		? catalogChanges(input.productionDocuments, documents)
		: changes
	const beforeMedia = new Set(input.documents.flatMap(documentMedia))
	const afterMedia = new Set(documents.flatMap(documentMedia))
	const media: CmsPlan["media"] = [
		...[...afterMedia]
			.filter((path) => !beforeMedia.has(path))
			.sort()
			.map((path) => ({ path, operation: "add" as const })),
		...[...beforeMedia]
			.filter((path) => !afterMedia.has(path))
			.sort()
			.map((path) => ({ path, operation: "remove" as const })),
	]
	const sorted = [...included.values()].sort((a, b) => order(a.document, b.document))
	const summary = changes
		.map(
			(change) =>
				"- " +
				{ add: "Add", edit: "Update", delete: "Remove" }[change.operation] +
				" " +
				change.title +
				" (" +
				SCHEMAS[change.collection].singular.toLowerCase() +
				"): " +
				change.fields.join(", ")
		)
		.join("\n")
	if (owners.size > 1) destination = { kind: "blocked" }
	return {
		roots,
		included: sorted,
		required: [...reasons]
			.sort(([a], [b]) => a.localeCompare(b, "en"))
			.map(([id, by]) => ({ id, requiredBy: [...by].sort() })),
		omitted: input.drafts
			.filter((draft) => !included.has(draft.id) && isDraftDirty(draft))
			.sort((a, b) => order(a.document, b.document)),
		documents,
		assets: [...usedAssets.values()].sort((a, b) => a.path.localeCompare(b.path, "en")),
		previewAssets: [...previewAssets.values()].sort((a, b) => a.path.localeCompare(b.path, "en")),
		errors,
		destination,
		title: describe(fullChanges),
		commitMessage: describe(changes),
		summary,
		changedFields: changes,
		media,
		reviewKey: stableStringify({
			head: input.head,
			branch: input.branch,
			prNumber: input.prNumber || null,
			roots: roots.map((draft) => draft.id),
			records: sorted.map((draft) => ({
				id: draft.id,
				revision: draft.revision,
				raw: draft.document.raw,
				deleted: !!draft.deleted,
			})),
			assets: [...usedAssets.values()].map((asset) => ({
				id: asset.id,
				path: asset.path,
				size: asset.blob.size,
				variants: asset.variants?.map((variant) => ({
					path: variant.path,
					size: variant.blob?.size,
				})),
			})),
		}),
	}
}
