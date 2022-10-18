import type { Vendor } from '$lib/types/vendor';
import type { Page } from '@sveltejs/kit';
import { gql, GraphQLClient } from 'graphql-request';

export async function GET(page: Page) {
	const flatbread = new GraphQLClient(import.meta.env.VITE_FLATBREAD_URL, {
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