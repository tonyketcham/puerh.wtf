import type { Page } from '@sveltejs/kit';
import { gql, GraphQLClient } from 'graphql-request';
import type { Tasting } from '../../index.json';

export async function get({ params }: Page) {
	const { slug, month, year } = params;
	const flatbread = new GraphQLClient(import.meta.env.VITE_FLATBREAD_URL, {
		headers: {}
	});

	//
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
		allTastings: Tasting[];
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
