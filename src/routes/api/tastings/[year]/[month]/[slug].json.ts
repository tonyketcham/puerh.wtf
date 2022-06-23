import type { Page } from '@sveltejs/kit';
import { gql, GraphQLClient } from 'graphql-request';
import type { TastingFull } from '$lib/types/tasting';

export async function get({ params }: Page) {
	const { slug, month, year } = params;
	const flatbread = new GraphQLClient(import.meta.env.VITE_FLATBREAD_URL, {
		headers: {}
	});

	const monthStart = new Date(Number(year), Number(month) - 1, 1);
	// TODO: add date range `between[]` comparator to Flatbread
	// const monthEnd = new Date(Number(year), Number(month) - 1, 0);

	const query = gql`
		query TastingBySlug($slug: String!, $monthStart: Date!) {
			allTastings(filter: { slug: { eq: $slug }, date: { gte: $monthStart } }) {
				id
				slug
				title
				date
				production_year
				excerpt
				season
				elevation
				aging_conditions
				purchase_link
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
					cream {
						start
						finish
					}
					umami {
						start
						finish
					}
					stone {
						start
						finish
					}
					spices {
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
					wood {
						start
						finish
					}
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
				}
				content {
					html
				}
				images {
					image
					alt
				}
			}
		}
	`;

	const variables = {
		slug,
		monthStart
	};

	const {
		allTastings
	}: {
		allTastings: TastingFull[];
	} = await flatbread.request(query, variables);

	let error = null;

	if (allTastings.length === 0) {
		error = 'Tasting not found';
	} else if (allTastings.length > 1) {
		error = 'Multiple tastings found';
	}

	if (error) {
		return {
			status: 400,
			body: {
				error
			}
		};
	}

	return {
		status: 200,
		body: allTastings[0]
	};
}
