import { expect, test, type Page } from "@playwright/test"

const earliest = (page: Page) => page.getByRole("slider", { name: "Earliest vintage" })
const latest = (page: Page) => page.getByRole("slider", { name: "Latest vintage" })
const years = (page: Page) => new URL(page.url()).searchParams.get("years")

test.use({ viewport: { width: 1600, height: 1000 } })

for (const reducedMotion of ["no-preference", "reduce"] as const) {
	test.describe(`Vintage ruler (${reducedMotion})`, () => {
		test.beforeEach(async ({ page }) => {
			await page.emulateMedia({ reducedMotion })
			await page.goto("/")
			await expect(earliest(page)).toBeVisible()
			// The responsive Explorer initially hydrates as an inert drawer, then docks.
			await expect
				.poll(() => earliest(page).evaluate((element) => !!element.closest("[inert]")))
				.toBe(false)
		})

		test("keyboard range, filtering and clearing keep the URL and sliders in sync", async ({
			page,
		}) => {
			const min = await earliest(page).getAttribute("aria-valuemin")
			const max = await latest(page).getAttribute("aria-valuemax")
			await earliest(page).focus()
			await page.keyboard.press("End")
			await expect.poll(() => years(page)).toBe(max)
			await expect(earliest(page)).toHaveAttribute("aria-valuenow", max!)
			await expect(page.locator(".ft-row").last()).toContainText(max!)
			await page.keyboard.press("Home")
			await expect.poll(() => years(page)).toBeNull()
			await latest(page).focus()
			await page.keyboard.press("Home")
			await expect.poll(() => years(page)).toBe(min)
			await page.keyboard.press("ArrowRight")
			await expect.poll(() => years(page)?.split(",").length).toBe(2)
			await page.keyboard.press("PageUp")
			await expect.poll(() => years(page)?.split(",").length).toBe(7)
			await page.keyboard.press("Escape")
			await expect.poll(() => years(page)).toBeNull()
			await expect(earliest(page)).toHaveAttribute("aria-valuenow", min!)
			await expect(latest(page)).toHaveAttribute("aria-valuenow", max!)
		})

		test("drag filters live, finishes on the last sample, and does not replay readout blur", async ({
			page,
		}) => {
			const track = page.getByRole("group", { name: "Filter by vintage" })
			const box = (await track.boundingBox())!
			const readout = page.locator(`[id="${await track.getAttribute("aria-describedby")}"]`)
			await expect(readout).toHaveCSS("filter", "none")
			const handle = (await earliest(page).boundingBox())!
			await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
			await page.mouse.down()
			await page.mouse.move(box.x + box.width * 0.55, box.y + box.height / 2, { steps: 15 })
			await expect.poll(() => years(page)).not.toBeNull()
			await expect(readout).toHaveCSS("filter", "none")
			const value = await earliest(page).getAttribute("aria-valuenow")
			expect(Number(value)).toBeGreaterThan(
				Number(await earliest(page).getAttribute("aria-valuemin"))
			)
			await page.mouse.move(box.x + box.width * 0.72, box.y + box.height / 2)
			await page.mouse.up()
			await expect
				.poll(() => years(page)?.split(",")[0])
				.toBe(await earliest(page).getAttribute("aria-valuenow"))
			await expect(page.getByRole("button", { name: /Remove filter vintage:/ })).toBeVisible()
			await page.getByRole("button", { name: /Remove filter vintage:/ }).click()
			await expect.poll(() => years(page)).toBeNull()
		})

		test("the handle follows sub-vintage motion, resists overscroll and snaps only on release", async ({
			page,
		}) => {
			const slider = earliest(page)
			const initial = (await slider.boundingBox())!
			const value = await slider.getAttribute("aria-valuenow")
			const x = initial.x + initial.width / 2
			const y = initial.y + initial.height / 2
			await page.mouse.move(x, y)
			await page.mouse.down()
			// Motion within a vintage's snap interval must still follow the pointer.
			await page.mouse.move(x + 5, y)
			await expect
				.poll(async () => (await slider.boundingBox())!.x - initial.x)
				.toBeGreaterThan(4.5)
			await expect(slider).toHaveAttribute("aria-valuenow", value!)
			await page.mouse.move(x - 60, y)
			await expect.poll(async () => (await slider.boundingBox())!.x).toBeLessThan(initial.x - 1)
			expect((await slider.boundingBox())!.x).toBeGreaterThan(initial.x - 15)
			await page.mouse.up()
			await expect
				.poll(async () => Math.abs((await slider.boundingBox())!.x - initial.x))
				.toBeLessThan(0.5)
			await expect.poll(() => years(page)).toBeNull()
		})

		test("brush, shift-click and double-click retain their selection behavior", async ({
			page,
		}) => {
			const track = page.getByRole("group", { name: "Filter by vintage" })
			const box = (await track.boundingBox())!
			await track.click({ position: { x: box.width * 0.4, y: box.height / 2 } })
			await expect.poll(() => years(page)?.split(",").length).toBe(1)
			await track.click({
				position: { x: box.width * 0.8, y: box.height / 2 },
				modifiers: ["Shift"],
			})
			await expect.poll(() => years(page)?.split(",").length ?? 0).toBeGreaterThan(1)
			await track.dblclick({ position: { x: box.width * 0.6, y: box.height / 2 } })
			await expect.poll(() => years(page)).toBeNull()
			await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2)
			await page.mouse.down()
			await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 12 })
			await page.mouse.up()
			await expect.poll(() => years(page)?.split(",").length ?? 0).toBeGreaterThan(1)
		})
	})
}
