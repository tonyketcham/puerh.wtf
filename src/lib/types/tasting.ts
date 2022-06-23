import type { Category } from '$lib/types/category';
import type { Content } from '$lib/types/content';

export type BaseTasting = {
	id: string;
	slug: string;
};

export type TastingPreview = BaseTasting & {
	title: string;
	date: string;
	production_year: number | null;
	excerpt: string;
	style: {
		category: Category;
	}[];
};

export type TastingFull = BaseTasting &
	TastingPreview & {
		season: string | null;
		elevation: number | null;
		aging_conditions: string | null;
		rating: number;
		purchase_link: string | null;
		notes: TastingNotes;

		images: {
			image: string;
			alt: string;
		}[];

		content: Content;
	};

export type TastingNotes = {
	dry_leaf_nose: string;
	wet_leaf_nose: string;
	finish: string;
	empty_cup: string;
	mouthfeel: string;
	taste: string;
	cha_qi: string;
};

export type TastingFlavorAxes = {
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
