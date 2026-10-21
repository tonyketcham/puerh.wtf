/**
 * Organic edge masks (plan §4.7.2, v3): where a finer layer gives way to the coarser one beneath,
 * the edge follows the union of the origins' areas instead of a feathered rectangle.
 *
 * The coverage field is a metaball sum: each disk adds a Gaussian lowered to reach exactly zero at
 * its radius (so nothing leaks past the disk, and so past the data), then a smoothstep makes a
 * plateau inside and a soft rim. Close disks merge into one smooth shape with no crease; nothing
 * has a corner. It is rasterized at about 1 km per px into an 8-bit grayscale PNG, registered to
 * a rect in shared units; the runtime scales it over the layer with smoothing and composites it
 * with destination-in.
 */
import { readFile } from "node:fs/promises"
import { PNG } from "pngjs"
import { unitsPerKmAt } from "./cells.mjs"
import { round, writeBinary } from "./util.mjs"

/**
 * Disks for a coverage field, in shared units: { point: [x, y], r } with r = (R − insetKm) km.
 * @param {{ point: number[], km: number, lat: number }[]} disks
 */
export function fieldDisks(disks, scale, insetKm) {
	return disks
		.map((d) => ({ point: d.point, r: Math.max(0, d.km - insetKm) * unitsPerKmAt(scale, d.lat) }))
		.filter((d) => d.r > 0)
}

/**
 * The coverage field 0..1 at a point (shared units).
 * @param {{ point: number[], r: number }[]} disks
 * @param {{ sigmaFrac: number, lo: number, hi: number }} params
 */
export function coverageField(disks, { sigmaFrac, lo, hi }) {
	const floor = Math.exp(-1 / (2 * sigmaFrac * sigmaFrac))
	const terms = disks.map(({ point: [x, y], r }) => ({
		x,
		y,
		r2: r * r,
		k: 1 / (2 * (sigmaFrac * r) ** 2),
	}))
	return (px, py) => {
		let sum = 0
		for (const t of terms) {
			const d2 = (px - t.x) ** 2 + (py - t.y) ** 2
			if (d2 >= t.r2) continue
			sum += (Math.exp(-d2 * t.k) - floor) / (1 - floor)
		}
		if (sum <= lo) return 0
		if (sum >= hi) return 1
		const u = (sum - lo) / (hi - lo)
		return u * u * (3 - 2 * u)
	}
}

/**
 * Rasterize a field over `rect` ([x, y, w, h], shared units) at about `unitsPerPx`: values at
 * pixel centres, 0–255. The image maps exactly onto `rect` (pixels a hair off square).
 */
export function rasterMask(rect, unitsPerPx, field) {
	const [x, y, w, h] = rect
	const width = Math.max(2, Math.ceil(w / unitsPerPx))
	const height = Math.max(2, Math.ceil(h / unitsPerPx))
	const data = new Uint8Array(width * height)
	for (let j = 0; j < height; j++) {
		const py = y + ((j + 0.5) * h) / height
		for (let i = 0; i < width; i++) {
			data[j * width + i] = Math.round(field(x + ((i + 0.5) * w) / width, py) * 255)
		}
	}
	return { rect, width, height, data }
}

/** Whether a raster mask shows anything inside `box` ([x, y, w, h]; bilinear reach included) */
export function maskTouches({ rect: [x, y, w, h], width, height, data }, [bx, by, bw, bh]) {
	const sx = width / w
	const sy = height / h
	const i0 = Math.max(0, Math.floor((bx - x) * sx - 1))
	const i1 = Math.min(width - 1, Math.ceil((bx + bw - x) * sx))
	const j0 = Math.max(0, Math.floor((by - y) * sy - 1))
	const j1 = Math.min(height - 1, Math.ceil((by + bh - y) * sy))
	for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (data[j * width + i]) return true
	return false
}

/**
 * Frame mask disks: members with a disk of min(radius_km, capKm) + padKm, each shrunk to stay
 * inside the frame's viewBox (the frame has no data past it, and an edge there would be straight).
 */
export function frameDisks(members, viewBox, { capKm, padKm }, project, scale) {
	const [vx, vy, vw, vh] = viewBox
	return members.map((o) => {
		const point = project([o.geo.lon, o.geo.lat])
		const upk = unitsPerKmAt(scale, o.geo.lat)
		const edge =
			Math.min(point[0] - vx, vx + vw - point[0], point[1] - vy, vy + vh - point[1]) / upk
		const km = Math.max(0, Math.min(Math.min(o.geo.radius_km ?? 0, capKm) + padKm, edge * 0.98))
		return { slug: o.slug, point, km, lat: o.geo.lat }
	})
}

/** 8-bit grayscale PNG */
export function encodeMask({ width, height, data }) {
	const png = new PNG({ width, height, colorType: 0, inputColorType: 0, bitDepth: 8 })
	png.data = Buffer.from(data)
	return PNG.sync.write(png, { colorType: 0, inputColorType: 0, bitDepth: 8 })
}

/**
 * Write a mask PNG unless the file there already holds the same pixels: zlib's output can differ
 * between Node builds and CPUs, so pixels, not bytes, decide whether the file changes (§4.3.1).
 * @returns {Promise<number>} bytes on disk
 */
export async function writeMask(file, mask) {
	try {
		const old = PNG.sync.read(await readFile(file))
		if (old.width === mask.width && old.height === mask.height) {
			let same = true
			for (let i = 0; i < mask.data.length && same; i++) same = old.data[i * 4] === mask.data[i]
			if (same) return (await readFile(file)).length
		}
	} catch {
		// missing or unreadable: write it
	}
	const buf = encodeMask(mask)
	await writeBinary(file, buf)
	return buf.length
}

/** A mask's pixels as rows of hex (every `step`-th), for the geo:test snapshot */
export function maskRows({ width, height, data }, step = 1) {
	const rows = []
	for (let j = 0; j < height; j += step) {
		let row = ""
		for (let i = 0; i < width; i += step) row += data[j * width + i].toString(16).padStart(2, "0")
		rows.push(row)
	}
	return rows
}

/** The manifest's record of a mask */
export const maskMeta = (url, mask, bytes) => ({
	url,
	rect: mask.rect.map((v) => round(v, 2)),
	size: [mask.width, mask.height],
	bytes,
})
