/**
 * Context lines from Natural Earth 10 m: coast, rivers, lakes, province lines.
 * The zips live in the cache; only the clipped, projected paths end up in git.
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import mapshaper from "mapshaper"
import { linesPath, polygonsPath } from "./project.mjs"
import { log, round } from "./util.mjs"

async function ensureZip(dir, baseUrl, layerPath, offline) {
	const name = path.basename(layerPath)
	const file = path.join(dir, `${name}.zip`)
	try {
		if ((await stat(file)).size > 0) return { name, file }
	} catch {}
	if (offline) throw new Error(`--offline: ${file} is missing. Run \`pnpm geo\` with network once.`)
	log.info(`  downloading ${name}.zip`)
	let lastError
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const res = await fetch(`${baseUrl}/${layerPath}.zip`, {
				signal: AbortSignal.timeout(120000),
			})
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			const buf = Buffer.from(await res.arrayBuffer())
			await mkdir(dir, { recursive: true })
			await writeFile(`${file}.tmp`, buf)
			await rename(`${file}.tmp`, file)
			return { name, file }
		} catch (err) {
			lastError = err
			await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
		}
	}
	throw new Error(`Natural Earth ${name} failed: ${lastError?.message}`)
}

const bboxArg = (b) => b.map((v) => round(v, 5)).join(",")

/**
 * Load the four layers clipped to `bbox` (the locator frame), keeping only the fields
 * the map uses. Returns plain GeoJSON features with a `layer` property.
 */
export async function loadContext({ dir, ne, bbox, offline }) {
	const features = { lines: [], lakes: [] }
	for (const [layer, layerPath] of Object.entries(ne.layers)) {
		const { name, file } = await ensureZip(dir, ne.baseUrl, layerPath, offline)
		const out = await mapshaper.applyCommands(
			`-i in.zip -clip bbox=${bboxArg(bbox)} -o format=geojson`,
			{
				"in.zip": await readFile(file),
			}
		)
		const fc = JSON.parse(String(out[`${name}.json`]))
		for (const f of fc.features) {
			if (!f.geometry) continue
			const p = f.properties ?? {}
			if (layer === "admin") {
				if (p.FEATURECLA !== ne.adminClass || !ne.adminCountries.includes(p.ADM0_NAME)) continue
				features.lines.push({ ...f, properties: { layer, rank: p.SCALERANK ?? 0, name: "" } })
			} else if (layer === "coast") {
				features.lines.push({ ...f, properties: { layer, rank: p.scalerank ?? 0, name: "" } })
			} else if (layer === "rivers") {
				features.lines.push({
					...f,
					properties: {
						layer,
						rank: p.scalerank ?? 0,
						name: p.name || "",
						name_zh: p.name_zh || "",
					},
				})
			} else if (layer === "lakes") {
				features.lakes.push({
					...f,
					properties: {
						layer,
						rank: p.scalerank ?? 0,
						name: p.name || "",
						name_zh: p.name_zh || "",
					},
				})
			}
		}
	}
	return features
}

async function clipSimplify(features, bbox, toleranceM) {
	if (!features.length) return []
	const out = await mapshaper.applyCommands(
		`-i ctx.json -clip bbox=${bboxArg(bbox)} -simplify interval=${Math.round(
			toleranceM
		)} -o format=geojson ctx.json`,
		{ "ctx.json": JSON.stringify({ type: "FeatureCollection", features }) }
	)
	if (!out["ctx.json"]) return [] // everything clipped away
	return (JSON.parse(String(out["ctx.json"])).features ?? []).filter((f) => f.geometry)
}

const linesOf = (g) =>
	g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []
const polysOf = (g) =>
	g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []

/** Named groups (rivers, lakes) as [{ name, name_zh, d }], sorted by name */
function named(features, toPath) {
	const groups = new Map()
	for (const f of features) {
		const key = f.properties.name
		if (!groups.has(key))
			groups.set(key, { name: key, name_zh: f.properties.name_zh || "", parts: [] })
		groups.get(key).parts.push(f.geometry)
	}
	return [...groups.values()]
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		.map((g) => ({ name: g.name, name_zh: g.name_zh, d: toPath(g.parts) }))
		.filter((g) => g.d)
}

/**
 * Context paths for one frame.
 * @param {{ bbox: number[], clip: number[], project: Function, unitsPerPx: number, kmPerPx: number, rivers: number, lakes: number }} frame
 */
export async function frameContext(ctx, frame) {
	const tolerance = frame.kmPerPx * 1000 * 0.6
	const minLen = frame.unitsPerPx * 2
	const minArea = frame.unitsPerPx ** 2 * 4
	const lineFeatures = ctx.lines.filter(
		(f) => f.properties.layer !== "rivers" || f.properties.rank <= frame.rivers
	)
	const lakeFeatures = ctx.lakes.filter((f) => f.properties.rank <= frame.lakes)
	const lines = await clipSimplify(lineFeatures, frame.bbox, tolerance)
	const lakes = await clipSimplify(lakeFeatures, frame.bbox, tolerance)
	const byLayer = (layer) => lines.filter((f) => f.properties.layer === layer)
	const linePath = (geoms) =>
		linesPath(geoms.flatMap(linesOf), frame.project, { minLength: minLen, clip: frame.clip })
	const polyPath = (geoms) =>
		polygonsPath(geoms.flatMap(polysOf), frame.project, { minArea, clip: frame.clip })
	return {
		coast: linePath(byLayer("coast").map((f) => f.geometry)),
		admin: linePath(byLayer("admin").map((f) => f.geometry)),
		rivers: named(byLayer("rivers"), linePath),
		lakes: named(lakes, polyPath),
	}
}
