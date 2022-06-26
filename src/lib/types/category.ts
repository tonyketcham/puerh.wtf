export type Category = {
	id: string;
	_slug: string;
	title: string;
	color: string;
	description: string | null;
	_content: {
		html: string;
	};
};
