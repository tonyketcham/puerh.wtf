/**
 * public/maps/labels.json (plan §4.7.4): every place name the maps can show, in shared units,
 * with the lowest zoom tier each may show at. One deterministic file:
 *
 *   { version, tiers, labels: [{ id, kind, name, name_zh, x, y, rank, angle? }] }
 *
 * Sources: curated countries, provinces and tea towns (content/geo/places.json), Natural Earth
 * populated places (cities), marine polygons (seas), lakes and river lines (name anchors with
 * an angle), and the placed origins themselves. The runtime places them in screen space with
 * priority by rank and greedy collision.
 */
import mapshaper from "mapshaper"
import { rankBy, riverAnchors } from "./annotate.mjs"
import { readLayer } from "./context.mjs"
import { round } from "./util.mjs"

export const LABEL_KINDS = ["country", "sea", "province", "city", "town", "origin", "lake", "river"]

const HAN = /^\p{Script=Han}+$/u

/** Only Han characters survive (a kana or Latin name gets no hanzi) */
const hanOnly = (s) => (s && HAN.test(s) ? s : null)

/** ascii-folded lower-case name, for matching duplicates */
const fold = (s) =>
	(s ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")

export const slugify = (s) =>
	(s ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")

/** Hanzi for a Natural Earth populated place, in the local form (see params LABELS) */
export function cityHanzi(p, countries) {
	const a3 = p.ADM0_A3
	if (!countries.includes(a3)) return null
	if (a3 === "TWN") return hanOnly((p.NAME_ZHT || "").replace(/[市縣]$/u, "").replace(/臺/gu, "台"))
	if (a3 === "JPN") return hanOnly((p.NAME_JA || "").replace(/[市都府県町村]$/u, ""))
	return hanOnly((p.NAME_ZH || "").replace(/市$/u, ""))
}

/** mapshaper's inner point (pole of inaccessibility) for each polygon feature */
async function innerPoints(features) {
	if (!features.length) return []
	const out = await mapshaper.applyCommands("-i in.json -points inner -o format=geojson out.json", {
		"in.json": JSON.stringify({ type: "FeatureCollection", features }),
	})
	return (JSON.parse(String(out["out.json"])).features ?? []).filter((f) => f.geometry)
}

/**
 * @param {{
 *   dir: string, ne: object, offline: boolean, project: (p: number[]) => number[],
 *   unitsPerKm: (lat: number) => number,
 *   places: object, origins: object[], ctx: { lines: object[], lakes: object[] },
 *   params: object, tiers: object[],
 * }} opts
 */
export async function buildLabels({
	dir,
	ne,
	offline,
	project,
	unitsPerKm,
	places,
	origins,
	ctx,
	params,
	tiers,
}) {
	const [W, S, E, N] = params.bbox
	const inBox = (lon, lat) => lon >= W && lon <= E && lat >= S && lat <= N
	const [ax0, ay0] = project([W, N])
	const [ax1, ay1] = project([E, S])
	const inArea = ([x, y]) => x >= ax0 && x <= ax1 && y >= ay0 && y <= ay1
	const at = (lon, lat) => project([lon, lat]).map((v) => round(v, 1))
	// outside the core, Natural Earth labels keep their hanzi only at the coarsest ranks
	const [cw, cs, ce, cn] = params.core
	const [cx0, cy0] = project([cw, cn])
	const [cx1, cy1] = project([ce, cs])
	const inCoreUnits = ([x, y]) => x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1
	const outerZh = (name_zh, rank, lon, lat) =>
		rank <= params.outerHanziMaxRank || (lon >= cw && lon <= ce && lat >= cs && lat <= cn)
			? name_zh
			: null
	const inDense = (lon, lat) =>
		params.cities.dense.some(
			({ bbox: [w, s, e, n] }) => lon >= w && lon <= e && lat >= s && lat <= n
		)
	const denseRects = params.cities.dense.map(({ bbox: [w, s, e, n] }) => [
		...project([w, n]),
		...project([e, s]),
	])
	const inDenseUnits = ([x, y]) =>
		denseRects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)
	const originPoints = origins
		.filter((o) => params.origins.ranks[o.geo.precision] != null)
		.map((o) => [o.geo.lon, o.geo.lat])
	const nearOrigin = (lon, lat, km) =>
		originPoints.some(
			([olon, olat]) =>
				Math.hypot(
					(olon - lon) * Math.cos((lat * Math.PI) / 180) * 111.195,
					(olat - lat) * 111.195
				) <= km
		)

	/** priority: origins, then curated, then Natural Earth */
	const named = []
	const add = (l, lon, lat) => {
		if (lon != null && !inBox(lon, lat)) return
		named.push(l)
	}

	// origins ----------------------------------------------------------------------------
	for (const o of origins) {
		const rank = params.origins.ranks[o.geo.precision]
		if (rank == null || o.kind === "unknown") continue
		const [x, y] = at(o.geo.lon, o.geo.lat)
		add(
			{
				kind: "origin",
				name: o.title,
				name_zh: hanOnly(o.hanzi),
				x,
				y,
				rank,
				slug: o.slug,
				lat: o.geo.lat,
			},
			o.geo.lon,
			o.geo.lat
		)
	}

	// curated ----------------------------------------------------------------------------
	for (const c of places.countries) {
		for (const [lon, lat, rank] of c.anchors) {
			const [x, y] = at(lon, lat)
			add({ kind: "country", name: c.name, name_zh: c.name_zh, x, y, rank }, lon, lat)
		}
	}
	for (const p of places.provinces) {
		const [x, y] = at(p.lon, p.lat)
		add({ kind: "province", name: p.name, name_zh: p.name_zh, x, y, rank: p.rank }, p.lon, p.lat)
	}
	for (const p of places.places) {
		const [x, y] = at(p.lon, p.lat)
		add(
			{
				kind: p.kind,
				name: p.name,
				name_zh: p.name_zh,
				x,
				y,
				rank: p.rank,
				lat: p.lat,
				aliases: p.aliases,
			},
			p.lon,
			p.lat
		)
	}

	// Natural Earth cities ----------------------------------------------------------------
	const cities = params.cities
	for (const f of await readLayer({
		dir,
		ne,
		layerPath: ne.labelLayers.places,
		bbox: params.bbox,
		offline,
	})) {
		const p = f.properties
		const [lon, lat] = f.geometry.coordinates
		const dense = cities.dense.find(
			({ bbox: [w, s, e, n] }) => lon >= w && lon <= e && lat >= s && lat <= n
		)
		if (!(p.SCALERANK <= Math.max(cities.maxScalerank, dense?.maxScalerank ?? -1))) continue
		const capital = /capital/i.test(p.FEATURECLA ?? "")
		const rank = Math.max(
			1,
			rankBy(cities.ranks, p.SCALERANK) - (capital ? cities.capitalBoost : 0)
		)
		const hanzi = rank <= cities.hanziMaxRank || !!dense || nearOrigin(lon, lat, cities.hanziNearKm)
		const [x, y] = at(lon, lat)
		add(
			{
				kind: "city",
				name: (p.NAME_EN || p.NAME).replace(/ City$/, ""),
				name_zh: hanzi ? outerZh(cityHanzi(p, cities.hanzi), rank, lon, lat) : null,
				x,
				y,
				rank,
				lat,
				scalerank: p.SCALERANK,
			},
			lon,
			lat
		)
	}

	// seas -----------------------------------------------------------------------------------
	const seaPolys = (
		await readLayer({ dir, ne, layerPath: ne.labelLayers.marine, bbox: params.bbox, offline })
	).filter((f) => f.properties.name && !params.seas.exclude.includes(f.properties.featurecla))
	// Natural Earth writes a few in traditional characters (灣, 馬, 達); the mainland forms
	const seaOverrides = new Map((places.seas ?? []).map((r) => [r.match, r]))
	for (const f of await innerPoints(seaPolys)) {
		const p = f.properties
		const [lon, lat] = f.geometry.coordinates
		const [x, y] = at(lon, lat)
		const rank = rankBy(params.seas.ranks, p.min_label ?? 99)
		const o = seaOverrides.get(p.name)
		add(
			{
				kind: "sea",
				name: p.name,
				// a curated form is kept wherever the sea is
				name_zh:
					o && "name_zh" in o ? hanOnly(o.name_zh) : outerZh(hanOnly(p.name_zh), rank, lon, lat),
				x,
				y,
				rank,
			},
			lon,
			lat
		)
	}

	// lakes ----------------------------------------------------------------------------------
	const lakeGroups = new Map()
	for (const f of ctx.lakes) {
		if (!f.properties.name) continue
		const g = lakeGroups.get(f.properties.name)
		if (!g || f.properties.rank < g.properties.rank) lakeGroups.set(f.properties.name, f)
	}
	for (const f of await innerPoints([...lakeGroups.values()])) {
		const p = f.properties
		const [lon, lat] = f.geometry.coordinates
		const [x, y] = at(lon, lat)
		const rank = rankBy(params.lakes.ranks, p.rank)
		add(
			{
				kind: "lake",
				name: p.name,
				name_zh: outerZh(hanOnly(p.name_zh), rank, lon, lat),
				x,
				y,
				rank,
			},
			lon,
			lat
		)
	}

	// rivers ----------------------------------------------------------------------------------
	const overrides = new Map((places.rivers ?? []).map((r) => [r.match, r]))
	const riverGroups = new Map()
	for (const f of ctx.lines) {
		const p = f.properties
		if (p.layer !== "rivers" || !p.name) continue
		const g = f.geometry
		const lines = g.type === "LineString" ? [g.coordinates] : g.coordinates
		const lons = lines.flat().map((c) => c[0])
		const lats = lines.flat().map((c) => c[1])
		const dense = inDense(
			(Math.min(...lons) + Math.max(...lons)) / 2,
			(Math.min(...lats) + Math.max(...lats)) / 2
		)
		if (p.rank > (dense ? params.rivers.denseMaxScalerank : params.rivers.maxScalerank)) continue
		const o = overrides.get(p.name)
		const name_zh = hanOnly(o && "name_zh" in o ? o.name_zh : p.name_zh)
		const key = `${p.name}\n${name_zh ?? ""}`
		if (!riverGroups.has(key))
			riverGroups.set(key, { name: o?.name ?? p.name, name_zh, scalerank: p.rank, lines: [] })
		const r = riverGroups.get(key)
		r.scalerank = Math.min(r.scalerank, p.rank)
		for (const line of lines) r.lines.push(line.map((c) => project(c)))
	}
	const rivers = [...riverGroups.values()]
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		.map((r) => ({ ...r, rank: rankBy(params.rivers.ranks, r.scalerank) }))
	const anchorOk = (p, rank) => inArea(p) && (rank < params.rivers.denseFromRank || inDenseUnits(p))
	for (const a of riverAnchors(rivers, tiers, params.rivers, anchorOk))
		named.push({
			kind: "river",
			...a,
			name_zh: a.rank <= params.outerHanziMaxRank || inCoreUnits([a.x, a.y]) ? a.name_zh : null,
		})

	// de-duplicate: a city or town at the same place as a higher-priority label of the same name
	// (or one of its curated aliases, e.g. Pu'er's urban district Simao)
	const names = (l) => [l.name, ...(l.aliases ?? [])].map(fold)
	const settled = []
	const placeKinds = new Set(["origin", "city", "town"])
	for (const l of named) {
		if (placeKinds.has(l.kind)) {
			const radius = 8 * unitsPerKm(l.lat ?? 25)
			const dup = settled.find(
				(s) =>
					placeKinds.has(s.kind) &&
					Math.hypot(s.x - l.x, s.y - l.y) <= radius &&
					(names(s).includes(fold(l.name)) ||
						(s.name_zh &&
							l.name_zh &&
							(s.name_zh.startsWith(l.name_zh) || l.name_zh.startsWith(s.name_zh))))
			)
			if (dup) continue
		}
		settled.push(l)
	}

	// deterministic order and ids ---------------------------------------------------------------
	const kindOrder = (k) => LABEL_KINDS.indexOf(k)
	settled.sort(
		(a, b) =>
			a.rank - b.rank ||
			kindOrder(a.kind) - kindOrder(b.kind) ||
			(a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
			a.x - b.x ||
			a.y - b.y
	)
	const seen = new Map()
	return settled.map((l) => {
		const base = `${l.kind}:${l.slug ?? slugify(l.name)}`
		const n = (seen.get(base) ?? 0) + 1
		seen.set(base, n)
		const out = {
			id: n === 1 ? base : `${base}:${n}`,
			kind: l.kind,
			name: l.name,
			name_zh: l.name_zh ?? null,
			x: l.x,
			y: l.y,
			rank: l.rank,
		}
		if (l.angle != null) out.angle = l.angle
		return out
	})
}

/** Every Han character in a set of strings, sorted by code point */
export function hanziOf(strings) {
	const chars = new Set()
	for (const s of strings) for (const ch of s ?? "") if (/\p{Script=Han}/u.test(ch)) chars.add(ch)
	return [...chars].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join("")
}
