import { test, expect, type Page } from "@playwright/test"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { COLLECTION_NAMES } from "../src/lib/authoring/types"
import { parseDocument } from "../src/lib/authoring/documents"

test.setTimeout(90_000)

async function writerFixture(page: Page) {
	const records: { path: string; content: string; sha: string }[] = []
	for (const collection of COLLECTION_NAMES)
		for (const filename of await readdir(
			path.resolve(import.meta.dirname, "../content", collection)
		)) {
			if (!filename.endsWith(".md")) continue
			const content = await readFile(
				path.resolve(import.meta.dirname, "../content", collection, filename),
				"utf8"
			)
			records.push({
				path: `app/content/${collection}/${filename}`,
				content,
				sha: createHash("sha1").update(content).digest("hex"),
			})
		}
	const pushes: { documents: { path: string; content: string }[] }[] = []
	await page.addInitScript(() => localStorage.setItem("puerh:editing", "enabled"))
	await page.route("**/api/cms*", async (route) => {
		const action = new URL(route.request().url()).searchParams.get("action")
		const reply = (body: unknown, status = 200) =>
			route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
		if (action === "session")
			return reply({
				configured: true,
				authenticated: true,
				user: { login: "cms-editor" },
				repository: { owner: "tonyketcham", name: "puerh.wtf", defaultBranch: "main" },
				csrfToken: "writer-fixture",
			})
		if (action === "catalog")
			return reply({ branch: "main", head: "1".repeat(40), records, pullRequests: [] })
		if (action === "media") {
			const imagePath = new URL(route.request().url()).searchParams.get("path") || ""
			if (
				!/^app\/public\/images\/uploads\/[a-zA-Z0-9_./-]+\.webp$/.test(imagePath) ||
				imagePath.includes("..")
			)
				return reply({ error: { message: "Unknown image" } }, 404)
			return route.fulfill({
				contentType: "image/webp",
				body: await readFile(path.resolve(import.meta.dirname, "../../", imagePath)),
			})
		}
		if (action === "push") {
			pushes.push(route.request().postDataJSON())
			return reply(
				{
					error: { code: "fixture_stop", message: "Captured editorial snapshot for verification." },
				},
				409
			)
		}
		return reply({ error: { code: "fixture_action", message: "Unexpected fixture action." } }, 400)
	})
	await page.goto("/working-changes/")
	await expect(page.getByLabel("New record", { exact: true })).toBeVisible()
	await page.getByLabel("New record", { exact: true }).selectOption("tastings")
	await page.getByRole("textbox", { name: /^Tea name/ }).fill("A quiet cup")
	return { pushes }
}

for (const mobile of [false, true])
	test(
		"editorial writer keeps prose first and restores reading position " +
			(mobile ? "mobile" : "desktop"),
		async ({ page }) => {
			await page.setViewportSize(
				mobile ? { width: 390, height: 844 } : { width: 1360, height: 960 }
			)
			await writerFixture(page)
			const notes = page.getByLabel("Notes", { exact: true })
			const rect = await notes.boundingBox()
			expect(rect!.y).toBeLessThan(mobile ? 650 : 600)
			if (mobile) {
				const footer = await page.locator(".cms-commit-bar").boundingBox()
				expect(
					Math.min(rect!.y + rect!.height, footer!.y) - Math.max(0, rect!.y)
				).toBeGreaterThanOrEqual(180)
				await page.locator(".cms-date-editor > summary").click()
				expect(
					(await page.locator('input[type="datetime-local"]').boundingBox())!.width
				).toBeGreaterThan(250)
				await page.locator(".cms-date-editor > summary").click()
			}
			const context = page.getByRole("heading", { name: "The tea & its people", exact: true })
			expect((await context.boundingBox())!.y).toBeGreaterThan(rect!.y)
			await notes.fill("First steep: warm stone.\n\n" + "A quiet, lingering cup.\n".repeat(35))
			await notes.focus()
			await notes.evaluate((el) => {
				const textarea = el as HTMLTextAreaElement
				textarea.setSelectionRange(8, 17)
				textarea.scrollTop = 120
			})
			const initial = await notes.evaluate((el) => ({
				start: (el as HTMLTextAreaElement).selectionStart,
				end: (el as HTMLTextAreaElement).selectionEnd,
				scroll: (el as HTMLTextAreaElement).scrollTop,
			}))
			await page.getByRole("button", { name: "Read", exact: true }).click()
			await expect(notes).toBeHidden()
			await expect(page.locator(".cms-notes-panel")).toContainText("First steep: warm stone.")
			await page.getByRole("button", { name: "Write", exact: true }).click()
			await expect(notes).toBeFocused()
			expect(
				await notes.evaluate((el) => ({
					start: (el as HTMLTextAreaElement).selectionStart,
					end: (el as HTMLTextAreaElement).selectionEnd,
					scroll: (el as HTMLTextAreaElement).scrollTop,
				}))
			).toEqual(initial)
			await page.getByText("Voice options", { exact: true }).click()
			await page.getByRole("button", { name: "Use keyboard dictation", exact: true }).click()
			await expect(page.getByText(/On Windows, press Win \+ H/)).toBeVisible()
			await expect(notes).toBeFocused()
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
			).toBe(true)
		}
	)

test("inline related creation is cancellable, durable and keeps the session; flavor and brew edits enter the selected snapshot", async ({
	page,
}) => {
	const fixture = await writerFixture(page),
		url = page.url()
	await page.getByLabel("Notes", { exact: true }).fill("Keep my place while adding a tea shop.")
	await page.getByRole("button", { name: "New vendor", exact: true }).click()
	const inline = page.getByRole("group", { name: "New vendor", exact: true })
	await expect(
		inline.getByRole("button", { name: "Create & use vendor", exact: true })
	).toBeDisabled()
	await inline.getByRole("textbox", { name: /^Name/ }).fill("Abandoned shop")
	await inline.getByRole("button", { name: "Cancel", exact: true }).click()
	await expect(inline).toBeHidden()
	await page.getByRole("button", { name: "New vendor", exact: true }).click()
	await inline.getByRole("textbox", { name: /^Name/ }).fill("A little tea shop")
	await inline.getByRole("button", { name: "Create & use vendor", exact: true }).click()
	await expect(page).toHaveURL(url)
	await expect(
		page.getByRole("button", { name: "Remove A little tea shop", exact: true })
	).toBeVisible()
	await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
		"Keep my place while adding a tea shop."
	)
	await page.getByRole("button", { name: "Floral", exact: true }).click()
	await page.getByLabel("Floral start value", { exact: true }).fill("7.5")
	await page.getByRole("button", { name: "finish", exact: true }).click()
	await page.getByLabel("Floral finish value", { exact: true }).fill("4")
	await page.getByLabel("Water temperature (°C)", { exact: true }).fill("96")
	await page
		.getByRole("button", { name: "Show temperature in degrees Fahrenheit", exact: true })
		.click()
	await expect(page.getByLabel("Water temperature (°F)", { exact: true })).toHaveValue("204.8")
	await page.reload()
	await expect(
		page.getByRole("button", { name: "Remove A little tea shop", exact: true })
	).toBeVisible()
	await expect(page.getByLabel("Water temperature (°C)", { exact: true })).toHaveValue("96")
	await page.getByRole("button", { name: "Review in Working changes →", exact: true }).click()
	await expect(
		page.getByRole("checkbox", { name: "Include Abandoned shop", exact: true })
	).toHaveCount(0)
	await page.getByRole("button", { name: "Commit & push 2 records", exact: true }).click()
	await expect.poll(() => fixture.pushes.length).toBe(1)
	const documents = fixture.pushes[0].documents.map((record) =>
		parseDocument({ ...record, sha: null })
	)
	expect(documents.map((doc) => doc.data.title).sort()).toEqual([
		"A little tea shop",
		"A quiet cup",
	])
	const session = documents.find((doc) => doc.collection === "tastings")!
	expect(session.data.brewing).toMatchObject({ temperature: 204.8 })
	expect(session.data.flavor_axes).toMatchObject({ floral: { start: 7.5, finish: 4 } })
})

test("one photo editor preserves order, captions, image descriptions and reversible removal after reload", async ({
	page,
}) => {
	await writerFixture(page)
	await page.getByRole("link", { name: "← Working changes", exact: true }).click()
	await page.getByText("Browse repository content", { exact: true }).click()
	await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption("tastings")
	await page.getByRole("searchbox", { name: "Find content", exact: true }).fill("Wuyi")
	await page
		.locator(".cms-library-list")
		.getByRole("button")
		.filter({ hasText: "1988-wuyi.md" })
		.click()
	const photos = page.locator(".cms-image-entry")
	await expect(photos).toHaveCount(4)
	await page.getByText("Preview shelf cover", { exact: true }).click()
	const cover = page.locator("[data-cover-preview]")
	await expect(cover.locator("img")).toHaveAttribute("alt", "sprawled out sesh")
	const coverImage = await cover.locator("img").boundingBox()
	expect(coverImage!.width / coverImage!.height).toBeCloseTo(1.5, 1)
	const currentUrl = page.url()
	await cover.locator("a").focus()
	await expect(cover.locator("a")).not.toBeFocused()
	await cover.locator("a").click({ force: true })
	await expect(page).toHaveURL(currentUrl)
	await expect(photos.nth(1).locator("img")).toHaveAttribute("alt", "dried leaf")
	await photos.nth(1).getByRole("button", { name: "Make cover", exact: true }).click()
	await expect(photos.first().locator("img")).toHaveAttribute("alt", "dried leaf")
	await expect(cover.locator("img")).toHaveAttribute("alt", "dried leaf")
	await photos
		.first()
		.getByLabel("Image description", { exact: true })
		.fill("Twisted dry leaf on a tea tray.")
	await photos
		.first()
		.getByLabel("Caption", { exact: true })
		.fill("Before the water meets the leaf.")
	await expect(cover.locator("img")).toHaveAttribute("alt", "Twisted dry leaf on a tea tray.")
	await expect(cover).not.toContainText("Before the water meets the leaf.")
	await photos.first().getByRole("button", { name: "Remove from this record", exact: true }).click()
	await expect(photos).toHaveCount(3)
	await page.getByRole("button", { name: "Undo removal", exact: true }).click()
	await expect(photos).toHaveCount(4)
	await expect(photos.first().getByLabel("Caption", { exact: true })).toHaveValue(
		"Before the water meets the leaf."
	)
	await page.reload()
	await expect(photos.first().getByLabel("Image description", { exact: true })).toHaveValue(
		"Twisted dry leaf on a tea tray."
	)
	await expect(photos.first().getByLabel("Caption", { exact: true })).toHaveValue(
		"Before the water meets the leaf."
	)
	await page.getByText("More details", { exact: true }).click()
	await expect(page.getByLabel("Image", { exact: true })).toHaveCount(0)
	await expect(page.locator(".cms-photo-panel")).toHaveCount(1)
	await page.getByRole("button", { name: "Read", exact: true }).click()
	const cube = page.locator("[data-journal-preview] [data-photo-cube]")
	await expect(cube.locator('[aria-label="Before the water meets the leaf."]')).toBeVisible()
	await expect(cube.locator('img[alt="Twisted dry leaf on a tea tray."]').first()).toBeAttached()
})
