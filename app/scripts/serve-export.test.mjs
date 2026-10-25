import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { once } from "node:events"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createExportServer } from "./serve-export.mjs"

let temporary, server, baseURL

before(async () => {
	temporary = await mkdtemp(join(tmpdir(), "puerh-export-"))
	const root = join(temporary, "out")
	await mkdir(join(root, "vendors"), { recursive: true })
	await writeFile(join(root, "index.html"), "<h1>Home</h1>")
	await writeFile(join(root, "vendors", "index.html"), "<h1>Vendors</h1>")
	await writeFile(join(root, "vendors", "index.txt"), "exported flight payload")
	await writeFile(join(root, "worker.js"), "self.onmessage = () => {}")
	await writeFile(join(temporary, "outside.txt"), "outside the export")
	server = createExportServer(root).listen(0, "127.0.0.1")
	await once(server, "listening")
	baseURL = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
	if (server) await new Promise((done) => server.close(done))
	if (temporary) {
		assert.ok(temporary.startsWith(join(tmpdir(), "puerh-export-")))
		await rm(temporary, { recursive: true, force: true })
	}
})

test("serves directory routes and query strings from the export", async () => {
	const redirect = await fetch(`${baseURL}/vendors?q=tea`, { redirect: "manual" })
	assert.equal(redirect.status, 308)
	assert.equal(redirect.headers.get("location"), "/vendors/?q=tea")
	const response = await fetch(`${baseURL}/vendors/?q=tea`)
	assert.equal(response.status, 200)
	assert.match(response.headers.get("content-type"), /^text\/html/)
	assert.equal(await response.text(), "<h1>Vendors</h1>")
})

test("serves Flight payloads and workers with their required MIME types", async () => {
	const flight = await fetch(`${baseURL}/vendors/index.txt?_rsc=example`)
	assert.match(flight.headers.get("content-type"), /^text\/plain/)
	assert.equal(await flight.text(), "exported flight payload")
	const worker = await fetch(`${baseURL}/worker.js`)
	assert.match(worker.headers.get("content-type"), /^text\/javascript/)
})

test("supports HEAD and rejects writes", async () => {
	const head = await fetch(`${baseURL}/`, { method: "HEAD" })
	assert.equal(head.status, 200)
	assert.equal(Number(head.headers.get("content-length")), Buffer.byteLength("<h1>Home</h1>"))
	assert.equal(await head.text(), "")
	const post = await fetch(`${baseURL}/`, { method: "POST" })
	assert.equal(post.status, 405)
	assert.equal(post.headers.get("allow"), "GET, HEAD")
})

test("missing assets stay missing and encoded paths cannot leave the export", async () => {
	const missing = await fetch(`${baseURL}/missing.txt`)
	assert.equal(missing.status, 404)
	assert.equal(await missing.text(), "Not found")
	const outside = await fetch(`${baseURL}/..%2Foutside.txt`)
	assert.equal(outside.status, 403)
	assert.notEqual(await outside.text(), "outside the export")
	assert.equal((await fetch(`${baseURL}/%ZZ`)).status, 400)
})
