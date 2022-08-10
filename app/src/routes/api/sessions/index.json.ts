import type { SessionPreview } from '$lib/types/session';
import type { Page } from '@sveltejs/kit';
import { gql, GraphQLClient } from 'graphql-request';

export async function GET(page: Page) {
	const flatbread = new GraphQLClient(import.meta.env.VITE_FLATBREAD_URL, {
		headers: {}
	});

	const order = page.url.searchParams.get('order') ?? 'DESC';
	const sortBy = page.url.searchParams.get('sortBy') ?? 'date';

	const query = gql`
		query AllSessions($order: Order, $sortBy: String) {
			allSessions(order: $order, sortBy: $sortBy) {
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
			}
		}
	`;

	const {
		allSessions
	}: {
		allSessions: SessionPreview[];
	} = await flatbread.request(query, { order, sortBy });

	return {
		body: {
			allSessions
		}
	};
}
