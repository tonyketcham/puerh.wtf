import type { Category } from "@/lib/types/category"
import type { OriginNote, OriginRef } from "@/lib/types/origin"
import type { Content } from "@/lib/types/content"
import type {
	Session as GqlSession,
	Varietal as GqlVarietal,
	Session_Notes as GqlSessionNotes,
} from "@/generated/graphql"

type NonNullObject<T> = { [K in keyof T]-?: NonNullable<T[K]> }

// Base identity fields used throughout the app, derived from generated schema
export type BaseSession = {
	id: NonNullable<GqlSession["id"]>
	_slug: NonNullable<GqlSession["_slug"]>
}

/** The session routing query has no presentation fields. */
export type SessionRoute = { _slug: string; date: string }

export type SessionPreview = BaseSession & {
	_collection: NonNullable<GqlSession["_collection"]>
	title: NonNullable<GqlSession["title"]>
	tea_name?: GqlSession["tea_name"]
	date: NonNullable<GqlSession["date"]>
	production_year: GqlSession["production_year"]
	excerpt: NonNullable<GqlSession["excerpt"]>
	style:
		| {
				id: string
				_slug: string
				title: string
				color: string | null
				category: Pick<Category, "_slug" | "title" | "color"> | null
		  }[]
		| null
	vendor?:
		| {
				_slug: string
				title: string
				image: string | null
		  }[]
		| null
	cultivar?: Cultivar[] | null
	tags?: SessionTag[] | null
	origin?: OriginRef[] | null
	/** why there's no origin (blends, undisclosed sourcing) */
	origin_note?: OriginNote | null
	/** what it was brewed in (brewing.vessel keeps the free-text note) */
	vessel?: SessionVessel[] | null
	/** where it aged, in order (aging_conditions keeps the raw text) */
	storage?: StorageStint[] | null
}

/** The shape of a brewing vessel (content/vessels). */
export type VesselKind = "gaiwan" | "teapot" | "shiboridashi" | "chawan"

/** A brewing vessel as sessions reference it. */
export type SessionVessel = {
	id: string
	_slug: string
	title: string
	hanzi?: string | null
	kind?: VesselKind | string | null
	material?: string | null
	/** what it holds, in ml */
	volume_ml?: number | null
	image?: string | null
}

export type StorageHumidity = "dry" | "natural" | "wet"

/**
 * One stint of storage, hand-parsed from `aging_conditions` (plan §3.5): a place key (see
 * lib/storage.ts), the years it covers when the text says, and the humidity when it says.
 * `approx` marks a hedged reading ("~20 years", "perhaps TW storage?").
 */
export type StorageStint = {
	place: string
	from?: number | null
	to?: number | null
	humidity?: StorageHumidity | null
	approx?: boolean | null
}

/** A tag: a colored mood chip. Tags act as Explorer filters (?tags=), not pages. */
export type SessionTag = { _slug: string; title: string; color?: string | null }

/** A photo attached to a session. `image` is a site-root path like /images/uploads/x.jpeg (or a legacy https URL). */
export type SessionImage = {
	image: string
	alt: string
}

/** Brewing parameters. temperature is °F, material_amount grams, liquid_amount ml, durations seconds. */
export type SessionBrewing = {
	temperature?: number | null
	material_amount?: number | null
	liquid_amount?: number | null
	vessel?: string | null
	first_infusion_duration?: number | null
	infusion_increment?: number | null
}

export type SessionAuthor = {
	_slug: string
	title: string
	image?: string | null
}

export type SessionPreviewWithFeatureImage = SessionPreview & {
	images: SessionImage[] | null
}

/**
 * Shape returned by getExplorerSessions(): the explorer / command bar / compare index of every
 * session. Lighter than SessionFull (no body html), but carries everything needed to search,
 * compare (radar overlay) and find descriptor references. Fields may be null on older tastings.
 */
export type ExplorerSession = SessionPreviewWithFeatureImage & {
	rating?: number | null
	notes: Partial<SessionNotes> | null
	flavor_axes: SessionFlavorAxes | null
	brewing: SessionBrewing | null
}

export type Cultivar = Pick<NonNullObject<NonNullable<GqlVarietal>>, "id" | "_slug" | "title">

/** Harvest timing. `season` is the normalized season; `season_note` on the session keeps the raw text. */
export type SessionHarvest = {
	season?: "spring" | "summer" | "autumn" | "winter" | null
	/** 1–12 */
	month?: number | null
	years?: number[] | null
}

export type SessionFull = SessionPreviewWithFeatureImage & {
	harvest: SessionHarvest | null
	season_note: GqlSession["season_note"]
	/** meters */
	elevation: GqlSession["elevation"]
	aging_conditions: GqlSession["aging_conditions"]
	rating: NonNullable<GqlSession["rating"]>
	purchase_link: GqlSession["purchase_link"]
	cultivar: Cultivar[] | null
	picking: GqlSession["picking"]
	notes: SessionNotes
	flavor_axes: SessionFlavorAxes
	brewing: SessionBrewing | null
	author: SessionAuthor[] | null

	images: SessionImage[] | null

	_content: Content
}

export type SessionNotes = Omit<NonNullObject<NonNullable<GqlSessionNotes>>, "__typename">

/** Stage keys of the tasting notes. */
export type NoteStage = keyof SessionNotes

/** Note stages in tasting order (dry leaf → cha qi). */
export const NOTE_STAGES: readonly NoteStage[] = [
	"dry_leaf_nose",
	"wet_leaf_nose",
	"mouthfeel",
	"taste",
	"finish",
	"empty_cup",
	"cha_qi",
] as const

export type SessionFlavorAxes = {
	vegetal: FlavorAxesTransition
	floral: FlavorAxesTransition
	fruits: FlavorAxesTransition
	spices: FlavorAxesTransition
	wood: FlavorAxesTransition
	earth: FlavorAxesTransition
	nuts_roast: FlavorAxesTransition
	cream: FlavorAxesTransition
	stone: FlavorAxesTransition
	umami: FlavorAxesTransition
}

export type FlavorAxis = keyof SessionFlavorAxes

/** The 10 flavor axes in canonical radar order. */
export const FLAVOR_AXES: readonly FlavorAxis[] = [
	"vegetal",
	"floral",
	"fruits",
	"spices",
	"wood",
	"earth",
	"nuts_roast",
	"cream",
	"stone",
	"umami",
] as const

/**
 * How a tea transforms in profile over the session of the tasting.
 */
export type FlavorAxesTransition = {
	start: number
	finish: number
}
