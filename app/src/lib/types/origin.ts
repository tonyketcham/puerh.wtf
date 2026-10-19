import type { Origin as GqlOrigin } from "@/generated/graphql"

/** What an origin node is: the tree runs country → province → prefecture → county → mountain-area → village. */
export type OriginKind =
	| "country"
	| "province"
	| "prefecture"
	| "county"
	| "mountain-area"
	| "township"
	| "village"
	| "forest"
	| "unknown"

/** Why a session has no origin. */
export type OriginNote = "blend" | "undisclosed" | "unknown"

/** Hand-curated location. Coordinates are WGS84; `precision` says what the point actually means. */
export type OriginGeo = {
	lat: number
	lon: number
	precision: OriginKind
	radius_km: number
	/** typical garden range [min, max] in meters */
	elevation_m?: [number, number] | null
	confidence: "high" | "medium" | "low"
	source: string
}

/**
 * An origin as sessions see it: identity, names and the parent chain (resolved by Flatbread's
 * Origin → Origin self-ref, a handful of levels deep; see ORIGIN_FIELDS in api.ts).
 */
export type OriginRef = {
	_slug: NonNullable<GqlOrigin["_slug"]>
	id: NonNullable<GqlOrigin["id"]>
	title: NonNullable<GqlOrigin["title"]>
	hanzi?: GqlOrigin["hanzi"]
	pinyin?: GqlOrigin["pinyin"]
	kind?: OriginKind | null
	parent?: OriginRef | null
}

/** Full origin node, as an origin page or the map pipeline reads it. */
export type Origin = OriginRef & {
	groups?: string[] | null
	geo?: OriginGeo | null
	description?: GqlOrigin["description"]
}
