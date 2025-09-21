import type { Category } from "@/lib/types/category"
import type { Content } from "@/lib/types/content"
import type {
	Session as GqlSession,
	Varietal as GqlVarietal,
	Session_Flavor_Axes as GqlSessionFlavorAxes,
	Session_Notes as GqlSessionNotes,
} from "@/generated/graphql"

type NonNullObject<T> = { [K in keyof T]-?: NonNullable<T[K]> }

// Base identity fields used throughout the app, derived from generated schema
export type BaseSession = {
	id: NonNullable<GqlSession["id"]>
	_slug: NonNullable<GqlSession["_slug"]>
}

export type SessionPreview = BaseSession & {
	_collection: NonNullable<GqlSession["_collection"]>
	title: NonNullable<GqlSession["title"]>
	tea_name?: GqlSession["tea_name"]
	date: NonNullable<GqlSession["date"]>
	production_year: GqlSession["production_year"]
	excerpt: NonNullable<GqlSession["excerpt"]>
	style: {
		id: string
		title: string
		color: string
		category: Category
	}[]
	vendor?:
		| {
				_slug: string
				title: string
				image: string
		  }[]
		| null
	cultivar?: Cultivar[]
	tags?: { _slug: string; title: string }[] | null
	origin?:
		| {
				_slug: string
				id: string
				country?: string | null
				location?: string | null
				municipality?: string | null
		  }[]
		| null
}

export type SessionPreviewWithFeatureImage = SessionPreview & {
	images:
		| {
				image: NonNullable<
					NonNullObject<NonNullable<NonNullable<GqlSession["images"]>[number]>>["image"]
				>
				alt: NonNullable<
					NonNullObject<NonNullable<NonNullable<GqlSession["images"]>[number]>>["alt"]
				>
		  }[]
		| null
}

export type Cultivar = Pick<NonNullObject<NonNullable<GqlVarietal>>, "id" | "_slug" | "title">

export type SessionFull = SessionPreviewWithFeatureImage & {
	season: GqlSession["season"]
	elevation: GqlSession["elevation"]
	aging_conditions: GqlSession["aging_conditions"]
	rating: NonNullable<GqlSession["rating"]>
	purchase_link: GqlSession["purchase_link"]
	vendor:
		| {
				_slug: NonNullable<
					NonNullObject<NonNullable<NonNullable<GqlSession["vendor"]>[number]>>["_slug"]
				>
				title: NonNullable<
					NonNullObject<NonNullable<NonNullable<GqlSession["vendor"]>[number]>>["title"]
				>
				image: NonNullable<
					NonNullObject<NonNullable<NonNullable<GqlSession["vendor"]>[number]>>["image"]
				>
		  }[]
		| null
	cultivar: Cultivar[]
	picking: GqlSession["picking"]
	genre: GqlSession["genre"]
	notes: SessionNotes
	flavor_axes: SessionFlavorAxes

	images:
		| {
				image: NonNullable<
					NonNullObject<NonNullable<NonNullable<GqlSession["images"]>[number]>>["image"]
				>
				alt: NonNullable<
					NonNullObject<NonNullable<NonNullable<GqlSession["images"]>[number]>>["alt"]
				>
		  }[]
		| null

	_content: Content
}

export type SessionNotes = Omit<NonNullObject<NonNullable<GqlSessionNotes>>, "__typename">

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

/**
 * How a tea transforms in profile over the session of the tasting.
 */
type FlavorAxesTransition = {
	start: number
	finish: number
}
