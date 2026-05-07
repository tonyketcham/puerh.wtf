import { gql, GraphQLClient } from "graphql-request"
import type { SessionFull, SessionPreview, SessionPreviewWithFeatureImage } from "./types/session"
import type { Vendor } from "./types/vendor"
import type { Category } from "./types/category"

const flatbread = new GraphQLClient(process.env.FLATBREAD_URL || "http://localhost:5057/graphql", {
	headers: {},
})

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
}): Promise<SessionPreview[]> {
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
				}
				origin {
					_slug
					id
					country
					location
					municipality
				}
			}
		}
	`

	const { allSessions }: { allSessions: SessionPreview[] } = await flatbread.request(query, {
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
				season
				elevation
				aging_conditions
				rating
				purchase_link
				picking
				genre
				style {
					id
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
					dry_leaf_nose
					wet_leaf_nose
					finish
					empty_cup
					mouthfeel
					taste
					cha_qi
				}
				flavor_axes {
					vegetal {
						start
						finish
					}
					floral {
						start
						finish
					}
					fruits {
						start
						finish
					}
					spices {
						start
						finish
					}
					wood {
						start
						finish
					}
					earth {
						start
						finish
					}
					nuts_roast {
						start
						finish
					}
					cream {
						start
						finish
					}
					stone {
						start
						finish
					}
					umami {
						start
						finish
					}
				}
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
