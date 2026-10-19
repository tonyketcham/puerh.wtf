/**
 * The four drawn pieces of teaware, reconstructed from the log's own session photos.
 *
 * Evidence record
 * | piece              | evidence                                                    | how it's used                         |
 * | ------------------ | ----------------------------------------------------------- | ------------------------------------- |
 * | Cat Gaiwan         | top view (3c1f3c14…), side view on the 1988 Wuyi desk shot  | flare, rim lip, inset lid and ring    |
 * |                    | (1988-wuyi_4), volume_ml 100                                | knob traced; scaled to hold 100 ml    |
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
	topHeight,
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
	/** where the drawing's evidence came from, for the caption */
	source: string
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
	return finish(parts, {
		cavity: bowl,
		brim: 50.6,
		ml: 100,
		lift: { lid: 30 },
		bodyParts: ["bowl"],
		callouts: [
			{ label: "盖 lid", at: onRing(27, 51, -60), part: "lid", side: "left" },
			{ label: "ring knob", at: onRing(11.8, 60, 30), part: "lid", side: "right" },
			{ label: "碗 bowl", at: onRing(43.2, 38, 25), part: "bowl", side: "right" },
			{ label: "foot ring", at: onRing(22.4, 2.5, -40), part: "bowl", side: "left" },
		],
	})
}

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

/* ---------------------------------------------------------------- registry */

export const DRAWINGS: DrawingSpec[] = [
	{
		id: "cat-gaiwan",
		slug: "cat-gaiwan",
		short: "cat gaiwan",
		accent: "#e9dcc2",
		action: "lift the lid",
		source: "from session photos, sized by volume",
		build: catGaiwan,
	},
	{
		id: "hongni-shuiping",
		slug: "hongni-shuiping",
		short: "shuiping",
		accent: "#e07a52",
		action: "lift the lid",
		source: "from session photos, sized by volume",
		build: hongniShuiping,
	},
	{
		id: "thousand-lines",
		slug: "thousand-lines-chaozhou-xishi",
		short: "thousand lines",
		accent: "#c98f6d",
		action: "lift the lid",
		source: "from session photos, sized by volume",
		build: thousandLines,
	},
	{
		id: "cups",
		slug: null,
		short: "cups",
		accent: "#dcc8a0",
		action: null,
		info: { title: "Tea cups", hanzi: "品茗杯", facts: ["glazed stoneware"] },
		source: "from session photos",
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
		source: "from wrapper photos; a 357 g bing's size",
		build: cnnp7542,
	},
]
