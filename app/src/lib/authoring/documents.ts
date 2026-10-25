import { isMap, parseDocument as parseYamlDocument, type Document } from "yaml"
import { isCollection, SCHEMAS } from "./schema"
import type { CmsDocument, CmsDraft, Collection } from "./types"

export interface SourceRecord {
	path: string
	sha: string | null
	content: string
}

export function collectionFromPath(path: string): Collection {
	const match = /^app\/content\/([^/]+)\/([^/]+\.md)$/.exec(path)
	if (!match || !isCollection(match[1]) || match[2].startsWith(".") || path.includes("\\"))
		throw new Error("Unsupported content path: " + path)
	return match[1]
}

function splitSource(raw: string) {
	const opening = /^(?:\uFEFF)?---(?:\r\n|\n)/.exec(raw)
	if (!opening) throw new Error("Content must start with YAML frontmatter.")
	const rest = raw.slice(opening[0].length)
	const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest)
	if (!closing) throw new Error("Content has no closing frontmatter delimiter.")
	return {
		opening: opening[0],
		yaml: rest.slice(0, closing.index),
		closing: closing[0],
		body: rest.slice(closing.index + closing[0].length),
		newline: opening[0].includes("\r\n") ? "\r\n" : "\n",
	}
}

function sourceYaml(raw: string) {
	const source = splitSource(raw)
	const yaml = parseYamlDocument(source.yaml, { keepSourceTokens: true, uniqueKeys: true })
	if (yaml.errors.length)
		throw new Error("Invalid YAML: " + yaml.errors.map((error) => error.message).join("; "))
	if (!isMap(yaml.contents)) throw new Error("Frontmatter must be a mapping.")
	const data: unknown = yaml.toJS({ maxAliasCount: 100 })
	if (!isRecord(data)) throw new Error("Frontmatter must be a mapping.")
	return { source, yaml, data }
}

export function parseDocument(source: SourceRecord): CmsDocument {
	const collection = collectionFromPath(source.path)
	const { source: parts, data } = sourceYaml(source.content)
	if (typeof data.id !== "string" || !data.id.trim())
		throw new Error("Content needs an existing stable ID: " + source.path)
	return {
		id: data.id,
		collection,
		path: source.path,
		sha: source.sha,
		raw: source.content,
		data,
		body: parts.body,
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return (
		!!value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== Date.prototype
	)
}

/** Stable comparison ignores map key order; raw source remains byte-authoritative. */
export function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return "[" + value.map((item) => stableStringify(item)).join(",") + "]"
	if (isRecord(value))
		return (
			"{" +
			Object.keys(value)
				.sort()
				.map((key) => JSON.stringify(key) + ":" + stableStringify(value[key]))
				.join(",") +
			"}"
		)
	return JSON.stringify(value) ?? "null"
}

function mergePatch(
	base: Record<string, unknown>,
	patch: Record<string, unknown>
): Record<string, unknown> {
	const next = Object.fromEntries(Object.entries(base))
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) delete next[key]
		else
			Object.defineProperty(next, key, {
				value: isRecord(value) && isRecord(base[key]) ? mergePatch(base[key], value) : value,
				writable: true,
				enumerable: true,
				configurable: true,
			})
	}
	return next
}

function syncNode(yaml: Document, previous: unknown, next: unknown, path: (string | number)[]) {
	if (stableStringify(previous) === stableStringify(next)) return
	if (isRecord(previous) && isRecord(next)) {
		for (const key of Object.keys(previous)) if (!(key in next)) yaml.deleteIn([...path, key])
		for (const [key, value] of Object.entries(next))
			syncNode(yaml, previous[key], value, [...path, key])
	} else if (Array.isArray(previous) && Array.isArray(next)) {
		for (let i = previous.length - 1; i >= next.length; i--) yaml.deleteIn([...path, i])
		next.forEach((value, i) => syncNode(yaml, previous[i], value, [...path, i]))
	} else {
		yaml.setIn(path, next)
	}
}

/**
 * Patch intended keys in the parsed YAML AST. Unknown fields, comments and untouched
 * scalar styles survive; a no-op returns the original bytes, including line endings/body.
 * Passing undefined for a key explicitly deletes it. IDs and paths never change here.
 */
export function serializeDocument(
	document: CmsDocument,
	patch?: Record<string, unknown>,
	body = document.body
): CmsDocument {
	const { source, yaml, data } = sourceYaml(document.raw)
	const next = patch ? mergePatch(document.data, patch) : document.data
	if (next.id !== document.id) throw new Error("A stable content ID cannot be edited.")
	if (collectionFromPath(document.path) !== document.collection)
		throw new Error("Collection and source path do not match.")
	const fieldsChanged = stableStringify(data) !== stableStringify(next)
	if (!fieldsChanged && body === source.body)
		return { ...document, data: next, body, raw: document.raw }
	let yamlText = source.yaml
	if (fieldsChanged) {
		syncNode(yaml, data, next, [])
		yamlText = yaml.toString({ lineWidth: 0 }).replace(/\r?\n/g, source.newline)
	}
	const raw = source.opening + yamlText + source.closing + body
	return parseDocument({ path: document.path, sha: document.sha, content: raw })
}

export const updateDocument = serializeDocument

export function setDocumentField(
	document: CmsDocument,
	path: readonly (string | number)[],
	value: unknown
): CmsDocument {
	if (
		!path.length ||
		path[0] === "id" ||
		path.some((key) => key === "__proto__" || key === "constructor" || key === "prototype")
	)
		throw new Error("Unsupported editable field.")
	const data = structuredClone(document.data)
	let cursor: Record<string | number, unknown> | unknown[] = data
	path.slice(0, -1).forEach((key, index) => {
		const item = (cursor as Record<string | number, unknown>)[key]
		if (!item || typeof item !== "object")
			(cursor as Record<string | number, unknown>)[key] =
				typeof path[index + 1] === "number" ? [] : {}
		cursor = (cursor as Record<string | number, unknown>)[key] as Record<string | number, unknown>
	})
	const key = path[path.length - 1]
	if (value === undefined) delete (cursor as Record<string | number, unknown>)[key]
	else (cursor as Record<string | number, unknown>)[key] = value
	return serializeDocument({ ...document, data })
}

function slug(value: string) {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 70)
}

export function createDocument(
	collection: Collection,
	initialData: Record<string, unknown> = {},
	body = ""
): CmsDocument {
	const id = crypto.randomUUID()
	const title = typeof initialData.title === "string" ? initialData.title : ""
	const stem = slug(title) || SCHEMAS[collection].singular.toLowerCase()
	const path = "app/content/" + collection + "/" + stem + "-" + id.slice(0, 8) + ".md"
	const yaml = parseYamlDocument("id: " + id + "\ntitle: ''\n")
	for (const [key, value] of Object.entries(initialData))
		if (key !== "id" && value !== undefined) yaml.set(key, value)
	return parseDocument({
		path,
		sha: null,
		content: "---\n" + yaml.toString({ lineWidth: 0 }) + "---\n" + body,
	})
}

export function createDraft(
	document: CmsDocument,
	baseHead: string,
	branch = "main",
	prNumber?: number
): CmsDraft {
	return {
		id: document.id,
		document: structuredClone(document),
		base: document.sha ? structuredClone(document) : null,
		baseHead,
		branch,
		...(prNumber ? { prNumber } : {}),
		revision: 1,
		updatedAt: Date.now(),
		assets: [],
	}
}

export function isDraftDirty(draft: CmsDraft): boolean {
	return !!draft.deleted || !draft.base || draft.document.raw !== draft.base.raw
}

/** Asset models carry repository paths; content continues to store site-root image URLs. */
export function assetPublicPath(path: string): string {
	return path.startsWith("app/public/") ? "/" + path.slice("app/public/".length) : path
}
