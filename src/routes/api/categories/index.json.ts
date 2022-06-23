import type { Category } from '$lib/types/category';
import type { Page } from '@sveltejs/kit';
import { gql, GraphQLClient } from 'graphql-request';

export async function get(page: Page) {
	const flatbread = new GraphQLClient(import.meta.env.VITE_FLATBREAD_URL, {
		headers: {}
	});

	const order = page.url.searchParams.get('order') ?? 'ASC';
	const sortBy = page.url.searchParams.get('sortBy') ?? 'title';

	const query = gql`
		query AllCategories($sortBy: String, $order: Order) {
			allCategories(sortBy: $sortBy, order: $order) {
				slug
				id
				title
				color
				description
				content {
					html
				}
			}
		}
	`;

	const {
		allCategories
	}: {
		allCategories: Category[];
	} = await flatbread.request(query, { order, sortBy });

	return {
		body: {
			allCategories
		}
	};
}
