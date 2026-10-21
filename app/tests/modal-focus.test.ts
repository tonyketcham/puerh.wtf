import { expect, test } from "@playwright/test"

test("the mobile Explorer keeps Tab focus inside and restores its toggle on Escape", async ({
	page,
}) => {
	await page.setViewportSize({ width: 900, height: 900 })
	await page.goto("/vendors/")
	const toggle = page.locator("[data-explorer-toggle]")
	await toggle.click()
	const dialog = page.getByRole("dialog", { name: "Explorer", exact: true })
	await expect(dialog).toBeFocused()
	await page.keyboard.press("Shift+Tab")
	await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
	await page.keyboard.press("Tab")
	await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
	await page.keyboard.press("Escape")
	await expect(dialog).toHaveCount(0)
	await expect(toggle).toBeFocused()
})

test("the expanded terrain map keeps Tab focus inside and returns to its expand button", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1600, height: 1000 })
	await page.emulateMedia({ reducedMotion: "reduce" })
	await page.goto("/origins/yiwu/")
	const expand = page.getByRole("button", { name: "Expand the map", exact: true }).first()
	await expand.click()
	const dialog = page.getByRole("dialog")
	await expect(dialog).toBeVisible()
	const close = dialog.getByRole("button", { name: "Close (Esc)", exact: true })
	await close.focus()
	await page.keyboard.press("Tab")
	await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
	await page.keyboard.press("Shift+Tab")
	await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
	await page.keyboard.press("Escape")
	await expect(dialog).toHaveCount(0)
	await expect(expand).toBeFocused()
})
