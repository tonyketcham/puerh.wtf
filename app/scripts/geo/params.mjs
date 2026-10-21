/**
 * Geo pipeline parameters (plan §4.2–§4.4, §4.7).
 *
 * Everything here is plain data: `geo:check` hashes it (together with the origin
 * frontmatter, content/geo/places.json and SCRIPT_VERSION) to decide whether the committed
 * maps are stale. Bump SCRIPT_VERSION whenever the pipeline code changes its output.
 */

export const SCRIPT_VERSION = "3.2.0"

/**
 * One north-up projection for every shared frame (locator → china-east/japan → yunnan →
 * six-mountains) and every detail patch, so all LOD layers register exactly and the camera can
 * tween a viewBox between them (plan §4.7.1). Web Mercator, so a terrain tile's pixel grid is a
 * plain affine of shared units.
 *
 * Units: scale 30000 ⇒ 523.6 units per degree of longitude. Units per km = scale ÷ (6371.0088 ×
 * cos φ): 1 unit ≈ 192 m at 25°N, 197 m at 22°N, 174 m at 35°N.
 * The runtime mirrors this in src/lib/components/map/projection.ts; geo:test checks they agree.
 */
export const SHARED_PROJECTION = {
	type: "mercator",
	rotate: [-102, 0],
	center: [0, 25],
	scale: 30000,
	translate: [0, 0],
}

/** lon/lat points written to maps-manifest.json with their d3 projection (runtime cross-check) */
export const CONTROL_POINTS = [
	[96, 18],
	[100.5, 21.5],
	[101.469, 21.981],
	[102, 25],
	[104, 30],
	[110, 22.5],
	[118.03, 27.759],
	[120.7, 23.475],
	[135.987, 34.864],
	[141.5, 40],
]

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
 * The camera's widest view (camera.ts): `lonDeg` of longitude across at `aspect` (w / h), in shared
 * units [lonDeg × units per degree, that ÷ aspect]. A view of any aspect must fit inside it, so a
 * wide map is as wide as this and a tall one (a phone held upright) as tall. The locator is grown by
 * half of it on every side of the origins (frames.mjs, `view`), so any origin can sit at the centre
 * of the widest view without the view running off the data. v2's widest view was the locator box
 * plus 12%: 42.8° across at 16:10, 49.7° on the wider hero.
 */
export const CAMERA = {
	maxView: { lonDeg: 48, aspect: 1.6 },
	/** the "East Asia" box the minimap and /origins zoom out to: the origins plus this (degrees) */
	overviewPad: 3,
}

/**
 * Shared frames. Bounds are derived from the origins (see frames.mjs), using:
 *  - select: which origins span the frame
 *  - pad:    degrees added on every side
 *  - view:   instead of `pad`, half the camera's widest view (CAMERA.maxView) on every side
 *  - circles: pad each origin by its radius_km instead of a point
 * `rivers` / `lakes`: the largest Natural Earth scalerank drawn in the frame.
 * `mask`: the frame's edge is an organic coverage mask built from its members (masks.mjs) instead
 *   of a feathered rectangle: each member adds a disk of min(radius_km, capKm) + padKm, shrunk to
 *   stay inside the frame. Frames without one (locator, china-east) cover their whole box.
 */
export const FRAMES = [
	{
		id: "locator",
		select: { exclude: ["country", "unknown"] },
		// the origins ± half the widest view (v2: 3° around them, 96.9–141.3°E, 18.6–39.3°N)
		view: true,
		// z5 like v2's 1400 px over 44°: the grid grows with the sheet (≈ 1,970 px across)
		maxGridPx: 2000,
		blurSigma: 1.2,
		intervals: [1000],
		indexEvery: 2,
		simplify: 0.1,
		// the same 19.4 shared units per display px as v2's 1200 px over 23,248 units, so the
		// simplification, speckle and label spacing are unchanged
		displayPx: 2340,
		// scalerank 3 adds the Ganges, the Indus and the Yellow River to the widest view
		rivers: 3,
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
		mask: { capKm: 40, padKm: 60, kmPerPx: 2 },
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
		mask: { capKm: 40, padKm: 75, kmPerPx: 2 },
	},
	{
		id: "six-mountains",
		select: {
			within: "xishuangbanna",
			precision: ["village", "township", "mountain-area", "forest"],
		},
		circles: true,
		// room around the members' areas for the organic edge (v2: 0.04; more needs more tiles)
		pad: 0.15,
		maxGridPx: 2600,
		blurSigma: 2.5,
		intervals: [100],
		indexEvery: 5,
		simplify: 0.06,
		displayPx: 1600,
		rivers: 10,
		lakes: 10,
		mask: { capKm: 20, padKm: 38, kmPerPx: 1 },
	},
]

/**
 * Coverage-tiled detail (plan §4.7.2, v3): the finest LOD layer. Every origin of a listed
 * precision contributes a disk of R = min(radius_km, capKm) + padKm; the detail cells are the
 * footprints of terrarium tiles at `zoom` that meet a disk (axis-aligned rects in the shared
 * Mercator), each contoured from `dataZoom` tiles. Only the `dataZoom` tiles that meet a disk are
 * fetched; the rest of a cell is left empty, which is outside every disk and so under a zero mask.
 *
 * Every cell uses the same interval, blur and simplification on a grid with `marginPx` around it,
 * so lines continue across cells; paths are clipped to the cell rect + `clipPadKm` and the runtime clips
 * each cell to its exact rect, so no clip edge is ever drawn and seams vanish.
 */
export const DETAIL = {
	precision: ["village", "township", "mountain-area", "forest", "county"],
	capKm: 40,
	padKm: 15,
	/** cell = one terrarium tile footprint at this zoom (≈ 36 km at 22°N) */
	zoom: 10,
	/**
	 * a cell over this many KB (gzip) is split into its four child tiles (the steepest ground: 50 m
	 * contours over 3 km of relief), down to cells of `maxZoom`
	 */
	splitAboveKb: 25,
	maxZoom: 11,
	/** contoured from tiles at this zoom (≈ 70 m per px at 22°N) */
	dataZoom: 11,
	/** grid margin around each cell (dataZoom px): pad + blur + simplification context */
	marginPx: 48,
	/** paths run this far past the cell rect (km); hard clip vertices stay out of sight */
	clipPadKm: 1.2,
	/** coordinates are written in hundredths of a shared unit (≈ 2 m) */
	decimals: 2,
	blurSigma: 2.75,
	interval: 50,
	indexEvery: 5,
	/**
	 * mapshaper weighted Visvalingam by a fixed threshold in grid px (not a percentage), so a line
	 * simplifies the same way in both cells it crosses
	 */
	simplify: "weighted interval=2",
	/** a cell is laid out as if drawn this many px wide (speckle, label spacing, reference lines) */
	displayPx: 512,
	rivers: 10,
	lakes: 10,
	/**
	 * the camera framing of an origin (the session panel, the hero): a square of
	 * max(minSideKm, radius_km × 2 × areaPad) around it, as v2's patches were
	 */
	frame: { minSideKm: 24, areaPad: 1.3 },
	/** organic edge mask per connected region of cells (masks.mjs) */
	mask: { kmPerPx: 1 },
}

/**
 * Contour thinning (lib/thin.mjs): each intermediate stretch carries the coarsest zoom it may be
 * stroked at. A sheet is drawn at most at `lodFade` × its size (a cell: one z`DETAIL.zoom` tile) across
 * a map `mapPx` CSS px wide (the peek, the panel), so a stretch that still shows at that many units
 * per px shows at every zoom of the sheet and is written as such.
 */
export const THIN = {
	mapPx: 200,
	lodFade: 1.45,
	/** a z`DETAIL.maxZoom` cell over budget thins in longer runs, up to this many doublings */
	maxCoarse: 4,
}

/**
 * The coverage field behind every organic mask (detail regions and the masked frames): per disk a
 * Gaussian of σ = sigmaFrac × R′ (R′ = R − insetKm) lowered to reach zero at R′, summed
 * (metaball-style, so close disks merge without creases), then smoothstep(lo, hi). A lone disk is
 * fully opaque out to ≈ 0.58 R′ and gone by ≈ 0.96 R′: a soft rim of ~40% of the radius.
 */
export const MASK = {
	sigmaFrac: 0.6,
	insetKm: 1,
	lo: 0.04,
	hi: 0.5,
}

/**
 * Reference layers (plan §4.7.3) folded into every frame and patch `context`.
 * Simplification tolerance is a fraction of one display pixel (in metres on the ground):
 * rivers and province lines keep `linePx`; land, coast and borders are simplified harder.
 */
export const CONTEXT = {
	linePx: 0.6,
	hardPx: 1.2,
}

/**
 * Elevation labels on index contours (plan §4.7.4), per frame and patch: a few anchors per
 * index band on long straight runs of the contour, spaced apart. Lengths are display px (the
 * frame's or patch's displayPx across its viewBox); `perBand` is per `areaPx`² of display, so
 * a big frame gets proportionally more.
 */
export const CONTOUR_LABELS = {
	perBand: 3,
	areaPx: 360,
	spacingPx: 80,
	insetPx: 16,
	minRunPx: 9,
}

/**
 * Label zoom tiers (plan §4.7.4). A label's `rank` is the lowest tier at which it may show; the
 * runtime shows ranks ≤ the current tier and resolves collisions by rank. The current tier is
 * the highest whose `maxUnitsPerPx` is ≥ the camera's shared units per CSS px
 * (null = unbounded). `viewKm` is the rough view width at 1200 px, for orientation only.
 *
 *   0 world     East Asia locator      countries, oceans and major seas
 *   1 region    china-east / japan     provinces, major cities, big rivers, seas
 *   2 province  yunnan                 prefecture cities, tea counties, rivers, lakes, neighbours' provinces
 *   3 cluster   six-mountains          tea towns, mountain areas, counties, more river anchors
 *   4 detail    one detail patch       villages, small towns, dense river anchors
 *   5 fine      a ~10 km view          everything left
 */
export const LABEL_TIERS = [
	{ rank: 0, name: "world", maxUnitsPerPx: null, viewKm: 8000 },
	{ rank: 1, name: "region", maxUnitsPerPx: 10, viewKm: 2300 },
	{ rank: 2, name: "province", maxUnitsPerPx: 2.5, viewKm: 580 },
	{ rank: 3, name: "cluster", maxUnitsPerPx: 0.66, viewKm: 150 },
	{ rank: 4, name: "detail", maxUnitsPerPx: 0.16, viewKm: 37 },
	{ rank: 5, name: "fine", maxUnitsPerPx: 0.04, viewKm: 9 },
]

/**
 * Label sources and the rank each one gets (labels.mjs). Labels outside `bbox` are dropped.
 * Hanzi: Natural Earth NAME_ZH for China, the native forms for Taiwan (NAME_ZHT, 臺 → 台, as the
 * origins write it) and Japan (NAME_JA kanji). Other countries' cities carry no hanzi, which
 * keeps the font subset small; countries, seas, rivers, lakes and curated places always do.
 */
export const LABELS = {
	// labels may sit anywhere on the locator frame (build.mjs passes its bbox)
	/**
	 * The tea's part of the map (v2's label area, [W, S, E, N]): Natural Earth labels outside it
	 * (cities, seas, lakes, rivers) carry hanzi only at rank ≤ `outerHanziMaxRank`, the ones the
	 * widest views show; the rest of India, Mongolia or the Philippines is labelled in Latin. Each
	 * hanzi costs ~145 B of font. Curated labels (places.json) keep theirs.
	 */
	core: [95.5, 17, 142.5, 40.5],
	outerHanziMaxRank: 1,
	/** rank from a Natural Earth scalerank: the first [maxScalerank, rank] pair that fits */
	cities: {
		hanzi: ["CHN", "TWN", "JPN", "HKG", "MAC"],
		/** everywhere in the label area */
		maxScalerank: 4,
		/** denser where the tea is; [W, S, E, N] */
		dense: [
			{ bbox: [97.5, 20.5, 106.2, 29.3], maxScalerank: 8 }, // Yunnan and its borderlands
			{ bbox: [134.6, 33.8, 139.2, 36], maxScalerank: 8 }, // Kansai to Shizuoka
			{ bbox: [115.8, 23, 122.2, 31.2], maxScalerank: 6 }, // Fujian, Zhejiang, Taiwan
		],
		ranks: [
			[1, 1],
			[3, 2],
			[5, 3],
			[7, 4],
			[99, 5],
		],
		/** admin-0 and admin-1 capitals show one tier earlier */
		capitalBoost: 1,
		/**
		 * Cities carry hanzi (and cost font glyphs) only at rank ≤ this, inside a dense area, or
		 * within `hanziNearKm` of an origin; the rest are labelled in Latin only.
		 */
		hanziMaxRank: 2,
		hanziNearKm: 80,
	},
	seas: {
		/** by Natural Earth min_label */
		ranks: [
			[2, 0],
			[4, 1],
			[6, 2],
			[99, 3],
		],
		exclude: ["river"],
	},
	lakes: {
		ranks: [
			[2, 1],
			[5, 2],
			[7, 3],
			[99, 4],
		],
	},
	rivers: {
		/** rivers named at all: Natural Earth scalerank everywhere, and in the dense areas (cities.dense) */
		maxScalerank: 6,
		denseMaxScalerank: 10,
		/** the lowest tier a river is named at, by scalerank */
		ranks: [
			[2, 1],
			[5, 2],
			[8, 3],
			[99, 4],
		],
		/** anchors along the line every `spacingPx` px at each tier, coarse tiers first */
		spacingPx: 600,
		/** the finest tier that gets river anchors */
		maxRank: 4,
		/** anchors at this tier and finer only inside the dense areas */
		denseFromRank: 4,
		/** the angle is the chord over this many px around the anchor (smooths meanders) */
		chordPx: 60,
		/** chain line pieces whose ends are closer than this (units) */
		joinUnits: 0.5,
	},
	origins: {
		/** by geo.precision; precisions not listed get no origin label */
		ranks: {
			county: 3,
			"mountain-area": 3,
			township: 3,
			forest: 4,
			village: 4,
		},
	},
}

/** "Unknown Pleasures" ridgelines over the six-mountains frame */
export const RIDGES = {
	frame: "six-mountains",
	/** the ridges span the members' areas plus this (degrees), v2's frame, not the padded one */
	pad: 0.04,
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

/** Natural Earth 10 m (public domain). Only clipped, projected output is committed. */
export const NATURAL_EARTH = {
	baseUrl: "https://naciscdn.org/naturalearth/10m",
	layers: {
		coast: "physical/ne_10m_coastline",
		rivers: "physical/ne_10m_rivers_lake_centerlines",
		lakes: "physical/ne_10m_lakes",
		admin: "cultural/ne_10m_admin_1_states_provinces_lines",
		land: "physical/ne_10m_land",
		borders: "cultural/ne_10m_admin_0_boundary_lines_land",
	},
	/** label sources (labels.mjs) */
	labelLayers: {
		places: "cultural/ne_10m_populated_places",
		marine: "physical/ne_10m_geography_marine_polys",
	},
	/** province lines (dashed) */
	adminCountries: ["China", "Taiwan", "Japan"],
	adminClass: "Admin-1 boundary",
	/** national borders: Natural Earth's default view, never the disputed or indefinite lines */
	borderClasses: ["International boundary (verify)"],
}

/** Hanzi subset for map labels (plan §4.1). Pinned to a google/fonts commit and verified by hash. */
export const FONT = {
	url: "https://raw.githubusercontent.com/google/fonts/a85815a42757630ce188fdad368c2dfc444d4773/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf",
	cacheName: "NotoSansSC-wght-a85815a4.ttf",
	sha256: "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da",
	weight: 400,
}

/** gzip budgets in KB (plan §4.4, §4.7.7) */
export const BUDGETS = {
	cell: 25,
	base: 150, // locator + yunnan
	frame: 150, // any other single shared frame
	cluster: 250,
	ridges: 60,
	labels: 40,
	// 15 KB in plan §4.4, then 16 KB for the native Taiwanese and Japanese forms. Map v2 adds every
	// label's hanzi (countries, provinces, cities, seas, rivers, lakes, tea towns): ~330 glyphs at
	// ~145 B each. The widened locator (2026-10-20) adds the countries, provinces, seas and the
	// coarsest cities and rivers from India to the Sea of Okhotsk (~42 glyphs net; the font now
	// holds only what labels and origins show, not every river name in the sheets)
	font: 55,
}

export const ATTRIBUTION = [
	"Terrain: AWS Terrain Tiles (Mapzen terrarium; SRTM, GMTED, ETOPO1, 3DEP)",
	"Reference layers and labels: Natural Earth 10m (public domain)",
	"Hanzi labels: Noto Sans SC (SIL Open Font License 1.1)",
]
