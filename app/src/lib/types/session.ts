import type { Category } from '$lib/types/category';
import type { Content } from '$lib/types/content';

export type BaseSession = {
	id: string;
	_slug: string;
};

export type SessionPreview = BaseSession & {
	_collection: string;
	title: string;
	date: string;
	production_year: number | null;
	excerpt: string;
	style: {
		id: string;
		title: string;
		color: string;
		category: Category;
	}[];
};

export type SessionFull = BaseSession &
	SessionPreview & {
		season: string | null;
		elevation: number | null;
		aging_conditions: string | null;
		rating: number;
		purchase_link: string | null;
		vendor:
			| {
					_slug: string;
					title: string;
					image: string;
			  }[]
			| null;
		cultivar: {
			title: string;
		};
		picking: string | null;
		genre: string[] | null;
		notes: SessionNotes;
		flavor_axes: SessionFlavorAxes;

		images:
			| {
					image: string;
					alt: string;
			  }[]
			| null;

		_content: Content;
	};

export type SessionNotes = {
	dry_leaf_nose: string;
	wet_leaf_nose: string;
	finish: string;
	empty_cup: string;
	mouthfeel: string;
	taste: string;
	cha_qi: string;
};

export type SessionFlavorAxes = {
	vegetal: FlavorAxesTransition;
	floral: FlavorAxesTransition;
	fruits: FlavorAxesTransition;
	spices: FlavorAxesTransition;
	wood: FlavorAxesTransition;
	earth: FlavorAxesTransition;
	nuts_roast: FlavorAxesTransition;
	cream: FlavorAxesTransition;
	stone: FlavorAxesTransition;
	umami: FlavorAxesTransition;
};

/**
 * How a tea transforms in profile over the session of the tasting.
 */
type FlavorAxesTransition = {
	start: number;
	finish: number;
};
