/**
 * The drawn pieces of teaware, reconstructed from the log's own session photos.
 *
 * Evidence record
 * | piece              | evidence                                                    | how it's used                         |
 * | ------------------ | ----------------------------------------------------------- | ------------------------------------- |
 * | Cat Gaiwan         | top view (3c1f3c14…), side view on the 1988 Wuyi desk shot  | flare, rim lip, inset lid and ring    |
 * |                    | (1988-wuyi_4), volume_ml 100; the owner's side photo of     | knob; scaled to hold 100 ml. The      |
 * |                    | its painting (see PHOTO)                                    | painting is traced in the photo's px  |
 * | Hongni Shuiping    | top view (5ddb9bd2…), volume_ml 90                          | round body, wide mouth, straight      |
 * |                    |                                                             | tapered spout, ear handle; side       |
 * |                    |                                                             | profile estimated; scaled to 90 ml    |
 * | Thousand Lines     | side views (1988-wuyi_3, _4, _5), volume_ml 110             | squat ridged body, ridge count, short |
 * |                    |                                                             | spout, ear handle, ridged domed lid;  |
 * |                    |                                                             | scaled to 110 ml                      |
 * | cups               | 2011 Xiaguan / 2020 Moon Bear session photos, 1988-wuyi_4   | proportions only; no volume logged    |
 * | CNNP 7542 cake     | three wrapper photos supplied with the request (a 2006      | the 八中 print (eight 中 threaded on a |
 * |                    | CNNP cake beside its unwrapped face, two wrapped cakes)     | double band, 茶 inside, a border ring) |
 * |                    |                                                             | and the neifei's place; the bing's    |
 * |                    |                                                             | size is the usual 357 g pressing      |
 *
 * Everything is an illustrative reconstruction: proportions are read off photographs and the
 * size comes from the logged volume, so the dimensions are estimates (≈), never measurements.
 * Wall thicknesses, lid flanges and the inside of the pots are plausible construction, unseen.
 */
import {
	arc,
	bezier,
	cavityVolume,
	extents,
	lathe,
	line,
	ridge,
	sampleProfile,
	sheet,
	sideRadius,
	topHeight,
	wrap,
	drape,
	tube,
	type Callout,
	type Decal,
	type Part,
	type ProfilePoint,
	type ProfileSample,
	type Vec3,
	type VesselModel,
} from "./geometry"
import { DEFAULT_PITCH as P, DEFAULT_YAW as Y } from "./render"
import type { Shot } from "./sequence"

export type DrawingId = "cat-gaiwan" | "hongni-shuiping" | "thousand-lines" | "cups" | "cnnp-7542"

export interface DrawingSpec {
	id: DrawingId
	/** the vessel's page, when it has one */
	slug: string | null
	/** short name for the tab */
	short: string
	/** stroke for the silhouette: the body's colour, lifted for the dark ground */
	accent: string
	/** what a click does, for the hint line */
	action: string | null
	/** pitch it's first shown at, when not the default */
	pitch?: number
	/** caption for a piece with no vessel page */
	info?: { title: string; hanzi: string | null; facts: string[] }
	/** a line about the piece itself, for one the log has no sessions for */
	note?: string
	/** its turntable: the views it moves through, the first one drawn on */
	shots: Shot[]
	build: () => VesselModel
}

/* --------------------------------------------------------------- helpers */

/** Scales raw parts (and their callouts) so the cavity holds `ml`, returning the model. */
function finish(
	parts: Part[],
	{
		cavity,
		brim,
		ml,
		lift = {},
		callouts = [],
		decals = [],
		pitch,
		bodyParts,
	}: {
		cavity?: ProfileSample[]
		brim?: number
		ml?: number | null
		lift?: Record<string, number>
		callouts?: Callout[]
		decals?: Decal[]
		pitch?: number
		/** parts measured for Ø (spouts and handles aren't) */
		bodyParts: string[]
	}
): VesselModel {
	const raw = cavity && brim != null ? cavityVolume(cavity, brim) / 1000 : null
	const k = raw && ml ? Math.cbrt(ml / raw) : 1
	for (const p of parts) {
		for (let i = 0; i < p.pos.length; i++) p.pos[i] *= k
		if (p.axis) p.axis = [p.axis[0] * k, p.axis[1] * k]
	}
	const all = extents(parts)
	const body = extents(parts.filter((p) => bodyParts.includes(p.id)))
	return {
		parts,
		lift: Object.fromEntries(Object.entries(lift).map(([id, dz]) => [id, dz * k])),
		callouts: callouts.map((c) => ({ ...c, at: c.at.map((v) => v * k) as Vec3 })),
		decals: decals.map((d) => ({ ...d, pts: d.pts.map((p) => p.map((v) => v * k) as Vec3) })),
		pitch,
		radius: all.radius,
		height: all.zMax - all.zMin,
		dims: { diameter: body.radius * 2, height: all.zMax - all.zMin },
		capacity: raw && ml ? raw * k ** 3 : null,
	}
}

const profile = (pts: ProfilePoint[], wireEvery?: number) => sampleProfile(pts, 1.1, wireEvery)

/** Joins sampled runs; consecutive runs share their seam point, kept as a crease. */
const join = (...runs: ProfileSample[][]) => runs.flat()

/** A point on a lathe surface at azimuth `deg` (0° = +x, toward the spout). */
const onRing = (r: number, z: number, deg: number): Vec3 => {
	const a = (deg * Math.PI) / 180
	return [r * Math.cos(a), r * Math.sin(a), z]
}

/* ------------------------------------------------------------ cat gaiwan */

/*
 * The owner's side photo of the cat gaiwan (1500 × 2000 px) is the reference for its painting,
 * traced in the photo's pixels. Each stroke is unrolled off the photographed wall (undoing the
 * curve's foreshortening about the bowl's axis) and laid onto the model's wall, scaled down so
 * the scene sits within the bowl's belly.
 */
const PHOTO = {
	/** the photographed wall's radius at the painting, px */
	wallR: 480,
	/** the bowl's axis in the photo: x at the rim (y 695) and at the foot (y 1750) */
	axis: { rimY: 695, rimX: 757, footY: 1750, footX: 820 },
	/** the painting's middle, px, and where it lands on the model's wall (z, raw units) */
	centreY: 1074,
	centreZ: 31,
	/** px per raw unit: the painting spans ~27 units of the wall's height */
	k: 26,
}

function catGaiwan(): VesselModel {
	const bowl = profile([
		[0, 1.6],
		[17, 1.6, "s"],
		[18, 0, "s"],
		[22.2, 0, "s"],
		[22.6, 5, "s"],
		[25.5, 7.2],
		[33.5, 16],
		[41, 29.5],
		[45.6, 43.5],
		[47.8, 50, "s"],
		[46.6, 51.4],
		[45.2, 50.6, "si"],
		[43.4, 44, "i"],
		[39, 30, "i"],
		[31, 16.6, "i"],
		[22, 9.6, "i"],
		[12, 8.6, "i"],
		[0, 8.5, "i"],
	])
	const lid = profile([
		[0, 53.2],
		[14, 51.8],
		[28, 48.4],
		[38, 45.6],
		[41.8, 44.6, "s"],
		[44, 45.6, "s"],
		[42.4, 46.8, "s"],
		[36, 48],
		[26, 51],
		[16, 54],
		[11.6, 55, "s"],
		[11.8, 61.4, "s"],
		[9.2, 61.4, "s"],
		[9.2, 57, "s"],
		[0, 57],
	])
	const parts = [lathe("bowl", bowl), lathe("lid", lid)]

	// the painting, unrolled off the photo and laid on the wall, centred on the default view's front
	const side = sideRadius(bowl, 5, 50)
	const { axis, wallR, centreY, centreZ, k } = PHOTO
	const toWall = ([x, y]: [number, number]): [number, number] => {
		const ax = axis.rimX + ((y - axis.rimY) * (axis.footX - axis.rimX)) / (axis.footY - axis.rimY)
		const d = Math.max(-0.999, Math.min(0.999, (x - ax) / wallR))
		return [(wallR * Math.asin(d)) / k, centreZ + (centreY - y) / k]
	}
	const at = (-66 * Math.PI) / 180
	const decals = PAINTING.flatMap(({ color, strokes }) =>
		wrap(
			strokes.map((s) => s.map(toWall)),
			side,
			{ at, lift: 0.25 }
		).map((pts) => ({ part: "bowl", color, pts }))
	)
	const pin = (x: number, y: number) => wrap([[toWall([x, y]), toWall([x, y])]], side, { at })[0][0]

	return finish(parts, {
		cavity: bowl,
		brim: 50.6,
		ml: 100,
		lift: { lid: 30 },
		bodyParts: ["bowl"],
		decals,
		callouts: [
			{ label: "盖 lid", at: onRing(27, 51, -60), part: "lid", side: "left" },
			{ label: "ring knob", at: onRing(11.8, 60, 30), part: "lid", side: "right" },
			{ label: "mischievous cat", at: pin(928, 812), part: "bowl", side: "right" },
			{ label: "unsuspecting victim", at: pin(640, 1290), part: "bowl", side: "left" },
			{ label: "foot ring", at: onRing(22.4, 2.5, -40), part: "bowl", side: "left" },
		],
	})
}

/** the painting's inks, lifted for the dark ground */
const INK = {
	iron: "#c99366",
	leaf: "#8fc4a0",
	nose: "#e9a08c",
}

type Px = [number, number]

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 22): Px[] =>
	Array.from({ length: n + 1 }, (_, k) => {
		const a = (k / n) * Math.PI * 2
		return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
	})

/** A thin pointed leaf from its base to its tip, `w` px wide at the middle. */
const blade = ([bx, by]: Px, [tx, ty]: Px, w: number): Px[] => {
	const len = Math.hypot(tx - bx, ty - by)
	const [ux, uy] = [(tx - bx) / len, (ty - by) / len]
	const [nx, ny] = [-uy, ux]
	const n = 8
	const half = (sign: number) =>
		Array.from({ length: n + 1 }, (_, k) => {
			const t = k / n
			const off = sign * (w / 2) * Math.sin(Math.PI * t) ** 0.8
			return [bx + ux * len * t + nx * off, by + uy * len * t + ny * off] as Px
		})
	return [...half(1), ...half(-1).reverse()]
}

/**
 * The cat gaiwan's painting, traced in px from the owner's photo: a tabby has hauled its chin up
 * onto a table and stares down past the edge at a potted succulent in a footed planter.
 */
const PAINTING: { color: string; strokes: Px[][] }[] = [
	{
		color: INK.iron,
		strokes: [
			// the table: its far edge, and its left side running down toward the eye
			[
				[400, 1150],
				[483, 985],
				[1222, 990],
			],
			// head, from the table up over both ears and back down
			[
				[748, 978],
				[738, 930],
				[728, 860],
				[716, 790],
				[708, 742],
				[742, 760],
				[770, 782],
				[820, 768],
				[870, 762],
				[920, 766],
				[958, 772],
				[985, 745],
				[1009, 724],
				[1013, 770],
				[1018, 818],
				[1030, 880],
				[1040, 940],
				[1040, 985],
			],
			// eyes, and pupils turned down toward the plant
			ellipse(800, 852, 32, 27),
			ellipse(928, 846, 32, 27),
			ellipse(792, 858, 14, 15, 14),
			ellipse(920, 852, 14, 15, 14),
			// mouth and chin
			[
				[858, 898],
				[858, 912],
			],
			[
				[832, 916],
				[845, 923],
				[858, 912],
				[871, 923],
				[884, 916],
			],
			[
				[838, 952],
				[858, 960],
				[878, 952],
			],
			// whiskers
			[
				[768, 892],
				[712, 878],
			],
			[
				[766, 905],
				[706, 906],
			],
			[
				[768, 916],
				[714, 936],
			],
			[
				[950, 890],
				[1034, 866],
			],
			[
				[952, 903],
				[1046, 904],
			],
			[
				[950, 914],
				[1040, 940],
			],
			// tabby marks on the brow and over the ears
			[
				[834, 786],
				[839, 824],
			],
			[
				[866, 780],
				[866, 818],
			],
			[
				[898, 786],
				[893, 824],
			],
			[
				[760, 812],
				[778, 832],
			],
			[
				[986, 806],
				[968, 828],
			],
			// the planter: rim band, tapering body on two little feet, its brush marks
			[
				[548, 1150],
				[772, 1150],
				[772, 1182],
				[552, 1185],
				[548, 1150],
			],
			[
				[555, 1185],
				[590, 1410],
				[785, 1395],
				[770, 1182],
			],
			[
				[592, 1410],
				[594, 1424],
				[610, 1422],
				[608, 1408],
			],
			[
				[764, 1397],
				[766, 1410],
				[783, 1408],
				[781, 1395],
			],
			...[
				[590, 1220],
				[612, 1300],
				[640, 1210],
				[662, 1330],
				[690, 1225],
				[712, 1300],
				[742, 1215],
				[752, 1320],
				[620, 1360],
				[700, 1365],
				[600, 1250],
				[730, 1265],
			].map(([x, y]) => [
				[x, y],
				[x + 2, y + 30],
			] as Px[]),
		],
	},
	{
		color: INK.leaf,
		strokes: [
			// a mound of moss over the soil
			[
				[560, 1150],
				[574, 1128],
				[610, 1116],
				[665, 1110],
				[722, 1118],
				[756, 1132],
				[766, 1150],
			],
			// and the succulent's spikes fanning out of it
			blade([622, 1122], [542, 1133], 12),
			blade([630, 1118], [568, 1090], 12),
			blade([640, 1116], [600, 1076], 12),
			blade([650, 1114], [628, 1064], 12),
			blade([660, 1114], [660, 1068], 12),
			blade([670, 1114], [690, 1064], 12),
			blade([680, 1115], [714, 1072], 12),
			blade([692, 1117], [742, 1080], 12),
			blade([702, 1120], [758, 1106], 12),
		],
	},
	{
		color: INK.nose,
		strokes: [
			[
				[838, 876],
				[878, 876],
				[870, 890],
				[858, 898],
				[846, 890],
				[838, 876],
			],
		],
	},
]

/* ------------------------------------------------------- hongni shuiping */

function hongniShuiping(): VesselModel {
	const body = profile([
		[0, 1.2],
		[19, 1.2, "s"],
		[19.6, 0, "s"],
		[22, 0, "s"],
		[23, 1.6, "s"],
		[26.5, 5],
		[31.2, 12],
		[33.2, 20],
		[32.4, 27.5],
		[28.4, 34.2],
		[23.4, 38.4],
		[21.6, 39.6, "s"],
		[21.4, 41.6, "s"],
		[18.9, 41.6, "s"],
		[18.9, 39.6, "s"],
		[17, 39.6, "si"],
		[17, 36.4, "i"],
		[24.6, 31.4, "i"],
		[29.6, 22, "i"],
		[29, 13, "i"],
		[24, 6.6, "i"],
		[15, 4.5, "i"],
		[0, 4.3, "i"],
	])
	const lid = profile([
		[0, 37.6],
		[16.1, 37.6, "s"],
		[16.1, 39.8, "s"],
		[18.6, 39.8, "s"],
		[18.6, 41.5, "s"],
		[16, 42.2],
		[10, 43.5],
		[5.4, 44, "s"],
		[5.7, 45.6],
		[5.2, 47.6],
		[3.4, 49],
		[0, 49.5],
	])
	// straight tapered spout, its tip on the level of the rim (水平: spout, mouth, handle level)
	const spoutFrom: Vec3 = [23, 0, 14]
	const spoutTip: Vec3 = [51, 0, 41.2]
	const spout = tube("spout", line(spoutFrom, spoutTip), (t) => 7.6 - 4.8 * t ** 0.8, {
		featureAt: [1],
		wireRings: 4,
		wireFrom: 0.3,
	})
	const handle = tube(
		"handle",
		bezier([-26, 0, 35.5], [-48, 0, 42.5], [-55, 0, 15], [-27, 0, 9.5]),
		(t) => 4.4 - 0.9 * t,
		{ nu: 56, wireRings: 0, longitudinals: 6 }
	)
	return finish([lathe("body", body), lathe("lid", lid), spout, handle], {
		cavity: body,
		brim: 39.6,
		ml: 90,
		lift: { lid: 22 },
		bodyParts: ["body"],
		callouts: [
			{ label: "straight spout", at: [44, -3.6, 34.8], part: "spout", side: "right" },
			{ label: "pearl knob", at: [0, 0, 49.5], part: "lid", side: "right" },
			{ label: "ear handle", at: [-49.5, -3.9, 26], part: "handle", side: "left" },
			{ label: "flush lid", at: onRing(17.2, 42.2, -70), part: "lid", side: "left" },
		],
	})
}

/* -------------------------------------------- thousand lines chaozhou xishi */

function thousandLines(): VesselModel {
	const base = profile([
		[0, 1],
		[20.4, 1, "s"],
		[21.2, 0, "s"],
		[24.2, 0, "s"],
		[25, 1.6],
	])
	// the body's envelope, then eleven ridges pressed into it: the thousand lines
	const envelope = sampleProfile(
		[
			[25, 1.6],
			[30.5, 4.4],
			[36.4, 10],
			[39.2, 17],
			[38.4, 23.4],
			[34.4, 29.6],
			[28.4, 34.4],
			[22.6, 37],
		],
		0.4,
		1e9
	)
	const ridged = ridge(envelope, 11, 0.8, 8)
	const top = profile([
		[22.6, 37],
		[22.2, 39.2, "s"],
		[19.8, 39.2, "s"],
		[19.8, 37.6, "s"],
		[18.2, 37.6, "si"],
		[18.2, 35, "i"],
		[27, 30.4, "i"],
		[34.6, 21.6, "i"],
		[35.4, 15, "i"],
		[31.8, 7.6, "i"],
		[24, 3.8, "i"],
		[12, 3, "i"],
		[0, 3, "i"],
	])
	const body = join(base, ridged, top)

	const lidEnvelope = sampleProfile(
		[
			[19.5, 39.2],
			[16.8, 41.6],
			[12.4, 44.4],
			[7.2, 46],
		],
		0.3,
		1e9
	)
	const lid = join(
		profile([
			[0, 36],
			[17.6, 36, "s"],
			[17.6, 37.8, "s"],
			[19.5, 37.8, "s"],
			[19.5, 39.2],
		]),
		ridge(lidEnvelope, 4, 0.45, 6),
		profile([
			[7.2, 46],
			[6.4, 46.6, "s"],
			[6.6, 49.4],
			[5.4, 51.4],
			[0, 52],
		])
	)
	const spout = tube("spout", line([29, 0, 13], [51.5, 0, 30.5]), (t) => 7.2 - 3.9 * t ** 0.7, {
		featureAt: [1],
		wireRings: 3,
		wireFrom: 0.4,
	})
	const handle = tube(
		"handle",
		bezier([-30, 0, 31.5], [-58, 0, 41], [-62, 0, 6], [-33, 0, 10.5]),
		(t) => 3.9 - 0.5 * t,
		{ nu: 60, wireRings: 0, longitudinals: 6 }
	)
	return finish([lathe("body", body), lathe("lid", lid), spout, handle], {
		cavity: body,
		brim: 30.5,
		ml: 110,
		lift: { lid: 20 },
		bodyParts: ["body"],
		callouts: [
			{ label: "ridged body", at: onRing(39.5, 19, 60), part: "body", side: "right" },
			{ label: "short spout", at: [45, -3.8, 25.4], part: "spout", side: "right" },
			{ label: "ridged lid", at: onRing(15, 43, -120), part: "lid", side: "left" },
			{ label: "ear handle", at: [-55, -3.6, 24], part: "handle", side: "left" },
		],
	})
}

/* ------------------------------------------------------------------- cups */

function cups(): VesselModel {
	// a wide, shallow crackle cup with an iron-dipped rim
	const wide = profile([
		[0, 1.2],
		[12.6, 1.2, "s"],
		[13.2, 0, "s"],
		[16, 0, "s"],
		[16.4, 4.4, "s"],
		[19.4, 6],
		[27, 12],
		[33, 19.6],
		[35.6, 26.4],
		[35.3, 29.4, "s"],
		[34.4, 30.2],
		[33.4, 29.4, "si"],
		[33.4, 26, "i"],
		[30.6, 19.6, "i"],
		[25, 13, "i"],
		[16, 8.2, "i"],
		[0, 7.4, "i"],
	])
	// a deeper, rounded speckled cup, its lip turned in
	const deep = profile([
		[0, 1],
		[11, 1, "s"],
		[11.6, 0, "s"],
		[14.4, 0, "s"],
		[14.9, 3.6, "s"],
		[19, 6],
		[25.6, 11.6],
		[30.2, 20],
		[31, 28.4],
		[29.8, 35.6, "s"],
		[29, 36.3],
		[28.1, 35.6, "si"],
		[28.8, 28.4, "i"],
		[28, 20.4, "i"],
		[24, 12.8, "i"],
		[15, 7, "i"],
		[0, 6.4, "i"],
	])
	const parts = [
		lathe("wide", wide, { offset: [-37, -8, 0] }),
		lathe("deep", deep, { offset: [36, 9, 0] }),
	]
	return finish(parts, {
		bodyParts: ["wide", "deep"],
		callouts: [
			{ label: "iron rim", at: [-37 - 35.4, -8, 29], part: "wide", side: "left" },
			{ label: "foot ring", at: [-37 + 11, -8 + 11, 2.2], part: "wide", side: "left" },
			{ label: "inturned lip", at: [36 + 30, 9, 33], part: "deep", side: "right" },
			{ label: "round belly", at: [36 + 13, 9 - 27.6, 20], part: "deep", side: "right" },
		],
	})
}

/* -------------------------------------------------------- cnnp 7542 cake */

const PRINT_RED = "#e5573f"
const PRINT_GREEN = "#66b483"

/** 茶 as the 八中 logo draws it: two crosses for the grass, a roof, then 木 under it. y up, mm. */
const CHA: [number, number][][] = [
	[[-11.5, 11], [-2.5, 11]],
	[[-7, 15.5], [-7, 6.5]],
	[[2.5, 11], [11.5, 11]],
	[[7, 15.5], [7, 6.5]],
	[[-14, -1], [0, 6.5], [14, -1]],
	[[-9, -5], [9, -5]],
	[[0, 0.5], [0, -17]],
	[[-3, -9], [-9.5, -14.5]],
	[[3, -9], [9.5, -14.5]],
]

const scaled = (strokes: [number, number][][], k: number) =>
	strokes.map((st) => st.map(([x, y]) => [x * k, y * k] as [number, number]))

/**
 * The 八中 mark: a double band threaded by eight 中, each a box straddling the band with its
 * stroke running radially through it. Band lines stop at the boxes, as printed.
 */
function baZhong(scale = 1, boxes = true): [number, number][][] {
	const band = [29.5 * scale, 35 * scale]
	const box = { r0: 26.5 * scale, r1: 38 * scale, half: 6.5 * scale }
	const stroke = [22.5 * scale, 42 * scale]
	const out: [number, number][][] = []
	for (let k = 0; k < 8; k++) {
		const a = Math.PI / 2 + (k * Math.PI) / 4
		const er = [Math.cos(a), Math.sin(a)]
		const et = [-Math.sin(a), Math.cos(a)]
		const p = (r: number, t: number): [number, number] => [er[0] * r + et[0] * t, er[1] * r + et[1] * t]
		if (boxes)
			out.push([p(box.r0, -box.half), p(box.r1, -box.half), p(box.r1, box.half), p(box.r0, box.half), p(box.r0, -box.half)])
		out.push([p(stroke[0], 0), p(stroke[1], 0)])
		for (const r of band) {
			const gap = boxes ? Math.asin(box.half / r) : 0
			out.push(arc(r, a + gap, a + Math.PI / 4 - gap))
		}
	}
	return out
}

function cnnp7542(): VesselModel {
	// a 357 g bing: domed face, rounded rim, a flat back with the nest (窝) pressed into it
	const cakeProfile = profile(
		[
			[0, 9],
			[8, 8.4],
			[16, 5.2],
			[21.5, 1.6],
			[26, 0.2],
			[60, 0],
			[85, 0.4],
			[95.5, 2.4],
			[99.4, 6.6],
			[100, 11],
			[98.8, 15.4],
			[95, 18.4],
			[80, 21.6],
			[50, 25.6],
			[20, 28],
			[0, 28.6],
		],
		12
	)
	// the cotton wrapper pillows a little proud of the cake and tucks under its back
	const wrapProfile = profile(
		[
			[56, -0.8],
			[88, -0.6],
			[97.4, 1.6],
			[101.8, 6.6],
			[102.6, 11],
			[101.2, 16.4],
			[96.6, 20.4],
			[80, 24],
			[50, 28.1],
			[20, 30.5],
			[0, 31.1],
		],
		14
	)
	const cakeTop = topHeight(cakeProfile, 14)
	const wrapTop = topHeight(wrapProfile, 16)

	// the neifei: a paper ticket pressed into the face toward the rim
	const nf = { r: 66, angle: (-112 * Math.PI) / 180, w: 44, h: 34 }
	const nfAt = [nf.r * Math.cos(nf.angle), nf.r * Math.sin(nf.angle)] as [number, number]
	const nfTurn = nf.angle + Math.PI / 2
	const neifei = sheet("neifei", (u, v) => {
		const lx = (u - 0.5) * nf.w
		const ly = (v - 0.5) * nf.h
		const x = nfAt[0] + lx * Math.cos(nfTurn) - ly * Math.sin(nfTurn)
		const y = nfAt[1] + lx * Math.sin(nfTurn) + ly * Math.cos(nfTurn)
		return [x, y, cakeTop(Math.hypot(x, y)) + 0.35]
	})
	const onNeifei = (strokes: [number, number][][]) =>
		drape(strokes, cakeTop, { at: nfAt, turn: nfTurn - Math.PI / 2, lift: 0.6 })

	const decals: Decal[] = [
		// the wrapper: border ring, the 八中 mark, 茶 in green at its heart (top of the print at +y)
		...drape([arc(88), arc(91)], wrapTop).map((pts) => ({ part: "wrapper", color: PRINT_RED, pts })),
		...drape(baZhong(), wrapTop).map((pts) => ({ part: "wrapper", color: PRINT_RED, pts })),
		...drape(scaled(CHA, 1.3), wrapTop).map((pts) => ({ part: "wrapper", color: PRINT_GREEN, pts })),
		// the neifei carries the same mark, too small for its boxes: band and strokes only
		...onNeifei(baZhong(0.32, false)).map((pts) => ({ part: "cake", color: PRINT_RED, pts })),
	]

	const ring = (r: number, deg: number, top: (r: number) => number): Vec3 => {
		const a = (deg * Math.PI) / 180
		return [r * Math.cos(a), r * Math.sin(a), top(r) + 0.3]
	}
	// lattice stops short of the print, leaving the 八中 mark a clear field
	const parts = [
		lathe("cake", cakeProfile, { meridians: 32, clearR: 44 }),
		lathe("wrapper", wrapProfile, { meridians: 32, clearR: 44 }),
		neifei,
	]
	return finish(parts, {
		lift: { wrapper: 62 },
		pitch: 0.72,
		decals,
		bodyParts: ["cake"],
		callouts: [
			{ label: "八中 print", at: ring(38, -78, wrapTop), part: "wrapper", side: "right" },
			{ label: "cotton wrapper", at: onRing(102.4, 12, -20), part: "wrapper", side: "right" },
			{ label: "内飞 neifei", at: [nfAt[0], nfAt[1], cakeTop(nf.r) + 0.4], part: "cake", side: "left" },
			{ label: "domed face", at: ring(84, -160, cakeTop), part: "cake", side: "left" },
		],
	})
}

/* --------------------------------------------------------------- turntables */

/**
 * A lidded pot's run: three-quarter, then a side elevation (spout, mouth and handle in profile),
 * the lid lifts, the camera rises to look in, tips over into plan, and the lid seats again.
 */
const LIDDED: Shot[] = [
	{ yaw: Y, pitch: P, explode: 0, hold: 1500 },
	{ yaw: 0, pitch: 0.05, explode: 0, hold: 1300, move: 850 },
	{ yaw: 0, pitch: 0.05, explode: 1, hold: 1000, move: 650 },
	{ yaw: 0.9, pitch: 0.68, explode: 1, hold: 1400, move: 950 },
	{ yaw: 1.7, pitch: 1.08, explode: 1, hold: 1100, move: 850 },
	{ yaw: 2.5, pitch: P, explode: 0, hold: 1300, move: 950 },
]

/** the gaiwan holds its painting to the eye: the cat, straight on, before the lid comes off */
const GAIWAN: Shot[] = [
	{ yaw: Y, pitch: P, explode: 0, hold: 1500 },
	{ yaw: Y, pitch: 0.06, explode: 0, hold: 1700, move: 850 },
	{ yaw: Y, pitch: 0.06, explode: 1, hold: 1000, move: 650 },
	{ yaw: Y + 1, pitch: 0.7, explode: 1, hold: 1400, move: 950 },
	{ yaw: Y + 1.9, pitch: 1.08, explode: 1, hold: 1100, move: 850 },
	{ yaw: Y + 2.8, pitch: P, explode: 0, hold: 1300, move: 950 },
]

/** the cups: in elevation side by side, then down into them */
const CUPS: Shot[] = [
	{ yaw: Y, pitch: P, explode: 0, hold: 1500 },
	{ yaw: 0, pitch: 0.04, explode: 0, hold: 1300, move: 850 },
	{ yaw: 0.6, pitch: 1.05, explode: 0, hold: 1400, move: 950 },
	{ yaw: 1.5, pitch: 0.5, explode: 0, hold: 1300, move: 950 },
]

/**
 * The cake: the wrapper's print read square-on from above, its dome and rim in elevation, then the
 * wrapper lifts to show the neifei pressed into the face.
 */
const CAKE: Shot[] = [
	{ yaw: Y, pitch: 0.72, explode: 0, hold: 1500 },
	{ yaw: 0, pitch: 1.12, explode: 0, hold: 1600, move: 900 },
	{ yaw: 0.25, pitch: 0.04, explode: 0, hold: 1200, move: 900 },
	{ yaw: Y, pitch: 0.62, explode: 1, hold: 1600, move: 1000 },
	{ yaw: Y + 1.2, pitch: 0.72, explode: 0, hold: 1200, move: 950 },
]

/* ---------------------------------------------------------------- registry */

export const DRAWINGS: DrawingSpec[] = [
	{
		id: "cat-gaiwan",
		slug: "cat-gaiwan",
		short: "cat gaiwan",
		accent: "#e9dcc2",
		action: "lift the lid",
		shots: GAIWAN,
		build: catGaiwan,
	},
	{
		id: "hongni-shuiping",
		slug: "hongni-shuiping",
		short: "shuiping",
		accent: "#e07a52",
		action: "lift the lid",
		shots: LIDDED,
		build: hongniShuiping,
	},
	{
		id: "thousand-lines",
		slug: "thousand-lines-chaozhou-xishi",
		short: "thousand lines",
		accent: "#c98f6d",
		action: "lift the lid",
		shots: LIDDED,
		build: thousandLines,
	},
	{
		id: "cups",
		slug: null,
		short: "cups",
		accent: "#dcc8a0",
		action: null,
		info: { title: "Tea cups", hanzi: "品茗杯", facts: ["glazed stoneware"] },
		note: "where every steep ends up",
		shots: CUPS,
		build: cups,
	},
	{
		id: "cnnp-7542",
		slug: null,
		short: "7542",
		accent: "#ece2cc",
		action: "lift the wrapper",
		pitch: 0.72,
		info: { title: "CNNP 7542", hanzi: "雲南七子餅茶", facts: ["sheng bing", "357 g", "Ø≈200 mm"] },
		note: "75: a 1975 recipe · 4: its leaf grade · 2: Menghai",
		shots: CAKE,
		build: cnnp7542,
	},
]
