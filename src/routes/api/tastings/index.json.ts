import type { TastingPreview } from '$lib/types/tasting';
import type { Page } from '@sveltejs/kit';
import { gql, GraphQLClient } from 'graphql-request';

export async function get(page: Page) {
	const flatbread = new GraphQLClient(import.meta.env.VITE_FLATBREAD_URL, {
		headers: {}
	});

	const order = page.url.searchParams.get('order') ?? 'DESC';
	const sortBy = page.url.searchParams.get('sortBy') ?? 'date';

	const query = gql`
		query AllTastings($order: Order, $sortBy: String) {
			allTastings(order: $order, sortBy: $sortBy) {
				id
				slug
				title
				date
				production_year
				excerpt
			}
		}
	`;

	const {
		allTastings
	}: {
		allTastings: TastingPreview[];
	} = await flatbread.request(query, { order, sortBy });

	return {
		body: {
			allTastings
		}
	};
}
