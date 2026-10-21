import { expect, test, type Locator } from "@playwright/test"

/** How many of the canvas's pixels carry ink. */
async function inked(canvas: Locator) {
	return canvas.evaluate((c: HTMLCanvasElement) => {
		const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data
		let n = 0
		for (let i = 3; i < d.length; i += 4) if (d[i]) n++
		return n
	})
}

test.describe("Home page teaware drawing", () => {
	// no spin and no draw-on, so frames hold still between assertions
	test.beforeEach(({ page }) => page.emulateMedia({ reducedMotion: "reduce" }))

	test("draws each vessel and links it to its page", async ({ page }) => {
		await page.goto("/")
		const fig = page.locator("[data-recording-key=teaware-drawing]")
		const canvas = fig.locator("canvas")
		await expect(fig.getByRole("tab")).toHaveCount(5)
		await expect.poll(() => inked(canvas)).toBeGreaterThan(2000)

		await fig.getByRole("tab", { name: "shuiping" }).click()
		await expect(fig.getByRole("tab", { name: "shuiping" })).toHaveAttribute("aria-selected", "true")
		await expect(fig.getByRole("link", { name: "Hongni Shuiping" })).toHaveAttribute(
			"href",
			/^\/teaware\/hongni-shuiping\/?$/
		)
		await expect(fig.locator("figcaption")).toContainText("90 ml")
		await expect.poll(() => inked(canvas)).toBeGreaterThan(2000)

		// the cups have no vessel page: a plain caption, no lid to lift
		await fig.getByRole("tab", { name: "cups" }).click()
		await expect(fig.locator("figcaption")).toContainText("Tea cups")
		await expect(fig.getByRole("link")).toHaveCount(0)
	})

	test("a click lifts the lid and a second seats it", async ({ page }) => {
		await page.goto("/")
		const fig = page.locator("[data-recording-key=teaware-drawing]")
		const canvas = fig.locator("canvas")
		await expect.poll(() => inked(canvas)).toBeGreaterThan(2000)
		const seated = await canvas.screenshot()
		await canvas.click()
		await expect.poll(async () => (await canvas.screenshot()).equals(seated)).toBe(false)
		const lifted = await canvas.screenshot()
		await canvas.click()
		await expect.poll(async () => (await canvas.screenshot()).equals(lifted)).toBe(false)
	})
})
