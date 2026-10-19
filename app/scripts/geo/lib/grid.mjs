/**
 * Step 3: stitch tiles into one Float32Array of meters, then blur.
 */
import { tilesFor } from "./tiles.mjs"

const TILE = 256

/**
 * @param {{ z: number, left: number, top: number, width: number, height: number }} win
 * @param {{ read: (tile) => Promise<Float32Array> }} source
 */
export async function stitch(win, source) {
	const { left, top, width, height } = win
	const values = new Float32Array(width * height)
	for (const tile of tilesFor(win)) {
		const data = await source.read(tile)
		const ox = tile.tx * TILE - left
		const oy = tile.y * TILE - top
		const x0 = Math.max(0, ox)
		const x1 = Math.min(width, ox + TILE)
		const y0 = Math.max(0, oy)
		const y1 = Math.min(height, oy + TILE)
		for (let y = y0; y < y1; y++) {
			const src = (y - oy) * TILE - ox
			const dst = y * width
			for (let x = x0; x < x1; x++) values[dst + x] = data[src + x]
		}
	}
	// The sea floor would drag coastal contours offshore once blurred; land is all we draw.
	for (let i = 0; i < values.length; i++) if (values[i] < 0) values[i] = 0
	return { ...win, values }
}

function kernel(sigma) {
	const radius = Math.max(1, Math.ceil(sigma * 3))
	const k = new Float64Array(radius * 2 + 1)
	let sum = 0
	for (let i = -radius; i <= radius; i++) {
		k[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma))
		sum += k[i + radius]
	}
	for (let i = 0; i < k.length; i++) k[i] /= sum
	return { k, radius }
}

/** Separable Gaussian blur, edge-clamped. Returns a new grid. */
export function blur(grid, sigma) {
	if (!sigma) return grid
	const { width: w, height: h, values } = grid
	const { k, radius } = kernel(sigma)
	const tmp = new Float32Array(w * h)
	const out = new Float32Array(w * h)
	for (let y = 0; y < h; y++) {
		const row = y * w
		for (let x = 0; x < w; x++) {
			let acc = 0
			for (let i = -radius; i <= radius; i++) {
				const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i
				acc += values[row + xx] * k[i + radius]
			}
			tmp[row + x] = acc
		}
	}
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let acc = 0
			for (let i = -radius; i <= radius; i++) {
				const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i
				acc += tmp[yy * w + x] * k[i + radius]
			}
			out[y * w + x] = acc
		}
	}
	return { ...grid, values: out }
}

/** Bilinear sample at a global pixel coordinate (pixel centers at +0.5) */
export function sample(grid, gx, gy) {
	const { width: w, height: h, values, left, top } = grid
	const fx = Math.min(w - 1, Math.max(0, gx - left - 0.5))
	const fy = Math.min(h - 1, Math.max(0, gy - top - 0.5))
	const x0 = Math.floor(fx)
	const y0 = Math.floor(fy)
	const x1 = Math.min(w - 1, x0 + 1)
	const y1 = Math.min(h - 1, y0 + 1)
	const tx = fx - x0
	const ty = fy - y0
	const a = values[y0 * w + x0] * (1 - tx) + values[y0 * w + x1] * tx
	const b = values[y1 * w + x0] * (1 - tx) + values[y1 * w + x1] * tx
	return a * (1 - ty) + b * ty
}

export function extent(values) {
	let min = Infinity
	let max = -Infinity
	for (const v of values) {
		if (v < min) min = v
		if (v > max) max = v
	}
	return [min, max]
}
