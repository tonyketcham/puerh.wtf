export const COLLECTION_NAMES = [
	"tastings",
	"vendors",
	"origins",
	"styles",
	"categories",
	"cultivars",
	"vessels",
	"authors",
	"tags",
] as const

export type Collection = typeof COLLECTION_NAMES[number]

/** Raw source is authoritative. GraphQL fields are read projections and never serialized here. */
export interface CmsDocument {
	id: string
	collection: Collection
	path: string
	sha: string | null
	raw: string
	data: Record<string, unknown>
	body: string
}

export interface CmsAssetVariant {
	path: string
	mime: string
	width: number
	height: number
	blob?: Blob
}

export interface CmsAsset {
	id: string
	filename: string
	/** Repository path under app/public/images/uploads; content uses the corresponding /images/ URL. */
	path: string
	mime: string
	width: number
	height: number
	blob: Blob
	variants?: CmsAssetVariant[]
}

export interface CmsDraft {
	id: string
	document: CmsDocument
	base: CmsDocument | null
	baseHead: string
	branch: string
	prNumber?: number
	revision: number
	updatedAt: number
	assets: CmsAsset[]
	deleted?: boolean
}

export type CmsFieldType =
	| "text"
	| "textarea"
	| "number"
	| "datetime"
	| "boolean"
	| "select"
	| "relation"
	| "list"
	| "object"
	| "image"
	| "color"

export interface CmsField {
	name: string
	label: string
	type: CmsFieldType
	required?: boolean
	multiple?: boolean
	collection?: Collection
	options?: readonly string[]
	fields?: readonly CmsField[]
	itemType?: "text" | "number"
	min?: number
	max?: number
	step?: number
	hint?: string
}

export interface CollectionDefinition {
	name: Collection
	label: string
	singular: string
	route: string | null
	fields: readonly CmsField[]
}

export interface CmsIssue {
	code: string
	message: string
	documentId?: string
	field?: string
}

export interface CmsRequiredRecord {
	id: string
	/** Root/required record whose new relationship requires this record. */
	requiredBy: string[]
}

export interface CmsFieldChange {
	documentId: string
	collection: Collection
	title: string
	operation: "add" | "edit" | "delete"
	fields: string[]
}

export type CmsDestination =
	| { kind: "new"; branch: "main" }
	| { kind: "pr"; branch: string; prNumber: number }
	| { kind: "blocked" }

export interface CmsPlan {
	roots: CmsDraft[]
	included: CmsDraft[]
	required: CmsRequiredRecord[]
	omitted: CmsDraft[]
	/** Exact base plus selected whole records; excluded local values never enter this catalog. */
	documents: CmsDocument[]
	assets: CmsAsset[]
	/** Referenced local bytes for preview, including media already pushed to the target. */
	previewAssets: CmsAsset[]
	errors: CmsIssue[]
	destination: CmsDestination
	title: string
	commitMessage: string
	summary: string
	changedFields: CmsFieldChange[]
	media: { path: string; operation: "add" | "remove" }[]
	/** Stable for identical local/remote revisions; compare again immediately before push. */
	reviewKey: string
}

export interface CmsPlanInput {
	documents: readonly CmsDocument[]
	/** Live catalog for cumulative PR metadata when documents is a PR target snapshot. */
	productionDocuments?: readonly CmsDocument[]
	drafts: readonly CmsDraft[]
	selectedIds: readonly string[]
	head: string
	branch: string
	prNumber?: number
}

export interface DraftNamespace {
	repository: string
	account: string
}
