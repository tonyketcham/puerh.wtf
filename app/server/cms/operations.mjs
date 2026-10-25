import { assert, CmsError, sha256 } from "./security.mjs"
import {
	UUID,
	OID,
	blobSha,
	validateAssets,
	validateDocuments,
	metadataFor,
	prMetadata,
} from "./documents.mjs"
import {
	repositoryPath,
	branchHead,
	optionalHead,
	readCatalog,
	listPaged,
	authoringBranch,
	contentPath,
	pullFiles,
	verifyPull,
	verifyFileScope,
	pullSummary,
	COMMIT_MUTATION,
	READINESS_QUERY,
	READY_MUTATION,
} from "./github.mjs"

function operationPayload(body) {
	return {
		target: {
			branch: body.target.branch,
			head: body.target.head,
			pullRequestNumber: body.target.pullRequestNumber ?? null,
		},
		documents: body.documents
			.map(({ path, content, expectedBlobSha }) => ({ path, content, expectedBlobSha }))
			.sort((a, b) => a.path.localeCompare(b.path)),
		assets: (body.assets || [])
			.map(({ path, base64, mime }) => ({ path, base64, mime }))
			.sort((a, b) => a.path.localeCompare(b.path)),
	}
}
function operationMarker(id, hash, actor) {
	return `CMS-Operation: ${id}\nCMS-Payload-SHA256: ${hash}\nCMS-Actor: ${actor}`
}
async function findOperation(github, config, branch, operationId, payloadHash, actor, proof) {
	const commits = await github.rest(
		"GET",
		`${repositoryPath(config)}/commits?sha=${encodeURIComponent(branch)}&per_page=100`
	)
	if (proof) proof.targetSeen = commits.some((value) => value.sha === proof.target)
	const commit = commits.find((value) =>
		String(value.commit?.message || "")
			.split("\n")
			.includes(`CMS-Operation: ${operationId}`)
	)
	if (!commit) return null
	const message = String(commit.commit.message || "")
	assert(
		message.split("\n").includes(`CMS-Payload-SHA256: ${payloadHash}`) &&
			message.split("\n").includes(`CMS-Actor: ${actor}`),
		409,
		"operation_reused",
		"This operation ID was already used for different content. Keep the original request for retry or begin a new reviewed operation."
	)
	return commit.sha
}
async function findPull(github, config, branch) {
	const pulls = await listPaged(
		github,
		`${repositoryPath(config)}/pulls?state=all&head=${encodeURIComponent(
			`${config.owner}:${branch}`
		)}`,
		3
	)
	return pulls.find(
		(pr) =>
			pr.head.ref === branch &&
			pr.head.repo?.full_name?.toLowerCase() === config.repository.toLowerCase()
	)
}
async function ensurePull(
	github,
	config,
	repo,
	user,
	branch,
	head,
	beforeCatalog,
	catalog,
	initialMetadata
) {
	let pr = await findPull(github, config, branch)
	if (pr) {
		if (pr.state !== "open") {
			assert(
				pr.user?.id === user.id && Boolean(pr.merged || pr.merged_at),
				409,
				"pull_request_closed",
				"This draft PR was closed. Start a new reviewed change set instead of reopening it implicitly."
			)
			return pr
		}
		verifyPull(pr, config, user, repo.default_branch, { branch })
	} else {
		try {
			pr = await github.rest("POST", `${repositoryPath(config)}/pulls`, {
				...prMetadata(null, initialMetadata),
				head: branch,
				base: repo.default_branch,
				draft: true,
				maintainer_can_modify: false,
			})
		} catch (error) {
			if (error.status !== 409) throw error
			pr = await findPull(github, config, branch)
			if (!pr) throw error
		}
		verifyPull(pr, config, user, repo.default_branch, { branch })
	}
	const files = await pullFiles(github, config, pr.number)
	verifyFileScope(files, true)
	const changedPaths = new Set(
		files.filter((file) => contentPath(file.filename)).map((file) => file.filename)
	)
	const cumulative = catalog.records.filter((record) => changedPaths.has(record.path))
	const presentation = prMetadata(pr, metadataFor(cumulative, beforeCatalog.records))
	if (presentation.title !== pr.title || presentation.body !== pr.body)
		pr = await github.rest("PATCH", `${repositoryPath(config)}/pulls/${pr.number}`, presentation)
	assert(
		pr.head.sha === head,
		409,
		"head_conflict",
		"The PR changed while it was being prepared. Refresh before pushing again."
	)
	return pr
}
export async function pushChangeSet(github, config, { repo, user }, body) {
	assert(
		body &&
			UUID.test(body.operationId) &&
			body.target &&
			typeof body.target.branch === "string" &&
			OID.test(body.target.head) &&
			Array.isArray(body.documents),
		422,
		"push_request",
		"A push requires an operation UUID, exact target branch/head and whole documents."
	)
	const creating = body.target.branch === repo.default_branch && !body.target.pullRequestNumber
	const branch = creating
		? `cms/authoring/${user.id}/${body.operationId.toLowerCase()}`
		: body.target.branch
	assert(
		creating ||
			(authoringBranch(branch) &&
				branch.startsWith(`cms/authoring/${user.id}/`) &&
				Number.isSafeInteger(body.target.pullRequestNumber) &&
				body.target.pullRequestNumber > 0),
		403,
		"branch_scope",
		"Choose the default branch for a new draft PR, or an existing authoring PR owned by this account."
	)
	const hash = sha256(JSON.stringify(operationPayload(body))),
		prefix = repositoryPath(config)
	let currentHead = await optionalHead(github, config, branch),
		operationHead = null
	// An interrupted new-PR operation can retain its exact reviewed base on its own branch.
	// Main may advance, but the branch/catalog and atomic expectedHeadOid must still match.
	const resumingCreatedBranch = creating && currentHead === body.target.head
	const proof = { target: body.target.head, targetSeen: false }
	if (currentHead)
		operationHead = await findOperation(
			github,
			config,
			branch,
			body.operationId,
			hash,
			user.id,
			proof
		)
	else if (creating)
		operationHead = await findOperation(
			github,
			config,
			repo.default_branch,
			body.operationId,
			hash,
			user.id,
			proof
		)
	if (!creating) {
		try {
			const pr = await github.rest("GET", `${prefix}/pulls/${body.target.pullRequestNumber}`)
			if (!operationHead || !pr.merged_at)
				verifyPull(pr, config, user, repo.default_branch, {
					branch,
					number: body.target.pullRequestNumber,
				})
			const files = await pullFiles(github, config, pr.number)
			verifyFileScope(files)
		} catch (error) {
			if (
				!operationHead &&
				proof.targetSeen &&
				error instanceof CmsError &&
				error.status >= 400 &&
				error.status < 500
			)
				error.details = { ...error.details, operationStatus: "not_committed" }
			throw error
		}
	}
	if (!operationHead) {
		let metadata, additions
		try {
			assert(
				body.documents.length > 0 &&
					body.documents.length <= 40 &&
					body.documents.every(
						(record) => contentPath(record?.path) && typeof record.content === "string"
					),
				422,
				"path",
				"Choose up to 40 allowed content records."
			)
			if (creating) {
				if (!resumingCreatedBranch)
					assert(
						(await branchHead(github, config, repo.default_branch)) === body.target.head,
						409,
						"head_conflict",
						"The default branch changed. Review the new base before creating this draft PR."
					)
				currentHead ||= body.target.head
			}
			assert(
				currentHead === body.target.head,
				409,
				"head_conflict",
				"The target branch changed. Review the latest version before pushing.",
				{ branch, latestHead: currentHead }
			)
			const assets = validateAssets(body.assets || [])
			const catalog = await readCatalog(github, config, currentHead)
			const changes = validateDocuments(body.documents, catalog.records, catalog.tree, assets)
			const entries = new Map(catalog.tree.map((entry) => [entry.path, entry]))
			const changedAssets = assets.filter((asset) => {
				const existing = entries.get(asset.path)
				assert(
					!existing ||
						(existing.type === "blob" &&
							existing.mode === "100644" &&
							existing.sha === blobSha(asset.bytes)),
					409,
					"asset_conflict",
					"Authoring image paths are immutable. Use a new source digest for different image bytes."
				)
				assert(
					body.documents.some((document) =>
						document.content.includes(asset.path.slice("app/public".length))
					),
					422,
					"unreferenced_asset",
					"An uploaded image must be referenced by a selected record."
				)
				return !existing
			})
			assert(
				changes.length || changedAssets.length,
				422,
				"no_changes",
				"The selected records already match the target. Nothing was pushed."
			)
			metadata = metadataFor(changes, catalog.records)
			additions = [
				...changes.map((record) => ({
					path: record.path,
					contents: Buffer.from(record.content).toString("base64"),
				})),
				...changedAssets.map((asset) => ({ path: asset.path, contents: asset.base64 })),
			]
			if (creating && !resumingCreatedBranch) {
				assert(
					(await branchHead(github, config, repo.default_branch)) === body.target.head,
					409,
					"head_conflict",
					"The default branch changed while validating this push. Review its new base."
				)
			}
		} catch (error) {
			// Only pre-mutation validation after a complete reconciliation proof may be abandoned.
			// A history-window miss, transport failure, recovered operation or attempted commit stays pending.
			if (
				proof.targetSeen &&
				error instanceof CmsError &&
				error.status >= 400 &&
				error.status < 500
			)
				error.details = { ...error.details, operationStatus: "not_committed" }
			throw error
		}
		if (creating) {
			if (!(await optionalHead(github, config, branch))) {
				try {
					await github.rest("POST", `${prefix}/git/refs`, {
						ref: `refs/heads/${branch}`,
						sha: body.target.head,
					})
				} catch (error) {
					if (error.status !== 409) throw error
				}
			}
		}
		try {
			const result = await github.graphql(COMMIT_MUTATION, {
				input: {
					branch: { repositoryNameWithOwner: config.repository, branchName: branch },
					expectedHeadOid: body.target.head,
					message: {
						headline: metadata.title,
						body: `${metadata.body}\n\n${operationMarker(body.operationId, hash, user.id)}`,
					},
					fileChanges: { additions },
					clientMutationId: body.operationId,
				},
			})
			operationHead = result.createCommitOnBranch?.commit?.oid
			assert(
				OID.test(operationHead),
				502,
				"github_response",
				"GitHub did not confirm the created commit. Retry this same operation."
			)
		} catch (error) {
			const recovered = await findOperation(github, config, branch, body.operationId, hash, user.id)
			if (!recovered) throw error
			operationHead = recovered
		}
	}
	currentHead = await branchHead(github, config, branch)
	const [catalog, beforeCatalog] = await Promise.all([
		readCatalog(github, config, currentHead),
		readCatalog(github, config, await branchHead(github, config, repo.default_branch)),
	])
	const pr = await ensurePull(
		github,
		config,
		repo,
		user,
		branch,
		currentHead,
		beforeCatalog,
		catalog,
		metadataFor(body.documents, beforeCatalog.records)
	)
	return {
		branch,
		head: operationHead,
		remoteHead: currentHead,
		commitHead: operationHead,
		pullRequest: pullSummary(pr, user.id),
		documents: body.documents.map((record) => ({
			path: record.path,
			sha: blobSha(record.content),
		})),
	}
}
const PROTECTION_QUERY = `query CmsProtection($owner: String!, $name: String!, $ref: String!) { repository(owner: $owner, name: $name) { ref(qualifiedName: $ref) { branchProtectionRule { isAdminEnforced requiresStatusChecks requiresStrictStatusChecks requiredStatusCheckContexts } } } }`
async function verifyStrictProtection(github, config, repo) {
	const result = await github.graphql(PROTECTION_QUERY, {
		owner: config.owner,
		name: config.name,
		ref: `refs/heads/${repo.default_branch}`,
	})
	const rule = result.repository?.ref?.branchProtectionRule
	assert(
		rule?.isAdminEnforced &&
			rule.requiresStatusChecks &&
			rule.requiresStrictStatusChecks &&
			rule.requiredStatusCheckContexts?.length,
		409,
		"publish_protection",
		"Publishing requires branch protection with up-to-date required checks enforced for administrators. Configure those repository rules before publishing in the app."
	)
}
export async function publishPull(github, config, { repo, user }, body) {
	assert(
		body &&
			Number.isSafeInteger(body.number) &&
			body.number > 0 &&
			OID.test(body.head) &&
			OID.test(body.baseHead),
		422,
		"publish_request",
		"Publication requires a PR number and its exact reviewed head/base commits."
	)
	const prefix = repositoryPath(config)
	let pr = await github.rest("GET", `${prefix}/pulls/${body.number}`)
	verifyPull(pr, config, user, repo.default_branch, { number: body.number })
	assert(
		pr.head.sha === body.head &&
			(await branchHead(github, config, repo.default_branch)) === body.baseHead,
		409,
		"head_conflict",
		"The PR or production base changed. Review the cumulative PR again before publishing."
	)
	const files = await pullFiles(github, config, body.number)
	verifyFileScope(files)
	const [headCatalog, baseCatalog] = await Promise.all([
		readCatalog(github, config, body.head),
		readCatalog(github, config, body.baseHead),
	])
	const entries = new Map(headCatalog.tree.map((entry) => [entry.path, entry]))
	assert(
		files.every((file) => {
			const entry = entries.get(file.filename)
			return entry?.type === "blob" && entry.mode === "100644"
		}),
		422,
		"pull_request_scope",
		"Authoring PRs cannot introduce executable files, symlinks or submodules."
	)
	const baseByPath = new Map(baseCatalog.records.map((record) => [record.path, record]))
	const paths = new Set(
		files.filter((file) => contentPath(file.filename)).map((file) => file.filename)
	)
	const documents = headCatalog.records
		.filter((record) => paths.has(record.path))
		.map((record) => ({ ...record, expectedBlobSha: baseByPath.get(record.path)?.sha || null }))
	assert(
		documents.length,
		422,
		"pull_request_scope",
		"An authoring PR must contain editable content records."
	)
	validateDocuments(documents, baseCatalog.records, headCatalog.tree, [], 500)
	const comparison = await github.rest("GET", `${prefix}/compare/${body.baseHead}...${body.head}`)
	assert(
		["ahead", "identical"].includes(comparison.status),
		409,
		"base_behind",
		"Update this draft branch to the reviewed production base and rerun its checks before publishing."
	)
	await verifyStrictProtection(github, config, repo)
	if (pr.draft) {
		await github.graphql(READY_MUTATION, { id: pr.node_id })
		pr = await github.rest("GET", `${prefix}/pulls/${body.number}`)
	}
	const result = await github.graphql(READINESS_QUERY, {
		owner: config.owner,
		name: config.name,
		number: body.number,
	})
	const readiness = result.repository?.pullRequest
	assert(
		readiness &&
			!readiness.isDraft &&
			readiness.headRefOid === body.head &&
			readiness.baseRefOid === body.baseHead &&
			readiness.mergeStateStatus === "CLEAN" &&
			readiness.reviewDecision !== "CHANGES_REQUESTED" &&
			readiness.reviewDecision !== "REVIEW_REQUIRED" &&
			readiness.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state === "SUCCESS",
		409,
		"publish_not_ready",
		"The PR is ready for review, but required approvals, successful checks and an up-to-date merge candidate must be satisfied before it can merge."
	)
	assert(
		(await branchHead(github, config, repo.default_branch)) === body.baseHead,
		409,
		"head_conflict",
		"The production base changed during review. Check the updated merge candidate before publishing."
	)
	const merged = await github.rest("PUT", `${prefix}/pulls/${body.number}/merge`, {
		sha: body.head,
		merge_method: "squash",
	})
	assert(
		merged.merged === true,
		409,
		"publish_not_merged",
		"GitHub did not merge this PR. Its repository rules remain authoritative."
	)
	return { merged: true, number: body.number, sha: merged.sha, url: pr.html_url, status: "merged" }
}
