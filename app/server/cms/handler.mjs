import {
	configuration,
	assert,
	CmsError,
	randomToken,
	equal,
	seal,
	unseal,
	cookieValue,
	setCookie,
	safeReturnTo,
	verifyCsrf,
	authorize,
	publicUser,
} from "./security.mjs"
import {
	githubClient,
	authoringBranch,
	branchHead,
	readCatalog,
	listAuthoringPulls,
} from "./github.mjs"
import { pushChangeSet, publishPull, publicationStatus, updateEdition } from "./operations.mjs"
import { readMedia } from "./media.mjs"
import { createHash } from "node:crypto"

const MAX_BODY = 4000000
function json(res, status, value) {
	res.statusCode = status
	res.setHeader("Content-Type", "application/json; charset=utf-8")
	res.end(JSON.stringify(value))
}
function redirect(res, location) {
	res.statusCode = 302
	res.setHeader("Location", location)
	res.end()
}
async function readBody(req) {
	if (req.body !== undefined) {
		const source =
			typeof req.body === "string" || Buffer.isBuffer(req.body)
				? String(req.body)
				: JSON.stringify(req.body)
		assert(
			Buffer.byteLength(source) <= MAX_BODY,
			413,
			"request_limit",
			"This selection exceeds the upload limit. Keep its drafts local and push fewer records/images."
		)
		try {
			return JSON.parse(source)
		} catch {
			throw new CmsError(400, "json", "The request must contain valid JSON.")
		}
	}
	const chunks = []
	let size = 0
	for await (const chunk of req) {
		size += chunk.length
		assert(
			size <= MAX_BODY,
			413,
			"request_limit",
			"This selection exceeds the upload limit. Push fewer records/images."
		)
		chunks.push(chunk)
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"))
	} catch {
		throw new CmsError(400, "json", "The request must contain valid JSON.")
	}
}
export function createCmsHandler({
	env = process.env,
	fetch: transport = globalThis.fetch,
	now = Date.now,
} = {}) {
	return async function handler(req, res) {
		let config
		res.setHeader("Cache-Control", "private, no-store, max-age=0")
		res.setHeader("Vary", "Cookie")
		res.setHeader("X-Content-Type-Options", "nosniff")
		res.setHeader("Referrer-Policy", "no-referrer")
		try {
			config = configuration(env)
			const url = new URL(req.url, config.origin || "http://localhost")
			const action =
				url.searchParams.get("action") ||
				(url.searchParams.has("code") ||
				url.searchParams.has("state") ||
				url.searchParams.has("error")
					? "callback"
					: "session")
			const method = req.method || "GET"
			assert(
				(["session", "login", "callback", "catalog", "media"].includes(action) &&
					method === "GET") ||
					(["logout", "push", "publish", "publication-status", "update-edition"].includes(action) &&
						method === "POST"),
				405,
				"method",
				"This CMS action does not support the requested method."
			)
			const repository = { owner: config.owner, name: config.name, defaultBranch: null }
			if (action === "session" && !config.configured)
				return json(res, 200, { configured: false, authenticated: false, repository })
			assert(
				config.configured,
				503,
				"configuration",
				"GitHub editing is not configured. The site remains available and local drafts are retained."
			)
			const session = unseal(cookieValue(req, config.sessionName), config, now())
			if (action === "login") {
				const state = randomToken(),
					verifier = randomToken(),
					returnTo = safeReturnTo(url.searchParams.get("returnTo"))
				setCookie(
					res,
					config.flowName,
					seal({ type: "flow", state, verifier, returnTo, expiresAt: now() + 600000 }, config),
					600,
					config
				)
				const login = new URL("https://github.com/login/oauth/authorize")
				Object.entries({
					client_id: config.clientId,
					redirect_uri: config.callbackUrl,
					state,
					code_challenge: createHash("sha256").update(verifier).digest("base64url"),
					code_challenge_method: "S256",
				}).forEach(([key, value]) => login.searchParams.set(key, value))
				return redirect(res, login.href)
			}
			if (action === "callback") {
				const flow = unseal(cookieValue(req, config.flowName), config, now())
				setCookie(res, config.flowName, "", 0, config)
				assert(
					flow?.type === "flow" && equal(flow.state, url.searchParams.get("state")),
					403,
					"oauth_state",
					"GitHub sign-in could not be verified. Enable editing again."
				)
				if (url.searchParams.has("error")) return redirect(res, safeReturnTo(flow.returnTo))
				const code = url.searchParams.get("code")
				assert(
					typeof code === "string" && code.length > 0 && code.length <= 512,
					400,
					"oauth_code",
					"GitHub sign-in did not provide a valid authorization code."
				)
				const response = await transport("https://github.com/login/oauth/access_token", {
					method: "POST",
					headers: { Accept: "application/json", "Content-Type": "application/json" },
					body: JSON.stringify({
						client_id: config.clientId,
						client_secret: config.clientSecret,
						code,
						code_verifier: flow.verifier,
						redirect_uri: config.callbackUrl,
					}),
					signal: AbortSignal.timeout(25000),
				})
				const token = await response.json()
				assert(
					response.ok &&
						typeof token.access_token === "string" &&
						token.access_token.length <= 1024 &&
						!token.error,
					401,
					"oauth_token",
					"GitHub could not complete sign-in. Try enabling editing again."
				)
				const github = githubClient(token.access_token, { fetch: transport }),
					user = await github.rest("GET", "/user")
				assert(
					Number.isSafeInteger(user.id) && user.id > 0,
					401,
					"authentication",
					"GitHub did not verify an account."
				)
				const seconds = Math.min(28800, Number(token.expires_in) || 28800)
				assert(seconds >= 60, 401, "authentication", "This GitHub authorization has expired.")
				const value = {
					type: "session",
					token: token.access_token,
					user: { id: user.id },
					csrf: randomToken(),
					expiresAt: now() + seconds * 1000,
				}
				await authorize(github, value, config, true)
				setCookie(res, config.sessionName, seal(value, config), seconds, config)
				return redirect(res, safeReturnTo(flow.returnTo))
			}
			if (action === "session") {
				if (!session) return json(res, 200, { configured: true, authenticated: false, repository })
				try {
					const context = await authorize(
						githubClient(session.token, { fetch: transport }),
						session,
						config,
						true
					)
					return json(res, 200, {
						configured: true,
						authenticated: true,
						user: publicUser(context.user),
						repository: { ...repository, defaultBranch: context.repo.default_branch },
						csrfToken: session.csrf,
					})
				} catch (error) {
					if (![401, 403, 404].includes(error.status)) throw error
					setCookie(res, config.sessionName, "", 0, config)
					return json(res, 200, {
						configured: true,
						authenticated: false,
						repository,
						reason: error.code,
					})
				}
			}
			if (action === "logout") {
				assert(
					req.headers?.origin === config.origin &&
						String(req.headers?.["content-type"] || "")
							.split(";")[0]
							.trim() === "application/json",
					403,
					"origin",
					"Logout must originate from the configured site."
				)
				if (session) verifyCsrf(req, session, config)
				setCookie(res, config.sessionName, "", 0, config)
				setCookie(res, config.flowName, "", 0, config)
				return json(res, 200, { authenticated: false })
			}
			assert(session, 401, "authentication", "Enable editing with GitHub before continuing.")
			if (method === "POST") verifyCsrf(req, session, config)
			const github = githubClient(session.token, { fetch: transport }),
				context = await authorize(github, session, config, true)
			if (action === "catalog") {
				const branch = url.searchParams.get("branch") || context.repo.default_branch
				assert(
					branch === context.repo.default_branch || authoringBranch(branch),
					403,
					"branch_scope",
					"The catalog can read the default branch or an authoring draft branch."
				)
				const head = await branchHead(github, config, branch)
				const [catalog, pullRequests] = await Promise.all([
					readCatalog(github, config, head),
					listAuthoringPulls(github, config, context.repo, context.user),
				])
				return json(res, 200, { branch, head, records: catalog.records, pullRequests })
			}
			if (action === "media") {
				const bytes = await readMedia(github, config, context, {
					branch: url.searchParams.get("branch"),
					head: url.searchParams.get("head"),
					path: url.searchParams.get("path"),
				})
				res.setHeader("Content-Type", "image/webp")
				res.setHeader("Content-Length", bytes.length)
				return res.end(bytes)
			}
			const body = await readBody(req)
			if (action === "push")
				return json(res, 200, await pushChangeSet(github, config, context, body))
			if (action === "publication-status")
				return json(res, 200, await publicationStatus(github, config, context, body))
			if (action === "update-edition")
				return json(res, 200, await updateEdition(github, config, context, body))
			if (action === "publication-status")
				return json(res, 200, await publicationStatus(github, config, context, body))
			if (action === "update-edition")
				return json(res, 200, await updateEdition(github, config, context, body))
			if (action === "publish")
				return json(res, 200, await publishPull(github, config, context, body))
		} catch (error) {
			if (error?.status === 401 && config) setCookie(res, config.sessionName, "", 0, config)
			const known = error instanceof CmsError
			return json(res, known ? error.status : 503, {
				error: {
					code: known ? error.code : "unavailable",
					message: known
						? error.message
						: "The authoring service is temporarily unavailable. Your local drafts are safe.",
					...(known && error.details ? { details: error.details } : {}),
				},
			})
		}
	}
}
export default createCmsHandler()
