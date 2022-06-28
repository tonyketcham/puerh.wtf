import type { Page } from '@sveltejs/kit';
import { gql, GraphQLClient } from 'graphql-request';
import type { SessionFull } from '$lib/types/session';

export async function get({ params }: Page) {
	const { slug, month, year } = params;
	const flatbread = new GraphQLClient(import.meta.env.VITE_FLATBREAD_URL, {
		headers: {}
	});

	const monthStart = new Date(Number(year), Number(month) - 1, 1);
	// TODO: add date range `between[]` comparator to Flatbread
	// const monthEnd = new Date(Number(year), Number(month) - 1, 0);

	const query = gql`
		query SessionBySlug($slug: String!, $monthStart: Date!) {
			allSessions(filter: { _slug: { eq: $slug }, date: { gte: $monthStart } }) {
				id
				_slug
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
				_content {
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
		allSessions
	}: {
		allSessions: SessionFull[];
	} = await flatbread.request(query, variables);

	let error = null;

	if (allSessions.length === 0) {
		error = 'Session not found';
	} else if (allSessions.length > 1) {
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
		body: allSessions[0]
	};
}
