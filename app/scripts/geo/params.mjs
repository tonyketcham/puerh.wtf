/**
 * Geo pipeline parameters (plan §4.2–§4.4).
 *
 * Everything here is plain data: `geo:check` hashes it (together with the origin
 * frontmatter and SCRIPT_VERSION) to decide whether the committed maps are stale.
 * Bump SCRIPT_VERSION whenever the pipeline code changes its output.
 */

export const SCRIPT_VERSION = "1.0.0"

/**
 * One projection for every shared frame (locator → china-east → yunnan → six-mountains),
 * so LOD layers register exactly and the camera can tween a viewBox between them.
 * Units: 1 unit ≈ 212 m (scale 30000 ⇒ ~524 units per degree of latitude).
 */
export const SHARED_PROJECTION = {
	type: "conicEqualArea",
	parallels: [20, 30],
	rotate: [-102, 0],
	center: [0, 25],
	scale: 30000,
	translate: [0, 0],
}

export const TERRAIN = {
	url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
	tileSize: 256,
	maxZoom: 12, // SRTM in Asia stops improving past ~z12
	concurrency: 6,
	retries: 5,
	timeoutMs: 30000,
	/** extra grid around a frame (fraction of its size) so contour closures fall outside the viewBox */
	margin: 0.04,
}

/**
 * Shared frames. Bounds are derived from the origins (see frames.mjs), using:
 *  - select: which origins span the frame
 *  - pad:    degrees added on every side
 *  - circles: pad each origin by its radius_km instead of a point
 */
export const FRAMES = [
	{
		id: "locator",
		select: { exclude: ["country", "unknown"] },
		pad: 3,
		maxGridPx: 1400,
		blurSigma: 1.2,
		intervals: [1000],
		indexEvery: 2,
		simplify: 0.1,
		displayPx: 1200,
		rivers: 2,
		lakes: 4,
	},
	{
		id: "china-east",
		select: { roots: ["china", "taiwan"], exclude: ["country", "province", "unknown"] },
		pad: 1.2,
		maxGridPx: 1400,
		blurSigma: 1.5,
		intervals: [500],
		indexEvery: 4,
		simplify: 0.1,
		displayPx: 1200,
		rivers: 6,
		lakes: 7,
	},
	{
		id: "japan",
		select: { roots: ["japan"], exclude: ["country"] },
		pad: 0.5,
		maxGridPx: 1000,
		blurSigma: 2,
		intervals: [200],
		indexEvery: 5,
		simplify: 0.08,
		displayPx: 1000,
		rivers: 9,
		lakes: 9,
	},
	{
		id: "yunnan",
		select: { within: "yunnan", exclude: ["province", "unknown"] },
		pad: 0.35,
		maxGridPx: 1600,
		blurSigma: 2.5,
		intervals: [200],
		indexEvery: 5,
		simplify: 0.05,
		displayPx: 1200,
		rivers: 9,
		lakes: 9,
	},
	{
		id: "six-mountains",
		select: {
			within: "xishuangbanna",
			precision: ["village", "township", "mountain-area", "forest"],
		},
		circles: true,
		pad: 0.04,
		maxGridPx: 2400,
		blurSigma: 2.5,
		intervals: [100],
		indexEvery: 5,
		simplify: 0.06,
		displayPx: 1600,
		rivers: 10,
		lakes: 10,
	},
]

/** Per-origin insets (Properties › Provenance) */
export const INSET = {
	precision: ["village", "township", "mountain-area", "forest", "county"],
	/** box side: max(minSideKm, radius_km × 2 × areaPad) */
	minSideKm: 24,
	areaPad: 1.3,
	/** viewBox is [-size/2, -size/2, size, size] in a north-up azimuthal projection; 1 unit = 1 px at displayPx */
	size: 360,
	/** ≈ display resolution: z11 for a 24 km box. SRTM is ~30–90 m here, so z12 only adds stair-steps */
	maxGridPx: 480,
	blurSigma: 2.75,
	/**
	 * plan: inset 50 m, index 250 m. Boxes wider than `fineSideKm` scale the floor up
	 * (50 m × side / fineSideKm), and steep boxes step up until ≤ maxBands, so a panel stays legible.
	 */
	intervals: [50, 100, 200, 500],
	fineSideKm: 48,
	maxBands: 30,
	indexEvery: 5,
	simplify: 0.045,
	displayPx: 360,
	rivers: 10,
	lakes: 10,
}

/** "Unknown Pleasures" ridgelines over the six-mountains frame */
export const RIDGES = {
	frame: "six-mountains",
	rows: 36,
	samples: 220,
	width: 1000,
	/** vertical gap between baselines */
	spacing: 14,
	/** the tallest peak rises this many row spacings above its baseline */
	amplitude: 5,
	/** fraction of the width over which relief fades to flat at each end */
	taper: 0.14,
	blurSigma: 4,
}

/** Context lines (Natural Earth 10 m; public domain). Only clipped, projected output is committed. */
export const NATURAL_EARTH = {
	baseUrl: "https://naciscdn.org/naturalearth/10m",
	layers: {
		coast: "physical/ne_10m_coastline",
		rivers: "physical/ne_10m_rivers_lake_centerlines",
		lakes: "physical/ne_10m_lakes",
		admin: "cultural/ne_10m_admin_1_states_provinces_lines",
	},
	/** provinces only (dashed); never national borders */
	adminCountries: ["China", "Taiwan", "Japan"],
	adminClass: "Admin-1 boundary",
}

/** Hanzi subset for map labels (plan §4.1). Pinned to a google/fonts commit and verified by hash. */
export const FONT = {
	url: "https://raw.githubusercontent.com/google/fonts/a85815a42757630ce188fdad368c2dfc444d4773/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf",
	cacheName: "NotoSansSC-wght-a85815a4.ttf",
	sha256: "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da",
	weight: 400,
}

/** gzip budgets in KB (plan §4.4) */
export const BUDGETS = {
	inset: 20,
	base: 150, // locator + yunnan
	frame: 150, // any other single shared frame
	cluster: 250,
	ridges: 60,
	font: 15,
}

export const ATTRIBUTION = [
	"Terrain: AWS Terrain Tiles (Mapzen terrarium; SRTM, GMTED, ETOPO1, 3DEP)",
	"Context lines: Natural Earth 10m (public domain)",
	"Hanzi labels: Noto Sans SC (SIL Open Font License 1.1)",
]
