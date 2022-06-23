import type { Category } from '$lib/types/category';

export type TreeNode = {
	id: string;
	title: string;
	children?: TreeNode[];
	style?: {
		category: Category;
	}[];
};
