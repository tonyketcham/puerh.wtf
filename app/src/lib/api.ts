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
            color
          }
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

export async function getVendors(): Promise<Vendor[]> {
	const query = gql`
		query AllVendors {
			allVendors {
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
