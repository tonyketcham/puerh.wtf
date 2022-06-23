export type Category = {
	id: string;
	slug: string;
	title: string;
	color: string;
	description: string | null;
	content: {
		html: string;
	};
};
