import { expect, test, type Page } from "@playwright/test"

test.use({ viewport: { width: 1600, height: 1000 } })
test.beforeEach(({ page }) => page.emulateMedia({ reducedMotion: "reduce" }))

async function markHistory(page: Page) {
	await page.evaluate(() => {
		Object.assign(window, { historyTestDocument: "same document" })
		history.replaceState({ ...history.state, historyTestEntry: "same entry" }, "", location.href)
	})
}

async function expectHistoryPreserved(page: Page) {
	expect(await page.evaluate(() => history.state.historyTestEntry)).toBe("same entry")
	expect(await page.evaluate(() => history.state.__NA)).toBe(true)
}

test("focusing an origin preserves history metadata and Back keeps the live filters", async ({
	page,
}) => {
	await page.goto("/origins/?at=yiwu&years=2018")
	const map = page.locator('[data-origins-map="index"]')
	await expect(map.getByRole("button", { name: "open ↵", exact: true })).toBeVisible()
	await expect(page.getByRole("slider", { name: "Earliest vintage" })).toHaveAttribute(
		"aria-valuenow",
		"2018"
	)
	await markHistory(page)
	await map.focus()
	await page.keyboard.press("ArrowRight")
	await expect.poll(() => new URL(page.url()).searchParams.get("at")).not.toBe("yiwu")
	const focused = new URL(page.url()).searchParams.get("at")
	expect(focused).toBeTruthy()
	await expectHistoryPreserved(page)
	await page.keyboard.press("Enter")
	await expect(page).toHaveURL((url) => url.pathname === `/origins/${focused}/`, {
		timeout: 30_000,
	})
	await page.goBack()
	await expect(page).toHaveURL((url) => url.pathname === "/origins/", { timeout: 30_000 })
	expect(
		await page.evaluate(
			() => (window as unknown as { historyTestDocument?: string }).historyTestDocument
		)
	).toBe("same document")
	await expectHistoryPreserved(page)
	await expect(page.getByRole("button", { name: /Remove filter vintage: 2018/ })).toBeVisible()
})

test("selecting a flavor group preserves history metadata", async ({ page }) => {
	await page.goto("/lexicon/?years=2018")
	await expect(page.getByRole("slider", { name: "Earliest vintage" })).toHaveAttribute(
		"aria-valuenow",
		"2018"
	)
	await markHistory(page)
	await page.getByRole("navigation", { name: "Flavor groups" }).locator('a[href="#fruits"]').click()
	await expect(page).toHaveURL((url) => url.hash === "#fruits")
	await expectHistoryPreserved(page)
	await expect(page.getByRole("button", { name: /Remove filter vintage: 2018/ })).toBeVisible()
})
