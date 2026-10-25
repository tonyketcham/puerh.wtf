import { assert, CmsError } from "./security.mjs"

const API = "https://api.github.com"
export function githubClient(token, { fetch: transport = globalThis.fetch } = {}) {
	async function request(path, { method = "GET", body, headers = {} } = {}) {
		const response = await transport(`${API}${path}`, {
			method,
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2026-03-10",
				Authorization: `Bearer ${token}`,
				...headers,
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			signal: AbortSignal.timeout(25000),
		})
		let data
		try {
			data = await response.json()
		} catch {
			data = null
		}
		if (!response.ok) {
			const status =
				response.status === 401
					? 401
					: response.status === 403
					? 403
					: response.status === 404
					? 404
					: [409, 422].includes(response.status)
					? 409
					: response.status === 429
					? 429
					: 502
			const code =
				response.status === 401
					? "authentication"
					: response.status === 403
					? "permission"
					: response.status === 404
					? "not_found"
					: status === 409
					? "github_conflict"
					: "github_unavailable"
			throw new CmsError(
				status,
				code,
				status === 401
					? "GitHub authorization has expired or was revoked."
					: status === 403
					? "GitHub denied this repository operation."
					: status === 409
					? "GitHub could not apply this change. Refresh the branch and review any conflict."
					: status === 404
					? "The GitHub resource is unavailable."
					: "GitHub is temporarily unavailable. Your local changes are safe."
			)
		}
		return data
	}
	return {
		rest: (method, path, body) => request(path, { method, body }),
		async graphql(query, variables) {
			const data = await request("/graphql", { method: "POST", body: { query, variables } })
			if (data?.errors?.length) {
				const conflict = data.errors.some((error) =>
					/expectedHeadOid|head.*changed|expected.*head|does not match|not.*latest/i.test(
						error.message || ""
					)
				)
				throw new CmsError(
					conflict ? 409 : 502,
					conflict ? "head_conflict" : "github_operation",
					conflict
						? "The branch changed while pushing. Your local draft has been preserved."
						: "GitHub could not complete the requested operation. Your local changes are safe."
				)
			}
			assert(data?.data, 502, "github_response", "GitHub returned an incomplete response.")
			return data.data
		},
	}
}
export function contentPath(path) {
	return (
		typeof path === "string" &&
		path.length <= 512 &&
		/^app\/content\/(tastings|vendors|origins|styles|categories|cultivars|vessels|authors|tags)\/[^/\\\u0000-\u001f]+\.md$/u.test(
			path
		) &&
		!path.includes("..")
	)
}
export function assetPath(path) {
	return (
		typeof path === "string" &&
		/^app\/public\/images\/uploads\/authoring\/[a-f0-9]{64}\/[1-9][0-9]{0,4}\.webp$/.test(path)
	)
}
export const authoringBranch = (branch) =>
	typeof branch === "string" && /^cms\/authoring\/[1-9][0-9]*\/[a-f0-9-]{36}$/.test(branch)
export const repositoryPath = (config) => `/repos/${config.repository}`
export async function branchHead(github, config, branch) {
	const value = await github.rest(
		"GET",
		`${repositoryPath(config)}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`
	)
	return value.object.sha
}
export async function optionalHead(github, config, branch) {
	try {
		return await branchHead(github, config, branch)
	} catch (error) {
		if (error.status === 404) return null
		throw error
	}
}
export async function parallelMap(values, work, concurrency = 6) {
	const result = new Array(values.length)
	let cursor = 0
	await Promise.all(
		Array.from({ length: Math.min(concurrency, values.length) }, async () => {
			while (cursor < values.length) {
				const index = cursor++
				result[index] = await work(values[index], index)
			}
		})
	)
	return result
}
export async function readCatalog(github, config, head) {
	const tree = await github.rest("GET", `${repositoryPath(config)}/git/trees/${head}?recursive=1`)
	assert(
		!tree.truncated && Array.isArray(tree.tree),
		502,
		"catalog_limit",
		"GitHub returned an incomplete content tree."
	)
	const entries = tree.tree.filter((entry) => contentPath(entry.path))
	assert(
		entries.length <= 2000 &&
			entries.every(
				(entry) => entry.type === "blob" && entry.mode === "100644" && entry.size <= 262144
			),
		422,
		"catalog_limit",
		"The content catalog exceeds supported limits or contains a non-regular file."
	)
	const batches = []
	for (let offset = 0; offset < entries.length; offset += 50)
		batches.push(entries.slice(offset, offset + 50))
	const groups = await parallelMap(
		batches,
		async (batch) => {
			const declarations = batch.map((_, index) => "$oid" + index + ": GitObjectID!").join(", ")
			const fields = batch
				.map(
					(_, index) =>
						"blob" +
						index +
						": object(oid: $oid" +
						index +
						") { ... on Blob { text byteSize isBinary } }"
				)
				.join(" ")
			const variables = { owner: config.owner, name: config.name }
			batch.forEach((entry, index) => {
				variables["oid" + index] = entry.sha
			})
			const data = await github.graphql(
				"query CmsBlobs($owner: String!, $name: String!, " +
					declarations +
					") { repository(owner: $owner, name: $name) { " +
					fields +
					" } }",
				variables
			)
			return batch.map((entry, index) => {
				const blob = data.repository?.["blob" + index]
				assert(
					blob &&
						!blob.isBinary &&
						typeof blob.text === "string" &&
						blob.byteSize <= 262144 &&
						Buffer.byteLength(blob.text) === blob.byteSize,
					422,
					"catalog_limit",
					"A content document is unavailable or exceeds the supported UTF-8 size."
				)
				return { path: entry.path, sha: entry.sha, content: blob.text }
			})
		},
		2
	)
	const records = groups.flat()
	assert(
		records.reduce((sum, record) => sum + Buffer.byteLength(record.content), 0) <= 3600000,
		422,
		"catalog_limit",
		"The content catalog exceeds the API response limit."
	)
	return { records, tree: tree.tree }
}
export async function listPaged(github, path, maxPages = 20) {
	const rows = []
	for (let page = 1; page <= maxPages; page++) {
		const values = await github.rest(
			"GET",
			`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`
		)
		assert(Array.isArray(values), 502, "github_response", "GitHub returned an incomplete list.")
		rows.push(...values)
		if (values.length < 100) return rows
	}
	throw new CmsError(
		422,
		"list_limit",
		"This repository operation exceeds the supported listing limit."
	)
}
export function pullSummary(pr, userId) {
	return {
		number: pr.number,
		branch: pr.head.ref,
		head: pr.head.sha,
		base: pr.base.ref,
		baseHead: pr.base.sha,
		title: pr.title,
		body: pr.body || "",
		url: pr.html_url,
		draft: pr.draft,
		state: pr.state,
		merged: Boolean(pr.merged_at || pr.merged),
		author: pr.user?.login,
		editable: pr.user?.id === userId,
	}
}
export async function listAuthoringPulls(github, config, repo, user) {
	const pulls = await listPaged(
		github,
		`${repositoryPath(config)}/pulls?state=open&base=${encodeURIComponent(repo.default_branch)}`,
		5
	)
	return pulls
		.filter(
			(pr) =>
				authoringBranch(pr.head.ref) &&
				pr.head.repo?.full_name?.toLowerCase() === config.repository.toLowerCase()
		)
		.map((pr) => pullSummary(pr, user.id))
}
export async function pullFiles(github, config, number) {
	return listPaged(github, `${repositoryPath(config)}/pulls/${number}/files`, 10)
}
export function verifyPull(pr, config, user, defaultBranch, { branch, number } = {}) {
	assert(
		pr && (!number || pr.number === number) && pr.state === "open" && !pr.merged && !pr.merged_at,
		409,
		"pull_request_closed",
		"This authoring PR is no longer open."
	)
	assert(
		pr.user?.id === user.id &&
			authoringBranch(pr.head.ref) &&
			pr.head.ref.startsWith(`cms/authoring/${user.id}/`) &&
			(!branch || pr.head.ref === branch) &&
			pr.head.repo?.full_name?.toLowerCase() === config.repository.toLowerCase() &&
			pr.base.repo?.full_name?.toLowerCase() === config.repository.toLowerCase() &&
			pr.base.ref === defaultBranch,
		403,
		"pull_request_scope",
		"This PR is not an authoring PR owned by the signed-in account for this repository."
	)
}
export function verifyFileScope(files, allowEmpty = false) {
	assert(
		(allowEmpty || files.length > 0) &&
			files.length <= 500 &&
			files.every(
				(file) =>
					["added", "modified"].includes(file.status) &&
					(contentPath(file.filename) || assetPath(file.filename))
			),
		422,
		"pull_request_scope",
		"The PR contains changes outside editable Markdown and authoring images, or unsupported renames/deletions."
	)
}
export const COMMIT_MUTATION = `mutation CmsCommit($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }`
export const READY_MUTATION = `mutation CmsReady($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { id isDraft } } }`
export const READINESS_QUERY = `query CmsReadiness($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { id isDraft headRefOid baseRefOid mergeStateStatus reviewDecision commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } } } }`
