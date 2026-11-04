import type { CmsDocument } from "./types"

/** Carry the leaf's identity, never the previous cup's measurements or impressions. */
export function sessionSeed(document: CmsDocument): Record<string, unknown> {
	if (document.collection !== "tastings") return {}
	const fields = [
		"title",
		"tea_name",
		"production_year",
		"harvest",
		"season_note",
		"picking",
		"elevation",
		"vendor",
		"sourced_from",
		"style",
		"cultivar",
		"origin",
		"origin_note",
		"purchase_link",
	]
	return {
		...Object.fromEntries(
			fields
				.filter((field) => document.data[field] != null)
				.map((field) => [field, structuredClone(document.data[field])])
		),
		previous_session: document.id,
	}
}
