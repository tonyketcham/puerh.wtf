import { expect, test, type Page } from "@playwright/test"

const earliest = (page: Page) => page.getByRole("slider", { name: "Earliest vintage" })
const years = (page: Page) => new URL(page.url()).searchParams.get("years")
const vintageToken = (page: Page) => page.getByRole("button", { name: /Remove filter vintage:/ })

test.use({ viewport: { width: 1600, height: 1000 } })

test("a fresh load seeds query and facets, and sharing preserves unrelated params and hashes", async ({
	page,
}) => {
	await page.goto("/vendors/?years=2018&vendors=white2tea&q=sheng&at=yiwu#shared")
	await expect(earliest(page)).toHaveAttribute("aria-valuenow", "2018")
	await expect(vintageToken(page)).toBeVisible()
	await expect(page.getByRole("button", { name: "Remove filter vendor: white2tea" })).toBeVisible()
	await expect(page.getByRole("button", { name: /Remove filter find:.*sheng/ })).toBeVisible()
	await vintageToken(page).click()
	await expect.poll(() => years(page)).toBeNull()
	const shared = new URL(page.url())
	expect(shared.searchParams.get("vendors")).toBe("white2tea")
	expect(shared.searchParams.get("q")).toBe("sheng")
	expect(shared.searchParams.get("at")).toBe("yiwu")
	expect(shared.hash).toBe("#shared")
	await page.reload()
	await expect(page.getByRole("button", { name: "Remove filter vendor: white2tea" })).toBeVisible()
	await expect(vintageToken(page)).toHaveCount(0)
})

test("live input updates immediately and coalesces URL writes outside the router", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const original = History.prototype.replaceState
		Object.assign(window, { filterUrlWrites: [] })
		History.prototype.replaceState = function (state, unused, url) {
			;(window as unknown as { filterUrlWrites: string[] }).filterUrlWrites.push(String(url))
			return original.call(this, state, unused, url)
		}
	})
	await page.goto("/vendors/")
	await expect(earliest(page)).toBeVisible()
	await page.waitForTimeout(400)
	await page.evaluate(() => {
		Object.assign(window, { filterUrlWrites: [], routerUrlWrites: 0 })
		const patched = window.history.replaceState
		window.history.replaceState = function (...args) {
			const state = window as unknown as { routerUrlWrites: number }
			state.routerUrlWrites++
			return patched.apply(this, args)
		}
	})
	await earliest(page).focus()
	await page.keyboard.press("End")
	await page.keyboard.press("ArrowLeft")
	await page.keyboard.press("ArrowLeft")
	await expect(vintageToken(page)).toBeVisible()
	expect(years(page)).toBeNull()
	const selected = await earliest(page).getAttribute("aria-valuenow")
	await expect.poll(() => years(page)?.split(",")[0]).toBe(selected)
	expect(
		await page.evaluate(
			() => (window as unknown as { filterUrlWrites: string[] }).filterUrlWrites.length
		)
	).toBe(1)
	expect(
		await page.evaluate(() => (window as unknown as { routerUrlWrites: number }).routerUrlWrites)
	).toBe(0)
})

test("URL edits and popstate do not replace live filters; a hard reload does", async ({ page }) => {
	await page.goto("/vendors/?years=2018")
	await expect(earliest(page)).toHaveAttribute("aria-valuenow", "2018")
	await page.waitForTimeout(400)
	await page.evaluate(() => {
		history.replaceState(history.state, "", "?years=1988")
		window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }))
	})
	// Allow the router transition and persistence debounce to run before asserting isolation.
	await page.waitForTimeout(400)
	await expect(earliest(page)).toHaveAttribute("aria-valuenow", "2018")
	await expect(vintageToken(page)).toHaveAccessibleName(/2018/)
	await page.reload()
	await expect(earliest(page)).toHaveAttribute("aria-valuenow", "1988")
	await expect(vintageToken(page)).toHaveAccessibleName(/1988/)
})

test("client navigation keeps the live filters and mirrors them onto the new path", async ({
	page,
}) => {
	await page.goto("/styles/?years=2018")
	await expect(earliest(page)).toHaveAttribute("aria-valuenow", "2018")
	await page.evaluate(() => Object.assign(window, { filterDocument: "same document" }))
	await page.getByRole("tab", { name: "Vendors", exact: true }).click()
	await page.locator('[data-recording-key="explorer-vendors-index"]').click()
	await expect(page).toHaveURL(/\/vendors\/?(?:\?|$)/)
	await expect(earliest(page)).toHaveAttribute("aria-valuenow", "2018")
	await expect.poll(() => years(page)).toBe("2018")
	expect(
		await page.evaluate(() => (window as unknown as { filterDocument: string }).filterDocument)
	).toBe("same document")
	await page.goBack()
	await expect(page).toHaveURL(/\/styles\/?(?:\?|$)/)
	await expect(earliest(page)).toHaveAttribute("aria-valuenow", "2018")
})

test("entity filter buttons share immediate state with the ruler before URL persistence", async ({
	page,
}) => {
	await page.goto("/vendors/white2tea/?years=2018")
	await expect(earliest(page)).toHaveAttribute("aria-valuenow", "2018")
	const filter = page.locator('[title="Show only white2tea in the Explorer"]')
	await filter.click()
	const active = page.locator('[title="Remove the Explorer filter"]')
	await expect(active).toHaveAttribute("aria-pressed", "true")
	await expect(page.getByRole("button", { name: "Remove filter vendor: white2tea" })).toBeVisible()
	const latest = page.getByRole("slider", { name: "Latest vintage" })
	await latest.focus()
	await page.keyboard.press("End")
	await expect(latest).toHaveAttribute(
		"aria-valuenow",
		(await latest.getAttribute("aria-valuemax"))!
	)
	await earliest(page).focus()
	await page.keyboard.press("End")
	await expect(earliest(page)).toHaveAttribute(
		"aria-valuenow",
		(await earliest(page).getAttribute("aria-valuemax"))!
	)
	await expect(active).toHaveAttribute("aria-pressed", "true")
	await active.click()
	await expect(page.getByRole("button", { name: "Remove filter vendor: white2tea" })).toHaveCount(0)
	await expect.poll(() => years(page)).toBe(await earliest(page).getAttribute("aria-valuemax"))
	expect(new URL(page.url()).searchParams.has("vendors")).toBe(false)
})
