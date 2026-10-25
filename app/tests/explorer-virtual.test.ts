import { expect, test } from "@playwright/test"

test.use({ viewport: { width: 1600, height: 1000 } })

test("10,000 sessions keep a bounded DOM and keyboard navigation reaches unmounted rows", async ({
	page,
}) => {
	await page.goto("/tests/explorer-tree/")
	const fixture = page.locator('[data-recording-key="virtual-tree-fixture"]')
	const list = fixture.locator("[data-virtual-list]")
	await expect(list).toHaveAttribute("data-virtual-total", "10001")
	const first = fixture.getByRole("link", { name: /Session 00000/ })
	await expect(first).toBeVisible()
	expect(await list.locator(":scope > li").count()).toBeLessThan(30)
	await first.focus()
	await page.keyboard.press("End")
	await expect(fixture.getByRole("link", { name: /Session 09999/ })).toBeFocused()
	expect(await list.locator(":scope > li").count()).toBeLessThan(30)
	await page.keyboard.press("Shift+Tab")
	await expect(fixture.getByRole("link", { name: /Session 09998/ })).toBeFocused()
	await page.keyboard.press("Home")
	await expect(fixture.getByRole("button", { name: /Fixture sessions/ })).toBeFocused()
	await page.keyboard.press("ArrowDown")
	await expect(first).toBeFocused()
	await page.keyboard.press("Home")
	await expect(fixture.getByRole("button", { name: /Fixture sessions/ })).toBeFocused()
	await page.keyboard.press("Enter")
	await expect(list).toHaveAttribute("data-virtual-total", "1")
	await page.keyboard.press("Enter")
	await expect(list).toHaveAttribute("data-virtual-total", "10001")
})

test("filtering at the bottom clamps the scroll range, handles empty results and restores rows", async ({
	page,
}) => {
	await page.goto("/tests/explorer-tree/")
	const fixture = page.locator('[data-recording-key="virtual-tree-fixture"]')
	const list = fixture.locator("[data-virtual-list]")
	await fixture.getByRole("link", { name: /Session 00000/ }).focus()
	await page.keyboard.press("End")
	await expect(fixture.getByRole("link", { name: /Session 09999/ })).toBeFocused()
	await fixture.getByRole("button", { name: "tail", exact: true }).click()
	await expect(list).toHaveAttribute("data-virtual-total", "51")
	await expect(fixture.getByRole("link", { name: /Session 09999/ })).toBeVisible()
	await fixture.getByRole("button", { name: "empty", exact: true }).click()
	await expect(fixture.getByText("// nothing matches")).toBeVisible()
	await expect(list.locator(".ft-row")).toHaveCount(0)
	await fixture.getByRole("button", { name: "all", exact: true }).click()
	await expect(fixture.getByRole("link", { name: /Session 00000/ })).toBeVisible()
	expect(await list.locator(":scope > li").count()).toBeLessThan(30)
	await fixture.getByRole("button", { name: "nested", exact: true }).click()
	await fixture.getByRole("button", { name: /Branch/ }).click()
	await expect(list).toHaveAttribute("data-virtual-total", "2")
	await expect(list.locator(".ft-row")).toHaveCount(0)
})

test("all Explorer views use the bounded renderer and retain navigation across the viewport", async ({
	page,
}) => {
	await page.goto("/vendors/")
	const panel = page.locator("#explorer-view-panel")
	for (const name of ["Origins", "Vendors", "Styles", "Lexicon", "Sessions"]) {
		await page.getByRole("tab", { name, exact: true }).click()
		const list = panel.locator("[data-virtual-list]").last()
		await expect(list).toBeVisible()
		await expect.poll(() => list.locator(":scope > li").count()).toBeGreaterThan(0)
		expect(await list.locator(":scope > li").count()).toBeLessThan(40)
		await expect
			.poll(() =>
				list.locator(":scope > li").evaluateAll(
					(elements) =>
						elements.filter((row) => {
							const box = row.getBoundingClientRect()
							const content = row.firstElementChild?.getBoundingClientRect()
							return content && (content.top < box.top - 0.5 || content.bottom > box.bottom + 0.5)
						}).length
				)
			)
			.toBe(0)
		const first = list.locator("a[href], button").first()
		await first.focus()
		await page.keyboard.press("End")
		await expect
			.poll(() =>
				page.evaluate(() =>
					document.activeElement?.closest("[data-virtual-index]")?.getAttribute("aria-posinset")
				)
			)
			.toBe(await list.getAttribute("data-virtual-total"))
		await page.keyboard.press("Home")
		await expect
			.poll(() =>
				page.evaluate(() =>
					document.activeElement?.closest("[data-virtual-index]")?.getAttribute("aria-posinset")
				)
			)
			.toBe("1")
	}
})

test("a word returns to its unmounted parent and scrolling preserves keyboard focus", async ({
	page,
}) => {
	await page.goto("/vendors/")
	await page.getByRole("tab", { name: "Lexicon", exact: true }).click()
	const list = page.locator("#explorer-view-panel [data-virtual-list]")
	const group = list.locator('[data-lexicon-row="group"][data-group="fruits"]')
	await expect(group).toBeVisible()
	await group.focus()
	await page.keyboard.press("ArrowRight")
	await expect(group).toHaveAttribute("aria-expanded", "true")
	const groupIndex = Number(await group.locator("..").getAttribute("data-virtual-index"))
	const words = Number((await group.getAttribute("aria-label"))?.match(/^fruits, (\d+) words?$/)?.[1])
	expect(words).toBeGreaterThan(0)
	const wordAt = (index: number) =>
		list.locator(
			`[data-virtual-index="${index}"] [data-lexicon-row="word"][data-group="fruits"]`
		)
	const focusedIndex = () =>
		page.evaluate(() =>
			Number(
				document.activeElement?.closest<HTMLElement>("[data-virtual-index]")?.dataset.virtualIndex
			)
		)
	await page.keyboard.press("ArrowRight")
	await expect(wordAt(groupIndex + 1)).toBeFocused()
	await page.keyboard.press("PageDown")
	await expect.poll(focusedIndex).toBeGreaterThan(groupIndex + 1)
	const pageDownIndex = await focusedIndex()
	await expect(wordAt(pageDownIndex)).toBeFocused()
	// Reach the last word of the actual group, awaiting each asynchronous focus handoff.
	// A fixed burst of keys can repeatedly navigate from the previous mounted row.
	for (let index = pageDownIndex + 1; index <= groupIndex + words; index++) {
		await page.keyboard.press("ArrowDown")
		await expect(wordAt(index)).toBeFocused()
	}
	await expect(group).toHaveCount(0)
	await page.keyboard.press("ArrowLeft")
	await expect(group).toBeFocused()
	const box = await list.boundingBox()
	await page.mouse.move(box!.x + 100, 800)
	await page.mouse.wheel(0, 2000)
	await expect(group).toBeFocused()
	await expect(group).toHaveCount(1)
	expect(await list.locator(":scope > li").count()).toBeLessThan(40)
})
