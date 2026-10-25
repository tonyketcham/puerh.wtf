import { test, expect, type Page } from "@playwright/test"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { PNG } from "pngjs"

import { parseDocument, serializeDocument } from "../src/lib/authoring/documents"
import { COLLECTION_NAMES } from "../src/lib/authoring/types"

// Full editorial flows include real WASM, reloads and durable network acknowledgements.
test.setTimeout(120_000)

async function githubFixture(
	page: Page,
	options: { loseFirstPush?: boolean; signedOut?: boolean } = {}
) {
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
	const identity = { login: "cms-editor" },
		service = { catalogError: false }
	const receipts = new Map<string, unknown>()
	const publicationRequests: {
		action: string
		body: { number: number; head: string; baseHead: string }
	}[] = []
	const readiness = {
		checkState: "SUCCESS",
		requiresUpdate: false,
		requiredApprovals: 0,
		reviewState: "NONE",
		mergeState: "CLEAN",
		protectionReady: true,
	}
	const mediaRequests: { branch: string; head: string; path: string; status: number }[] = []
	const publicImageRequests: { path: string; status: number }[] = []
	const catalogRequests: string[] = []
	let sequence = 1,
		reads = 0,
		authenticated = !options.signedOut,
		providerRedirects = 0,
		returnTo = "/"
	await page.route("https://github.com/**", async (route) => {
		if (new URL(route.request().url()).pathname !== "/login/oauth/authorize") return route.abort()
		providerRedirects++
		const callback = new URL(route.request().url()).searchParams.get("redirect_uri")!
		return route.fulfill({
			contentType: "text/html",
			body:
				"<!doctype html><script>location.replace(" +
				JSON.stringify(callback + "&code=fixture-code&state=fixture-state") +
				")</script>",
		})
	})
	await page.route("**/api/cms*", async (route) => {
		reads++
		const request = route.request(),
			url = new URL(request.url()),
			action = url.searchParams.get("action")
		const ok = (body: unknown) =>
			route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
		if (action === "login" && options.signedOut) {
			returnTo = url.searchParams.get("returnTo") || "/"
			const callback = new URL("/api/cms?action=callback", request.url()).href
			const provider =
				"https://github.com/login/oauth/authorize?client_id=fixture-client&redirect_uri=" +
				encodeURIComponent(callback) +
				"&state=fixture-state"
			// Separate navigations let Playwright intercept every simulated provider hop.
			return route.fulfill({
				contentType: "text/html",
				body: "<!doctype html><script>location.replace(" + JSON.stringify(provider) + ")</script>",
			})
		}
		if (action === "callback" && options.signedOut) {
			authenticated = true
			return route.fulfill({
				status: 302,
				headers: { Location: new URL(returnTo, request.url()).href },
			})
		}
		if (action === "session")
			return ok({
				configured: true,
				authenticated,
				...(authenticated ? { user: { login: identity.login } } : {}),
				repository: { owner: "tonyketcham", name: "puerh.wtf", defaultBranch: "main" },
				csrfToken: "fixture-csrf",
			})
		if (action === "catalog") {
			if (service.catalogError)
				return route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({
						error: { code: "unavailable", message: "Repository is temporarily unavailable." },
					}),
				})
			catalogRequests.push(url.searchParams.get("branch") || "main")
			const catalog = catalogs.get(url.searchParams.get("branch") || "main")
			return ok({ ...catalog, pullRequests: prs })
		}
		if (action === "media") {
			const branch = url.searchParams.get("branch") || "",
				head = url.searchParams.get("head") || "",
				imagePath = url.searchParams.get("path") || ""
			const catalog = catalogs.get(branch),
				publicPath = imagePath.slice("app/public".length)
			const allowedBranch =
				branch === "main" ||
				prs.some((pr) => pr.branch === branch && branch.startsWith("cms/authoring/7/"))
			const validPath =
				/^app\/public\/images\/uploads\/authoring\/[a-f0-9]{64}\/[1-9][0-9]{0,4}\.webp$/.test(
					imagePath
				)
			const referenced = catalog?.records.some(
				(record) => record.content.includes(publicPath) && parseDocument(record)
			)
			const status =
				request.method() !== "GET"
					? 405
					: !allowedBranch
					? 403
					: !/^[a-f0-9]{40}$/.test(head) || !validPath
					? 422
					: catalog?.head !== head
					? 409
					: !referenced || !images[publicPath]
					? 422
					: 200
			mediaRequests.push({ branch, head, path: imagePath, status })
			return status === 200
				? route.fulfill({
						contentType: "image/webp",
						headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
						body: Buffer.from(images[publicPath], "base64"),
				  })
				: route.fulfill({
						status,
						contentType: "application/json",
						body: JSON.stringify({
							error: {
								code: status === 409 ? "head_conflict" : "media_scope",
								message: "The reviewed image is unavailable in this exact fixture branch and head.",
							},
						}),
				  })
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

		if (action === "publication-status" || action === "update-edition") {
			expect(request.method()).toBe("POST")
			expect(request.headers()["x-csrf-token"]).toBe("fixture-csrf")
			const data = request.postDataJSON(),
				pr = prs.find((p) => p.number === data.number)!
			publicationRequests.push({ action, body: data })
			if (!pr || data.head !== pr.head || data.baseHead !== catalogs.get("main")!.head)
				return route.fulfill({
					status: 409,
					contentType: "application/json",
					body: JSON.stringify({
						error: {
							code: "head_conflict",
							message: "This edition changed. Reopen its review to read the latest version.",
						},
					}),
				})
			if (action === "update-edition") {
				expect(readiness.requiresUpdate).toBe(true)
				const old = catalogs.get(pr.branch)!,
					head = (++sequence).toString(16).padStart(40, "0")
				catalogs.set(pr.branch, { ...old, head })
				pr.head = head
				readiness.requiresUpdate = false
				readiness.checkState = "PENDING"
				readiness.mergeState = "BLOCKED"
				return ok({ number: pr.number, updating: true, url: pr.url })
			}
			return ok({
				number: pr.number,
				head: pr.head,
				baseHead: catalogs.get("main")!.head,
				draft: pr.draft,
				...readiness,
				checks: [
					{
						name: "Build journal",
						state:
							readiness.checkState === "SUCCESS"
								? "success"
								: readiness.checkState === "FAILURE"
								? "failure"
								: "pending",
						url: "https://github.com/tonyketcham/puerh.wtf/actions/runs/123",
						required: true,
					},
				],
				checksTruncated: false,
				url: pr.url,
			})
		}
		if (action === "publish") {
			const data = request.postDataJSON()
			const pr = prs.find((p) => p.number === data.number)!
			publicationRequests.push({ action: "publish", body: data })
			expect(data.head).toBe(pr.head)
			expect(data.baseHead).toBe(catalogs.get("main")!.head)
			expect(readiness.requiresUpdate).toBe(false)
			expect(readiness.checkState).toBe("SUCCESS")
			pr.draft = false
			catalogs.set("main", { ...catalogs.get(pr.branch)!, branch: "main" })
			prs.splice(prs.indexOf(pr), 1)
			return ok({ merged: true, sha: pr.head })
		}
		return ok({ authenticated: false })
	})
	await page.route("**/images/uploads/authoring/**", (route) => {
		const publicPath = new URL(route.request().url()).pathname
		const published = catalogs
			.get("main")!
			.records.some((record) => record.content.includes(publicPath) && parseDocument(record))
		const bytes = published ? images[publicPath] : undefined
		publicImageRequests.push({ path: publicPath, status: bytes ? 200 : 404 })
		return bytes
			? route.fulfill({ contentType: "image/webp", body: Buffer.from(bytes, "base64") })
			: route.fulfill({ status: 404 })
	})
	return {
		records,
		identity,
		service,
		prs,
		readiness,
		publicationRequests,
		advanceProduction() {
			const main = catalogs.get("main")!
			catalogs.set("main", { ...main, head: (++sequence).toString(16).padStart(40, "0") })
			readiness.requiresUpdate = true
		},
		catalogs,
		pushes,
		mediaRequests,
		publicImageRequests,
		catalogRequests,
		get authenticated() {
			return authenticated
		},
		get providerRedirects() {
			return providerRedirects
		},
		get mediaReads() {
			return mediaRequests.length
		},
		get publicImageReads() {
			return publicImageRequests.length
		},
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
			await page
				.getByRole("button", { name: /^Search and commands(?: \(\d+ filters active\))?$/ })
				.click()
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
		await expect(page).toHaveURL(new RegExp(sessionId))
		await page.getByRole("textbox", { name: /^Name/ }).fill("Evening Tea Shop")
		await page.getByRole("button", { name: "Create & use vendor", exact: true }).click()
		await expect(
			page.getByRole("button", { name: "Remove Evening Tea Shop", exact: true })
		).toBeVisible()
		await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(/First steep/)
		await page
			.locator('input[type="file"][accept^="image/"]')
			.setInputFiles({ name: "amber-tea.png", mimeType: "image/png", buffer: png() })
		await expect(page.locator(".cms-image-entry img")).toBeVisible({ timeout: 30000 })
		await page
			.getByLabel("Image description", { exact: true })
			.fill("Amber tea in a small porcelain cup.")
		await page.getByText("Preview shelf cover", { exact: true }).click()
		const shelfCover = page.locator("[data-cover-preview] img")
		await expect(shelfCover).toHaveAttribute("src", /^blob:/)
		await expect(shelfCover).toHaveAttribute("alt", "Amber tea in a small porcelain cup.")
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
		await expect(page.locator("[data-journal-preview]")).toContainText("Evening Tea Shop")
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
		await expect(page.locator("#cms-publication")).toContainText(
			"2 records · versions saved to GitHub"
		)
		await page.getByRole("button", { name: "Publish PR #101 · 2 records", exact: true }).click()
		await expect(page.locator(".cms-notice")).toContainText("merged")
		const vendor = (fixture.pushes[0].documents as { path: string; content: string }[])
			.map((record) => parseDocument({ ...record, sha: null }))
			.find((record) => record.data.title === "Evening Tea Shop")!
		await page.goto("/write/?id=" + vendor.id)
		await expect(page.getByRole("textbox", { name: /^Name/ })).toHaveValue("Evening Tea Shop")
		const publicReadsBeforeRelatedPreview = fixture.publicImageReads
		await page.getByRole("button", { name: "Read", exact: true }).click()
		const relatedPhoto = page
			.locator("[data-journal-preview] a")
			.filter({ hasText: "An evening tea session" })
			.locator("img")
		await expect(relatedPhoto).toHaveAttribute("src", /^blob:/)
		await expect
			.poll(() =>
				relatedPhoto.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
			)
			.toBe(true)
		expect(fixture.publicImageReads).toBe(publicReadsBeforeRelatedPreview)
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
	await expect(
		page.getByRole("status").filter({ hasText: "Pushed 1 records to draft PR #101." })
	).toBeVisible()
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
	await expect(page.getByText("Unpublished · PR #101", { exact: true })).toBeVisible()
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
	await expect(page.locator(".cms-reconciliation [data-journal-preview]")).toContainText(
		"Remote description retained."
	)
	await expect(page.locator(".cms-reconciliation [data-journal-preview]")).toContainText(
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

test("fresh-device PR editor reads private images, reloads its branch catalog and caches while typing", async ({
	page,
}) => {
	const fixture = await githubFixture(page),
		errors: string[] = []
	page.on("pageerror", (error) => errors.push(error.message))
	await page.goto("/")
	await openEditor(page)
	await command(page, "Working changes")
	await page.getByLabel("New record", { exact: true }).selectOption("tastings")
	const title = "A fresh-device tea session"
	await page.getByRole("textbox", { name: /^Tea name/ }).fill(title)
	await page.getByLabel("Notes", { exact: true }).fill("Pushed from the first device.")
	const id = new URL(page.url()).searchParams.get("id")!
	await page
		.locator('input[type="file"][accept^="image/"]')
		.setInputFiles({ name: "fresh-device-tea.png", mimeType: "image/png", buffer: png() })
	await expect(page.locator(".cms-image-entry img")).toBeVisible({ timeout: 30000 })
	await page
		.getByLabel("Image description", { exact: true })
		.fill("Amber tea photographed on the first device.")
	await page.getByRole("button", { name: "Review in Working changes →" }).click()
	await page.getByRole("button", { name: "Commit & push 1 record", exact: true }).click()
	await expect(page.locator(".cms-notice")).toContainText("Pushed 1 records")
	const branch = [...fixture.catalogs.keys()].find((key) => key !== "main")!
	const catalog = fixture.catalogs.get(branch)!
	const record = catalog.records.map(parseDocument).find((document) => document.id === id)!
	const photo = (record.data.images as { image: string }[])[0].image
	// Pushed bytes must not accidentally exist on the public deployment before merge.
	expect(await page.evaluate(async (image) => (await fetch(image)).status, photo)).toBe(404)
	expect(fixture.publicImageRequests.at(-1)).toEqual({ path: photo, status: 404 })
	const origin = new URL(page.url()).origin
	await page.goto("about:blank")
	const cdp = await page.context().newCDPSession(page)
	await cdp.send("Storage.clearDataForOrigin", { origin, storageTypes: "indexeddb,local_storage" })
	await cdp.detach()
	await page.goto("/")
	await openEditor(page)
	await command(page, "Working changes")
	await expect(page.getByRole("heading", { name: "Working changes", exact: true })).toBeVisible()
	await page.getByRole("button", { name: "Browse edition", exact: true }).click()
	await page.getByText("Browse repository content", { exact: true }).click()
	await expect(page.getByRole("combobox", { name: "Edition", exact: true })).toHaveValue(branch)
	await page.getByRole("combobox", { name: "Collection", exact: true }).selectOption("tastings")
	await page.getByLabel("Find content", { exact: true }).fill(title)
	await page.locator(".cms-library-list button").filter({ hasText: title }).click()
	await expect(page).toHaveURL(new RegExp("id=" + id))
	const image = page.locator(".cms-photo-panel .cms-image-entry img")
	await expect
		.poll(() =>
			image.evaluate(
				(element: HTMLImageElement) =>
					element.complete && element.naturalWidth > 0 && element.currentSrc.startsWith("blob:")
			)
		)
		.toBe(true)
	expect(fixture.mediaReads).toBeGreaterThan(0)
	expect(
		fixture.mediaRequests.every(
			(request) =>
				request.branch === branch && request.head === catalog.head && request.status === 200
		)
	).toBe(true)
	const catalogReadCount = fixture.catalogRequests.length
	await page.reload()
	await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
		"Pushed from the first device."
	)
	await expect
		.poll(() =>
			image.evaluate(
				(element: HTMLImageElement) =>
					element.complete && element.naturalWidth > 0 && element.currentSrc.startsWith("blob:")
			)
		)
		.toBe(true)
	expect(fixture.catalogRequests.slice(catalogReadCount)).toContain(branch)
	const mediaReads = fixture.mediaReads,
		currentSrc = await image.evaluate((element: HTMLImageElement) => element.currentSrc)
	await page.getByLabel("Notes", { exact: true }).fill("Fresh-device notes.")
	await page
		.getByLabel("Notes", { exact: true })
		.pressSequentially(" The image remains visible while I write.")
	await expect(page.getByRole("status").filter({ hasText: "Saved on this device" })).toBeVisible()
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	)
	expect(fixture.mediaReads).toBe(mediaReads)
	expect(await image.evaluate((element: HTMLImageElement) => element.currentSrc)).toBe(currentSrc)
	expect(errors).toEqual([])
})

test("first GitHub sign-in restores editing after a cold OAuth return to the root page", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 })
	const fixture = await githubFixture(page, { signedOut: true }),
		errors: string[] = []
	page.on("pageerror", (error) => errors.push(error.message))
	await page.goto("/")
	expect(fixture.reads).toBe(0)
	await command(page, "Enable editing")
	const signIn = page.getByRole("link", { name: "Continue with GitHub", exact: true })
	await expect(signIn).toHaveAttribute("href", "/api/cms?action=login&returnTo=%2F")
	await signIn.click()
	await expect(page).toHaveURL(/\/$/)
	expect(fixture.providerRedirects).toBe(1)
	expect(fixture.authenticated).toBe(true)
	// No second Enable editing command: a full provider navigation discarded the original Jotai state.
	await expect(page.locator(".cms-explorer-tools")).toBeAttached({ timeout: 15000 })
	await command(page, "Working changes")
	await expect(page.getByRole("heading", { name: "Working changes", exact: true })).toBeVisible()
	expect(fixture.pushes).toHaveLength(0)
	expect(errors).toEqual([])
})

test("Keep reading cancels remembered unauthenticated activation", async ({ page }) => {
	const fixture = await githubFixture(page, { signedOut: true })
	await page.goto("/")
	await command(page, "Enable editing")
	await expect(page.getByRole("link", { name: "Continue with GitHub", exact: true })).toBeVisible()
	await page.getByRole("button", { name: "Keep reading", exact: true }).click()
	await expect(page.locator(".cms-auth-notice")).toHaveCount(0)
	expect(await page.evaluate(() => localStorage.getItem("puerh:editing"))).toBeNull()
	const reads = fixture.reads
	await page.reload()
	await expect(page.getByRole("button", { name: "Search and commands", exact: true })).toBeVisible()
	await expect(page.locator(".cms-auth-notice")).toHaveCount(0)
	expect(fixture.reads).toBe(reads)
})

test("blocked activation storage preserves reading, editing and explicit disable", async ({
	page,
}) => {
	await page.addInitScript(() => {
		for (const name of ["getItem", "setItem", "removeItem"] as const) {
			const original = Storage.prototype[name]
			Object.defineProperty(Storage.prototype, name, {
				configurable: true,
				value: function (key: string, ...args: string[]) {
					if (key === "puerh:editing")
						throw new DOMException("Site data is blocked", "SecurityError")
					return Reflect.apply(original, this, [key, ...args])
				},
			})
		}
	})
	const fixture = await githubFixture(page),
		errors: string[] = []
	page.on("pageerror", (error) => errors.push(error.message))
	await page.goto("/")
	await expect(page.getByRole("button", { name: "Search and commands", exact: true })).toBeVisible()
	expect(fixture.reads).toBe(0)
	await openEditor(page)
	await command(page, "Disable editing")
	await expect(page.locator(".cms-explorer-tools")).toHaveCount(0)
	await expect(page.locator(".cms-auth-notice")).toHaveCount(0)
	await expect(page.getByRole("button", { name: "Search and commands", exact: true })).toBeVisible()
	expect(errors).toEqual([])
})

for (const entry of ["contextual", "library"] as const)
	for (const filtered of [false, true])
		test(
			"editing an existing vendor after a restored unrelated tag draft uses the vendor identity " +
				entry +
				(filtered ? " filtered" : ""),
			async ({ page }) => {
				await page.setViewportSize({ width: 1440, height: 1000 })
				const fixture = await githubFixture(page),
					errors: string[] = []
				// Routing mocks normally disable HTTP cache; retain the production cache behavior here.
				const network = await page.context().newCDPSession(page)
				await network.send("Network.enable")
				await network.send("Network.setCacheDisabled", { cacheDisabled: false })
				page.on("pageerror", (error) => errors.push(error.message))
				await page.goto(filtered ? "/?q=white2tea" : "/")
				await openEditor(page)
				await command(page, "Working changes")
				await page.getByLabel("New record", { exact: true }).selectOption("tags")
				await page.getByRole("textbox", { name: /^Name/ }).fill("An unrelated local tag")
				await expect(
					page.getByRole("status").filter({ hasText: "Saved on this device" })
				).toBeVisible()
				const tagId = new URL(page.url()).searchParams.get("id")!
				await page.reload()
				await expect(page.getByRole("textbox", { name: /^Name/ })).toHaveValue(
					"An unrelated local tag"
				)
				const vendor = parseDocument(
					fixture.records.find((record) => record.path === "app/content/vendors/white2tea.md")!
				)
				if (entry === "contextual") {
					await page.getByRole("tab", { name: "Vendors", exact: true }).click()
					await page.getByRole("link", { name: /^white2tea, vendor,/ }).click()
					await expect(
						page.locator("main").getByRole("heading", { name: "white2tea", exact: true })
					).toBeVisible()
					await page.getByRole("button", { name: "Edit this vendor", exact: true }).click()
				} else {
					await page.getByRole("link", { name: "← Working changes", exact: true }).click()
					await page.getByText("Browse repository content", { exact: true }).click()
					await page.locator(".cms-library").getByRole("combobox").nth(1).selectOption("vendors")
					await page.getByLabel("Find content", { exact: true }).fill("white2tea")
					await page
						.locator(".cms-library-list")
						.getByRole("button", { name: /white2tea/ })
						.click()
				}
				await expect(page).toHaveURL(new RegExp("/write/\\?id=" + vendor.id + "(?:&|$)"))
				expect(new URL(page.url()).searchParams.get("id")).not.toBe(tagId)
				await expect(page.getByRole("textbox", { name: /^Name/ })).toHaveValue("white2tea")
				await expect(page.locator(".cms-write .cms-eyebrow")).toHaveText("Vendor")
				await page.getByRole("link", { name: "← Working changes", exact: true }).click()
				await expect(
					page.getByRole("checkbox", { name: "Include An unrelated local tag", exact: true })
				).toBeVisible()
				await page
					.locator(".cms-record-row")
					.filter({
						has: page.getByRole("checkbox", {
							name: "Include An unrelated local tag",
							exact: true,
						}),
					})
					.getByRole("link", { name: "Edit draft", exact: true })
					.click()
				await expect(page).toHaveURL(new RegExp("/write/\\?id=" + tagId + "(?:&|$)"))
				await expect(page.getByRole("textbox", { name: /^Name/ })).toHaveValue(
					"An unrelated local tag"
				)
				await page.goBack()
				await expect(page).toHaveURL(/\/working-changes\/(?:\?|$)/)
				await expect(
					page.getByRole("checkbox", { name: "Include An unrelated local tag", exact: true })
				).toBeVisible()
				await page.goForward()
				await expect(page).toHaveURL(new RegExp("/write/\\?id=" + tagId + "(?:&|$)"))
				await expect(page.getByRole("textbox", { name: /^Name/ })).toHaveValue(
					"An unrelated local tag"
				)
				await page.reload()
				await expect(page).toHaveURL(new RegExp("/write/\\?id=" + tagId + "(?:&|$)"))
				await expect(page.getByRole("textbox", { name: /^Name/ })).toHaveValue(
					"An unrelated local tag"
				)
				expect(fixture.pushes).toHaveLength(0)
				expect(errors).toEqual([])
			}
		)

function savedPublication(fixture: Awaited<ReturnType<typeof githubFixture>>) {
	const source = fixture.records.find((record) => record.path.endsWith("/white2tea.md"))!
	const document = parseDocument(source),
		edited = serializeDocument(document, undefined, document.body + "\nA revised editorial note.\n")
	const branch = "cms/authoring/7/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		head = "2".repeat(40)
	fixture.catalogs.set(branch, {
		branch,
		head,
		records: fixture.records.map((record) =>
			record.path === source.path
				? { ...record, content: edited.raw, sha: sha(edited.raw) }
				: record
		),
	})
	const pr = {
		number: 101,
		branch,
		head,
		base: "main",
		title: "Update white2tea",
		url: "https://github.com/tonyketcham/puerh.wtf/pull/101",
		draft: true,
	}
	fixture.prs.push(pr)
	return pr
}

test("publication review shows pending and failed checks without a competing commit action", async ({
	page,
}) => {
	const fixture = await githubFixture(page),
		pr = savedPublication(fixture)
	fixture.readiness.checkState = "PENDING"
	fixture.readiness.mergeState = "BLOCKED"
	await page.goto("/")
	await openEditor(page)
	await command(page, "Working changes")
	await page.getByRole("button", { name: "Review publication", exact: true }).click()
	const panel = page.locator("#cms-publication"),
		status = page.getByRole("region", { name: "Publication readiness" }),
		footer = page.locator(".cms-commit-bar")
	await expect(panel).toContainText("A revised editorial note.")
	await expect(status).toContainText("No human review is required by this repository.")
	await expect(status).toContainText("Build journal")
	await expect(status).toContainText("In progress")
	await expect(status.getByRole("link", { name: "Build journal", exact: true })).toHaveAttribute(
		"href",
		/actions\/runs\/123$/
	)
	await expect(
		footer.getByRole("button", { name: "Publish PR #101 · 1 records", exact: true })
	).toBeDisabled()
	await expect(footer.getByRole("button", { name: /Commit & push/ })).toHaveCount(0)
	await expect(footer).not.toContainText("Confirming push")
	expect(fixture.prs[0].draft).toBe(true)
	expect(fixture.publicationRequests.map((request) => request.action)).toEqual([
		"publication-status",
	])
	fixture.readiness.checkState = "FAILURE"
	await status.getByRole("button", { name: "Refresh checks", exact: true }).click()
	await expect(status).toContainText("Needs attention")
	await expect(footer.getByRole("button", { name: /Publish PR/ })).toBeDisabled()
	fixture.readiness.checkState = "SUCCESS"
	fixture.readiness.mergeState = "CLEAN"
	await status.getByRole("button", { name: "Refresh checks", exact: true }).click()
	await expect(status).toContainText("Passed")
	await expect(footer.getByRole("button", { name: /Publish PR/ })).toBeEnabled()
	await footer.getByRole("button", { name: /Publish PR/ }).click()
	await expect(page.locator(".cms-notice")).toContainText("merged")
	expect(fixture.publicationRequests.at(-1)).toEqual({
		action: "publish",
		body: { number: pr.number, head: pr.head, baseHead: "1".repeat(40) },
	})
})

test("outdated publication updates in app and requires rereading the new edition before publish", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	const fixture = await githubFixture(page),
		pr = savedPublication(fixture),
		oldHead = pr.head
	fixture.advanceProduction()
	const baseHead = fixture.catalogs.get("main")!.head
	await page.goto("/")
	await openEditor(page)
	await command(page, "Working changes")
	await page.getByRole("button", { name: "Review publication", exact: true }).click()
	const status = page.getByRole("region", { name: "Publication readiness" }),
		footer = page.locator(".cms-commit-bar")
	await expect(status).toContainText("Published content has moved forward.")
	await expect(footer.getByRole("button", { name: /Publish PR/ })).toBeDisabled()
	await status
		.getByRole("button", { name: "Update edition from latest production", exact: true })
		.click()
	await expect(page.locator("#cms-publication .cms-error")).toContainText("Reopen this review")
	expect(
		fixture.publicationRequests.find((request) => request.action === "update-edition")
	).toEqual({ action: "update-edition", body: { number: pr.number, head: oldHead, baseHead } })
	expect(pr.head).not.toBe(oldHead)
	await expect(footer.getByRole("button", { name: /Publish PR/ })).toBeDisabled()
	await status
		.getByRole("button", { name: "Reopen review from latest edition", exact: true })
		.click()
	await expect(status).toContainText("includes the latest published content")
	await expect(status).toContainText("In progress")
	const latest = fixture.publicationRequests
		.filter((request) => request.action === "publication-status")
		.at(-1)!
	expect(latest.body).toEqual({ number: pr.number, head: pr.head, baseHead })
	fixture.readiness.checkState = "SUCCESS"
	fixture.readiness.mergeState = "CLEAN"
	await status.getByRole("button", { name: "Refresh checks", exact: true }).click()
	await expect(footer.getByRole("button", { name: /Publish PR/ })).toBeEnabled()
	await footer.getByRole("button", { name: /Publish PR/ }).click()
	await expect(page.locator(".cms-notice")).toContainText("merged")
	expect(fixture.publicationRequests.at(-1)).toEqual({
		action: "publish",
		body: { number: pr.number, head: pr.head, baseHead },
	})
	expect(fixture.pushes).toHaveLength(0)
})

for (const boundary of ["sign out", "disable editing"] as const)
	test(
		"recovered drafts stay private after " + boundary + " and another account's catalog fails",
		async ({ page }) => {
			const fixture = await githubFixture(page)
			await page.goto("/")
			await openEditor(page)
			await command(page, "Working changes")
			await page.getByLabel("New record", { exact: true }).selectOption("tags")
			await page.getByRole("textbox", { name: /^Name/ }).fill("Private account A draft")
			await page.getByRole("button", { name: "Review in Working changes →", exact: true }).click()
			await page.getByRole("button", { name: "Discard draft", exact: true }).click()
			await expect(page.locator(".cms-notice")).toContainText("Draft set aside")
			await page.getByText("Draft recovery", { exact: true }).click()
			await expect(page.locator(".cms-recovered-drafts")).toContainText("Private account A draft")
			if (boundary === "sign out")
				await page.getByRole("button", { name: "Sign out of GitHub", exact: true }).click()
			else await command(page, "Disable editing")
			await expect(page.locator(".cms-explorer-tools")).toHaveCount(0)
			fixture.identity.login = "editor-b"
			fixture.service.catalogError = true
			await command(page, "Enable editing")
			await expect(page.locator(".cms-auth-notice")).toContainText(
				"Repository access could not load"
			)
			await expect(page.locator(".cms-recovered-drafts")).toHaveCount(0)
			await expect(page.locator("[data-cms-working]")).not.toContainText("Private account A draft")
			await expect(
				page.locator("[data-cms-working]").getByRole("button", { name: "Undo", exact: true })
			).toHaveCount(0)
			// Return to A with the catalog still unavailable: its durable recovery must remain available.
			fixture.identity.login = "cms-editor"
			await page.reload()
			await expect(page.locator(".cms-auth-notice")).toContainText(
				"Repository access could not load"
			)
			await page.getByText("Draft recovery", { exact: true }).click()
			await expect(page.locator(".cms-recovered-drafts")).toContainText("Private account A draft")
		}
	)

test("mobile whole-record checkboxes keep the selection list in place while titles open previews", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await githubFixture(page)
	await page.goto("/")
	await openEditor(page)
	await command(page, "Working changes")
	for (const name of ["First local vendor", "Second local vendor"]) {
		await page.getByLabel("New record", { exact: true }).selectOption("vendors")
		await page.getByRole("textbox", { name: /^Name/ }).fill(name)
		await page.getByLabel("Notes", { exact: true }).fill("An editorial note for " + name + ".")
		await page.getByRole("button", { name: "Review in Working changes →", exact: true }).click()
	}
	await page.getByRole("button", { name: "Clear selection", exact: true }).click()
	await page.evaluate(() => window.scrollTo(0, 0))
	for (const name of ["First local vendor", "Second local vendor"]) {
		const before = await page.evaluate(() => window.scrollY)
		await page.getByRole("checkbox", { name: "Include " + name, exact: true }).check()
		const movement = await page.evaluate(
			(before) =>
				new Promise<number>((resolve) => {
					let frames = 0,
						max = 0
					const frame = () => {
						max = Math.max(max, Math.abs(window.scrollY - before))
						if (++frames < 20) requestAnimationFrame(frame)
						else resolve(max)
					}
					requestAnimationFrame(frame)
				}),
			before
		)
		expect(movement).toBeLessThanOrEqual(2)
	}
	await expect(page.locator(".cms-commit-bar")).toContainText("2 selected")
	await page
		.locator(".cms-selection")
		.getByRole("button", { name: "First local vendor", exact: true })
		.click()
	await expect
		.poll(async () =>
			page.locator("#cms-editorial-preview").evaluate((el) => el.getBoundingClientRect().top)
		)
		.toBeLessThan(160)
	await expect(page.locator("#cms-editorial-preview")).toBeFocused()
})

test("failed inline creation preserves notes typed during the atomic write without a dangling relationship", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const original = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function (value: unknown, ...rest: unknown[]) {
			const entry = value as { draft?: { base?: unknown; document?: { collection?: string } } }
			if (
				(window as any).__failInline &&
				this.name === "drafts" &&
				entry.draft?.document?.collection === "vendors" &&
				entry.draft.base === null
			) {
				;(window as any).__failInline = false
				const textarea =
					document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Notes"]') ||
					document.querySelector<HTMLTextAreaElement>("textarea.cms-body")
				if (!textarea) throw new Error("The session notes textarea was unavailable.")
				Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
					textarea,
					"New notes typed while the related save was pending."
				)
				textarea.dispatchEvent(new Event("input", { bubbles: true }))
				throw new DOMException("Test-only atomic related save failure", "QuotaExceededError")
			}
			return original.apply(this, [value, ...rest] as Parameters<IDBObjectStore["put"]>)
		}
	})
	await githubFixture(page)
	await page.goto("/")
	await openEditor(page)
	await command(page, "Working changes")
	await page.getByLabel("New record", { exact: true }).selectOption("tastings")
	await page.getByRole("textbox", { name: /^Tea name/ }).fill("Atomic notes preservation")
	await page.getByLabel("Notes", { exact: true }).fill("Earlier notes.")
	await expect(page.getByRole("status").filter({ hasText: "Saved on this device" })).toBeVisible()
	const id = new URL(page.url()).searchParams.get("id")!
	await page.getByRole("button", { name: "New vendor", exact: true }).click()
	await page
		.getByRole("group", { name: "New vendor", exact: true })
		.getByRole("textbox", { name: /^Name/ })
		.fill("Failed new vendor")
	await page.evaluate(() => ((window as any).__failInline = true))
	await page.getByRole("button", { name: "Create & use vendor", exact: true }).click()
	await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
		"New notes typed while the related save was pending."
	)
	await expect(page.getByRole("status").filter({ hasText: "Saved on this device" })).toBeVisible()
	await page.reload()
	await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
		"New notes typed while the related save was pending."
	)
	const stored = await page.evaluate(async (id) => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open("puerh-authoring", 3)
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		const records = await new Promise<any[]>((resolve, reject) => {
			const request = db.transaction("drafts", "readonly").objectStore("drafts").getAll()
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		return {
			vendor: records.find((entry) => entry.draft.id === id).draft.document.data.vendor || [],
			children: records.filter((entry) => entry.draft.document.collection === "vendors").length,
		}
	}, id)
	expect(stored).toEqual({ vendor: [], children: 0 })
})

test("export and import round-trip the discarded drafts visible in recovery", async ({ page }) => {
	await githubFixture(page)
	await page.goto("/")
	await openEditor(page)
	await command(page, "Working changes")
	await page.getByLabel("New record", { exact: true }).selectOption("tags")
	await page.getByRole("textbox", { name: /^Name/ }).fill("A recoverable backup tag")
	await page.getByRole("button", { name: "Review in Working changes →", exact: true }).click()
	await page.getByRole("button", { name: "Discard draft", exact: true }).click()
	await expect(page.locator(".cms-notice")).toContainText("Draft set aside")
	await page.getByText("Draft recovery", { exact: true }).click()
	const downloadPromise = page.waitForEvent("download")
	await page.getByRole("button", { name: "Export local drafts", exact: true }).click()
	const download = await downloadPromise,
		backup = await readFile((await download.path())!, "utf8")
	expect(JSON.parse(backup).recoveries[0].draft.document.data.title).toBe(
		"A recoverable backup tag"
	)
	await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open("puerh-authoring", 3)
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(["drafts", "recovery"], "readwrite")
			tx.objectStore("drafts").clear()
			tx.objectStore("recovery").clear()
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
	})
	await page.reload()
	await expect(page.getByRole("heading", { name: "Working changes", exact: true })).toBeVisible()
	await page.getByText("Draft recovery", { exact: true }).click()
	await expect(page.locator(".cms-recovered-drafts")).toHaveCount(0)
	await page.getByLabel("Import draft backup", { exact: true }).setInputFiles({
		name: "local-drafts.json",
		mimeType: "application/json",
		buffer: Buffer.from(backup),
	})
	await expect(page.locator(".cms-recovered-drafts")).toContainText("A recoverable backup tag")
	await page.getByRole("button", { name: "Restore draft", exact: true }).click()
	await expect(
		page.getByRole("checkbox", { name: "Include A recoverable backup tag", exact: true })
	).toBeVisible()
})

test("successful inline creation retains the relationship when concurrent typing returns to the original notes", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const original = IDBObjectStore.prototype.put
		IDBObjectStore.prototype.put = function (value: unknown, ...rest: unknown[]) {
			const entry = value as { draft?: { base?: unknown; document?: { collection?: string } } }
			if (
				(window as any).__completeInline &&
				this.name === "drafts" &&
				entry.draft?.document?.collection === "vendors" &&
				entry.draft.base === null
			) {
				;(window as any).__completeInline = false
				const textarea = document.querySelector<HTMLTextAreaElement>("textarea.cms-body")!
				const before = textarea.value,
					set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
				for (const text of ["Temporary newer notes.", before]) {
					set.call(textarea, text)
					textarea.dispatchEvent(new Event("input", { bubbles: true }))
				}
			}
			return original.apply(this, [value, ...rest] as Parameters<IDBObjectStore["put"]>)
		}
	})
	await githubFixture(page)
	await page.goto("/")
	await openEditor(page)
	await command(page, "Working changes")
	await page.getByLabel("New record", { exact: true }).selectOption("tastings")
	await page.getByRole("textbox", { name: /^Tea name/ }).fill("Successful atomic relation")
	await page
		.getByLabel("Notes", { exact: true })
		.fill("Original notes before successful related creation.")
	await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible()
	const id = new URL(page.url()).searchParams.get("id")!
	await page.getByRole("button", { name: "New vendor", exact: true }).click()
	await page
		.getByRole("group", { name: "New vendor", exact: true })
		.getByRole("textbox", { name: /^Name/ })
		.fill("A successful new vendor")
	await page.evaluate(() => ((window as any).__completeInline = true))
	await page.getByRole("button", { name: "Create & use vendor", exact: true }).click()
	await expect(
		page.getByRole("button", { name: "Remove A successful new vendor", exact: true })
	).toBeVisible()
	await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible()
	await page.reload()
	await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
		"Original notes before successful related creation."
	)
	await expect(
		page.getByRole("button", { name: "Remove A successful new vendor", exact: true })
	).toBeVisible()
	const stored = await page.evaluate(async (id) => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open("puerh-authoring", 3)
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		const records = await new Promise<any[]>((resolve, reject) => {
			const request = db.transaction("drafts", "readonly").objectStore("drafts").getAll()
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		const child = records.find((entry) => entry.draft.document.collection === "vendors").draft
		return {
			vendor: records.find((entry) => entry.draft.id === id).draft.document.data.vendor,
			child: child.id,
		}
	}, id)
	expect(stored.vendor).toEqual([stored.child])
})
