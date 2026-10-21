#!/usr/bin/env node
/**
 * Liquor colors
 *
 * For every tasting in content/tastings, pick the photo most likely to show the
 * brewed tea liquor (by alt text), then sample the dominant saturated, warm color
 * of the liquor and write it to src/generated/liquor-colors.json keyed by the
 * session's flatbread `_slug`.
 *
 * Sampling:
 *  1. downscale to 128px, take the central 70% crop
 *  2. reject near-black / near-white / grey pixels
 *  3. weight survivors by a center-weighted gaussian × chroma × warm-hue bias
 *  4. weighted k-means (k=6) in OKLab, pick the cluster with the best
 *     (mass × chroma × warmth) score, and emit its centroid
 *
 * Usage: pnpm liquor            (writes the json)
 *        pnpm liquor --verbose  (also logs per-session picks)
 *        pnpm liquor --remote   (also fetches http(s) image URLs, e.g. old cloudinary photos)
 */
import { readdir, readFile, writeFile, mkdir, access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, "..")
const tastingsDir = path.join(appRoot, "content", "tastings")
const outFile = path.join(appRoot, "src", "generated", "liquor-colors.json")
const verbose = process.argv.includes("--verbose")
/** Older tastings reference cloudinary URLs; only fetch them when asked to. */
const allowRemote = process.argv.includes("--remote")

/** Static image roots, in lookup order. Frontmatter paths look like /images/uploads/x.jpeg */
const imageRoots = [path.join(appRoot, "public"), path.join(appRoot, "static")]

// ---------------------------------------------------------------------------
// Frontmatter (tiny purpose-built parser: we only need the `images` list)
// ---------------------------------------------------------------------------

function slugify(filename) {
	return filename
		.replace(/\.md$/i, "")
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

function unquote(value) {
	const v = value.trim()
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		return v.slice(1, -1)
	}
	return v
}

function parseImages(markdown) {
	const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
	if (!fm) return []
	const lines = fm[1].split(/\r?\n/)
	const start = lines.findIndex((l) => /^images:\s*$/.test(l))
	if (start === -1) return []

	const block = []
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i]
		if (/^\S/.test(line)) break // next top-level key
		block.push(line)
	}

	const items = []
	let current = null
	let lastKey = null
	for (const raw of block) {
		const itemStart = raw.match(/^\s*-\s+(\w+):\s*(.*)$/)
		const keyLine = raw.match(/^\s+(\w+):\s*(.*)$/)
		if (itemStart) {
			current = {}
			items.push(current)
			lastKey = itemStart[1]
			current[lastKey] = itemStart[2]
		} else if (keyLine && current) {
			lastKey = keyLine[1]
			current[lastKey] = keyLine[2]
		} else if (current && lastKey) {
			// folded continuation line
			current[lastKey] = `${current[lastKey]} ${raw.trim()}`
		}
	}

	return items
		.map((it) => ({ image: unquote(it.image ?? ""), alt: unquote(it.alt ?? "") }))
		.filter((it) => it.image)
}

// ---------------------------------------------------------------------------
// Photo choice
// ---------------------------------------------------------------------------

const POSITIVE_STRONG = /\b(liquor|soup|liquid|beaker|beak|cup|color|colour)\b/i
const POSITIVE = /\b(brew(ed)?|infusion|steep(ed)?|pour(ed)?|flushing)\b/i
const NEGATIVE = /\b(leaf|leaves|wrapper|cake|packaging|maocha|compressed|hunk)\b/i

function scoreAlt(alt) {
	let score = 0
	if (POSITIVE_STRONG.test(alt)) score += 3
	if (POSITIVE.test(alt)) score += 2
	if (/\btea in\b/i.test(alt)) score += 1
	if (NEGATIVE.test(alt)) score -= 4
	return score
}

function pickLiquorImage(images) {
	if (!images.length) return null
	let best = null
	images.forEach((img, i) => {
		const score = scoreAlt(img.alt)
		// ties go to the later photo (sessions tend to end with the cup)
		if (score > 0 && (!best || score >= best.score)) best = { ...img, score, index: i }
	})
	if (best) return { ...best, confidence: "alt" }
	// Fall back to the last photo, but never to one whose alt says it is leaf/wrapper/cake:
	// a wrapper's color is worse than the app's amber default.
	const last = images[images.length - 1]
	if (scoreAlt(last.alt) < 0) return null
	return { ...last, score: 0, index: images.length - 1, confidence: "fallback" }
}

async function resolveImage(imagePath) {
	if (/^https?:\/\//i.test(imagePath)) {
		if (!allowRemote) return null
		const res = await fetch(imagePath)
		if (!res.ok) return null
		return Buffer.from(await res.arrayBuffer())
	}
	const rel = imagePath.replace(/^\/+/, "")
	for (const root of imageRoots) {
		const candidate = path.join(root, rel)
		try {
			await access(candidate)
			return candidate
		} catch {}
	}
	return null
}

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function rgbToOklab(r, g, b) {
	const lr = srgbToLinear(r / 255)
	const lg = srgbToLinear(g / 255)
	const lb = srgbToLinear(b / 255)
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}

function oklabToRgb(L, a, b) {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
	const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
	const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
	const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	return [lr, lg, lb].map((c) => Math.round(Math.min(1, Math.max(0, linearToSrgb(c))) * 255))
}

function rgbToHsv(r, g, b) {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255
	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const d = max - min
	let h = 0
	if (d) {
		if (max === rn) h = ((gn - bn) / d) % 6
		else if (max === gn) h = (bn - rn) / d + 2
		else h = (rn - gn) / d + 4
		h *= 60
		if (h < 0) h += 360
	}
	return [h, max ? d / max : 0, max]
}

const toHex = (rgb) => "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("")

/**
 * Warmth bias: tea liquor spans pale green-gold (young sheng, ~90°) through
 * amber/orange (~35°) to deep red-brown (shou, ~10–20°).
 */
function warmth(hue) {
	if (hue >= 5 && hue <= 70) return 1
	if (hue > 70 && hue <= 100) return 0.75
	if (hue < 5 || hue >= 340) return 0.5
	return 0.12
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

async function sampleLiquor(file) {
	const SIZE = 128
	const { data, info } = await sharp(file)
		.rotate() // honour EXIF orientation
		.resize(SIZE, SIZE, { fit: "inside" })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })

	const { width, height, channels } = info
	const crop = 0.15 // trim 15% each side → central 70%
	const x0 = Math.floor(width * crop)
	const x1 = Math.ceil(width * (1 - crop))
	const y0 = Math.floor(height * crop)
	const y1 = Math.ceil(height * (1 - crop))
	const cx = (width - 1) / 2
	const cy = (height - 1) / 2
	const sigma = Math.min(width, height) * 0.32

	const points = []
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			const i = (y * width + x) * channels
			const r = data[i]
			const g = data[i + 1]
			const b = data[i + 2]
			const [h, s, v] = rgbToHsv(r, g, b)
			if (v < 0.1) continue // near black
			if (v > 0.93 && s < 0.2) continue // near white / specular
			if (s < 0.22) continue // greys, porcelain, steel
			const lab = rgbToOklab(r, g, b)
			const chroma = Math.hypot(lab[1], lab[2])
			const d2 = (x - cx) ** 2 + (y - cy) ** 2
			const center = Math.exp(-d2 / (2 * sigma * sigma))
			const w = center * (0.35 + chroma * 4) * warmth(h)
			if (w <= 0.001) continue
			points.push({ lab, w })
		}
	}

	if (points.length < 12) return null

	// weighted k-means++ (deterministic seeding by weight rank)
	const K = Math.min(6, points.length)
	const sorted = [...points].sort((a, b) => b.w - a.w)
	const centroids = [sorted[0].lab.slice()]
	while (centroids.length < K) {
		let bestP = null
		let bestScore = -1
		for (const p of sorted) {
			const dMin = Math.min(...centroids.map((c) => dist2(c, p.lab)))
			const score = dMin * p.w
			if (score > bestScore) {
				bestScore = score
				bestP = p
			}
		}
		centroids.push(bestP.lab.slice())
	}

	const assign = new Array(points.length).fill(0)
	for (let iter = 0; iter < 16; iter++) {
		let moved = 0
		points.forEach((p, i) => {
			let best = 0
			let bestD = Infinity
			centroids.forEach((c, k) => {
				const d = dist2(c, p.lab)
				if (d < bestD) {
					bestD = d
					best = k
				}
			})
			if (assign[i] !== best) moved++
			assign[i] = best
		})
		const sums = centroids.map(() => [0, 0, 0, 0])
		points.forEach((p, i) => {
			const s = sums[assign[i]]
			s[0] += p.lab[0] * p.w
			s[1] += p.lab[1] * p.w
			s[2] += p.lab[2] * p.w
			s[3] += p.w
		})
		sums.forEach((s, k) => {
			if (s[3] > 0) centroids[k] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]
		})
		if (!moved && iter > 0) break
	}

	const mass = centroids.map(() => 0)
	points.forEach((p, i) => (mass[assign[i]] += p.w))
	const total = mass.reduce((a, b) => a + b, 0)

	let pick = 0
	let pickScore = -1
	centroids.forEach((c, k) => {
		const chroma = Math.hypot(c[1], c[2])
		const hue = ((Math.atan2(c[2], c[1]) * 180) / Math.PI + 360) % 360
		// OKLab hue → rough sRGB-hue equivalence for the warm band (oklab ~30°..110°)
		const warm = hue >= 25 && hue <= 115 ? 1 : hue > 115 && hue <= 135 ? 0.6 : 0.25
		const score = (mass[k] / total) * (0.4 + chroma * 5) * warm
		if (score > pickScore) {
			pickScore = score
			pick = k
		}
	})

	const [L, a, b] = centroids[pick]
	const rgb = oklabToRgb(L, a, b)
	const C = Math.hypot(a, b)
	const H = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
	return {
		rgb,
		hex: toHex(rgb),
		oklch: [round(L, 4), round(C, 4), round(H, 2)],
		share: round(mass[pick] / total, 3),
	}
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d

// ---------------------------------------------------------------------------

async function main() {
	const files = (await readdir(tastingsDir)).filter((f) => f.endsWith(".md")).sort()
	const out = {}
	let sampled = 0
	let skipped = 0

	for (const file of files) {
		const slug = slugify(file)
		const md = await readFile(path.join(tastingsDir, file), "utf8")
		const images = parseImages(md)
		const choice = pickLiquorImage(images)
		if (!choice) {
			skipped++
			if (verbose) console.log(`- ${slug}: ${images.length ? "no liquor photo" : "no images"}`)
			continue
		}
		const abs = await resolveImage(choice.image)
		if (!abs) {
			skipped++
			const remote = /^https?:\/\//i.test(choice.image)
			if (verbose || !remote) {
				console.warn(`! ${slug}: ${remote ? "remote (pass --remote)" : "missing file"} ${choice.image}`)
			}
			continue
		}
		try {
			const color = await sampleLiquor(abs)
			if (!color) {
				skipped++
				if (verbose) console.log(`- ${slug}: no saturated pixels in ${choice.image}`)
				continue
			}
			out[slug] = {
				hex: color.hex,
				rgb: color.rgb,
				oklch: color.oklch,
				source: choice.image,
				alt: choice.alt,
				confidence: choice.confidence,
			}
			sampled++
			if (verbose) {
				console.log(
					`${color.hex} ${slug.padEnd(48)} ${choice.confidence.padEnd(8)} "${choice.alt}" (${Math.round(color.share * 100)}%)`
				)
			}
		} catch (err) {
			skipped++
			console.warn(`! ${slug}: ${err.message}`)
		}
	}

	await mkdir(path.dirname(outFile), { recursive: true })
	const sortedOut = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
	// keep number tuples on one line for readable diffs
	const json = JSON.stringify(sortedOut, null, "\t").replace(
		/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g,
		(_, nums) => `[${nums.split(/,\s*/).join(", ")}]`
	)
	await writeFile(outFile, json + "\n")
	console.log(
		`liquor colors: ${sampled} sampled, ${skipped} skipped → ${path.relative(appRoot, outFile)}`
	)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
