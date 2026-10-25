import { createHash } from "node:crypto"
import YAML from "yaml"
import { assert, sha256 } from "./security.mjs"
import { contentPath, assetPath } from "./github.mjs"
import { SCHEMAS } from "../../src/lib/authoring/schema-data.mjs"

export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const OID = /^[a-f0-9]{40}$/i
const relations = {
	tastings: {
		author: "authors",
		style: "styles",
		cultivar: "cultivars",
		origin: "origins",
		vendor: "vendors",
		tags: "tags",
		vessel: "vessels",
	},
	origins: { parent: "origins" },
	styles: { category: "categories" },
	cultivars: { styles: "styles" },
}
const singular = {
	tastings: "session",
	vendors: "vendor",
	origins: "origin",
	styles: "style",
	categories: "category",
	cultivars: "cultivar",
	vessels: "vessel",
	authors: "author",
	tags: "tag",
}
export function parseDocument(record) {
	assert(
		contentPath(record.path) &&
			typeof record.content === "string" &&
			Buffer.byteLength(record.content) <= 262144 &&
			!record.content.includes("\0") &&
			Buffer.from(record.content).toString("utf8") === record.content,
		422,
		"document",
		"Every content document must be an allowed UTF-8 Markdown file below 256 KiB."
	)
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(record.content)
	assert(match, 422, "frontmatter", `${record.path}: YAML frontmatter is required.`)
	const parsed = YAML.parseDocument(match[1], { uniqueKeys: true, strict: true })
	assert(
		!parsed.errors.length && !parsed.warnings.length,
		422,
		"frontmatter",
		`${record.path}: frontmatter is not valid supported YAML.`
	)
	let data
	try {
		data = parsed.toJS({ maxAliasCount: 0 })
	} catch {
		assert(false, 422, "frontmatter", `${record.path}: YAML aliases are not supported.`)
	}
	assert(
		data &&
			typeof data === "object" &&
			!Array.isArray(data) &&
			typeof data.id === "string" &&
			/^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/.test(data.id) &&
			typeof data.title === "string" &&
			data.title.trim().length > 0 &&
			data.title.length <= 300 &&
			!/[\r\n\0]/.test(data.title),
		422,
		"identity",
		`${record.path}: a stable content ID and nonempty single-line title are required.`
	)
	return {
		...record,
		collection: record.path.split("/")[2],
		data,
		body: record.content.slice(match[0].length),
	}
}
function strings(value, result = [], depth = 0) {
	assert(
		depth <= 24 && result.length <= 20000,
		422,
		"document_complexity",
		"Document metadata exceeds supported nesting limits."
	)
	if (typeof value === "string") result.push(value)
	else if (Array.isArray(value)) value.forEach((item) => strings(item, result, depth + 1))
	else if (value && typeof value === "object")
		Object.values(value).forEach((item) => strings(item, result, depth + 1))
	return result
}
function validateFields(record) {
	function walk(values, fields, prefix = "") {
		for (const field of fields) {
			const value = values[field.name],
				name = prefix + field.name
			const fail = (condition, message) =>
				assert(condition, 422, "field", record.data.title + ": " + message, {
					path: record.path,
					field: name,
				})
			if (value === undefined || value === null || value === "") {
				fail(!field.required, field.label + " is required.")
				continue
			}
			if (field.type === "number")
				fail(
					typeof value === "number" &&
						Number.isFinite(value) &&
						(field.min === undefined || value >= field.min) &&
						(field.max === undefined || value <= field.max),
					field.label + " must be a finite number in its supported range."
				)
			else if (field.type === "boolean")
				fail(typeof value === "boolean", field.label + " must be true or false.")
			else if (field.type === "object") {
				fail(
					typeof value === "object" && !Array.isArray(value),
					field.label + " must be an object."
				)
				walk(value, field.fields || [], name + ".")
			} else if (field.type === "list") {
				fail(Array.isArray(value), field.label + " must be a list.")
				value.forEach((item, index) => {
					if (field.fields) {
						fail(
							item && typeof item === "object" && !Array.isArray(item),
							field.label + " items must be objects."
						)
						walk(item, field.fields, name + "." + index + ".")
					} else if (field.itemType)
						fail(
							typeof item === (field.itemType === "number" ? "number" : "string") &&
								(typeof item !== "number" || Number.isFinite(item)),
							field.label + " contains an invalid item."
						)
				})
			} else if (field.type === "relation")
				fail(
					field.multiple
						? Array.isArray(value) && value.every((id) => typeof id === "string")
						: typeof value === "string",
					field.label + " must contain stable record IDs."
				)
			else {
				fail(typeof value === "string", field.label + " must be text.")
				if (field.type === "select")
					fail(field.options.includes(value), field.label + " has an unsupported choice.")
				if (field.type === "datetime")
					fail(Number.isFinite(Date.parse(value)), field.label + " must be a valid date/time.")
				if (field.type === "image")
					fail(
						value.startsWith("/images/") || /^https:\/\//.test(value),
						field.label + " must reference a pushed image or HTTPS image URL."
					)
			}
		}
	}
	walk(record.data, SCHEMAS[record.collection].fields)
}
export function validateDocuments(documents, catalog, tree, assets = [], maxDocuments = 40) {
	assert(
		Array.isArray(documents) && documents.length > 0 && documents.length <= maxDocuments,
		422,
		"document_limit",
		`Choose between 1 and ${maxDocuments} whole records for this operation.`
	)
	const old = new Map(catalog.map((record) => [record.path, record]))
	const paths = new Set()
	for (const document of documents) {
		assert(
			document && contentPath(document.path) && !paths.has(document.path),
			422,
			"path",
			"Content paths must be unique allowed Markdown paths."
		)
		paths.add(document.path)
		assert(
			document.expectedBlobSha === null ||
				(typeof document.expectedBlobSha === "string" && OID.test(document.expectedBlobSha)),
			422,
			"blob_revision",
			"Each document must include its expected source blob SHA or null for a new record."
		)
		assert(
			(old.get(document.path)?.sha || null) === document.expectedBlobSha,
			409,
			"blob_conflict",
			"A source document changed. Review its latest version before pushing.",
			{ path: document.path, latestBlobSha: old.get(document.path)?.sha || null }
		)
	}
	const proposed = new Map(old)
	documents.forEach((document) => proposed.set(document.path, document))
	const parsed = [...proposed.values()].map(parseDocument),
		byId = new Map()
	for (const record of parsed) {
		assert(!byId.has(record.data.id), 422, "duplicate_id", "Stable content IDs must be unique.", {
			path: record.path,
		})
		byId.set(record.data.id, record)
	}
	const existingAssets = new Set(
		tree
			.filter((entry) => entry.type === "blob" && entry.mode === "100644")
			.map((entry) => entry.path)
	)
	assets.forEach((asset) => existingAssets.add(asset.path))
	const changes = parsed.filter((record) => paths.has(record.path))
	for (const record of changes) {
		validateFields(record)
		const before = old.has(record.path) ? parseDocument(old.get(record.path)) : null
		assert(
			!before || before.data.id === record.data.id,
			422,
			"identity",
			"Editing an existing document cannot change its stable ID.",
			{ path: record.path }
		)
		for (const [field, collection] of Object.entries(relations[record.collection] || {})) {
			const value = record.data[field]
			if (value === undefined || value === null || value === "") continue
			const scalar = record.collection === "origins" || record.collection === "styles"
			assert(
				scalar ? typeof value === "string" : Array.isArray(value),
				422,
				"relationship",
				`${record.data.title}: ${field} has the wrong relationship shape.`,
				{ path: record.path, field }
			)
			const targets = Array.isArray(value) ? value : [value]
			assert(
				targets.every((id) => typeof id === "string" && byId.get(id)?.collection === collection),
				422,
				"relationship",
				`${record.data.title}: ${field} must reference records present in this exact proposed snapshot.`,
				{ path: record.path, field }
			)
		}
		for (const value of strings(record.data)) {
			if (!value.startsWith("/images/uploads/authoring/")) continue
			const path = `app/public${value}`
			assert(
				assetPath(path) && existingAssets.has(path),
				422,
				"missing_media",
				`${record.data.title}: an authoring image is missing from this push or target branch.`,
				{ path }
			)
		}
		if (record.collection === "origins") {
			const seen = new Set([record.data.id])
			let parent = record.data.parent,
				depth = 1
			while (parent) {
				assert(
					!seen.has(parent) && ++depth <= 6,
					422,
					"origin_cycle",
					"Origin parent relationships must be acyclic and bounded."
				)
				seen.add(parent)
				parent = byId.get(parent)?.data.parent
			}
		}
	}
	return changes.filter((record) => record.content !== old.get(record.path)?.content)
}
export function webpDimensions(bytes) {
	assert(
		bytes.length >= 26 &&
			bytes.toString("ascii", 0, 4) === "RIFF" &&
			bytes.toString("ascii", 8, 12) === "WEBP" &&
			bytes.readUInt32LE(4) + 8 === bytes.length,
		422,
		"asset_format",
		"Authoring images must be complete WebP files."
	)
	let offset = 12,
		canvas = null,
		frame = null,
		alphaSeen = false
	while (offset + 8 <= bytes.length) {
		const kind = bytes.toString("ascii", offset, offset + 4),
			length = bytes.readUInt32LE(offset + 4),
			start = offset + 8
		assert(
			["VP8 ", "VP8L", "VP8X", "ALPH", "ICCP"].includes(kind) && start + length <= bytes.length,
			422,
			"asset_format",
			"Image metadata/animation or invalid WebP chunks are not accepted."
		)
		if (kind === "VP8X") {
			assert(
				!canvas && !frame && offset === 12 && length === 10 && (bytes[start] & ~0x30) === 0,
				422,
				"asset_format",
				"Invalid, duplicate or unsupported extended WebP header."
			)
			canvas = {
				width: bytes.readUIntLE(start + 4, 3) + 1,
				height: bytes.readUIntLE(start + 7, 3) + 1,
			}
		}
		if (kind === "ALPH") {
			assert(
				canvas && !frame && !alphaSeen,
				422,
				"asset_format",
				"Invalid or duplicate WebP alpha data."
			)
			alphaSeen = true
		}
		if (kind === "VP8 ") {
			assert(
				!frame &&
					length >= 10 &&
					(bytes[start] & 1) === 0 &&
					bytes.toString("hex", start + 3, start + 6) === "9d012a",
				422,
				"asset_format",
				"Invalid or duplicate WebP image data."
			)
			frame = {
				width: bytes.readUInt16LE(start + 6) & 0x3fff,
				height: bytes.readUInt16LE(start + 8) & 0x3fff,
			}
		}
		if (kind === "VP8L") {
			assert(
				!frame && !alphaSeen && length >= 5 && bytes[start] === 0x2f,
				422,
				"asset_format",
				"Invalid or duplicate WebP lossless image data."
			)
			const packed = bytes.readUInt32LE(start + 1)
			frame = { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 }
		}
		offset = start + length + (length % 2)
	}
	assert(
		offset === bytes.length &&
			frame &&
			(!canvas || (canvas.width === frame.width && canvas.height === frame.height)),
		422,
		"asset_dimensions",
		"WebP canvas and actual image dimensions must agree."
	)
	assert(
		frame.width > 0 &&
			frame.height > 0 &&
			frame.width <= 1600 &&
			frame.height <= 16384 &&
			frame.width * frame.height <= 20000000,
		422,
		"asset_dimensions",
		"Authoring image dimensions exceed supported limits."
	)
	return frame
}
export function validateAssets(assets = []) {
	assert(
		Array.isArray(assets) && assets.length <= 80,
		422,
		"asset_limit",
		"One push supports at most 80 image variants."
	)
	const paths = new Set()
	let total = 0
	return assets.map((asset) => {
		assert(
			asset &&
				assetPath(asset.path) &&
				!paths.has(asset.path) &&
				asset.mime === "image/webp" &&
				typeof asset.base64 === "string" &&
				/^[A-Za-z0-9+/]*={0,2}$/.test(asset.base64) &&
				asset.base64.length % 4 === 0,
			422,
			"asset",
			"Assets require unique allowed WebP paths and canonical base64."
		)
		paths.add(asset.path)
		const bytes = Buffer.from(asset.base64, "base64")
		assert(
			bytes.length > 0 && bytes.length <= 2000000 && bytes.toString("base64") === asset.base64,
			422,
			"asset_limit",
			"Each WebP variant must be below 2 MB."
		)
		total += bytes.length
		assert(
			total <= 2800000,
			413,
			"asset_limit",
			"Selected images exceed the push limit. Push fewer records/images while retaining the others locally."
		)
		const dimensions = webpDimensions(bytes)
		assert(
			Number(asset.path.split("/").at(-1).split(".")[0]) === dimensions.width,
			422,
			"asset_dimensions",
			"The image path width must match the image bytes."
		)
		return { ...asset, bytes, ...dimensions }
	})
}
export function blobSha(content) {
	const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content)
	return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
}
export function metadataFor(records, beforeRecords = []) {
	const previous = new Map(beforeRecords.map((record) => [record.path, parseDocument(record)]))
	const sorted = [...records]
		.map((record) => (record.data ? record : parseDocument(record)))
		.sort((a, b) => a.path.localeCompare(b.path, "en"))
	const lines = sorted.map(
		(record) =>
			`${previous.has(record.path) ? "Update" : "Add"} ${
				singular[record.collection]
			}: ${record.data.title.replace(/[\r\n]/g, " ")}`
	)
	const title =
		sorted.length === 0
			? "No outstanding tea log changes"
			: sorted.length === 1
			? lines[0]
			: `Update ${sorted.length} tea log records`
	return { title: title.slice(0, 150), body: lines.map((line) => `- ${line}`).join("\n") }
}
const MARKER = /\n?<!-- puerh-cms:v1 ([A-Za-z0-9_-]+) -->$/
export function prMetadata(pr, metadata) {
	const match = MARKER.exec(pr?.body || "")
	let generated
	try {
		if (match) generated = JSON.parse(Buffer.from(match[1], "base64url"))
	} catch {
		/* Human text remains authoritative. */
	}
	const previousBody = match ? pr.body.slice(0, match.index) : pr?.body
	const title = !pr || (generated && pr.title === generated.title) ? metadata.title : pr.title
	const automaticBody = !pr || (generated && sha256(previousBody || "") === generated.bodyHash)
	const body = automaticBody ? metadata.body : previousBody || ""
	const marker = Buffer.from(
		JSON.stringify({
			title: title === metadata.title ? title : generated?.title,
			bodyHash: automaticBody ? sha256(body) : generated?.bodyHash,
		})
	).toString("base64url")
	return { title, body: `${body}\n<!-- puerh-cms:v1 ${marker} -->` }
}
