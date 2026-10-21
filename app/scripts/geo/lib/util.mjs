/**
 * Shared helpers: paths, deterministic JSON, hashing, logging.
 * Everything that touches the filesystem goes through node:path so the
 * pipeline behaves the same on Windows, macOS and Linux (plan §4.3.1).
 */
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
export const geoDir = path.resolve(here, "..")
export const appRoot = path.resolve(geoDir, "..", "..")

export const paths = {
	origins: path.join(appRoot, "content", "origins"),
	places: path.join(appRoot, "content", "geo", "places.json"),
	generated: path.join(appRoot, "src", "generated"),
	originsGeo: path.join(appRoot, "src", "generated", "origins.geo.json"),
	manifest: path.join(appRoot, "src", "generated", "maps-manifest.json"),
	maps: path.join(appRoot, "public", "maps"),
	font: path.join(appRoot, "public", "fonts", "origins-sc.woff2"),
	fixtures: path.join(geoDir, "fixtures"),
}

/** Cache root: PUERH_GEO_CACHE or app/.cache. Holds terrain/{z}/{x}/{y}.png, naturalearth/, fonts/. */
export function cacheRoot() {
	const env = process.env.PUERH_GEO_CACHE
	return env ? path.resolve(env) : path.join(appRoot, ".cache")
}

/** URL (always `/`) for a file under public/ */
export function publicUrl(...segments) {
	return "/" + segments.join("/")
}

/** Round to a fixed number of decimals without "-0" */
export function round(value, decimals) {
	const f = 10 ** decimals
	const r = Math.round(value * f) / f
	return r === 0 ? 0 : r
}

/** JSON with sorted keys, for hashing */
export function canonicalJson(value) {
	return JSON.stringify(value, (_key, v) => {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			return Object.fromEntries(
				Object.keys(v)
					.sort()
					.map((k) => [k, v[k]])
			)
		}
		if (v === Infinity) return "Infinity"
		return v
	})
}

export function sha256(data) {
	return createHash("sha256").update(data).digest("hex")
}

const isPrimitive = (v) => v === null || typeof v !== "object"
/** Leaves that stay on one line: primitives, arrays of them, arrays of those (coordinates) */
const isFlat = (v) =>
	isPrimitive(v) ||
	(Array.isArray(v) && v.every((x) => isPrimitive(x) || (Array.isArray(x) && x.every(isPrimitive))))
const isRow = (v) =>
	v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(isFlat)

/**
 * Deterministic JSON: the object's own (deterministically built) key order, LF line
 * endings, trailing newline. Tab-indented, but coordinate arrays and flat records
 * (e.g. one band `{ elev, index, d }`) stay on one line so diffs stay readable.
 */
export function stringify(value) {
	const write = (v, indent) => {
		if (isFlat(v) || isRow(v)) return JSON.stringify(v)
		const inner = indent + "\t"
		const items = Array.isArray(v)
			? v.map((x) => inner + write(x, inner))
			: Object.keys(v)
					.filter((k) => v[k] !== undefined)
					.map((k) => `${inner}${JSON.stringify(k)}: ${write(v[k], inner)}`)
		const [open, close] = Array.isArray(v) ? ["[", "]"] : ["{", "}"]
		if (!items.length) return open + close
		return `${open}\n${items.join(",\n")}\n${indent}${close}`
	}
	return write(value, "") + "\n"
}

export async function writeText(file, text) {
	await mkdir(path.dirname(file), { recursive: true })
	await writeFile(file, text.replace(/\r\n/g, "\n"), "utf8")
	return Buffer.byteLength(text)
}

export async function writeBinary(file, buffer) {
	await mkdir(path.dirname(file), { recursive: true })
	await writeFile(file, buffer)
	return buffer.length
}

export function relativeToApp(file) {
	return path.relative(appRoot, file).split(path.sep).join("/")
}

export const log = {
	verbose: process.argv.includes("--verbose"),
	info: (...args) => console.log(...args),
	debug: (...args) => {
		if (log.verbose) console.log(...args)
	},
}
