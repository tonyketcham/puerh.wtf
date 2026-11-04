import { expect, test } from "@playwright/test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { sessionSeed } from "../src/lib/authoring/session-seed"
import { createDocument } from "../src/lib/authoring/documents"
import { validateDocument } from "../src/lib/authoring/schema"
import { infusionHtml, infusionIssues } from "../src/lib/session-journal.mjs"
import { buildSessionJournalIndex } from "../scripts/session-journal.mjs"
import { buildLegacyImageIndex } from "../scripts/legacy-images.mjs"
import sharp from "sharp"

test("a revisit keeps provenance and starts a fresh cup with a stable previous-session link", () => {
	const source = createDocument(
		"tastings",
		{
			title: "Yi Shan Mo",
			production_year: 2018,
			vendor: ["vendor"],
			harvest: { season: "spring" },
			rating: 91,
			brewing: { temperature: 205 },
			notes: { taste: "honey" },
			flavor_axes: { floral: { start: 8 } },
			storage: [{ place: "kunming" }],
			images: [{ image: "/old.jpg" }],
			infusions: [{ number: 1, note: "Old cup" }],
		},
		"Old prose"
	)
	const seed = sessionSeed(source)
	expect(seed).toEqual({
		title: "Yi Shan Mo",
		production_year: 2018,
		vendor: ["vendor"],
		harvest: { season: "spring" },
		previous_session: source.id,
	})
	;(seed.vendor as string[]).push("another")
	expect(source.data.vendor).toEqual(["vendor"])
})

test("structured steeps validate at review and escape notes when rendered", () => {
	const infusions = [
		{ number: 1, duration_seconds: 0, note: '<script>alert("x")</script>\nSweet & quiet.' },
		{ number: 3, at: "2026-11-04T08:00:00Z", note: "Next day" },
	]
	expect(infusionIssues(infusions)).toEqual([])
	const html = infusionHtml(infusions)
	expect(html).toContain('data-steep-number="3"')
	expect(html).toContain("0 s")
	expect(html).toContain("&lt;script&gt;")
	expect(html).not.toContain("<script>")
	const invalid = createDocument("tastings", {
		title: "Cup",
		date: "2026-11-04T08:00:00Z",
		infusions: [{ number: 1 }, { number: 1, duration_seconds: -1 }],
	})
	expect(validateDocument(invalid).filter((issue) => issue.field === "infusions")).toHaveLength(2)
	expect(validateDocument(createDocument("tags", { title: "Mood", color: "not-a-color" }))).toEqual(
		expect.arrayContaining([expect.objectContaining({ field: "color" })])
	)
})

test("optional journal fields reach the build index without rewriting legacy Markdown", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "tea-journal-"))
	try {
		const legacy = "---\nid: old\ntitle: Legacy\n---\n### Infusions\n1. First cup\n"
		await writeFile(path.join(root, "old.md"), legacy)
		await writeFile(
			path.join(root, "new.md"),
			"---\nid: new\nprevious_session: old\ninfusions:\n  - number: 2\n    duration_seconds: 25\n    note: Honey\n---\n"
		)
		expect(await buildSessionJournalIndex(root)).toEqual({
			new: {
				previous_session: "old",
				infusions: [{ number: 2, duration_seconds: 25, note: "Honey" }],
			},
		})
		expect(await readFile(path.join(root, "old.md"), "utf8")).toBe(legacy)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test("legacy derivatives preserve originals, aspect ratio and produce browser-sized WebP", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "tea-legacy-image-"))
	try {
		const contentDir = path.join(root, "content"),
			publicDir = path.join(root, "public")
		await mkdir(contentDir)
		await mkdir(path.join(publicDir, "images/uploads"), { recursive: true })
		const original = path.join(publicDir, "images/uploads/tea.jpg")
		await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#a98765" } })
			.jpeg()
			.toFile(original)
		const before = await readFile(original)
		await writeFile(
			path.join(contentDir, "tea.md"),
			"---\nimages:\n  - image: /images/uploads/tea.jpg\n---\n"
		)
		const index = await buildLegacyImageIndex({ contentDir, publicDir })
		expect(index["/images/uploads/tea.jpg"].map((v) => v.width)).toEqual([320, 640, 960, 1200])
		for (const variant of index["/images/uploads/tea.jpg"]) {
			const meta = await sharp(await readFile(path.join(publicDir, variant.src))).metadata()
			expect(meta.format).toBe("webp")
			expect(meta.height).toBe(variant.width / 2)
		}
		expect(await readFile(original)).toEqual(before)
		expect(await buildLegacyImageIndex({ contentDir, publicDir })).toEqual(index)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test("session reading has a continuous column, onward links and a readable feed", async ({
	page,
	request,
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 })
	await page.goto("/sessions/2022/07/2018-zsl-yi-shan-mo/")
	await expect(page.locator("[data-flow]").first()).toHaveAttribute("data-flow", "stack")
	const onward = page.getByRole("navigation", { name: "Continue the tea log" })
	await expect(onward.getByRole("link").first()).toBeVisible()
	await page.getByText("About the ratings", { exact: true }).click()
	await expect(page.getByText(/Ratings record personal enjoyment out of 100/)).toBeVisible()
	await page.screenshot({ path: test.info().outputPath("journal-desktop.png"), fullPage: true })
	const destination = await onward.getByRole("link").first().getAttribute("href")
	await onward.getByRole("link").first().click()
	await expect(page).toHaveURL(new RegExp(destination! + "/?$"))
	const feed = await request.get("/feed.xml")
	expect(feed.ok()).toBe(true)
	expect(feed.headers()["content-type"]).toMatch(/xml/)
	expect(await feed.text()).toContain('<rss version="2.0">')
	expect(await feed.text()).toContain("ZSL Yi Shan Mo")
})

test("structured public steep markers use explicit cup numbers and measured durations", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 })
	await page.goto("/tests/session-journal/")
	const fixture = page.locator('[data-recording-key="structured-journal-fixture"]')
	await expect(
		fixture.getByRole("button", { name: "Steep 1, 15 seconds", exact: true })
	).toBeVisible()
	const third = fixture.getByRole("button", { name: "Steep 3, 25 seconds", exact: true })
	await expect(third).toBeVisible()
	await expect(fixture.getByRole("button", { name: /^Steep 2/ })).toHaveCount(0)
	await third.click()
	await expect(page).toHaveURL(/#steep-3$/)
})
