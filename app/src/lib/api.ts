import { gql, GraphQLClient } from "graphql-request"
import {
	FLAVOR_AXES,
	type ExplorerSession,
	type SessionFull,
	type SessionPreviewWithFeatureImage,
} from "./types/session"
import type { Vendor } from "./types/vendor"
import type { Category } from "./types/category"
import type { Origin, OriginRef } from "./types/origin"

const flatbread = new GraphQLClient(process.env.FLATBREAD_URL || "http://localhost:5057/graphql", {
	headers: {},
})

// Shared GraphQL selection sets (interpolated into the gql strings below)
const FLAVOR_AXES_FIELDS = FLAVOR_AXES.map((axis) => `${axis} { start finish }`).join("\n")

const NOTES_FIELDS = `
	dry_leaf_nose
	wet_leaf_nose
	mouthfeel
	taste
	finish
	empty_cup
	cha_qi
`

/**
 * An origin plus its parent chain. Flatbread resolves the Origin → Origin self-ref one level per
 * selection, so nest it as deep as the tree goes (village → … → country is 6 nodes).
 * The deepest chains today (Banpo Laozhai, Weidong) are exactly 6; getOrigins() throws if the
 * content grows deeper so truncation can't go unnoticed.
 */
const ORIGIN_DEPTH = 6
const ORIGIN_NODE_FIELDS = `_slug id title hanzi pinyin kind`
const ORIGIN_FIELDS = Array.from({ length: ORIGIN_DEPTH - 1 }).reduce<string>(
	(inner) => `${ORIGIN_NODE_FIELDS} parent { ${inner} }`,
	ORIGIN_NODE_FIELDS
)

/** The vessel a session was brewed in (top-level ref; brewing.vessel stays the free-text note). */
const VESSEL_FIELDS = `
	id
	_slug
	title
	hanzi
	kind
	material
	volume_ml
	image
`

/** Storage stints, hand-parsed from aging_conditions (plan §3.5). */
const STORAGE_FIELDS = `
	place
	from
	to
	humidity
	approx
`

const BREWING_FIELDS = `
	temperature
	material_amount
	liquid_amount
	vessel
	first_infusion_duration
	infusion_increment
`

export async function getSessions(options?: {
	order?: "ASC" | "DESC"
	sortBy?: string
	limit?: number
	withImages?: boolean
}): Promise<SessionPreviewWithFeatureImage[]> {
	const { order = "DESC", sortBy = "date", limit, withImages } = options || {}

	const query = gql`
    query AllSessions($order: Order, $sortBy: String, $limit: Int) {
      allSessions(order: $order, sortBy: $sortBy, limit: $limit) {
        _slug
        _collection
        id
        title
        date
        production_year
        excerpt
        style {
          category {
            _slug
            title
            color
          }
        }
        vendor {
          _slug
          title
          image
        }
        ${
					withImages
						? `
        images {
          alt
          image
        }`
						: ""
				}
      }
    }
  `

	const { allSessions }: { allSessions: SessionPreviewWithFeatureImage[] } =
		await flatbread.request(query, { order, sortBy, limit })

	return allSessions
}

export async function getExplorerSessions(options?: {
	order?: "ASC" | "DESC"
	sortBy?: string
	limit?: number
}): Promise<ExplorerSession[]> {
	const { order = "DESC", sortBy = "date", limit } = options || {}

	const query = gql`
		query AllSessionsForExplorer($order: Order, $sortBy: String, $limit: Int) {
			allSessions(order: $order, sortBy: $sortBy, limit: $limit) {
				_slug
				_collection
				id
				title
				tea_name
				date
				production_year
				excerpt
				style {
					id
					_slug
					title
					color
					category {
						_slug
						title
						color
					}
				}
				vendor {
					_collection
					_slug
					title
					image
				}
				cultivar {
					id
					_slug
					title
				}
				tags {
					_slug
					title
					color
				}
				origin {
					${ORIGIN_FIELDS}
				}
				origin_note
				rating
				notes {
					${NOTES_FIELDS}
				}
				flavor_axes {
					${FLAVOR_AXES_FIELDS}
				}
				brewing {
					${BREWING_FIELDS}
				}
				vessel {
					${VESSEL_FIELDS}
				}
				storage {
					${STORAGE_FIELDS}
				}
				images {
					alt
					image
				}
			}
		}
	`

	const { allSessions }: { allSessions: ExplorerSession[] } = await flatbread.request(query, {
		order,
		sortBy,
		limit,
	})

	return allSessions
}

export async function getVendors(): Promise<Vendor[]> {
	const query = gql`
		query AllVendors {
			allVendors {
				id
				_collection
				_slug
				title
				image
			}
		}
	`

	const { allVendors }: { allVendors: Vendor[] } = await flatbread.request(query)
	return allVendors
}

export async function getCategories(): Promise<Category[]> {
	const query = gql`
		query AllCategories {
			allCategories {
				id
				_collection
				_slug
				title
				color
			}
		}
	`

	const { allCategories }: { allCategories: Category[] } = await flatbread.request(query)
	return allCategories
}

export async function getSession(slug: string): Promise<SessionFull> {
	// First, find the session by slug to get its id
	const findQuery = gql`
		query FindSession($slug: String!) {
			allSessions(filter: { _slug: { eq: $slug } }) {
				id
				_slug
			}
		}
	`

	const { allSessions } = await flatbread.request(findQuery, { slug })

	if (!allSessions || allSessions.length === 0) {
		throw new Error(`Session with slug "${slug}" not found`)
	}

	const sessionId = allSessions[0].id

	// Now get the full session details using the id
	const query = gql`
		query Session($id: String!) {
			Session(id: $id) {
				_slug
				_collection
				id
				title
				date
				production_year
				excerpt
				harvest {
					season
					month
					years
				}
				season_note
				elevation
				aging_conditions
				rating
				purchase_link
				picking
				style {
					id
					_slug
					title
					color
					category {
						_slug
						title
						color
					}
				}
				vendor {
					_slug
					title
					image
				}
				cultivar {
					_slug
					id
					title
				}
				notes {
					${NOTES_FIELDS}
				}
				flavor_axes {
					${FLAVOR_AXES_FIELDS}
				}
				brewing {
					${BREWING_FIELDS}
				}
				vessel {
					${VESSEL_FIELDS}
				}
				storage {
					${STORAGE_FIELDS}
				}
				author {
					_slug
					title
					image
				}
				tags {
					_slug
					title
					color
				}
				origin {
					${ORIGIN_FIELDS}
				}
				origin_note
				images {
					alt
					image
				}
				_content {
					html
				}
			}
		}
	`

	const { Session } = await flatbread.request(query, { id: sessionId })
	return Session
}

export async function getOrigins(): Promise<Origin[]> {
	const query = gql`
		query AllOrigins {
			allOrigins(sortBy: "_slug") {
				${ORIGIN_FIELDS}
				groups
				description
				geo {
					lat
					lon
					precision
					radius_km
					elevation_m
					confidence
					source
				}
			}
		}
	`

	const { allOrigins }: { allOrigins: Origin[] } = await flatbread.request(query)
	assertOriginDepth(allOrigins)
	return allOrigins
}

/**
 * Every origin is listed with at least its own parent, so if the last node of any selected chain
 * still has a parent in the full list, the tree outgrew ORIGIN_DEPTH and chains are being cut short.
 */
function assertOriginDepth(origins: Origin[]) {
	const parentOf = new Map(origins.map((origin) => [origin.id, origin.parent?.id]))
	for (const origin of origins) {
		let node: OriginRef | null | undefined = origin
		let depth = 1
		while (node?.parent) {
			node = node.parent
			depth++
		}
		if (depth === ORIGIN_DEPTH && node && parentOf.get(node.id)) {
			throw new Error(
				`Origin "${origin._slug}" is deeper than ORIGIN_DEPTH (${ORIGIN_DEPTH}); raise it in lib/api.ts`
			)
		}
	}
}

export type VendorDetail = {
	_slug: string
	title: string
	image?: string | null
	country?: string | null
	location?: string | null
	municipality?: string | null
	description?: string | null
	links?: {
		website?: string | null
		instagram?: string | null
		twitter?: string | null
		facebook?: string | null
		youtube?: string | null
	} | null
	_content?: { html?: string | null } | null
}

export async function getVendorBySlug(slug: string): Promise<VendorDetail> {
	const findQuery = gql`
		query FindVendor($slug: String!) {
			allVendors(filter: { _slug: { eq: $slug } }) {
				id
				_slug
			}
		}
	`

	const { allVendors } = await flatbread.request(findQuery, { slug })
	if (!allVendors || allVendors.length === 0) {
		throw new Error(`Vendor with slug "${slug}" not found`)
	}

	const vendorId = allVendors[0].id
	const query = gql`
		query Vendor($id: String!) {
			Vendor(id: $id) {
				_slug
				title
				image
				country
				location
				municipality
				description
				links {
					website
					instagram
					twitter
					facebook
					youtube
				}
				_content {
					html
				}
			}
		}
	`

	const { Vendor: vendor } = await flatbread.request(query, { id: vendorId })
	return vendor as VendorDetail
}

export type CategoryDetail = {
	_slug: string
	title: string
	color?: string | null
	description?: string | null
	_content?: { html?: string | null } | null
}

export async function getCategoryBySlug(slug: string): Promise<CategoryDetail> {
	const findQuery = gql`
		query FindCategory($slug: String!) {
			allCategories(filter: { _slug: { eq: $slug } }) {
				id
				_slug
			}
		}
	`

	const { allCategories } = await flatbread.request(findQuery, { slug })
	if (!allCategories || allCategories.length === 0) {
		throw new Error(`Category with slug "${slug}" not found`)
	}

	const categoryId = allCategories[0].id
	const query = gql`
		query Category($id: String!) {
			Category(id: $id) {
				_slug
				title
				color
				description
				_content {
					html
				}
			}
		}
	`

	const { Category: category } = await flatbread.request(query, { id: categoryId })
	return category as CategoryDetail
}
