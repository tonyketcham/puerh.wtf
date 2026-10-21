import { expect, test, type Locator, type Page } from "@playwright/test"

test.use({ viewport: { width: 1440, height: 900 } })

test("terrain falls back to the page when workers fail to start", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" })
	await page.addInitScript(() => {
		const state = window as typeof window & { terrainWorkerLoads: string[] }
		state.terrainWorkerLoads = []
		class FailedWorker extends EventTarget {
			timer: number | undefined
			postMessage(message: { type: string; url?: string }) {
				if (message.type !== "load" || !message.url) return
				state.terrainWorkerLoads.push(message.url)
				// Fail after the renderer has sent its initial loads, as a script load error does.
				this.timer ??= window.setTimeout(
					() =>
						this.dispatchEvent(new ErrorEvent("error", { message: "Worker script unavailable" })),
					0
				)
			}
			terminate() {
				window.clearTimeout(this.timer)
			}
		}
		window.Worker = FailedWorker as unknown as typeof Worker
	})
	const loaded = new Set<string>()
	page.on("response", (response) => {
		if (response.ok()) loaded.add(new URL(response.url()).pathname)
	})
	await page.goto("/origins?at=yiwu")
	const map = page.locator("[data-origins-map=index]")
	await expect(map).toBeVisible()
	// A canvas with only the graticule is not a recovered map: the page must fetch a sheet
	// that was previously requested only in the failed workers, then paint visible terrain.
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as typeof window & { terrainWorkerLoads: string[] }).terrainWorkerLoads
			)
		)
		.not.toHaveLength(0)
	const workerLoads = await page.evaluate(
		() => (window as typeof window & { terrainWorkerLoads: string[] }).terrainWorkerLoads
	)
	await expect
		.poll(() => workerLoads.some((url) => loaded.has(url)), { timeout: 15_000 })
		.toBe(true)
	await expect
		.poll(
			() =>
				map.locator("canvas[data-terrain-area]").evaluateAll((canvases) => {
					return canvases.some((element) => {
						const canvas = element as HTMLCanvasElement
						if (!canvas.width || !canvas.height) return false
						const data = canvas
							.getContext("2d")!
							.getImageData(0, 0, canvas.width, canvas.height).data
						let opaque = 0
						for (let i = 3; i < data.length; i += 4) if (data[i] > 128) opaque++
						return opaque > canvas.width * canvas.height * 0.25
					})
				}),
			{ timeout: 15_000 }
		)
		.toBe(true)
})

/** Real pointer input, with positions sampled during the drag rather than after the camera rests. */
async function panLabelPositions(page: Page, map: Locator, kind: "ticks" | "supply") {
	const start = await map.evaluate((root, kind) => {
		const state = window as typeof window & { mapPanPositions: number[][] }
		state.mapPanPositions = []
		root.addEventListener("pointermove", () => {
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					const bounds = root.getBoundingClientRect()
					const labels = Array.from(
						root.querySelectorAll<HTMLElement>(kind === "ticks" ? ".map-tick" : ".map-label")
					)
					const positions = labels.flatMap((label) => {
						if (getComputedStyle(label).visibility === "hidden") return []
						const r = label.getBoundingClientRect()
						if (kind === "ticks")
							return [
								label.dataset.axis === "lon" ? r.top - bounds.top - 4 : r.left - bounds.left - 4,
							]
						const arrow = label.textContent?.trim()[0]
						if (arrow === "←") return [r.left - bounds.left - 10]
						if (arrow === "→") return [bounds.right - r.right - 10]
						if (arrow === "↑") return [r.top - bounds.top - 32]
						if (arrow === "↓") return [bounds.bottom - r.bottom - 36]
						return []
					})
					if (positions.length) state.mapPanPositions.push(positions)
				})
			)
		})
		const r = root.getBoundingClientRect()
		for (const y of [0.4, 0.6, 0.3, 0.7])
			for (const x of [0.35, 0.65, 0.5]) {
				const px = r.left + x * r.width
				const py = r.top + y * r.height
				const el = document.elementFromPoint(px, py)
				if (
					el &&
					root.contains(el) &&
					!el.closest("a, button, input, select, textarea, [data-map-ui]")
				)
					return { x: px, y: py }
			}
		throw new Error("No clear map surface to pan")
	}, kind)
	const longitude = map.locator(".map-tick[data-axis=lon]:visible").first()
	const initialX = await longitude.evaluate((el) => el.getBoundingClientRect().left)
	await page.mouse.move(start.x, start.y)
	await page.mouse.down()
	try {
		for (let i = 1; i <= 8; i++) {
			await page.mouse.move(start.x + i * 7, start.y + i * 8)
			await page.evaluate(() => new Promise(requestAnimationFrame))
		}
		await page.evaluate(
			() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
		)
		const finalX = await longitude.evaluate((el) => el.getBoundingClientRect().left)
		expect(Math.abs(finalX - initialX)).toBeGreaterThan(20)
		return await page.evaluate(
			() => (window as typeof window & { mapPanPositions: number[][] }).mapPanPositions
		)
	} finally {
		await page.mouse.up()
	}
}

test("degree labels stay on their map edges while panning", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" })
	await page.goto("/origins?at=yiwu")
	const map = page.locator("[data-origins-map=index]")
	await expect(map.locator(".map-tick[data-axis=lon]:visible").first()).toBeVisible()
	await expect(map.locator(".map-tick[data-axis=lat]:visible").first()).toBeVisible()
	const samples = await panLabelPositions(page, map, "ticks")
	expect(samples.length).toBeGreaterThan(0)
	expect(samples.flat().every((offset) => Math.abs(offset) < 1)).toBe(true)
})

test("supply labels stay on their map edges while panning", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" })
	await page.goto("/origins?at=yiwu")
	const map = page.locator("[data-origins-map=index]")
	await page
		.getByRole("group", { name: "Map layers" })
		.getByRole("button", { name: "supply lines", exact: true })
		.click()
	await expect(map).toBeVisible()
	await expect(map.locator(".map-label").filter({ hasText: /^← Tea Encounter/ })).toBeVisible()
	const samples = await panLabelPositions(page, map, "supply")
	expect(samples.length).toBeGreaterThan(0)
	expect(samples.flat().every((offset) => Math.abs(offset) < 1)).toBe(true)
})

test("origin map controls zoom and return to Yunnan", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" })
	await page.goto("/origins?at=yiwu")
	const map = page.locator("[data-origins-map=index]")
	const view = map.locator("[data-map-pane] > svg")
	const width = async () => Number((await view.getAttribute("viewBox"))?.split(" ")[2])
	await expect.poll(width).toBeGreaterThan(0)
	const original = await width()
	await map.getByRole("button", { name: "Zoom out (−)", exact: true }).click()
	await expect.poll(width).toBeGreaterThan(original * 1.5)
	await map.getByRole("button", { name: "Zoom in (+)", exact: true }).click()
	await expect.poll(width).toBeLessThan(original * 1.2)
	await map.getByRole("button", { name: "Back to Yunnan", exact: true }).click()
	await expect.poll(width).toBeGreaterThan(original * 4)
})
