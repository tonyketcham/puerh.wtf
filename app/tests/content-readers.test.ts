import { expect, test } from "@playwright/test"

test("server readers honor their route and presentation projections", async ({ page }) => {
	await page.goto("/tests/content-readers/")
	const summary = page.locator('[data-recording-key="content-reader-contracts"]')
	await expect(summary).toHaveText("Content reader contracts passed")
	const routes = Number(await summary.getAttribute("data-route-count"))
	expect(routes).toBeGreaterThan(0)
	await expect(summary).toHaveAttribute("data-session-count", String(routes))
})
