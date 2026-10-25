import { test, expect, type Page } from "@playwright/test"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { COLLECTION_NAMES } from "../src/lib/authoring/types"
import { stringify } from "yaml"
import { createDraft, parseDocument, serializeDocument } from "../src/lib/authoring/documents"
import { revisedPassages, addedWordRanges } from "../src/lib/authoring/editorial-diff"
test.setTimeout(90000)
type RecordSource = { path: string; content: string; sha: string }
async function openWuyi(page: Page, additions: RecordSource[] = []) {
	const records: RecordSource[] = [...additions]
	for (const collection of COLLECTION_NAMES) {
		const filenames = await readdir(path.resolve(import.meta.dirname, "../content", collection))
		for (const filename of filenames.filter((f) => f.endsWith(".md"))) {
			const content = await readFile(
				path.resolve(import.meta.dirname, "../content", collection, filename),
				"utf8"
			)
			records.push({
				path: "app/content/" + collection + "/" + filename,
				content,
				sha: createHash("sha1").update(content).digest("hex"),
			})
		}
	}
	await page.addInitScript(() => localStorage.setItem("puerh:editing", "enabled"))
	await page.route("**/api/cms*", async (route) => {
		const url = new URL(route.request().url()),
			action = url.searchParams.get("action")
		const ok = (body: unknown) =>
			route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
		if (action === "session")
			return ok({
				configured: true,
				authenticated: true,
				user: { login: "review-fixture" },
				repository: { owner: "tonyketcham", name: "puerh.wtf", defaultBranch: "main" },
				csrfToken: "review-fixture",
			})
		if (action === "catalog")
			return ok({ branch: "main", head: "1".repeat(40), records, pullRequests: [] })
		if (action === "media") {
			const image = url.searchParams.get("path") || ""
			expect(image).toMatch(/^app\/public\/images\/uploads\/authoring\/[a-f0-9]{64}\/\d+\.webp$/)
			return route.fulfill({
				contentType: "image/webp",
				body: await readFile(path.resolve(import.meta.dirname, "../../", image)),
			})
		}
		throw Error("Unexpected CMS action: " + action)
	})
	await page.goto("/working-changes/")
	await page.getByText("Browse repository content", { exact: true }).click()
	await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption("tastings")
	await page.getByRole("searchbox", { name: "Find content", exact: true }).fill("Wuyi")
	await page
		.locator(".cms-library-list")
		.getByRole("button")
		.filter({ hasText: "1988-wuyi.md" })
		.click()
}
test("editorial diff isolates passages and marks repeated-word insertions without unbounded comparison", () => {
	expect(
		revisedPassages(
			"Opening.\n\nA calm finish.\n\nClosing.",
			"Opening.\n\nA bright calm finish.\n\nClosing."
		)
	).toEqual({ before: "A calm finish.", after: "A bright calm finish." })
	const value = "Tea tea bright tea"
	expect(addedWordRanges("Tea tea tea", value).map(([a, b]) => value.slice(a, b))).toEqual([
		"bright",
	])
	expect(addedWordRanges("old ".repeat(600), "new ".repeat(600))).toHaveLength(600)
	expect(revisedPassages("Opening.\r\n\r\nClosing.\r\n", "Opening.\n\nClosing.\n")).toEqual({
		before: "",
		after: "",
	})
})
for (const mobile of [false, true])
	test(
		"faithful journal preview and selective rendered review " + (mobile ? "mobile" : "desktop"),
		async ({ page }) => {
			await page.setViewportSize(
				mobile ? { width: 390, height: 844 } : { width: 1500, height: 1000 }
			)
			const errors: string[] = []
			page.on("pageerror", (error) => errors.push(error.message))
			await openWuyi(page)
			const notes = page.getByLabel("Notes", { exact: true }),
				original = await notes.inputValue()
			await notes.fill(original + "\n\nA bright apricot finish remains.")
			await page.getByRole("button", { name: "Review in Working changes →", exact: true }).click()
			await page.getByRole("button", { name: "Changes", exact: true }).click()
			const review = page.locator(".cms-editorial-review")
			await expect(review.locator("mark")).toContainText([
				"A",
				"bright",
				"apricot",
				"finish",
				"remains.",
			])
			await expect(review.locator(".cms-picture")).toHaveCount(0)
			await expect(review.locator('[data-reading-field="brewing"]')).toHaveCount(0)
			expect((await review.boundingBox())!.height).toBeLessThan(1100)
			const rootColor = await page.evaluate(() =>
				document.documentElement.style.getPropertyValue("--liquor")
			)
			await page.getByRole("button", { name: "Read", exact: true }).click()
			const journal = page.locator(".cms-journal")
			await expect(journal.locator("[data-flow]")).toHaveAttribute("data-flow", /wrap|stack/)
			await expect(journal.locator("[data-session-article]")).toContainText(
				"Strongly rounded out roast"
			)
			await expect(journal.getByRole("button", { name: "Next photo", exact: true })).toBeVisible()
			await expect(
				journal.getByRole("slider", { name: "Flavor phase, start to finish", exact: true })
			).toBeVisible()
			await journal
				.getByRole("slider", { name: "Flavor phase, start to finish", exact: true })
				.press("End")
			expect(
				await page.evaluate(() => document.documentElement.style.getPropertyValue("--liquor"))
			).toBe(rootColor)
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
			).toBe(true)
			expect(errors).toEqual([])
		}
	)

const vendorId = "ffffffff-ffff-4fff-8fff-ffffffffffff"
const originId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const image = "/images/uploads/authoring/" + "b".repeat(64) + "/480.webp"
function fixtureRecord(
	collection: string,
	slug: string,
	data: Record<string, unknown>,
	body = ""
): RecordSource {
	const content = "---\n" + stringify(data) + "---\n" + body
	return {
		path: "app/content/" + collection + "/" + slug + ".md",
		content,
		sha: createHash("sha1").update(content).digest("hex"),
	}
}
const styleId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	cultivarId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const additions = [
	fixtureRecord("styles", "untasted-style", { id: styleId, title: "Untasted style" }),
	fixtureRecord("cultivars", "untasted-cultivar", {
		id: cultivarId,
		title: "Untasted cultivar",
		styles: [styleId],
	}),
	fixtureRecord(
		"vendors",
		"hidden-tea-shop",
		{
			id: vendorId,
			title: "Hidden tea shop",
			location: "Columbus",
			municipality: "Ohio",
			country: "United States",
			description: "Frontmatter story.\n\nA second paragraph.",
		},
		"Separate body story."
	),
	fixtureRecord("origins", "hidden-origin", {
		id: originId,
		title: "Hidden mountain",
		kind: "mountain-area",
		geo: { lat: 25, lon: 101, precision: "mountain-area", radius_km: 2 },
	}),
	fixtureRecord("tastings", "hidden-cup", {
		id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
		title: "Hidden cup",
		date: "2026-10-20T12:00:00.000Z",
		vendor: [vendorId],
		origin: [originId],
		images: [
			{
				image,
				alt: "Private cup photo",
				variants: [{ path: image, width: 480, height: 320, mime: "image/webp" }],
			},
		],
	}),
]
test("an entity's related unpublished photo loads through authenticated snapshot media without a public image request", async ({
	page,
}) => {
	const requests: string[] = [],
		publicRequests: string[] = []
	await page.route("**/images/uploads/authoring/**", async (route) => {
		publicRequests.push(new URL(route.request().url()).pathname)
		await route.abort()
	})
	await openWuyi(page, additions)
	await page.route("**/api/cms?action=media*", async (route) => {
		const url = new URL(route.request().url())
		if (url.searchParams.get("path") !== "app/public" + image) return route.fallback()
		requests.push(url.searchParams.get("head")! + ":" + url.searchParams.get("branch"))
		const { default: sharp } = await import("sharp")
		await route.fulfill({
			contentType: "image/webp",
			body: await sharp({ create: { width: 480, height: 320, channels: 3, background: "#b77424" } })
				.webp()
				.toBuffer(),
		})
	})
	await page.getByRole("link", { name: "← Working changes", exact: true }).click()
	await page.getByText("Browse repository content", { exact: true }).click()
	await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption("vendors")
	await page.getByRole("searchbox", { name: "Find content", exact: true }).fill("Hidden tea shop")
	await page
		.locator(".cms-library-list")
		.getByRole("button")
		.filter({ hasText: "hidden-tea-shop.md" })
		.click()
	await expect(
		page.locator("[data-cms-write]").getByRole("textbox", { name: /^Name/ })
	).toHaveValue("Hidden tea shop")
	await page.locator("[data-cms-write]").getByRole("button", { name: "Read", exact: true }).click()
	const journal = page.locator(".cms-journal-entity"),
		photo = journal.getByAltText("Private cup photo", { exact: true })
	await expect(journal).toContainText("Frontmatter story.")
	await expect(journal).toContainText("A second paragraph.")
	await expect(journal).toContainText("Separate body story.")
	await expect(journal).toContainText("Columbus, Ohio, United States")
	await expect(
		journal.getByRole("img", { name: "Origins: Hidden mountain", exact: true })
	).toBeVisible()
	await expect(photo).toHaveAttribute("src", /^blob:/)
	await expect
		.poll(() =>
			photo.evaluate(async (el) => {
				try {
					await (el as HTMLImageElement).decode()
					return (el as HTMLImageElement).naturalWidth
				} catch {
					return 0
				}
			})
		)
		.toBe(480)
	expect(requests.length).toBeGreaterThan(0)
	expect(requests.every((request) => request === "1".repeat(40) + ":main")).toBe(true)
	expect(publicRequests).toEqual([])
	for (const [collection, name, linked] of [
		["cultivars", "Untasted cultivar", "Untasted style"],
		["styles", "Untasted style", "Untasted cultivar"],
	]) {
		await page.getByRole("link", { name: "← Working changes", exact: true }).click()
		await page.getByText("Browse repository content", { exact: true }).click()
		await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption(collection)
		await page.getByRole("searchbox", { name: "Find content", exact: true }).fill(name)
		await page.locator(".cms-library-list").getByRole("button").filter({ hasText: name }).click()
		await expect(
			page.locator("[data-cms-write]").getByRole("textbox", { name: /^Name/ })
		).toHaveValue(name)
		await page
			.locator("[data-cms-write]")
			.getByRole("button", { name: "Read", exact: true })
			.click()
		await expect(page.locator(".cms-journal-entity")).toContainText(linked)
	}
})

for (const retained of [false, true])
	test(
		"session Read resolves an unpublished vendor portrait " +
			(retained
				? "from retained local bytes"
				: "through exact authenticated media on a fresh device"),
		async ({ page }) => {
			const branch = "cms/authoring/7/portrait-preview",
				head = "2".repeat(40),
				portrait = "/images/uploads/authoring/" + "c".repeat(64) + "/36.webp",
				portraitPath = "app/public" + portrait,
				vendor = fixtureRecord("vendors", "portrait-vendor", {
					id: vendorId,
					title: "Portrait vendor",
					...(!retained ? { image: portrait } : {}),
				}),
				records = [
					vendor,
					fixtureRecord("origins", "portrait-mountain", {
						id: originId,
						title: "Portrait mountain",
						kind: "mountain-area",
					}),
					fixtureRecord("tastings", "portrait-session", {
						id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
						title: "Portrait fixture session",
						date: "2026-10-20T12:00:00.000Z",
						vendor: [vendorId],
						origin: [originId],
					}),
					fixtureRecord("vendors", "unrelated-portrait", {
						id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
						title: "Unrelated portrait",
						image: "/images/uploads/authoring/" + "d".repeat(64) + "/36.webp",
					}),
				],
				requests: { branch: string | null; head: string | null; path: string | null }[] = [],
				publicRequests: string[] = []
			const { default: sharp } = await import("sharp")
			const bytes = await sharp({
				create: { width: 36, height: 36, channels: 3, background: "#b77424" },
			})
				.webp()
				.toBuffer()
			await page.addInitScript(() => localStorage.setItem("puerh:editing", "enabled"))
			await page.route("**/images/uploads/authoring/**", async (route) => {
				publicRequests.push(new URL(route.request().url()).pathname)
				await route.abort()
			})
			await page.route("**/api/cms*", async (route) => {
				const url = new URL(route.request().url()),
					action = url.searchParams.get("action")
				const ok = (body: unknown) =>
					route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
				if (action === "session")
					return ok({
						configured: true,
						authenticated: true,
						user: { login: "portrait-fixture" },
						repository: { owner: "tonyketcham", name: "puerh.wtf", defaultBranch: "main" },
						csrfToken: "portrait-fixture",
					})
				if (action === "catalog") {
					const current = url.searchParams.get("branch") || "main"
					return ok({
						branch: current,
						head: current === branch ? head : "1".repeat(40),
						records: current === branch ? records : [],
						pullRequests: [
							{
								number: 501,
								branch,
								head,
								base: "main",
								title: "Portrait edition",
								url: "https://github.com/tonyketcham/puerh.wtf/pull/501",
								draft: true,
							},
						],
					})
				}
				if (action === "media") {
					requests.push({
						branch: url.searchParams.get("branch"),
						head: url.searchParams.get("head"),
						path: url.searchParams.get("path"),
					})
					return route.fulfill({ contentType: "image/webp", body: bytes })
				}
				throw Error("Unexpected CMS action: " + action)
			})
			await page.goto("/working-changes/")
			await expect(
				page.getByRole("heading", { name: "Working changes", exact: true })
			).toBeVisible()
			if (retained) {
				const base = parseDocument(vendor),
					draft = {
						...createDraft(base, head, branch, 501),
						document: serializeDocument(base, { image: portrait }),
						revision: 2,
						assets: [
							{
								id: "portrait",
								filename: "36.webp",
								path: portraitPath,
								mime: "image/webp",
								width: 36,
								height: 36,
								bytes: bytes.toString("base64"),
							},
						],
					}
				await page.getByText("Draft recovery", { exact: true }).click()
				await page.getByLabel("Import draft backup", { exact: true }).setInputFiles({
					name: "portrait-draft.json",
					mimeType: "application/json",
					buffer: Buffer.from(
						JSON.stringify({
							version: 2,
							namespace: { repository: "tonyketcham/puerh.wtf", account: "portrait-fixture" },
							drafts: [draft],
						})
					),
				})
				await expect(page.locator(".cms-notice")).toContainText("Draft backup restored")
			}
			await page.getByText("Browse repository content", { exact: true }).click()
			await page.getByRole("combobox", { name: "Edition", exact: true }).selectOption(branch)
			await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption("tastings")
			await page
				.locator(".cms-library-list")
				.getByRole("button")
				.filter({ hasText: "portrait-session.md" })
				.click()
			await expect(
				page.getByRole("heading", { name: "Portrait fixture session", exact: true })
			).toBeVisible()
			await page.getByRole("button", { name: "Read", exact: true }).click()
			const logo = page.locator('.cms-journal [data-recording-key="session-relations"] img')
			await expect(logo).toHaveAttribute("src", /^blob:/)
			await expect
				.poll(() =>
					logo.evaluate(async (el) => {
						await (el as HTMLImageElement).decode()
						return (el as HTMLImageElement).naturalWidth
					})
				)
				.toBe(36)
			const requestsBeforeEntityRead = requests.length
			await page.getByRole("link", { name: "← Working changes", exact: true }).click()
			await page.getByText("Browse repository content", { exact: true }).click()
			await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption("origins")
			await page
				.locator(".cms-library-list")
				.getByRole("button")
				.filter({ hasText: "portrait-mountain.md" })
				.click()
			await expect(
				page.getByRole("heading", { name: "Portrait mountain", exact: true })
			).toBeVisible()
			await page.getByRole("button", { name: "Read", exact: true }).click()
			await expect(page.locator(".cms-journal-entity")).toContainText("Portrait fixture session")
			expect(requests).toHaveLength(requestsBeforeEntityRead)
			if (retained) expect(requests).toEqual([])
			else {
				expect(requests.length).toBeGreaterThan(0)
				expect(
					requests.every(
						(request) =>
							request.branch === branch && request.head === head && request.path === portraitPath
					)
				).toBe(true)
			}
			expect(publicRequests).toEqual([])
		}
	)
