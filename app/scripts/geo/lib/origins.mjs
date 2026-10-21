/**
 * Step 0: origins from content/origins/*.md frontmatter (plan §4.6).
 * The slug is the filename, matching flatbread's `_slug`.
 */
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"

/** Only the fields the map pipeline reads; geo:check hashes exactly this. */
function pick(slug, data) {
	const geo = data.geo ?? null
	return {
		slug,
		id: data.id ?? null,
		title: data.title ?? slug,
		hanzi: data.hanzi ?? null,
		pinyin: data.pinyin ?? null,
		kind: data.kind ?? null,
		parent: data.parent ?? null,
		groups: Array.isArray(data.groups) ? [...data.groups].sort() : [],
		geo: geo && {
			lat: Number(geo.lat),
			lon: Number(geo.lon),
			precision: geo.precision ?? data.kind ?? "unknown",
			radius_km: geo.radius_km == null ? null : Number(geo.radius_km),
			elevation_m: Array.isArray(geo.elevation_m) ? geo.elevation_m.map(Number) : null,
			confidence: geo.confidence ?? null,
			source: geo.source ?? null,
		},
	}
}

/** Read every origin, sorted by slug, with `parentSlug` and `ancestors` resolved. */
export async function readOrigins(dir) {
	const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort()
	const origins = []
	for (const file of files) {
		const raw = await readFile(path.join(dir, file), "utf8")
		origins.push(pick(file.replace(/\.md$/, ""), matter(raw.replace(/\r\n/g, "\n")).data))
	}
	const byId = new Map(origins.map((o) => [o.id, o]))
	for (const o of origins) {
		o.parentSlug = (o.parent && byId.get(o.parent)?.slug) || null
	}
	const bySlug = new Map(origins.map((o) => [o.slug, o]))
	for (const o of origins) {
		const chain = []
		let cur = o.parentSlug && bySlug.get(o.parentSlug)
		while (cur && !chain.includes(cur.slug)) {
			chain.push(cur.slug)
			cur = cur.parentSlug && bySlug.get(cur.parentSlug)
		}
		o.ancestors = chain // nearest first
	}
	return origins
}

/** Curated map labels (content/geo/places.json, plan §4.7.4) */
export async function readPlaces(file) {
	return JSON.parse(await readFile(file, "utf8"))
}

/** The hashed view of the origins (no derived fields) */
export function originInputs(origins) {
	return origins.map(({ parentSlug: _p, ancestors: _a, ...rest }) => rest)
}
