import { chromium } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

// Real pointer clicks; measure each click's following 600 ms independently. An
// interaction-wide median can hide a 100 ms stall among many idle 8.3 ms frames.
const url = process.argv[2] || "http://localhost:3000/vendors/"
const output = path.resolve(process.argv[3] || ".cache/explorer-perf/latest.json")
const browser = await chromium.launch({
	channel: process.env.PW_CHANNEL || "msedge",
	headless: false,
})
try {
	const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
	const errors = []
	page.on("pageerror", (error) => errors.push(error.message))
	await page.goto(url)
	const track = page.getByRole("group", { name: "Filter by vintage" })
	await track.waitFor()
	await page.waitForTimeout(1200)
	await page.evaluate(() => {
		window.__explorerPerf = { running: true, frames: [], clicks: [], tasks: [] }
		const state = window.__explorerPerf
		let prev
		const frame = (t) => {
			if (prev !== undefined) state.frames.push({ t, dt: t - prev })
			prev = t
			if (state.running) requestAnimationFrame(frame)
		}
		requestAnimationFrame(frame)
		document.addEventListener("pointerdown", () => state.clicks.push(performance.now()), true)
		new PerformanceObserver((list) =>
			state.tasks.push(
				...list.getEntries().map((entry) => ({ start: entry.startTime, duration: entry.duration }))
			)
		).observe({ type: "longtask" })
	})
	const box = await track.boundingBox()
	for (const fraction of [0.4, 0.75, 0.05]) {
		await track.click({ position: { x: box.width * fraction, y: box.height / 2 } })
		await page.waitForTimeout(650)
		await page.getByRole("button", { name: /Remove filter vintage:/ }).click()
		await page.waitForTimeout(650)
	}
	const result = await page.evaluate(() => {
		const state = window.__explorerPerf
		state.running = false
		return {
			clicks: state.clicks.map((start, index) => {
				const frames = state.frames
					.filter((frame) => frame.t >= start && frame.t < start + 600)
					.map((frame) => frame.dt)
					.sort((a, b) => a - b)
				return {
					action: index % 2 ? "clear vintage" : "select vintage",
					frames: frames.length,
					p95Ms: frames[Math.floor(frames.length * 0.95)],
					worstMs: frames.at(-1),
					framesOver25Ms: frames.filter((dt) => dt > 25).length,
					longTasks: state.tasks.filter(
						(task) => task.start < start + 600 && task.start + task.duration >= start
					),
				}
			}),
			lists: [...document.querySelectorAll("#explorer-view-panel [data-virtual-list]")].map(
				(list) => ({
					logicalRows: Number(list.getAttribute("data-virtual-total")),
					renderedRows: list.children.length,
				})
			),
		}
	})
	await mkdir(path.dirname(output), { recursive: true })
	await writeFile(
		output,
		JSON.stringify({ url, viewport: "1600x1000", ...result, errors }, null, 2)
	)
	console.log(JSON.stringify({ ...result, errors }, null, 2))
} finally {
	await browser.close()
}
