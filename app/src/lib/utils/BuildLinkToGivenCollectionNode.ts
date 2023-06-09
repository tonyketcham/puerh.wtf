import type { TreeNode } from '$lib/types/tree';
import plur from 'plur';

function formatDate(date: Date) {
	return date.getFullYear().toString() + '/' + (date.getMonth() + 1).toString().padStart(2, '0');
}

/**
 * Generates the route to the page for a given node.
 */
export function buildLink(node: TreeNode): string {
	const collection = node?._collection ? plur(node._collection.toLowerCase()) : null;

	const date = node?.date ? formatDate(new Date(node.date)) : null;
	const slug = node?._slug ?? null;

	return '/' + [collection, date, slug].filter((token) => !!token).join('/');
}
