import type { Category } from '$lib/types/category';

export type TreeNode = {
	id: string;
	title: string;
	_slug?: string;
	_collection?: string;
	date?: string;
	children?: TreeNode[];
	style?: {
		category: Category;
	}[];
};
