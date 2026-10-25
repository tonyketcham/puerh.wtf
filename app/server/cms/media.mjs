import { assert } from "./security.mjs"
import { OID, blobSha, parseDocument, validateAssets } from "./documents.mjs"
import {
	repositoryPath,
	branchHead,
	authoringBranch,
	assetPath,
	readCatalog,
	listAuthoringPulls,
} from "./github.mjs"

/** Read a reviewed immutable image without exposing a GitHub token or using the public deployment. */
export async function readMedia(github, config, { repo, user }, { branch, head, path }) {
	assert(
		typeof branch === "string" && OID.test(head) && assetPath(path),
		422,
		"media_request",
		"Choose an allowed authoring image and exact reviewed branch/head."
	)
	assert(
		branch === repo.default_branch ||
			(authoringBranch(branch) && branch.startsWith(`cms/authoring/${user.id}/`)),
		403,
		"branch_scope",
		"Media previews are limited to production or the signed-in account authoring PRs."
	)
	assert(
		(await branchHead(github, config, branch)) === head,
		409,
		"head_conflict",
		"The image review changed. Reopen this exact catalog before reviewing its images."
	)
	if (branch !== repo.default_branch) {
		const pulls = await listAuthoringPulls(github, config, repo, user)
		assert(
			pulls.some((pull) => pull.branch === branch && pull.head === head && pull.editable),
			403,
			"pull_request_scope",
			"This image must belong to an open authoring PR owned by this account."
		)
	}
	const catalog = await readCatalog(github, config, head)
	const entry = catalog.tree.find((item) => item.path === path),
		publicPath = path.slice("app/public".length)
	assert(
		entry?.type === "blob" && entry.mode === "100644" && entry.size > 0 && entry.size <= 2000000,
		422,
		"media_scope",
		"The reviewed image is unavailable or exceeds the supported size."
	)
	assert(
		catalog.records.some((record) => record.content.includes(publicPath) && parseDocument(record)),
		422,
		"media_scope",
		"The image must be referenced by a valid record at this exact reviewed head."
	)
	const blob = await github.rest("GET", `${repositoryPath(config)}/git/blobs/${entry.sha}`)
	assert(
		blob?.encoding === "base64" && typeof blob.content === "string" && blob.size === entry.size,
		502,
		"github_response",
		"GitHub did not return the reviewed image."
	)
	const base64 = blob.content.replace(/\s/g, ""),
		bytes = Buffer.from(base64, "base64")
	assert(
		bytes.length === entry.size &&
			bytes.toString("base64") === base64 &&
			blobSha(bytes) === entry.sha,
		502,
		"github_response",
		"GitHub returned a different image revision."
	)
	validateAssets([{ path, mime: "image/webp", base64 }])
	return bytes
}
