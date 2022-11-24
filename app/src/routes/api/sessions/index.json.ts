import type { SessionPreview } from '$lib/types/session';
import type { Page } from '@sveltejs/kit';
import { gql, GraphQLClient } from 'graphql-request';

export async function GET(page: Page) {
	const flatbread = new GraphQLClient(import.meta.env.VITE_FLATBREAD_URL, {
		headers: {}
	});

	const order = page.url.searchParams.get('order') ?? 'DESC';
	const sortBy = page.url.searchParams.get('sortBy') ?? 'date';
	const limit =
		page.url.searchParams.get('limit') !== null
			? Number.parseInt(page.url.searchParams.get('limit') as string)
			: undefined;
	const withImages = page.url.searchParams.get('withImages') !== null ? true : undefined;

	const query = gql`
		query AllSessions($order: Order, $sortBy: String, $limit: Int) {
			allSessions(order: $order, sortBy: $sortBy, limit: $limit) {
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
				${
					withImages
						? gql`
						images {
							alt
							image
						}`
						: ''
				}
			}
		}
	`;

	const {
		allSessions
	}: {
		allSessions: SessionPreview[];
	} = await flatbread.request(query, { order, sortBy, limit });

	return {
		body: {
			allSessions
		}
	};
}
