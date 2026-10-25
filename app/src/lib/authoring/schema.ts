import type { CmsDocument, CmsField, CmsIssue, Collection, CollectionDefinition } from "./types"
import { COLLECTION_NAMES } from "./types"
import {
	COLLECTIONS as definitions,
	SCHEMAS as definitionsByName,
	RELATION_FIELDS as relationDefinitions,
} from "./schema-data.mjs"
export { NOTE_FIELDS, AXIS_FIELDS } from "./schema-data.mjs"
export const COLLECTIONS = definitions as unknown as readonly CollectionDefinition[]
export const SCHEMAS = definitionsByName as unknown as Record<Collection, CollectionDefinition>
export const RELATION_FIELDS = relationDefinitions as Partial<
	Record<Collection, Record<string, Collection>>
>
export const isCollection = (value: unknown): value is Collection =>
	typeof value === "string" && (COLLECTION_NAMES as readonly string[]).includes(value)

export function documentRelations(
	document: CmsDocument
): { field: string; collection: Collection; id: string }[] {
	const refs: { field: string; collection: Collection; id: string }[] = []
	for (const [field, collection] of Object.entries(RELATION_FIELDS[document.collection] || {})) {
		const value = document.data[field]
		for (const id of Array.isArray(value) ? value : value ? [value] : []) {
			if (typeof id === "string") refs.push({ field, collection, id })
		}
	}
	return refs
}

/** Validate only the chosen document, resolving references exclusively from the candidate catalog. */
export function validateDocument(
	document: CmsDocument,
	documents: readonly CmsDocument[] = []
): CmsIssue[] {
	const errors: CmsIssue[] = []
	const add = (field: string, message: string) =>
		errors.push({ code: "invalid-field", documentId: document.id, field, message })
	if (!document.id || document.data.id !== document.id)
		add("id", "A record must retain its stable ID.")
	const walk = (values: Record<string, unknown>, fields: readonly CmsField[], prefix = "") => {
		for (const field of fields) {
			const value = values[field.name]
			const path = prefix + field.name
			if (value == null || value === "") {
				if (field.required) add(path, field.label + " is required.")
				continue
			}
			if (field.type === "number") {
				if (typeof value !== "number" || !Number.isFinite(value))
					add(path, field.label + " must be a finite number.")
				else if (
					(field.min != null && value < field.min) ||
					(field.max != null && value > field.max)
				)
					add(path, field.label + " is outside its allowed range.")
			} else if (field.type === "boolean") {
				if (typeof value !== "boolean") add(path, field.label + " must be true or false.")
			} else if (field.type === "object") {
				if (!value || typeof value !== "object" || Array.isArray(value))
					add(path, field.label + " must be an object.")
				else walk(value as Record<string, unknown>, field.fields || [], path + ".")
			} else if (field.type === "list") {
				if (!Array.isArray(value)) add(path, field.label + " must be a list.")
				else
					value.forEach((item, index) => {
						if (field.fields) {
							if (!item || typeof item !== "object" || Array.isArray(item))
								add(path + "." + index, field.label + " item must be an object.")
							else walk(item as Record<string, unknown>, field.fields, path + "." + index + ".")
						} else if (
							field.itemType &&
							(typeof item !== (field.itemType === "number" ? "number" : "string") ||
								(typeof item === "number" && !Number.isFinite(item)))
						)
							add(path + "." + index, field.label + " has an invalid item.")
					})
			} else if (field.type === "relation") {
				if (
					field.multiple
						? !Array.isArray(value) || value.some((id) => typeof id !== "string")
						: typeof value !== "string"
				)
					add(path, field.label + " must contain stable record IDs.")
			} else if (typeof value !== "string") add(path, field.label + " must be text.")
			else if (field.type === "select" && !field.options?.includes(value))
				add(path, field.label + " has an unknown value.")
			else if (field.type === "datetime" && !Number.isFinite(Date.parse(value)))
				add(path, field.label + " must be a valid date and time.")
		}
	}
	walk(document.data, SCHEMAS[document.collection].fields)
	for (const ref of documentRelations(document)) {
		if (
			!documents.some(
				(candidate) => candidate.id === ref.id && candidate.collection === ref.collection
			)
		) {
			errors.push({
				code: "missing-reference",
				documentId: document.id,
				field: ref.field,
				message:
					"Missing " +
					SCHEMAS[ref.collection].singular.toLowerCase() +
					" referenced by " +
					ref.field +
					".",
			})
		}
	}
	if (document.collection === "origins") {
		const seen = new Set<string>()
		let current: CmsDocument | undefined = document
		let depth = 0
		while (current) {
			if (seen.has(current.id)) {
				add("parent", "Origin parents must not form a cycle.")
				break
			}
			seen.add(current.id)
			if (++depth > 6) {
				add("parent", "This origin hierarchy exceeds the six levels supported by the site.")
				break
			}
			const parent: unknown = current.data.parent
			current =
				typeof parent === "string"
					? documents.find(
							(candidate) => candidate.collection === "origins" && candidate.id === parent
					  )
					: undefined
		}
	}
	return errors
}
