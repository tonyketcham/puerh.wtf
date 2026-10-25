import { test, expect, type Page } from "@playwright/test"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { PNG } from "pngjs"
import { parseDocument, serializeDocument } from "../src/lib/authoring/documents"
import { COLLECTION_NAMES } from "../src/lib/authoring/types"

async function githubFixture(page: Page, options: { loseFirstPush?: boolean } = {}) {
	const records = []
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
				path: "app/content/" + collection + "/" + filename,
				content,
				sha: sha(content),
			})
		}
	const catalogs = new Map([["main", { head: "1".repeat(40), branch: "main", records }]])
	const prs: {
		number: number
		branch: string
		head: string
		base: string
		title: string
		url: string
		draft: boolean
	}[] = []
	const pushes: Record<string, unknown>[] = [],
		images: Record<string, string> = {}
	const receipts = new Map<string, unknown>()
	let sequence = 1,
		reads = 0
	await page.route("**/api/cms*", async (route) => {
		reads++
		const request = route.request(),
			url = new URL(request.url()),
			action = url.searchParams.get("action")
		const ok = (body: unknown) =>
			route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
		if (action === "session")
			return ok({
				configured: true,
				authenticated: true,
				user: { login: "cms-editor" },
				repository: { owner: "tonyketcham", name: "puerh.wtf", defaultBranch: "main" },
				csrfToken: "fixture-csrf",
			})
		if (action === "catalog") {
			const catalog = catalogs.get(url.searchParams.get("branch") || "main")
			return ok({ ...catalog, pullRequests: prs })
		}
		if (action === "push") {
			expect(request.headers()["x-csrf-token"]).toBe("fixture-csrf")
			const body = request.postDataJSON()
			pushes.push(body)
			if (receipts.has(body.operationId)) return ok(receipts.get(body.operationId))
			const branch = body.target.pullRequestNumber
				? body.target.branch
				: "cms/authoring/7/" + body.operationId
			const old = catalogs.get(body.target.branch)!
			const byPath = new Map(old.records.map((r) => [r.path, r]))
			for (const doc of body.documents)
				byPath.set(doc.path, { path: doc.path, content: doc.content, sha: sha(doc.content) })
			for (const asset of body.assets) images[asset.path.slice("app/public".length)] = asset.base64
			const head = (++sequence).toString(16).padStart(40, "0")
			catalogs.set(branch, { head, branch, records: [...byPath.values()] })
			const pr = prs.find((p) => p.branch === branch) || {
				number: 101 + prs.length,
				branch,
				head,
				base: "main",
				title: "Recorded tea session",
				url: "https://github.com/tonyketcham/puerh.wtf/pull/101",
				draft: true,
			}
			pr.head = head
			if (!prs.includes(pr)) prs.push(pr)
			const receipt = {
				branch,
				head,
				pullRequest: { ...pr },
				documents: body.documents.map((d: { path: string; content: string }) => ({
					path: d.path,
					sha: sha(d.content),
				})),
			}
			receipts.set(body.operationId, receipt)
			if (options.loseFirstPush && pushes.length === 1) return route.abort("failed")
			return ok(receipt)
		}
		if (action === "publish") {
			const data = request.postDataJSON()
			const pr = prs.find((p) => p.number === data.number)!
			expect(data.head).toBe(pr.head)
			catalogs.set("main", { ...catalogs.get(pr.branch)!, branch: "main" })
			prs.splice(prs.indexOf(pr), 1)
			return ok({ merged: true, sha: pr.head })
		}
		return ok({ authenticated: false })
	})
	await page.route("**/images/uploads/authoring/**", (route) => {
		const bytes = images[new URL(route.request().url()).pathname]
		return bytes
			? route.fulfill({ contentType: "image/webp", body: Buffer.from(bytes, "base64") })
			: route.fulfill({ status: 404 })
	})
	return {
		records,
		catalogs,
		pushes,
		get reads() {
			return reads
		},
	}
}
function sha(content: string) {
	return createHash("sha1")
		.update("blob " + Buffer.byteLength(content) + "\0" + content)
		.digest("hex")
}
async function command(page: Page, text: string) {
	await expect(async () => {
		if (!(await page.getByRole("combobox", { name: "Search or run a command" }).isVisible()))
			await page.getByRole("button", { name: "Search and commands", exact: true }).click()
		await expect(page.getByRole("combobox", { name: "Search or run a command" })).toBeVisible({
			timeout: 1500,
		})
	}).toPass({ timeout: 15000 })
	await page.getByRole("combobox", { name: "Search or run a command" }).fill("> " + text)
	await page.getByRole("option").filter({ hasText: text }).first().click()
	await expect(page.getByRole("combobox", { name: "Search or run a command" })).toBeHidden()
}
async function openEditor(page: Page) {
	await command(page, "Enable editing")
	await expect(page.locator(".cms-explorer-tools")).toBeAttached()
}
function png() {
	const image = new PNG({ width: 1200, height: 800 })
	for (let i = 0; i < image.data.length; i += 4) {
		image.data[i] = 145
		image.data[i + 1] = 95
		image.data[i + 2] = 40
		image.data[i + 3] = 255
	}
	return PNG.sync.write(image)
}
for (const mobile of [false, true])
	test("CMS complete editorial workflow " + (mobile ? "mobile" : "desktop"), async ({ page }) => {
		await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
		await page.addInitScript(() => {
			class Recognition {
				onstart?: () => void
				onend?: () => void
				onresult?: (event: unknown) => void
				start() {
					;(window as unknown as { __speech: Recognition }).__speech = this
					this.onstart?.()
				}
				stop() {
					this.onend?.()
				}
				abort() {
					this.onend?.()
				}
			}
			Object.assign(window, { SpeechRecognition: Recognition })
		})
		const fixture = await githubFixture(page),
			errors: string[] = []
		page.on("pageerror", (e) => errors.push(e.message))
		await page.goto("/")
		await expect(
			page.getByRole("button", { name: "Search and commands", exact: true })
		).toBeVisible()
		expect(fixture.reads).toBe(0)
		await openEditor(page)
		await command(page, "Working changes")
		await page.getByLabel("New record", { exact: true }).selectOption("vendors")
		await page.getByRole("textbox", { name: /^Name/ }).fill("An unfinished vendor")
		await expect(
			page.getByRole("status", { name: "" }).filter({ hasText: "Saved on this device" })
		).toBeVisible()
		await page.getByRole("link", { name: "← Working changes" }).click()
		await page.getByLabel("New record", { exact: true }).selectOption("tastings")
		await page.getByRole("textbox", { name: /^Tea name/ }).fill("An evening tea session")
		await page.getByLabel("Notes", { exact: true }).fill("First steep: honey and warm stone.")
		await page.getByRole("button", { name: "Dictate notes", exact: true }).click()
		await page.evaluate(() => {
			const speech = (window as unknown as { __speech: { onresult: (e: unknown) => void } })
				.__speech
			speech.onresult({
				resultIndex: 0,
				results: [{ 0: { transcript: "A rounded, lingering finish." }, length: 1, isFinal: true }],
			})
		})
		await page.getByRole("button", { name: "Stop dictation", exact: true }).click()
		await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
			/A rounded, lingering finish\./
		)
		const sessionId = new URL(page.url()).searchParams.get("id")!
		await page.getByRole("button", { name: "New vendor", exact: true }).click()
		await expect(page).not.toHaveURL(new RegExp(sessionId))
		await page.getByRole("textbox", { name: /^Name/ }).fill("Evening Tea Shop")
		const vendorId = new URL(page.url()).searchParams.get("id")!
		await page.getByRole("button", { name: /Use this vendor and return/ }).click()
		await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(/First steep/)
		await page
			.locator('input[type="file"][accept^="image/"]')
			.setInputFiles({ name: "amber-tea.png", mimeType: "image/png", buffer: png() })
		await expect(page.locator(".cms-image-entry img")).toBeVisible({ timeout: 30000 })
		await page
			.getByLabel("Image description", { exact: true })
			.fill("Amber tea in a small porcelain cup.")
		expect(fixture.pushes).toHaveLength(0)
		await page.reload()
		await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
			/A rounded, lingering finish\./
		)
		await expect(page.locator(".cms-image-entry img")).toBeVisible()
		await page.getByRole("button", { name: "Review in Working changes →" }).click()
		await expect(page.getByRole("heading", { name: "Working changes", exact: true })).toBeVisible()
		await expect(page.locator("dialog[open]")).toHaveCount(0)
		await expect(
			page.getByRole("checkbox", { name: "Include An evening tea session" })
		).toBeChecked()
		await expect(page.getByRole("checkbox", { name: "Include Evening Tea Shop" })).toBeChecked()
		await expect(
			page.getByRole("checkbox", { name: "Include An unfinished vendor" })
		).not.toBeChecked()
		await expect(page.locator(".cms-reading")).toContainText("Evening Tea Shop")
		await page.getByRole("button", { name: "Connections", exact: true }).click()
		await page.reload()
		await expect(page.getByRole("button", { name: "Connections", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true"
		)
		await page.getByRole("button", { name: "Read", exact: true }).click()
		await expect(page.locator(".cms-error")).toHaveCount(0)
		const dimensions = await page.evaluate(() => ({
			width: document.documentElement.scrollWidth,
			viewport: innerWidth,
		}))
		expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1)
		await page.screenshot({
			path: "test-results/cms-working-" + (mobile ? "mobile" : "desktop") + ".png",
			fullPage: true,
		})
		await page.getByRole("button", { name: "Commit & push 2 records", exact: true }).click()
		await expect(page.locator(".cms-notice")).toContainText("Pushed 2 records")
		expect(fixture.pushes).toHaveLength(1)
		expect((fixture.pushes[0].assets as unknown[]).length).toBeGreaterThan(1)
		expect(fixture.pushes[0].documents as unknown[]).toHaveLength(2)
		await expect(page.locator("dialog[open]")).toHaveCount(0)
		await expect(
			page.getByRole("checkbox", { name: "Include An unfinished vendor" })
		).not.toBeChecked()
		await page.goto("/write/?id=" + sessionId)
		await page.getByLabel("Notes", { exact: true }).fill("A later pushed edition.")
		await page.getByRole("button", { name: "Review in Working changes →" }).click()
		await expect(
			page.getByRole("button", { name: "Commit & push 1 record", exact: true })
		).toBeEnabled()
		await page.getByRole("button", { name: "Commit & push 1 record", exact: true }).click()
		await expect(page.locator(".cms-notice")).toContainText("Pushed 1 records")
		expect(fixture.pushes).toHaveLength(2)
		expect(fixture.pushes[1].target).toHaveProperty("pullRequestNumber", 101)
		expect(fixture.pushes[1].assets).toHaveLength(0)
		await page.getByRole("button", { name: "Review publication", exact: true }).click()
		await expect(page.locator("#cms-publication")).toContainText("2 cumulative records")
		await page
			.locator("#cms-publication")
			.getByRole("button", { name: "Publish PR #101 · 2 records", exact: true })
			.click()
		await expect(page.locator(".cms-notice")).toContainText("merged")
		await page.goto("/write/?id=" + vendorId)
		await expect(page.getByRole("textbox", { name: /^Name/ })).toHaveValue("Evening Tea Shop")
		expect(errors).toEqual([])
	})

test("lost push response resumes exact request after reload and preserves newer local notes", async ({
	page,
}) => {
	const fixture = await githubFixture(page, { loseFirstPush: true })
	await page.goto("/")
	await openEditor(page)
	await command(page, "Working changes")
	await page.getByLabel("New record", { exact: true }).selectOption("vendors")
	await page.getByRole("textbox", { name: /^Name/ }).fill("Recoverable vendor")
	await page.getByLabel("Notes", { exact: true }).fill("Captured edition.")
	const id = new URL(page.url()).searchParams.get("id")!
	await page.getByRole("button", { name: "Review in Working changes →" }).click()
	await page.getByRole("button", { name: "Commit & push 1 record", exact: true }).click()
	await expect(page.getByRole("button", { name: "Resume pending push", exact: true })).toBeEnabled()
	await page.goto("/write/?id=" + id)
	await page
		.getByLabel("Notes", { exact: true })
		.fill("Newer notes written after the interrupted push.")
	await expect(page.getByRole("status").filter({ hasText: "Saved on this device" })).toBeVisible()
	await page.goto("/working-changes/")
	await page.reload()
	await page.getByRole("button", { name: "Resume pending push", exact: true }).click()
	await expect(page.getByRole("button", { name: "Resume pending push", exact: true })).toHaveCount(
		0
	)
	expect(fixture.pushes).toHaveLength(2)
	expect(fixture.pushes[1]).toEqual(fixture.pushes[0])
	expect(JSON.stringify(fixture.pushes[1])).toContain("Captured edition.")
	expect(JSON.stringify(fixture.pushes[1])).not.toContain("Newer notes")
	await page.goto("/write/?id=" + id)
	await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
		"Newer notes written after the interrupted push."
	)
	await expect(page.getByText("Draft PR #101", { exact: true })).toBeVisible()
})

test("remote content conflict is reconciled in reading view before an explicit new push", async ({
	page,
}) => {
	const fixture = await githubFixture(page)
	const source = fixture.records.find((record) => record.path.startsWith("app/content/vendors/"))!
	const original = parseDocument(source),
		title = String(original.data.title)
	await page.goto("/")
	await openEditor(page)
	await command(page, "Working changes")
	await page.getByText("Browse repository content", { exact: true }).click()
	await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption("vendors")
	await page.getByLabel("Find content", { exact: true }).fill(title)
	await page.locator(".cms-library-list button").filter({ hasText: title }).first().click()
	await page.getByLabel("Notes", { exact: true }).fill("My local editorial wording.")
	await page.getByRole("button", { name: "Review in Working changes →" }).click()
	const remote = serializeDocument(
		original,
		{ description: "Remote description retained." },
		"Another editor changed these notes."
	)
	const catalog = fixture.catalogs.get("main")!
	catalog.records = catalog.records.map((record) =>
		record.path === source.path ? { ...record, content: remote.raw, sha: sha(remote.raw) } : record
	)
	catalog.head = "b".repeat(40)
	await page.getByRole("button", { name: "Commit & push 1 record", exact: true }).click()
	await page.getByRole("button", { name: "Reconcile this record", exact: true }).click()
	await page.getByRole("radio", { name: "Keep my local edit", exact: true }).check()
	await expect(page.locator(".cms-reconciliation .cms-reading")).toContainText(
		"Remote description retained."
	)
	await expect(page.locator(".cms-reconciliation .cms-reading")).toContainText(
		"My local editorial wording."
	)
	await page.getByRole("button", { name: "Apply reconciled draft", exact: true }).click()
	await expect(
		page.getByRole("button", { name: "Commit & push 1 record", exact: true })
	).toBeEnabled()
	expect(fixture.pushes).toHaveLength(0)
	await page.getByRole("button", { name: "Commit & push 1 record", exact: true }).click()
	await expect.poll(() => fixture.pushes.length).toBe(1)
	expect(JSON.stringify(fixture.pushes[0])).toContain("Remote description retained.")
	expect(JSON.stringify(fixture.pushes[0])).toContain("My local editorial wording.")
})
