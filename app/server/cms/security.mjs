import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	timingSafeEqual,
} from "node:crypto"

export class CmsError extends Error {
	constructor(status, code, message, details) {
		super(message)
		this.status = status
		this.code = code
		this.details = details
	}
}
export function assert(condition, status, code, message, details) {
	if (!condition) throw new CmsError(status, code, message, details)
}
export const sha256 = (value) => createHash("sha256").update(value).digest("hex")
export const randomToken = () => randomBytes(32).toString("base64url")
export function equal(a, b) {
	const x = Buffer.from(String(a ?? "")),
		y = Buffer.from(String(b ?? ""))
	return x.length === y.length && timingSafeEqual(x, y)
}
export function configuration(env = process.env) {
	const repository = env.CMS_REPOSITORY || "tonyketcham/puerh.wtf"
	assert(
		/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository),
		503,
		"configuration",
		"CMS_REPOSITORY must identify one GitHub repository."
	)
	const [owner, name] = repository.split("/")
	let origin
	try {
		origin = env.CMS_ORIGIN ? new URL(env.CMS_ORIGIN) : null
	} catch {
		throw new CmsError(503, "configuration", "CMS_ORIGIN must be a valid origin.")
	}
	if (origin)
		assert(
			origin.username === "" &&
				origin.password === "" &&
				origin.pathname === "/" &&
				!origin.search &&
				!origin.hash &&
				(origin.protocol === "https:" ||
					(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))),
			503,
			"configuration",
			"CMS_ORIGIN must be an HTTPS origin (HTTP is permitted on localhost only)."
		)
	const secret = env.CMS_SESSION_SECRET || ""
	const configured = Boolean(
		origin &&
			env.CMS_GITHUB_CLIENT_ID &&
			env.CMS_GITHUB_CLIENT_SECRET &&
			Buffer.byteLength(secret) >= 32
	)
	const secure = origin?.protocol === "https:"
	return {
		owner,
		name,
		repository,
		origin: origin?.origin,
		configured,
		secure,
		clientId: env.CMS_GITHUB_CLIENT_ID,
		clientSecret: env.CMS_GITHUB_CLIENT_SECRET,
		secret,
		sessionName: secure ? "__Host-puerh_cms" : "puerh_cms",
		flowName: secure ? "__Host-puerh_cms_flow" : "puerh_cms_flow",
		callbackUrl: origin ? `${origin.origin}/api/cms` : undefined,
	}
}
function key(config) {
	return createHash("sha256").update(config.secret).digest()
}
export function seal(value, config) {
	const iv = randomBytes(12),
		cipher = createCipheriv("aes-256-gcm", key(config), iv)
	cipher.setAAD(
		Buffer.from(`puerh-cms:v1:${config.origin}:${config.repository}:${config.clientId}`)
	)
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
	return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher
		.getAuthTag()
		.toString("base64url")}`
}
export function unseal(value, config, now = Date.now()) {
	try {
		const [version, encodedIv, data, tag, extra] = String(value || "").split(".")
		if (version !== "v1" || extra || !data || !tag) return null
		const decipher = createDecipheriv(
			"aes-256-gcm",
			key(config),
			Buffer.from(encodedIv, "base64url")
		)
		decipher.setAAD(
			Buffer.from(`puerh-cms:v1:${config.origin}:${config.repository}:${config.clientId}`)
		)
		decipher.setAuthTag(Buffer.from(tag, "base64url"))
		const result = JSON.parse(
			Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString(
				"utf8"
			)
		)
		return Number.isFinite(result.expiresAt) && result.expiresAt > now ? result : null
	} catch {
		return null
	}
}
export function cookieValue(req, name) {
	const values = String(req.headers?.cookie || "")
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part.startsWith(`${name}=`))
	return values.length === 1 ? values[0].slice(name.length + 1) : null
}
export function setCookie(res, name, value, seconds, config) {
	const cookie = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(
		0,
		Math.floor(seconds)
	)}${config.secure ? "; Secure" : ""}`
	const old = res.getHeader?.("Set-Cookie")
	res.setHeader("Set-Cookie", [...(Array.isArray(old) ? old : old ? [old] : []), cookie])
}
export function safeReturnTo(value) {
	if (
		typeof value !== "string" ||
		!value.startsWith("/") ||
		value.startsWith("//") ||
		/[\\\r\n\u0000]/.test(value) ||
		value.length > 2048
	)
		return "/"
	try {
		const parsed = new URL(value, "https://cms.invalid")
		return parsed.origin === "https://cms.invalid"
			? `${parsed.pathname}${parsed.search}${parsed.hash}`
			: "/"
	} catch {
		return "/"
	}
}
export function verifyCsrf(req, session, config) {
	assert(
		req.headers?.origin === config.origin,
		403,
		"origin",
		"This write must originate from the configured site."
	)
	assert(
		equal(req.headers?.["x-csrf-token"], session.csrf),
		403,
		"csrf",
		"The editing session changed. Reload editing before trying again."
	)
	const contentType = String(req.headers?.["content-type"] || "")
		.split(";")[0]
		.trim()
	assert(contentType === "application/json", 415, "content_type", "CMS writes require JSON.")
}
export function publicUser(user) {
	return { login: user.login, avatarUrl: user.avatar_url }
}
export async function authorize(github, session, config, write = true) {
	assert(
		session?.type === "session" && typeof session.token === "string" && session.user?.id,
		401,
		"authentication",
		"Enable editing with GitHub before continuing."
	)
	const user = await github.rest("GET", "/user")
	assert(
		user.id === session.user.id,
		401,
		"authentication",
		"The GitHub identity no longer matches this session."
	)
	const [repo, permissions] = await Promise.all([
		github.rest("GET", `/repos/${config.repository}`),
		github.rest(
			"GET",
			`/repos/${config.repository}/collaborators/${encodeURIComponent(user.login)}/permission`
		),
	])
	assert(
		["read", "write", "admin"].includes(permissions.permission),
		403,
		"permission",
		"This GitHub account is not a repository collaborator."
	)
	if (write)
		assert(
			["write", "admin"].includes(permissions.permission),
			403,
			"permission",
			"Repository write access is required for authoring."
		)
	assert(
		repo.full_name?.toLowerCase() === config.repository.toLowerCase() &&
			typeof repo.default_branch === "string",
		403,
		"repository",
		"The configured repository could not be verified."
	)
	return { user, repo }
}
