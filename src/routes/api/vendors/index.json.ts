import type { Page } from '@sveltejs/kit';
import { gql, GraphQLClient } from 'graphql-request';

export async function get(page: Page) {
	const flatbread = new GraphQLClient(import.meta.env.VITE_FLATBREAD_URL, {
		headers: {}
	});

	const order = page.url.searchParams.get('order') ?? 'ASC';
	const sortBy = page.url.searchParams.get('sortBy') ?? 'title';

	const query = gql`
		query AllVendors($sortBy: String, $order: Order) {
			allVendors(sortBy: $sortBy, order: $order) {
				slug
				id
				title
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

export type Vendor = {
	id: string;
	slug: string;
	title: string;
	date: string;
	production_year: number;
	excerpt: string;
};
