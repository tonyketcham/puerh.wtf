# GitHub authoring API

For reviewed account/deployment activation steps, see [in-app CMS setup](../../../docs/in-app-cms-setup.md) and the dedicated [GitHub App manifest](./github-app-manifest.json). No live account configuration or deployment is implied by these files.

`app/api/cms.ts` is a native Node Vercel Function. It is outside Next's route tree, so the public site remains a static export. The development entry point is `node server/cms/dev.mjs` from `app/`; it listens on `127.0.0.1:7379`. The frontend development server must proxy `/api/cms` to it.

## Operator configuration

Set these server-only environment variables on the function/development process:

- `CMS_GITHUB_CLIENT_ID` and `CMS_GITHUB_CLIENT_SECRET`: a GitHub App's user-authorization credentials.
- `CMS_SESSION_SECRET`: at least 32 random bytes represented as a secret string; generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
- `CMS_ORIGIN`: exact frontend origin, such as `https://puerh.wtf`. Local HTTP is accepted only for `localhost` or `127.0.0.1`.
- `CMS_REPOSITORY`: optional `owner/name`; default `tonyketcham/puerh.wtf`.

Install the GitHub App only on the intended repository. Request Contents/Pull requests read/write and Metadata/Checks/Commit statuses/Administration read; Administration is read-only for publication-protection inspection. Register the exact callback URL `${CMS_ORIGIN}/api/cms` (no query parameters). The handler detects OAuth callbacks from their code/state parameters. Keep user-token expiration enabled. No installation private key, browser token, personal access token, or AI provider key is required by this service.

Sessions use AES-256-GCM encrypted, authenticated HttpOnly cookies bound to origin, repository and client ID. HTTPS cookies have the `__Host-` prefix and Secure flag. Access tokens expire with the cookie (at most eight hours); refresh tokens are deliberately not retained. Expired users sign in again. This stateless design clears the current browser's session on logout; it cannot revoke an independently copied cookie before GitHub token expiration/revocation. Rotate the session secret to invalidate all service cookies. Local drafts live separately in the browser and are never deleted by API logout.

Every content read and write fetches the current GitHub identity and effective repository permission. Public repository readability is insufficient. This first implementation requires write/admin authority even for entering authoring mode.

## Requests

All routes share `/api/cms?action=...`:

- `GET session`: configuration/authentication status, verified public user profile, repository/default branch and CSRF token. No GitHub token is returned.
- `GET login&returnTo=/safe/path`: starts state-bound PKCE authorization; only same-origin relative return destinations are accepted.
- `GET callback`: OAuth continuation; the registered query-free URL is also accepted.
- `POST logout`: clears cookies, retaining local drafts.
- `GET catalog&branch=main`: an immutable head plus all nine flat Markdown collections and discovered authoring PRs. Blob text is fetched in batches of 50 immutable Git object IDs, rather than one request per document.
- `GET media&branch=...&head=...&path=app/public/images/uploads/authoring/...webp`: authenticated binary WebP preview at the exact current reviewed head. Production or the signed-in account's open authoring PRs only; the allowed regular image must be referenced by that pinned catalog. It never uses public deployment bytes for an unpublished image.
- `POST push`: `{operationId,target:{branch,head,pullRequestNumber?},documents:[{path,content,expectedBlobSha}],assets:[{path,base64,mime}]}`. For a new PR, target the current default branch/head. For an update, target the owned authoring branch/PR/head. Null source blob SHA means a new document.
- `POST publish`: `{number,head,baseHead}` publishes the whole reviewed PR under the safeguards below.

POST requests require exact `Origin`, JSON content type and `X-CSRF-Token` from the session response. Responses are private/no-store. Errors use `{error:{code,message,details?}}`; 409 means conflict/readiness requiring fresh review. An unknown network/5xx outcome is not evidence that GitHub was untouched: retry the identical operation ID and payload. The UI must retain the reviewed operation snapshot durably until acknowledged. A structured `error.details.operationStatus: "not_committed"` permits an explicit return to review: the service found the original target within its inspected history, found no matching prior operation, and rejected before mutating. Generic 4xx errors, history gaps and ambiguous/postcommit failures do not establish that proof and retain the pending request.

## Write and publication safeguards

Content is restricted to regular `app/content/{tastings,vendors,origins,styles,categories,cultivars,vessels,authors,tags}/*.md` files. Existing Unicode filenames, legacy IDs, raw formatting and unknown fields are preserved. IDs cannot change on an existing path. Shared schema definitions are independently checked on the server, and relationships resolve only against the exact target plus selected records. Origin ancestry is bounded to six levels.

Only sanitized WebP variants at `app/public/images/uploads/authoring/{64-character-source-digest}/{width}.webp` are accepted. The server checks byte format, actual frame/canvas agreement, width/path agreement, dimensions, duplicate-frame/header and metadata/animation exclusions, immutable existing asset paths, and references from selected documents. No arbitrary URL fetch, source/workflow/config changes, symlink, executable file, rename, or deletion endpoint exists.

An initial push creates `cms/authoring/{numeric-user-id}/{operation-uuid}` and one atomic GraphQL commit guarded by `expectedHeadOid`. Its message records operation ID, payload digest and actor. Retries inspect recent commits before writing; if an old operation is outside the 100-commit reconciliation window, the unchanged expected head prevents duplicate writes and returns a conflict instead. Branch/commit/draft-PR creation are separately recoverable. A push response `head`/`commitHead` identifies the exact acknowledged operation snapshot; `remoteHead` and `pullRequest.head` identify the current remote branch, which may have advanced. Never associate the original source bytes with that later head; fetch its catalog separately. Commits and PR metadata are generated from the exact delta/cumulative content; existing manually authored PR title/body text is preserved.

A push supports up to 40 documents, 80 image variants, 2 MB per image, 2.8 MB decoded image data and 4 MB total JSON. The catalog limit is 2,000 documents/3.6 MB raw text. Failures retain local work. These bounds intentionally fit Vercel's 4.5 MB request/response ceiling.

Publish checks owned same-repository authoring PR identity, the entire cumulative path scope and regular file modes, exact head and current base, full content validation, base ancestry, completed successful status rollup, and GitHub `CLEAN` merge state. It marks a draft ready, then uses normal head-SHA-guarded squash merge. Pending checks/approvals return a readiness error after marking ready; the user can retry once satisfied. It does not force merge or delete the branch.

The repository must have classic branch protection with up-to-date required checks enforced for administrators. This is verified through GitHub before marking ready/merging. It closes the base-change race that the merge API's head-only SHA guard cannot close. Ruleset-only/merge-queue publication is not implemented yet and fails closed; configure supported protection or publish through GitHub. No repository settings are created/changed by this implementation.

A successful merge is not a production deployment confirmation. The client must keep that status distinct from Live until its deployment evidence is available.

## Verification

Run `node --test server/cms/cms.test.mjs` from `app/`. Tests inject a fake GitHub HTTP transport and exercise permissions/revocation, OAuth/CSRF, exact-source catalogs, conflicts, stable identities, complete relationships, atomic push/retry behavior, PR metadata preservation, and cumulative publish guards. They do not claim real-account OAuth, GitHub mutations, Vercel deployment, or CI execution has occurred.
