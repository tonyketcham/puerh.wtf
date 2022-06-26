import { browser } from '$app/env';
import type { Vendor } from '$lib/types/vendor';
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
			query AllVendors($sortBy: String, $order: Order) {
				allVendors(sortBy: $sortBy, order: $order) {
					_slug
					_collection
					id
					title
					image
				}
			}
		`;

		const {
			allVendors
		}: {
			allVendors: Vendor[];
		} = await flatbread.request(query, { order, sortBy });

		return {
			body: {
				allVendors
			}
		};
	}
}
