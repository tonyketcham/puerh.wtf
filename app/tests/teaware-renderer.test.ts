import { expect, test } from "@playwright/test"
import { Renderer } from "../src/lib/components/teaware-drawing/render"
import { DRAWINGS } from "../src/lib/components/teaware-drawing/vessels"

type Projection = { x: Float32Array; y: Float32Array; d: Float32Array }
type DepthRenderer = { w: number; h: number; zbuf: Float32Array; tri: typeof referenceTriangle }

/** Independent per-pixel reference for the incremental rasterizer. */
function referenceTriangle(this: DepthRenderer, p: Projection, a: number, b: number, c: number) {
	const ax = p.x[a],
		ay = p.y[a],
		bx = p.x[b],
		by = p.y[b],
		cx = p.x[c],
		cy = p.y[c]
	const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
	if (Math.abs(area) < 1e-6) return
	for (
		let y = Math.max(0, Math.floor(Math.min(ay, by, cy)));
		y <= Math.min(this.h - 1, Math.ceil(Math.max(ay, by, cy)));
		y++
	) {
		for (
			let x = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
			x <= Math.min(this.w - 1, Math.ceil(Math.max(ax, bx, cx)));
			x++
		) {
			const px = x + 0.5,
				py = y + 0.5
			const u = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area
			const v = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area
			const w = 1 - u - v
			if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue
			const k = y * this.w + x
			this.zbuf[k] = Math.min(this.zbuf[k], u * p.d[a] + v * p.d[b] + w * p.d[c])
		}
	}
}

function recordingRenderer() {
	const calls: unknown[] = []
	const ctx = new Proxy(
		{},
		{
			get: (_, key) =>
				key === "measureText"
					? (s: string) => ({ width: s.length * 6 })
					: (...args: unknown[]) => calls.push([key, ...args]),
			set: (_, key, value) => {
				calls.push([key, value])
				return true
			},
		}
	)
	const renderer = new Renderer({ getContext: () => ctx } as unknown as HTMLCanvasElement, {
		accent: "#edc446",
		cream: "255 242 202",
		font: "10px monospace",
	})
	renderer.resize(600, 420, 1)
	return { renderer, calls }
}

test("optimized depth tests preserve every inked path across all five drawings and camera poses", () => {
	for (const drawing of DRAWINGS) {
		const model = drawing.build()
		const fast = recordingRenderer()
		const reference = recordingRenderer()
		;(reference.renderer as unknown as DepthRenderer).tri = referenceTriangle
		fast.renderer.setModel(model)
		reference.renderer.setModel(model)
		for (const [yaw, pitch, explode, reveal] of [
			[-0.42, 0.42, 0, 1.15],
			[1.3, 0.02, 1, 1.15],
			[-2.7, 1.15, 0.5, 1.15],
			[0, 0.7, 0, 0.5],
			[Math.PI, 0.3, 0.7, 1.15],
		]) {
			fast.calls.length = reference.calls.length = 0
			const view = { yaw, pitch, explode, reveal, alpha: 1 }
			fast.renderer.draw(view, false)
			reference.renderer.draw(view, false)
			expect(fast.calls, `${drawing.id} at ${yaw}, ${pitch}, ${explode}, ${reveal}`).toEqual(
				reference.calls
			)
		}
	}
})
