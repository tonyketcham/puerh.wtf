import { isRecord, parseDocument, serializeDocument, stableStringify } from "./documents"
import { SCHEMAS } from "./schema"
import type { CmsDocument, CmsDraft, CmsField } from "./types"

export type ReconcileChoice = "local" | "latest"
export interface ReconciliationConflict {
	id: string
	path: readonly string[]
	label: string
	field?: CmsField
	body: boolean
	base: unknown
	local: unknown
	remote: unknown
}
export interface ReconciliationResult {
	/** Available only when every conflicting field has an explicit choice. */
	document: CmsDocument | null
	conflicts: ReconciliationConflict[]
	unresolved: ReconciliationConflict[]
	error: string | null
}
export type ReconciliationChoices = Readonly<Record<string, ReconcileChoice | undefined>>

const equal = (left: unknown, right: unknown) =>
	left === undefined || right === undefined
		? left === right
		: stableStringify(left) === stableStringify(right)
const pointer = (path: readonly string[]) =>
	"/" + path.map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")
export const editorialLabel = (name: string) =>
	name
		.replace(/_/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/^./, (letter) => letter.toUpperCase())

function describePath(collection: CmsDocument["collection"], path: readonly string[]) {
	let fields = SCHEMAS[collection].fields
	let field: CmsField | undefined
	const labels = path.map((name) => {
		field = fields.find((candidate) => candidate.name === name)
		fields = field?.fields || []
		return field?.label || (name === "image_alt" ? "Image description" : editorialLabel(name))
	})
	return { label: labels.join(" › "), field }
}

function patchBetween(
	previous: Record<string, unknown>,
	next: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		[...new Set([...Object.keys(previous), ...Object.keys(next)])]
			.filter((key) => !equal(previous[key], next[key]))
			.map((key) => [
				key,
				isRecord(previous[key]) && isRecord(next[key])
					? patchBetween(previous[key], next[key])
					: next[key],
			])
	)
}

/** Bind the UI's choices to the exact local/base/remote versions that were reviewed. */
export function reconciliationKey(
	draft: CmsDraft,
	remote: CmsDocument | null | undefined,
	head = ""
) {
	return stableStringify({
		id: draft.id,
		revision: draft.revision,
		base: draft.base?.raw,
		local: draft.document.raw,
		remote: remote?.raw,
		sha: remote?.sha,
		head,
	})
}

/**
 * Merge semantic values, then patch the remote YAML AST. Maps merge by nested field;
 * lists, tasting notes, body and each single-image source/variants set are atomic. No unresolved conflict has a default.
 * This does not change a draft's base/branch or assert that a PR is still open.
 */
export function reconcileDraft(
	draft: CmsDraft,
	remote: CmsDocument | null | undefined,
	choices: ReconciliationChoices = {}
): ReconciliationResult {
	const conflicts: ReconciliationConflict[] = []
	const fail = (error: string): ReconciliationResult => ({
		document: null,
		conflicts: [],
		unresolved: [],
		error,
	})
	if (!draft.base)
		return fail(
			"This new draft has no shared earlier version. Keep a backup and resolve its source collision before pushing."
		)
	if (!remote)
		return fail(
			"The latest record is missing. Your local draft is intact; export a backup before resolving this record in the repository."
		)
	if (draft.deleted)
		return fail(
			"A deleted record needs separate review. Keep a backup; this editor does not reconcile deletions."
		)
	const versions = [draft.base, draft.document, remote]
	if (
		versions.some(
			(version) =>
				version.id !== draft.id ||
				version.data.id !== draft.id ||
				version.path !== draft.base!.path ||
				version.collection !== draft.base!.collection
		)
	)
		return fail(
			"The record's identity, collection or source path changed. Keep a backup and resolve the versions without creating a replacement identity."
		)
	if (!remote.sha)
		return fail(
			"The latest record has no verified repository revision. Refresh it before reconciling; your local work is retained."
		)
	try {
		for (const version of versions) {
			const parsed = parseDocument({ path: version.path, sha: version.sha, content: version.raw })
			if (
				parsed.id !== version.id ||
				parsed.body !== version.body ||
				!equal(parsed.data, version.data)
			)
				return fail(
					"A record's displayed fields do not match its saved source. Keep a backup and reload its verified version before reconciling."
				)
		}
		const merge = (
			base: unknown,
			local: unknown,
			latest: unknown,
			path: string[],
			atomic = false
		): unknown => {
			if (equal(local, latest)) return local
			if (equal(local, base)) return latest
			if (equal(latest, base)) return local
			if (
				!atomic &&
				isRecord(local) &&
				isRecord(latest) &&
				(isRecord(base) || base === undefined)
			) {
				const earlier = isRecord(base) ? base : {}
				const keys = [
					...new Set([...Object.keys(latest), ...Object.keys(earlier), ...Object.keys(local)]),
				]
				const singleImage =
					path.length === 1 &&
					path[0] === "data" &&
					keys.some((key) => key === "image" || key === "image_variants")
				// Src and responsive variants describe one picture, even if only one side added variants.
				const picture = (values: Record<string, unknown>) => {
					const entries = ["image", "image_variants"]
						.filter((key) => Object.prototype.hasOwnProperty.call(values, key))
						.map((key) => [key, values[key]])
					return entries.length ? Object.fromEntries(entries) : undefined
				}
				const mergedPicture = singleImage
					? merge(picture(earlier), picture(local), picture(latest), ["data", "image"], true)
					: undefined
				return Object.fromEntries(
					[
						...keys
							.filter((key) => !singleImage || (key !== "image" && key !== "image_variants"))
							.map((key) => [
								key,
								merge(
									earlier[key],
									local[key],
									latest[key],
									[...path, key],
									path.length === 1 && key === "notes"
								),
							]),
						...(isRecord(mergedPicture) ? Object.entries(mergedPicture) : []),
					].filter(([, value]) => value !== undefined)
				)
			}
			const body = path[0] === "body"
			const image = atomic && path.length === 2 && path[0] === "data" && path[1] === "image"
			const description = body
				? { label: "Notes & story", field: undefined }
				: image
				? { label: "Image", field: { name: "image", label: "Image", type: "image" as const } }
				: describePath(draft.document.collection, path.slice(1))
			const conflict: ReconciliationConflict = {
				id: pointer(path),
				path,
				...description,
				body,
				base,
				local,
				remote: latest,
			}
			conflicts.push(conflict)
			// The provisional value is never exposed as a reconciled document until chosen.
			return choices[conflict.id] === "local" ? local : latest
		}
		const data = merge(draft.base.data, draft.document.data, remote.data, ["data"]) as Record<
			string,
			unknown
		>
		const body = merge(draft.base.body, draft.document.body, remote.body, ["body"], true) as string
		const unresolved = conflicts.filter(
			(conflict) => choices[conflict.id] !== "local" && choices[conflict.id] !== "latest"
		)
		if (unresolved.length) return { document: null, conflicts, unresolved, error: null }
		const document = serializeDocument(remote, patchBetween(remote.data, data), body)
		return { document, conflicts, unresolved, error: null }
	} catch (error) {
		return fail(
			"These versions could not be reconciled safely. Your local work is retained. " +
				(error instanceof Error ? error.message : "Export a backup before continuing.")
		)
	}
}
