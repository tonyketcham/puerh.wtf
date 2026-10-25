import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createCmsHandler } from "./handler.mjs"
import { configuration, seal, unseal } from "./security.mjs"
import { blobSha, validateAssets, prMetadata } from "./documents.mjs"

const ENV = {
	CMS_GITHUB_CLIENT_ID: "client",
	CMS_GITHUB_CLIENT_SECRET: "secret",
	CMS_SESSION_SECRET: "a sufficiently long random secret used only by tests",
	CMS_ORIGIN: "https://tea.test",
}
const NOW = 1792800000000,
	USER = { id: 7, login: "editor", avatar_url: "https://avatars.test/7" }
const vendor = (title = "Example vendor", extra = "") =>
	`---\nid: 11111111-1111-4111-8111-111111111111\ntitle: ${title}\n${extra}---\n\nVendor notes.\n`
const PATH = "app/content/vendors/example.md",
	OP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const hash = (value) => createHash("sha1").update(value).digest("hex")
const clone = (value) => JSON.parse(JSON.stringify(value))
class FakeGitHub {
	constructor() {
		this.repo = { full_name: "tonyketcham/puerh.wtf", default_branch: "main" }
		this.refs = { main: hash("initial") }
		this.snapshots = { [this.refs.main]: { [PATH]: vendor() } }
		this.commits = {
			[this.refs.main]: {
				sha: this.refs.main,
				commit: { message: "Initial content" },
				parents: [],
			},
		}
		this.pulls = []
		this.calls = []
		this.permission = "write"
		this.strict = true
		this.checkState = "SUCCESS"
		this.lostCommit = false
		this.lostPr = false
	}
	current(pr) {
		return {
			...clone(pr),
			head: { ...pr.head, sha: this.refs[pr.head.ref] },
			base: { ...pr.base, sha: this.refs.main },
		}
	}
	makeCommit(branch, changes, message) {
		const previous = this.refs[branch],
			records = { ...this.snapshots[previous], ...changes },
			sha = hash(`${previous}:${JSON.stringify(records)}:${message}`)
		this.snapshots[sha] = records
		this.commits[sha] = { sha, commit: { message }, parents: [{ sha: previous }] }
		this.refs[branch] = sha
		return sha
	}
	response(value, status = 200) {
		return new Response(JSON.stringify(value), {
			status,
			headers: { "content-type": "application/json" },
		})
	}
	fetch = async (url, options = {}) => {
		const u = new URL(url),
			method = options.method || "GET",
			body = options.body ? JSON.parse(options.body) : undefined
		this.calls.push({ path: u.pathname, search: u.search, method, body, headers: options.headers })
		if (url === "https://github.com/login/oauth/access_token")
			return this.response({ access_token: "ghu_TEST_TOKEN_NEVER_EXPOSE", expires_in: 28800 })
		const path = u.pathname.replace("/repos/tonyketcham/puerh.wtf", "")
		if (u.pathname === "/user")
			return this.revoked ? this.response({ message: "Bad credentials" }, 401) : this.response(USER)
		if (path === "") return this.response(this.repo)
		if (path === "/collaborators/editor/permission")
			return this.response({ permission: this.permission })
		if (path.startsWith("/git/ref/heads/")) {
			const branch = decodeURIComponent(path.slice("/git/ref/heads/".length))
			return this.refs[branch]
				? this.response({ object: { sha: this.refs[branch] } })
				: this.response({}, 404)
		}
		if (path === "/git/refs" && method === "POST") {
			const branch = body.ref.slice("refs/heads/".length)
			if (this.refs[branch]) return this.response({}, 422)
			this.refs[branch] = body.sha
			return this.response({ object: { sha: body.sha } }, 201)
		}
		if (path.startsWith("/git/trees/")) {
			const records = this.snapshots[path.split("/").at(-1)]
			if (!records) return this.response({}, 404)
			return this.response({
				truncated: false,
				tree: Object.entries(records).map(([path, content]) => ({
					path,
					sha: blobSha(content),
					mode: "100644",
					type: "blob",
					size: Buffer.byteLength(content),
				})),
			})
		}
		if (path.startsWith("/git/blobs/")) {
			const sha = path.split("/").at(-1),
				content = Object.values(this.snapshots)
					.flatMap(Object.values)
					.find((value) => blobSha(value) === sha)
			return content === undefined
				? this.response({}, 404)
				: this.response({
						encoding: "base64",
						size: Buffer.byteLength(content),
						content: Buffer.from(content).toString("base64"),
				  })
		}
		if (path === "/commits") {
			let sha = this.refs[u.searchParams.get("sha")],
				values = []
			while (sha && values.length < 1000) {
				values.push(this.commits[sha])
				sha = this.commits[sha]?.parents[0]?.sha
			}
			const page = Number(u.searchParams.get("page") || 1)
			return this.response(values.slice((page - 1) * 100, page * 100))
		}
		if (path === "/pulls" && method === "GET") {
			const head = u.searchParams.get("head")?.replace("tonyketcham:", "")
			return this.response(
				this.pulls
					.filter(
						(pr) =>
							(!head || pr.head.ref === head) &&
							(u.searchParams.get("state") !== "open" || pr.state === "open")
					)
					.map((pr) => this.current(pr))
			)
		}
		if (path === "/pulls" && method === "POST") {
			const pr = {
				number: this.pulls.length + 1,
				node_id: `PR_${this.pulls.length + 1}`,
				title: body.title,
				body: body.body,
				html_url: `https://github.com/tonyketcham/puerh.wtf/pull/${this.pulls.length + 1}`,
				draft: body.draft,
				state: "open",
				user: USER,
				head: { ref: body.head, sha: this.refs[body.head], repo: this.repo },
				base: { ref: body.base, sha: this.refs.main, repo: this.repo },
			}
			this.pulls.push(pr)
			if (this.lostPr) {
				this.lostPr = false
				throw new Error("response lost after PR creation")
			}
			return this.response(this.current(pr), 201)
		}
		if (/^\/pulls\/\d+\/files$/.test(path)) {
			const pr = this.pulls[Number(path.split("/")[2]) - 1],
				before = this.snapshots[this.refs.main],
				after = this.snapshots[this.refs[pr.head.ref]]
			return this.response(
				Object.entries(after)
					.filter(([key, value]) => before[key] !== value)
					.map(([filename]) => ({
						filename,
						status: before[filename] === undefined ? "added" : "modified",
					}))
			)
		}
		if (/^\/pulls\/\d+\/merge$/.test(path)) {
			const pr = this.pulls[Number(path.split("/")[2]) - 1]
			if (body.sha !== this.refs[pr.head.ref]) return this.response({}, 409)
			pr.state = "closed"
			pr.merged = true
			this.refs.main = body.sha
			return this.response({ merged: true, sha: body.sha })
		}
		if (/^\/pulls\/\d+$/.test(path)) {
			const pr = this.pulls[Number(path.split("/")[2]) - 1]
			if (!pr) return this.response({}, 404)
			if (method === "PATCH") Object.assign(pr, body)
			return this.response(this.current(pr))
		}
		if (path.startsWith("/compare/")) return this.response({ status: "ahead" })
		if (u.pathname === "/graphql") {
			if (body.query.includes("CmsBlobs")) {
				const repository = {}
				Object.entries(body.variables)
					.filter(([key]) => key.startsWith("oid"))
					.forEach(([key, sha]) => {
						const content = Object.values(this.snapshots)
							.flatMap(Object.values)
							.find((value) => blobSha(value) === sha)
						repository["blob" + key.slice(3)] =
							content === undefined
								? null
								: { text: content, byteSize: Buffer.byteLength(content), isBinary: false }
					})
				return this.response({ data: { repository } })
			}
			if (body.query.includes("CmsCommit")) {
				const input = body.variables.input
				// GitHub CommittableBranch input, verified by live schema introspection 2026-10-25.
				// https://docs.github.com/en/graphql/reference/git#committablebranch
				const fields = new Set(["id", "repositoryNameWithOwner", "branchName"])
				const unsupported = Object.keys(input.branch).find((field) => !fields.has(field))
				if (unsupported)
					return this.response({
						errors: [{ message: `Field '${unsupported}' is not defined on CommittableBranch` }],
					})
				const branch = input.branch.branchName
				if (this.refs[branch] !== input.expectedHeadOid)
					return this.response({
						errors: [{ message: "expectedHeadOid does not match latest head" }],
					})
				const changes = Object.fromEntries(
					input.fileChanges.additions.map((addition) => [
						addition.path,
						addition.path.startsWith("app/content/")
							? Buffer.from(addition.contents, "base64").toString("utf8")
							: Buffer.from(addition.contents, "base64"),
					])
				)
				const sha = this.makeCommit(
					branch,
					changes,
					`${input.message.headline}\n\n${input.message.body}`
				)
				if (this.lostCommit) {
					this.lostCommit = false
					throw new Error("response lost after commit")
				}
				return this.response({ data: { createCommitOnBranch: { commit: { oid: sha } } } })
			}
			if (body.query.includes("CmsProtection"))
				return this.response({
					data: {
						repository: {
							ref: {
								branchProtectionRule: {
									isAdminEnforced: this.strict,
									requiresStatusChecks: true,
									requiresStrictStatusChecks: this.strict,
									requiredStatusCheckContexts: ["build"],
								},
							},
						},
					},
				})
			if (body.query.includes("CmsReady")) {
				const pr = this.pulls.find((pr) => pr.node_id === body.variables.id)
				pr.draft = false
				return this.response({
					data: {
						markPullRequestReadyForReview: { pullRequest: { id: pr.node_id, isDraft: false } },
					},
				})
			}
			if (body.query.includes("CmsReadiness")) {
				const pr = this.current(this.pulls[body.variables.number - 1])
				return this.response({
					data: {
						repository: {
							pullRequest: {
								id: pr.node_id,
								isDraft: pr.draft,
								headRefOid: pr.head.sha,
								baseRefOid: pr.base.sha,
								mergeStateStatus: this.checkState === "SUCCESS" ? "CLEAN" : "BLOCKED",
								reviewDecision: null,
								commits: { nodes: [{ commit: { statusCheckRollup: { state: this.checkState } } }] },
							},
						},
					},
				})
			}
		}
		throw new Error(`Unexpected fake GitHub request: ${method} ${u.pathname}${u.search}`)
	}
}
function sessionHeaders(extra = {}) {
	const config = configuration(ENV),
		session = {
			type: "session",
			token: "ghu_TEST_TOKEN_NEVER_EXPOSE",
			user: { id: USER.id },
			csrf: "csrf-test",
			expiresAt: NOW + 28800000,
		}
	return {
		cookie: `${config.sessionName}=${seal(session, config)}`,
		origin: ENV.CMS_ORIGIN,
		"content-type": "application/json",
		"x-csrf-token": session.csrf,
		...extra,
	}
}
async function call(
	handler,
	action,
	{ method = "GET", body, headers = sessionHeaders(), query = "" } = {}
) {
	const values = new Map()
	let output
	const res = {
		statusCode: 200,
		setHeader(name, value) {
			values.set(name.toLowerCase(), value)
		},
		getHeader(name) {
			return values.get(name.toLowerCase())
		},
		end(value) {
			output = value
		},
	}
	await handler({ method, url: `/api/cms?action=${action}${query}`, headers, body }, res)
	return {
		status: res.statusCode,
		headers: values,
		text: Buffer.isBuffer(output) ? null : output,
		bytes: Buffer.isBuffer(output) ? output : null,
		value: typeof output === "string" && output ? JSON.parse(output) : null,
	}
}
function setup() {
	const github = new FakeGitHub()
	return { github, handler: createCmsHandler({ env: ENV, fetch: github.fetch, now: () => NOW }) }
}
function pushBody(github, content = vendor("Updated vendor"), operationId = OP, target) {
	return {
		operationId,
		target: target || { branch: "main", head: github.refs.main },
		documents: [{ path: PATH, content, expectedBlobSha: blobSha(vendor()) }],
		assets: [],
	}
}

test("unconfigured sessions are honest and make no GitHub request", async () => {
	const response = await call(createCmsHandler({ env: {} }), "session", { headers: {} })
	assert.equal(response.status, 200)
	assert.equal(response.value.configured, false)
	assert.equal(response.value.authenticated, false)
	assert.match(response.headers.get("cache-control"), /no-store/)
})
test("authorization is server checked, public readability grants no authority, and revoked sessions clear cookies", async () => {
	const { github, handler } = setup()
	const good = await call(handler, "session")
	assert.equal(good.value.user.login, "editor")
	assert.equal(good.value.csrfToken, "csrf-test")
	assert(!good.text.includes("ghu_TEST_TOKEN"))
	github.permission = "read"
	const reader = await call(handler, "catalog")
	assert.equal(reader.status, 403)
	github.permission = "none"
	const unrelated = await call(handler, "session")
	assert.equal(unrelated.value.authenticated, false)
	github.permission = "write"
	github.revoked = true
	const revoked = await call(handler, "catalog")
	assert.equal(revoked.status, 401)
	assert.match(revoked.headers.get("set-cookie")[0], /Max-Age=0/)
})
test("origin and CSRF failures happen before protected GitHub calls", async () => {
	const { github, handler } = setup(),
		body = pushBody(github)
	for (const headers of [
		sessionHeaders({ origin: "https://evil.test" }),
		sessionHeaders({ "x-csrf-token": "wrong" }),
	]) {
		const before = github.calls.length,
			response = await call(handler, "push", { method: "POST", body, headers })
		assert.equal(response.status, 403)
		assert.equal(github.calls.length, before)
	}
})
test("OAuth uses bound state/PKCE, safe return targets, and encrypted HttpOnly cookies", async () => {
	const { github, handler } = setup(),
		config = configuration(ENV)
	const login = await call(handler, "login", { query: "&returnTo=%2F%2Fevil.test", headers: {} })
	const location = new URL(login.headers.get("location")),
		flowCookie = login.headers.get("set-cookie")[0].split(";")[0]
	assert.equal(location.searchParams.get("code_challenge_method"), "S256")
	assert.equal(location.searchParams.get("redirect_uri"), `${ENV.CMS_ORIGIN}/api/cms`)
	const invalid = await call(handler, "callback", {
		query: "&code=example&state=forged",
		headers: { cookie: flowCookie },
	})
	assert.equal(invalid.status, 403)
	assert.equal(github.calls.length, 0)
	const callback = await call(handler, "callback", {
		query: `&code=example&state=${location.searchParams.get("state")}`,
		headers: { cookie: flowCookie },
	})
	assert.equal(callback.status, 302)
	assert.equal(callback.headers.get("location"), "/")
	const cookie = callback.headers
		.get("set-cookie")
		.find((value) => value.startsWith(`${config.sessionName}=`))
	assert.match(cookie, /HttpOnly; SameSite=Lax.*Secure/)
	assert(!cookie.includes("ghu_TEST_TOKEN"))
	const value = unseal(cookie.split(";")[0].slice(config.sessionName.length + 1), config, NOW)
	assert.equal(value.token, "ghu_TEST_TOKEN_NEVER_EXPOSE")
})
test("catalog is a complete exact-head allowlisted raw source snapshot", async () => {
	const { github, handler } = setup()
	const response = await call(handler, "catalog")
	assert.equal(response.status, 200)
	assert.equal(response.value.head, github.refs.main)
	assert.deepEqual(response.value.records, [
		{ path: PATH, content: vendor(), sha: blobSha(vendor()) },
	])
	const foreign = await call(handler, "catalog", { query: "&branch=feature%2Fsource-code" })
	assert.equal(foreign.status, 403)
})
test("push creates one atomic commit and draft PR; exact retries create neither again", async () => {
	const { github, handler } = setup(),
		body = pushBody(github)
	const first = await call(handler, "push", { method: "POST", body })
	assert.equal(first.status, 200, first.text)
	assert.equal(first.value.pullRequest.draft, true)
	assert.match(first.value.branch, /^cms\/authoring\/7\//)
	const repeated = await call(handler, "push", { method: "POST", body })
	assert.equal(repeated.status, 200, repeated.text)
	assert.equal(repeated.value.head, first.value.head)
	assert.equal(github.pulls.length, 1)
	assert.equal(
		github.calls.filter((call) => call.path === "/graphql" && call.body.query.includes("CmsCommit"))
			.length,
		1
	)
	const changed = await call(handler, "push", {
		method: "POST",
		body: { ...body, documents: [{ ...body.documents[0], content: vendor("Different payload") }] },
	})
	assert.equal(changed.status, 409)
	assert.equal(changed.value.error.code, "operation_reused")
})
test("commit transport follows GitHub's CommittableBranch input schema", async () => {
	const { github, handler } = setup(),
		body = pushBody(github),
		result = await call(handler, "push", { method: "POST", body })
	assert.equal(result.status, 200, result.text)
	const request = github.calls.find(
		(request) => request.path === "/graphql" && request.body.query.includes("CmsCommit")
	)
	assert.deepEqual(request.body.variables.input.branch, {
		repositoryNameWithOwner: "tonyketcham/puerh.wtf",
		branchName: result.value.branch,
	})
	// Negative control: the previous provider-invalid field must fail before any commit.
	const invalid = clone(request.body)
	invalid.variables.input.branch.refName = invalid.variables.input.branch.branchName
	delete invalid.variables.input.branch.branchName
	const rejected = await github.fetch("https://api.github.com/graphql", {
		method: "POST",
		body: JSON.stringify(invalid),
	})
	assert.match((await rejected.json()).errors[0].message, /refName.*not defined/)
	assert.equal(github.refs[result.value.branch], result.value.head)
})

test("an exact pending push resumes its existing branch after main advances", async () => {
	const { github, handler } = setup(),
		body = pushBody(github),
		captured = clone(body),
		branch = `cms/authoring/${USER.id}/${body.operationId}`
	// A previous attempt created the branch but failed before committing content.
	github.refs[branch] = body.target.head
	const currentMain = github.makeCommit("main", { "README.md": "Service fix" }, "Deploy fix")
	const first = await call(handler, "push", { method: "POST", body })
	assert.equal(first.status, 200, first.text)
	assert.deepEqual(body, captured)
	assert.equal(github.commits[first.value.head].parents[0].sha, captured.target.head)
	assert.equal(github.refs.main, currentMain)
	assert.equal(first.value.pullRequest.baseHead, currentMain)
	const requests = () =>
		github.calls.filter(
			(request) => request.path === "/graphql" && request.body.query.includes("CmsCommit")
		)
	const input = requests()[0].body.variables.input
	assert.equal(input.expectedHeadOid, captured.target.head)
	assert.equal(input.clientMutationId, captured.operationId)
	const digest = createHash("sha256")
		.update(
			JSON.stringify({
				target: { ...captured.target, pullRequestNumber: null },
				documents: captured.documents,
				assets: captured.assets,
			})
		)
		.digest("hex")
	assert(input.message.body.includes(`CMS-Operation: ${captured.operationId}`))
	assert(input.message.body.includes(`CMS-Payload-SHA256: ${digest}`))
	const repeated = await call(handler, "push", { method: "POST", body: captured })
	assert.equal(repeated.status, 200, repeated.text)
	assert.equal(repeated.value.head, first.value.head)
	assert.equal(requests().length, 1)
	assert.equal(github.pulls.length, 1)
	assert.equal(
		github.calls.filter(
			(request) => request.path.endsWith("/git/refs") && request.method === "POST"
		).length,
		0
	)
})

test("a pending push cannot replace a moved operation branch after main advances", async () => {
	const { github, handler } = setup(),
		body = pushBody(github),
		branch = `cms/authoring/${USER.id}/${body.operationId}`
	github.refs[branch] = body.target.head
	const movedHead = github.makeCommit(branch, { [PATH]: vendor("Other edit") }, "Other work")
	github.makeCommit("main", { "README.md": "Service fix" }, "Deploy fix")
	const result = await call(handler, "push", { method: "POST", body })
	assert.equal(result.status, 409, result.text)
	assert.equal(result.value.error.code, "head_conflict")
	assert.equal(result.value.error.details?.operationStatus, "not_committed")
	assert.equal(github.refs[branch], movedHead)
	assert.equal(github.pulls.length, 0)
	assert.equal(
		github.calls.filter(
			(request) => request.path === "/graphql" && request.body.query.includes("CmsCommit")
		).length,
		0
	)
})

test("a lost commit response or PR response reconciles without duplicate writes", async () => {
	for (const failure of ["lostCommit", "lostPr"]) {
		const { github, handler } = setup(),
			body = pushBody(github)
		github[failure] = true
		const first = await call(handler, "push", { method: "POST", body })
		assert([200, 503].includes(first.status), first.text)
		const retry = await call(handler, "push", { method: "POST", body })
		assert.equal(retry.status, 200, retry.text)
		assert.equal(github.pulls.length, 1)
		assert.equal(
			github.calls.filter(
				(call) => call.path === "/graphql" && call.body.query.includes("CmsCommit")
			).length,
			1
		)
	}
})
test("stale branch/blob, source paths and stable ID changes cannot commit", async () => {
	for (const change of ["head", "blob", "path", "id"]) {
		const { github, handler } = setup(),
			body = pushBody(github)
		if (change === "head") body.target.head = hash("stale")
		if (change === "blob") body.documents[0].expectedBlobSha = hash("stale-blob")
		if (change === "path") body.documents[0].path = ".github/workflows/unsafe.yml"
		if (change === "id")
			body.documents[0].content = vendor().replace(
				"11111111-1111-4111-8111-111111111111",
				"22222222-2222-4222-8222-222222222222"
			)
		const response = await call(handler, "push", { method: "POST", body })
		assert([409, 422].includes(response.status), response.text)
		assert.equal(
			github.calls.filter(
				(call) => call.path === "/graphql" && call.body.query.includes("CmsCommit")
			).length,
			0
		)
	}
})
test("related new records commit together; missing relations are rejected", async () => {
	const { github, handler } = setup(),
		body = pushBody(github)
	const session = {
		path: "app/content/tastings/new-session.md",
		expectedBlobSha: null,
		content:
			"---\nid: 33333333-3333-4333-8333-333333333333\ntitle: New session\ndate: 2026-10-24T12:00:00.000Z\nvendor:\n  - 11111111-1111-4111-8111-111111111111\n---\nSession notes\n",
	}
	body.documents.push(session)
	const result = await call(handler, "push", { method: "POST", body })
	assert.equal(result.status, 200, result.text)
	assert.equal(result.value.documents.length, 2)
	const next = setup(),
		bad = pushBody(next.github)
	bad.documents = [
		{
			...session,
			content: session.content.replace(
				"11111111-1111-4111-8111-111111111111",
				"99999999-9999-4999-8999-999999999999"
			),
		},
	]
	const rejected = await call(next.handler, "push", { method: "POST", body: bad })
	assert.equal(rejected.value.error.code, "relationship")
})
test("subsequent pushes reuse the PR and preserve human-authored title/body", async () => {
	const { github, handler } = setup(),
		first = await call(handler, "push", { method: "POST", body: pushBody(github) })
	github.pulls[0].title = "Human editorial title"
	github.pulls[0].body = "Human description"
	const secondBody = pushBody(
		github,
		vendor("Second edit"),
		"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		{ branch: first.value.branch, head: first.value.head, pullRequestNumber: 1 }
	)
	secondBody.documents[0].expectedBlobSha = blobSha(vendor("Updated vendor"))
	const second = await call(handler, "push", { method: "POST", body: secondBody })
	assert.equal(second.status, 200, second.text)
	assert.equal(github.pulls.length, 1)
	assert.equal(second.value.pullRequest.title, "Human editorial title")
	assert.match(second.value.pullRequest.body, /^Human description/)
})
test("publish guards exact cumulative scope, base/head, enforced checks, then uses normal SHA-guarded merge", async () => {
	const { github, handler } = setup(),
		baseHead = github.refs.main
	const pushed = await call(handler, "push", { method: "POST", body: pushBody(github) }),
		body = { number: 1, head: pushed.value.head, baseHead }
	const stale = await call(handler, "publish", {
		method: "POST",
		body: { ...body, head: hash("old") },
	})
	assert.equal(stale.value.error.code, "head_conflict")
	github.strict = false
	const unprotected = await call(handler, "publish", { method: "POST", body })
	assert.equal(unprotected.value.error.code, "publish_protection")
	assert.equal(github.pulls[0].draft, true)
	github.strict = true
	github.checkState = "PENDING"
	const pending = await call(handler, "publish", { method: "POST", body })
	assert.equal(pending.value.error.code, "publish_not_ready")
	assert.equal(github.pulls[0].draft, false)
	github.checkState = "SUCCESS"
	const published = await call(handler, "publish", { method: "POST", body })
	assert.equal(published.status, 200, published.text)
	assert.equal(published.value.merged, true)
	const merge = github.calls.find((call) => call.method === "PUT" && call.path.endsWith("/merge"))
	assert.deepEqual(merge.body, { sha: body.head, merge_method: "squash" })
})
test("a PR containing code changes is never published", async () => {
	const { github, handler } = setup(),
		baseHead = github.refs.main,
		result = await call(handler, "push", { method: "POST", body: pushBody(github) })
	const head = github.makeCommit(
		result.value.branch,
		{ "app/src/unsafe.ts": 'console.log("bad")' },
		"Manual code change"
	)
	const rejected = await call(handler, "publish", {
		method: "POST",
		body: { number: 1, head, baseHead },
	})
	assert.equal(rejected.value.error.code, "pull_request_scope")
	assert(!github.calls.some((call) => call.method === "PUT" && call.path.endsWith("/merge")))
})
test("media validation rejects traversal, spoofed formats and non-WebP uploads", () => {
	for (const asset of [
		{
			path: "app/public/images/uploads/authoring/../../unsafe.webp",
			mime: "image/webp",
			base64: "AAAA",
		},
		{
			path: `app/public/images/uploads/authoring/${"a".repeat(64)}/480.webp`,
			mime: "image/webp",
			base64: Buffer.from("<script>bad</script>").toString("base64"),
		},
	])
		assert.throws(() => validateAssets([asset]))
})
test("generated metadata updates only fields that still match the previous generated values", () => {
	const first = prMetadata(null, { title: "Generated title", body: "- One change" })
	const next = prMetadata(first, { title: "New generated title", body: "- Two changes" })
	assert.equal(next.title, "New generated title")
	assert.match(next.body, /^- Two changes/)
	const manual = prMetadata(
		{
			...first,
			title: "Manual title",
			body: first.body.replace("- One change", "Human explanation"),
		},
		{ title: "Automatic update", body: "- New changes" }
	)
	assert.equal(manual.title, "Manual title")
	assert.match(manual.body, /^Human explanation/)
})

test("invalid content is rejected before even creating a remote branch", async () => {
	const { github, handler } = setup(),
		body = pushBody(github)
	body.documents[0].content = "---\nid: wrong\ntitle: Invalid\n---\n"
	const response = await call(handler, "push", { method: "POST", body })
	assert.equal(response.status, 422)
	assert(!github.calls.some((call) => call.path.endsWith("/git/refs") && call.method === "POST"))
})
test("server independently validates known nested fields instead of trusting browser validation", async () => {
	const { github, handler } = setup(),
		body = pushBody(github)
	body.documents.push({
		path: "app/content/tastings/invalid-number.md",
		expectedBlobSha: null,
		content:
			"---\nid: 44444444-4444-4444-8444-444444444444\ntitle: Invalid brewing\ndate: 2026-10-24T12:00:00.000Z\nbrewing:\n  temperature: boiling\n---\nNotes\n",
	})
	const result = await call(handler, "push", { method: "POST", body })
	assert.equal(result.status, 422)
	assert.equal(result.value.error.code, "field")
	assert.equal(result.value.error.details.field, "brewing.temperature")
})
test("existing Unicode filenames and legacy NanoIDs survive server parsing without migration", async () => {
	const { parseDocument } = await import("./documents.mjs")
	const content = "---\nid: 67kM9WrWVFbDylg4smBnK\ntitle: Existing record\n---\nOriginal body\n"
	const record = parseDocument({ path: "app/content/tastings/2014-shu-pu’er-nuggets.md", content })
	assert.equal(record.data.id, "67kM9WrWVFbDylg4smBnK")
	assert.equal(record.content, content)
})
test("logout verifies origin even without a currently valid session cookie", async () => {
	const { handler } = setup()
	const forged = await call(handler, "logout", {
		method: "POST",
		body: {},
		headers: { origin: "https://evil.test", "content-type": "application/json" },
	})
	assert.equal(forged.status, 403)
	const good = await call(handler, "logout", { method: "POST", body: {} })
	assert.equal(good.status, 200)
	assert.equal(good.value.authenticated, false)
})
test("reverting a cumulative PR to its base is an acknowledged push, not an unrecoverable partial failure", async () => {
	const { github, handler } = setup(),
		first = await call(handler, "push", { method: "POST", body: pushBody(github) })
	const body = pushBody(github, vendor(), "cccccccc-cccc-4ccc-8ccc-cccccccccccc", {
		branch: first.value.branch,
		head: first.value.head,
		pullRequestNumber: 1,
	})
	body.documents[0].expectedBlobSha = blobSha(vendor("Updated vendor"))
	const reverted = await call(handler, "push", { method: "POST", body })
	assert.equal(reverted.status, 200, reverted.text)
	assert.equal(github.pulls.length, 1)
	assert.equal(reverted.value.pullRequest.title, "No outstanding tea log changes")
})

test("catalog blob reads are batched by immutable OID to preserve GitHub rate limits", async () => {
	const { github, handler } = setup()
	for (let index = 0; index < 125; index++)
		github.snapshots[github.refs.main][`app/content/vendors/vendor-${index}.md`] = vendor(
			`Vendor ${index}`
		).replace(
			"11111111-1111-4111-8111-111111111111",
			`${String(index + 1).padStart(8, "0")}-2222-4222-8222-222222222222`
		)
	const response = await call(handler, "catalog")
	assert.equal(response.status, 200, response.text)
	assert.equal(response.value.records.length, 126)
	const batches = github.calls.filter(
		(call) => call.path === "/graphql" && call.body.query.includes("CmsBlobs")
	)
	assert.equal(batches.length, 3)
	assert(
		batches.every(
			(call) => Object.keys(call.body.variables).filter((key) => key.startsWith("oid")).length <= 50
		)
	)
})

test("replaying an earlier operation never associates its source bytes with a later branch head", async () => {
	const { github, handler } = setup(),
		original = pushBody(github),
		first = await call(handler, "push", { method: "POST", body: original })
	const next = pushBody(github, vendor("Later content"), "dddddddd-dddd-4ddd-8ddd-dddddddddddd", {
		branch: first.value.branch,
		head: first.value.head,
		pullRequestNumber: 1,
	})
	next.documents[0].expectedBlobSha = blobSha(vendor("Updated vendor"))
	const later = await call(handler, "push", { method: "POST", body: next })
	assert.equal(later.status, 200, later.text)
	const replay = await call(handler, "push", { method: "POST", body: original })
	assert.equal(replay.status, 200, replay.text)
	assert.equal(replay.value.head, first.value.head)
	assert.equal(replay.value.remoteHead, later.value.head)
	assert.equal(replay.value.pullRequest.head, later.value.head)
	assert.equal(replay.value.documents[0].sha, blobSha(original.documents[0].content))
})

function webpFixture({
	canvasWidth = 1,
	canvasHeight = 1,
	imageWidth = 1,
	imageHeight = 1,
	imageType = "VP8L",
	extraFrame = false,
	extraCanvas = false,
	flags = 0,
} = {}) {
	function chunk(kind, bytes) {
		const value = Buffer.alloc(8 + bytes.length + (bytes.length % 2))
		value.write(kind, 0, "ascii")
		value.writeUInt32LE(bytes.length, 4)
		bytes.copy(value, 8)
		return value
	}
	const extended = Buffer.alloc(10)
	extended[0] = flags
	extended.writeUIntLE(canvasWidth - 1, 4, 3)
	extended.writeUIntLE(canvasHeight - 1, 7, 3)
	const image = Buffer.alloc(imageType === "VP8L" ? 5 : 10)
	if (imageType === "VP8L") {
		image[0] = 0x2f
		image.writeUInt32LE(((imageWidth - 1) | ((imageHeight - 1) << 14)) >>> 0, 1)
	} else {
		image.write("9d012a", 3, "hex")
		image.writeUInt16LE(imageWidth, 6)
		image.writeUInt16LE(imageHeight, 8)
	}
	const parts = [
		chunk("VP8X", extended),
		...(extraCanvas ? [chunk("VP8X", extended)] : []),
		chunk(imageType, image),
		...(extraFrame ? [chunk(imageType, image)] : []),
	]
	const payload = Buffer.concat(parts),
		file = Buffer.alloc(12 + payload.length)
	file.write("RIFF", 0)
	file.writeUInt32LE(file.length - 8, 4)
	file.write("WEBP", 8)
	payload.copy(file, 12)
	return file
}
test("actual WebP frame dimensions cannot be hidden by a small extended canvas", () => {
	for (const imageType of ["VP8L", "VP8 "]) {
		const bytes = webpFixture({ imageWidth: 15999, imageHeight: 15999, imageType })
		assert.throws(
			() =>
				validateAssets([
					{
						path: `app/public/images/uploads/authoring/${"a".repeat(64)}/1.webp`,
						mime: "image/webp",
						base64: bytes.toString("base64"),
					},
				]),
			/dimensions must agree/
		)
	}
})
test("WebP duplicate frames, duplicate canvases and hidden metadata flags are rejected", () => {
	for (const options of [
		{ extraFrame: true },
		{ extraCanvas: true },
		{ flags: 0x08 },
		{ flags: 0x02 },
	]) {
		const bytes = webpFixture(options)
		assert.throws(() =>
			validateAssets([
				{
					path: `app/public/images/uploads/authoring/${"a".repeat(64)}/1.webp`,
					mime: "image/webp",
					base64: bytes.toString("base64"),
				},
			])
		)
	}
})
test("the strict header checks accept real opaque and transparent encoder output", async () => {
	const { default: sharp } = await import("sharp")
	for (const alpha of [1, 0.5]) {
		const bytes = await sharp({
			create: { width: 32, height: 24, channels: 4, background: { r: 10, g: 80, b: 40, alpha } },
		})
			.webp()
			.toBuffer()
		const result = validateAssets([
			{
				path: `app/public/images/uploads/authoring/${"a".repeat(64)}/32.webp`,
				mime: "image/webp",
				base64: bytes.toString("base64"),
			},
		])
		assert.equal(result[0].width, 32)
		assert.equal(result[0].height, 24)
	}
})

test("only proven precommit rejections let the client return to review", async () => {
	for (const invalid of ["blob", "field", "asset", "count"]) {
		const { github, handler } = setup(),
			body = pushBody(github)
		if (invalid === "blob") body.documents[0].expectedBlobSha = hash("other")
		if (invalid === "field") body.documents[0].content = vendor("Invalid", "description: 123\n")
		if (invalid === "asset")
			body.assets = [{ path: "bad.webp", mime: "image/webp", base64: "AAAA" }]
		if (invalid === "count")
			body.documents = Array.from({ length: 41 }, () => ({ ...body.documents[0] }))
		const result = await call(handler, "push", { method: "POST", body })
		assert.equal(result.value.error.details?.operationStatus, "not_committed", result.text)
		assert.equal(
			github.calls.filter(
				(request) => request.path === "/graphql" && request.body.query.includes("CmsCommit")
			).length,
			0
		)
		assert.equal(
			github.calls.filter(
				(request) => request.path.endsWith("/git/refs") && request.method === "POST"
			).length,
			0
		)
	}
	const { github, handler } = setup(),
		body = pushBody(github)
	github.makeCommit("main", { [PATH]: vendor("Concurrent main") }, "Someone else")
	const moved = await call(handler, "push", { method: "POST", body })
	assert.equal(moved.value.error.code, "head_conflict")
	assert.equal(moved.value.error.details?.operationStatus, "not_committed")
})

test("history gaps, reused operations and postcommit failures never prove non-commit", async () => {
	const { github, handler } = setup(),
		oldBody = pushBody(github)
	for (let i = 0; i < 101; i++)
		github.makeCommit("main", { [PATH]: vendor("Main " + i) }, "Later " + i)
	const unknown = await call(handler, "push", { method: "POST", body: oldBody })
	assert.equal(unknown.value.error.code, "head_conflict")
	assert.equal(unknown.value.error.details?.operationStatus, undefined)
	const next = setup(),
		body = pushBody(next.github)
	next.github.lostPr = true
	const lost = await call(next.handler, "push", { method: "POST", body })
	assert.equal(lost.status, 503)
	assert.equal(lost.value.error.details?.operationStatus, undefined)
	const reused = await call(next.handler, "push", {
		method: "POST",
		body: { ...body, documents: [{ ...body.documents[0], content: vendor("Different") }] },
	})
	assert.equal(reused.value.error.code, "operation_reused")
	assert.equal(reused.value.error.details?.operationStatus, undefined)
})

test("media preview serves the exact authenticated PR image before it is published", async () => {
	const { default: sharp } = await import("sharp")
	const { github, handler } = setup(),
		bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#225533" } })
			.webp()
			.toBuffer()
	const path = "app/public/images/uploads/authoring/" + "a".repeat(64) + "/32.webp",
		body = pushBody(
			github,
			vendor("With image", "image: " + path.slice("app/public".length) + "\n")
		)
	body.assets = [{ path, mime: "image/webp", base64: bytes.toString("base64") }]
	const pushed = await call(handler, "push", { method: "POST", body })
	assert.equal(pushed.status, 200, pushed.text)
	const query =
		"&" + new URLSearchParams({ branch: pushed.value.branch, head: pushed.value.head, path })
	const image = await call(handler, "media", { query })
	assert.equal(image.status, 200, image.text)
	assert.deepEqual(image.bytes, bytes)
	assert.equal(image.headers.get("content-type"), "image/webp")
	assert.match(image.headers.get("cache-control"), /private, no-store/)
	const stale = await call(handler, "media", {
		query: query.replace(pushed.value.head, hash("stale")),
	})
	assert.equal(stale.value.error.code, "head_conflict")
	const wrongPath = await call(handler, "media", {
		query:
			"&" +
			new URLSearchParams({
				branch: pushed.value.branch,
				head: pushed.value.head,
				path: "app/src/private.ts",
			}),
	})
	assert.equal(wrongPath.status, 422)
	const otherOwner = await call(handler, "media", {
		query: query.replace("cms%2Fauthoring%2F7%2F", "cms%2Fauthoring%2F8%2F"),
	})
	assert.equal(otherOwner.status, 403)
	const unauthorized = await call(handler, "media", { query, headers: {} })
	assert.equal(unauthorized.status, 401)
	github.permission = "read"
	const revoked = await call(handler, "media", { query })
	assert.equal(revoked.status, 403)
})

test("media preview rejects unreferenced and malformed bytes even on a reviewed head", async () => {
	const { default: sharp } = await import("sharp")
	const { github, handler } = setup(),
		bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#225533" } })
			.webp()
			.toBuffer()
	const path = "app/public/images/uploads/authoring/" + "b".repeat(64) + "/32.webp"
	let head = github.makeCommit("main", { [path]: bytes }, "Orphan image")
	const query = () => "&" + new URLSearchParams({ branch: "main", head, path })
	const orphan = await call(handler, "media", { query: query() })
	assert.equal(orphan.value.error.code, "media_scope")
	head = github.makeCommit(
		"main",
		{
			[PATH]: vendor("With image", "image: " + path.slice("app/public".length) + "\n"),
			[path]: Buffer.from("<script>unsafe</script>"),
		},
		"Malformed image"
	)
	const malformed = await call(handler, "media", { query: query() })
	assert.equal(malformed.value.error.code, "asset_format")
})

test("closed owned targets reject before committing but recovered writes never become abandonable", async () => {
	const { github, handler } = setup(),
		original = pushBody(github)
	const first = await call(handler, "push", { method: "POST", body: original })
	github.pulls[0].state = "closed"
	const next = pushBody(
		github,
		vendor("Later local edit"),
		"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
		{ branch: first.value.branch, head: first.value.head, pullRequestNumber: 1 }
	)
	next.documents[0].expectedBlobSha = blobSha(vendor("Updated vendor"))
	const rejected = await call(handler, "push", { method: "POST", body: next })
	assert.equal(rejected.value.error.code, "pull_request_closed")
	assert.equal(rejected.value.error.details?.operationStatus, "not_committed")
	const recovered = await call(handler, "push", { method: "POST", body: original })
	assert.equal(recovered.value.error.code, "pull_request_closed")
	assert.equal(recovered.value.error.details?.operationStatus, undefined)
})
