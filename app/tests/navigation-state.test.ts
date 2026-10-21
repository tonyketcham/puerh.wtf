import { expect, test, type Page } from "@playwright/test"

test.use({ viewport: { width: 1600, height: 1000 } })

const commandInput = (page: Page) => page.getByRole("combobox")

async function openCommands(page: Page, query: string) {
	await page.getByRole("button", { name: /Search and commands/ }).click()
	await commandInput(page).fill(`> ${query}`)
}

for (const destination of ["Vendors", "Go home"]) {
	test(`leaving a session for ${destination} clears the compare context`, async ({ page }) => {
		await page.goto("/")
		await page.locator('#explorer-view-panel a[href^="/sessions/"]').first().click()
		await expect(page.locator("[data-session-root]")).toBeVisible()
		await openCommands(page, "compare")
		await expect(page.getByRole("option", { name: /Compare with/ })).toBeVisible()
		await page.keyboard.press("Escape")
		await openCommands(page, destination)
		await page.getByRole("option", { name: new RegExp(destination) }).click()
		await expect(page).toHaveURL((url) => url.pathname === (destination === "Vendors" ? "/vendors/" : "/"))
		await openCommands(page, "compare")
		await expect(page.getByRole("option", { name: /Compare with/ })).toHaveCount(0)
	})
}

test("moving between sessions publishes the new compare context after retiring the old one", async ({ page }) => {
	await page.goto("/")
	await page.locator('#explorer-view-panel a[href^="/sessions/"]').first().click()
	await expect(page.locator("[data-session-root]")).toBeVisible()
	const first = page.url()
	await page.locator('#explorer-view-panel a[href^="/sessions/"]:not([aria-current="page"])').first().click()
	await expect(page).not.toHaveURL(first)
	await openCommands(page, "compare")
	await expect(page.getByRole("option", { name: /Compare with/ })).toBeVisible()
})

test("page and peek style filters toggle the same facet without replacing the query", async ({ page }) => {
	await page.goto("/styles/blended-sheng/?styles=blended-sheng&q=sheng")
	const pageFilter = page.locator('[data-entity-root] button[title="Remove the Explorer filter"]')
	await expect(pageFilter).toHaveAttribute("aria-pressed", "true")
	await pageFilter.click()
	await expect(page.getByRole("button", { name: "Remove filter style: Blended Sheng" })).toHaveCount(0)
	await expect(page.getByRole("button", { name: /Remove filter find:.*sheng/ })).toBeVisible()
	await page.locator('[data-entity-root] button[title="Show only Blended Sheng in the Explorer"]').click()
	await page.getByRole("tab", { name: "Styles", exact: true }).click()
	const style = page.locator('a[data-peek="style:blended-sheng"]').first()
	await style.focus()
	await style.press("p")
	const peek = page.locator('[data-recording-key="entity-peek"]')
	const peekFilter = peek.getByRole("button", { name: /^Filtered/ })
	await expect(peekFilter).toHaveAttribute("aria-pressed", "true")
	await peekFilter.click()
	await expect(page.getByRole("button", { name: "Remove filter style: Blended Sheng" })).toHaveCount(0)
	await expect(page.getByRole("button", { name: /Remove filter find:.*sheng/ })).toBeVisible()
})

for (const origin of ["yiwu-xishuangbanna-yunnan-china", "88d4ea3a-b772-4472-bd44-566c55bb608e"]) {
	test(`the page filter removes a Yiwu filter shared as ${origin}`, async ({ page }) => {
		await page.goto(`/origins/yiwu/?origins=${origin}`)
		const filter = page.locator('[data-entity-root] button[title="Remove the Explorer filter"]')
		await expect(filter).toHaveAttribute("aria-pressed", "true")
		await filter.click()
		await expect(page.getByRole("button", { name: "Remove filter origin: Yiwu" })).toHaveCount(0)
		await expect.poll(() => new URL(page.url()).searchParams.get("origins")).toBeNull()
	})
}
