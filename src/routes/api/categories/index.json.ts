import { browser } from '$app/env';
import type { Category } from '$lib/types/category';
import type { Page } from '@sveltejs/kit';
import { gql, GraphQLClient } from 'graphql-request';

export async function get(page: Page) {
	if (!browser) {
		const flatbread = new GraphQLClient('http://localhost:5057/graphql', {
			headers: {}
		});

		const order = page.url.searchParams.get('order') ?? 'ASC';
		const sortBy = page.url.searchParams.get('sortBy') ?? 'title';

		const query = gql`
			query AllCategories($sortBy: String, $order: Order) {
				allCategories(sortBy: $sortBy, order: $order) {
					_slug
					_collection
					id
					title
					color
					description
					_content {
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
}
