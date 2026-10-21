/**
 * Step 3: stitch tiles into one Float32Array of meters, then blur.
 */
import { tilesFor } from "./tiles.mjs"

const TILE = 256

/**
 * @param {{ z: number, left: number, top: number, width: number, height: number }} win
 * @param {{ read: (tile) => Promise<Float32Array> }} source
 * @param {(tile: { z: number, x: number, y: number }) => boolean} [has] tiles to read; the others
 *   are left as NaN (no data), which `blur` skips and then fills (see blurGaps)
 */
export async function stitch(win, source, has = null) {
	const { left, top, width, height } = win
	const values = new Float32Array(width * height)
	if (has) values.fill(NaN)
	for (const tile of tilesFor(win)) {
		if (has && !has(tile)) continue
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

/** Separable Gaussian blur, edge-clamped. Returns a new grid. NaN cells (no data): see blurGaps. */
export function blur(grid, sigma) {
	if (!sigma) return grid
	if (grid.values.some(Number.isNaN)) return blurGaps(grid, sigma)
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

/**
 * The blur of a grid with holes (NaN): a normalized convolution, so data next to a hole is
 * averaged over the data only and nothing bleeds in from the hole. Then each hole pixel takes the
 * value of the nearest data (breadth-first, in index order, so it is deterministic): contours
 * that reach a hole run on into it as near-straight lines instead of closing along its edge,
 * which would add a ring per band (and bands the ground never reaches).
 */
function blurGaps(grid, sigma) {
	const { width: w, height: h, values } = grid
	const { k, radius } = kernel(sigma)
	const pass = (src, wsrc, horizontal) => {
		const out = new Float32Array(w * h)
		const wout = new Float32Array(w * h)
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let acc = 0
				let wt = 0
				for (let i = -radius; i <= radius; i++) {
					const xx = horizontal ? Math.min(w - 1, Math.max(0, x + i)) : x
					const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + i))
					const j = yy * w + xx
					const ww = wsrc[j] * k[i + radius]
					if (ww > 0) {
						acc += src[j] * ww
						wt += ww
					}
				}
				out[y * w + x] = wt > 0 ? acc / wt : 0
				wout[y * w + x] = wt
			}
		}
		return [out, wout]
	}
	const v0 = new Float32Array(w * h)
	const w0 = new Float32Array(w * h)
	for (let i = 0; i < values.length; i++) {
		const ok = !Number.isNaN(values[i])
		v0[i] = ok ? values[i] : 0
		w0[i] = ok ? 1 : 0
	}
	const [v1, w1] = pass(v0, w0, true)
	const [v2] = pass(v1, w1, false)
	const queue = new Int32Array(w * h)
	const done = new Uint8Array(w * h)
	let head = 0
	let tail = 0
	for (let i = 0; i < values.length; i++)
		if (w0[i] > 0) {
			done[i] = 1
			queue[tail++] = i
		}
	if (!tail) return { ...grid, values: v2 }
	while (head < tail) {
		const i = queue[head++]
		const x = i % w
		for (const j of [i - w, i - 1, i + 1, i + w]) {
			if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1) || j < 0 || j >= w * h) continue
			if (done[j]) continue
			done[j] = 1
			v2[j] = v2[i]
			queue[tail++] = j
		}
	}
	return { ...grid, values: v2 }
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
