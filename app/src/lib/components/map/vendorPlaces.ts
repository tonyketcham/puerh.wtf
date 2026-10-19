/**
 * Where each vendor ships from, for the "supply lines" layer (plan §3.3, §4.5): one point per
 * vendor at the city its content names (`location` / `municipality` / `country` in
 * content/vendors). City centroids, so a line ends "in Seattle", not at a warehouse.
 *
 * Vendors whose content names only a country, or nothing at all (The Sweetest Dew, Verdant),
 * are left out rather than guessed. Move these into vendor frontmatter as `geo` when the
 * vendor schema grows one.
 */
export type VendorPlace = {
	/** what the label says */
	place: string
	lon: number
	lat: number
	/** "city" when the content names one; "region" when it names a province or country */
	precision: "city" | "region"
}

export const VENDOR_PLACES: Readonly<Record<string, VendorPlace>> = {
	"crimson-lotus": { place: "Seattle", lon: -122.33, lat: 47.61, precision: "city" },
	"farmer-leaf": { place: "Pu'er", lon: 100.97, lat: 22.79, precision: "city" },
	"kong-mountain-tea": { place: "Boston", lon: -71.06, lat: 42.36, precision: "city" },
	"liquid-proust": { place: "Columbus", lon: -83.0, lat: 39.96, precision: "city" },
	"living-tea": { place: "Telluride", lon: -107.81, lat: 37.94, precision: "city" },
	"mei-leaf": { place: "London", lon: -0.13, lat: 51.51, precision: "city" },
	"tea-encounter": { place: "Staffordshire", lon: -2.12, lat: 52.81, precision: "region" },
	"teas-we-like": { place: "Taiwan", lon: 121.0, lat: 23.7, precision: "region" },
	white2tea: { place: "Yunnan", lon: 102.71, lat: 25.04, precision: "region" },
	wistaria: { place: "Taipei", lon: 121.54, lat: 25.03, precision: "city" },
	"yunnan-sourcing": { place: "Kunming", lon: 102.71, lat: 25.04, precision: "city" },
}
