# Activate the in-app CMS

Status: code and configuration are reviewable locally. This document does not claim that a GitHub App has been created, credentials configured, a Vercel deployment built, or live GitHub authorization/writes verified. Keep the existing `log/` CMS and its deployment available until the activation checks below pass.

## Deployment shape

The frontend Vercel project's Root Directory must remain `app`. Its existing `framework: null`, `buildCommand: "pnpm build"` and `outputDirectory: "out"` settings keep the public site static. With that root, `app/api/cms.ts` is a native project-root `api/cms.ts` function; it is not a Next `src/app/api/.../route.ts` route and is not copied into the public export. Vercel discovers native API functions separately from the static output. No catch-all API rewrite, legacy `builds` array, framework change, or separate service project is required. [Vercel native functions and configuration](https://vercel.com/docs/project-configuration/vercel-json#functions), [static output directory behavior](https://vercel.com/docs/builds/configure-a-build#output-directory)

The native entry statically imports `server/cms/handler.mjs`; that graph imports the other server modules, production `yaml` dependency and `src/lib/authoring/schema-data.mjs`. Those paths remain inside the `app` root. Vercel's Node File Trace follows static imports, so a blanket `includeFiles` entry is unnecessary. Confirm this specific package in an authorized local Vercel build or preview before activation; a successful Next export alone does not test function packaging. [Vercel bundling and file tracing](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions)

The checked-in `app/vercel.json` retains those settings and adds this explicit function timeout:

```json
"functions": {
  "api/cms.ts": {
    "maxDuration": 60
  }
}
```

The catalog is read in batches of immutable Git blob IDs, and a push performs several GitHub operations. The explicit bound avoids depending on a project's old default timeout. Select a supported Node LTS version of at least 20 in the Vercel project. The handler uses Node request/response objects, which the native Node runtime supports. [Function duration configuration](https://vercel.com/docs/project-configuration/vercel-json#functions), [native Node runtime](https://vercel.com/docs/functions/runtimes/node-js)

## Register the dedicated GitHub App

Review [the manifest](../app/server/cms/github-app-manifest.json). It requests Contents and Pull requests write access; Metadata, Checks, Commit statuses and Administration read access. Administration is read-only and is used to inspect publication protections. The service never changes repository settings or workflow files.

Use the GitHub App settings form for the chosen owning account, copying the reviewed settings:

1. Choose a unique app name based on `puerh.wtf authoring` and homepage `https://puerh.wtf`.
2. Set callback URL to `https://puerh.wtf/api/cms`, without query parameters. Leave user-authorization token expiration enabled and device flow disabled.
3. Disable Webhook Active. No webhook URL, subscribed events, webhook secret, or private key is used by this implementation. The manifest omits `hook_attributes` and has an empty event list.
4. Apply the permissions listed in the manifest. Grant no Workflows permission and no Administration write permission.
5. Make the app public so authorized repository collaborators can authorize it; publishing a Marketplace listing is unnecessary. Public visibility does not grant repository authority: the service fixes `tonyketcham/puerh.wtf` and checks each person's effective write permission on every protected request. [GitHub App visibility](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private)
6. Install it on the repository owner's account with **Only select repositories → puerh.wtf**. Install/authorize are distinct actions; editors then authorize from **Enable editing** in the site's command bar.
7. Create a client secret and enter it directly in the intended secret stores. Do not paste credentials into chat, commit them, or put them in browser-facing variables.

The manifest is also suitable as an input to a deliberate registration tool. This repository does not implement GitHub's manifest-registration code exchange. Do not POST the manifest blindly and send its registration code to `/api/cms`: that endpoint handles user OAuth codes, which are a different handshake. A future registration helper must bind its own state and complete the manifest conversion separately. [GitHub App manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest)

For local development, use a separate development GitHub App or add the exact localhost callback deliberately. Its callback must match `CMS_ORIGIN + /api/cms`; do not point production credentials at arbitrary preview hosts. The current service uses authorization code flow with PKCE and state. It retains only an expiring user access token, so expired sessions reauthorize rather than refreshing silently. [GitHub user-token flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

## Configure server-only values

Set these on the frontend Vercel project in the intended Production environment; use separate development/preview values when needed:

- `CMS_GITHUB_CLIENT_ID`: the dedicated app's client ID.
- `CMS_GITHUB_CLIENT_SECRET`: a Secret containing the dedicated app's client secret.
- `CMS_SESSION_SECRET`: a separate random Secret used for authenticated cookie encryption. Rotating it invalidates existing editing cookies.
- `CMS_ORIGIN`: exactly `https://puerh.wtf`, with no path or trailing query. Login/callback cookies and mutation Origin checks are bound to it.
- `CMS_REPOSITORY`: `tonyketcham/puerh.wtf` (also the service default).

Never use a `NEXT_PUBLIC_` prefix for these values. Environment changes apply to a new deployment, so adding values to an old deployment's project does not prove the deployed function received them. Keep production secrets out of untrusted PR preview builds; testing OAuth on a preview requires a separately reviewed app/callback/origin configuration. [Vercel environment variables](https://vercel.com/docs/environment-variables)

Generate a new session secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Enter the result directly into the intended local/hosting secret store; do not save it in tracked files or share its value.

## Run locally

From the repository root, install dependencies with the project's pnpm version. For a configured local test, create ignored `app/.env.cms.local` in an editor, fill the two GitHub credentials and a generated session secret, and set:

```dotenv
CMS_GITHUB_CLIENT_ID=
CMS_GITHUB_CLIENT_SECRET=
CMS_SESSION_SECRET=
CMS_ORIGIN=http://localhost:3000
CMS_REPOSITORY=tonyketcham/puerh.wtf
CMS_PORT=7379
```

The blank credential lines are placeholders, not working configuration. `.env.*` files are ignored by this repository. The standalone Node server does not implicitly load Next's environment files; load the local file explicitly. With Node 20.6+ in terminal A:

```powershell
Set-Location app
node --env-file=.env.cms.local server/cms/dev.mjs
```

For an unconfigured smoke test, `pnpm --filter puerh.wtf cms:dev` from the repository root starts the same service and should report `configured: false` without any GitHub request.

In terminal B, from the repository root:

```powershell
$env:CMS_DEV_URL = "http://127.0.0.1:7379"
pnpm --filter puerh.wtf dev
```

Open `http://localhost:3000` consistently. The browser sees `/api/cms` on that origin; the development-only Next rewrite forwards it to the standalone service. A browser opened at `http://127.0.0.1:3000` has a different Origin and must use matching local configuration/callback. Adjust all three values together if another frontend port is needed. No production rewrite depends on `CMS_DEV_URL`.

In terminal C, from the repository root:

```powershell
Invoke-RestMethod "http://localhost:3000/api/cms?action=session"
pnpm --filter puerh.wtf cms:test
```

The first result should be honest configuration/authentication status. It must not contain a GitHub token. Enable editing from the command bar; follow a vendor/session page into a local edit, navigate away and reload, then return to Working changes. These actions must retain local drafts without creating a branch, PR, upload or CI run.

## Recovery and connectivity limits

Durable text drafts, image Blobs and exact pending push requests use IndexedDB, scoped to the verified GitHub account and repository. There is no text-only localStorage fallback in this implementation; localStorage holds activation and review preferences. Browser storage can be unavailable, reach quota or be cleared, so export a draft backup for work that must survive device/browser loss.

A cold start needs online session verification before restoring an account namespace, and repository operations need connectivity. During an active session, an authorization failure retains already loaded drafts in memory and offers device-draft export while keeping push/publication unavailable. If session verification succeeds but the catalog fails, local drafts and any exact pending operation remain available with Export device drafts and Retry loading. Keep the tab open and export before navigating away when a save/storage error is shown; memory alone is not durable storage.

Disable editing hides the tooling and retains the GitHub session. The separate Sign out of GitHub action clears its authenticated cookie. Both wait for outstanding device saves and refuse to discard the workspace when a save failed; neither deletes the durable drafts or pending operation. After reauthorization, an uncertain push resumes the identical durable payload. Return to review is available only after the server has positively confirmed a precommit rejection; ordinary network/5xx errors do not permit replacing the unresolved request.

## Extend the editor

Collection fields and relation definitions live in `app/src/lib/authoring/schema-data.mjs`. The field UI and independent server validation use this shared source. Extend both the reading/editor presentation and any collection-specific validation when adding field behavior; browser validation is feedback, while the service validates the exact outgoing content again before writing.

Local media preparation lives in `app/src/lib/authoring/media/`. The tracked worker uses versioned, same-origin WASM codecs prepared by `prepare-codecs.mjs` into generated `app/public/authoring-codecs/v1/` assets. It prepares optimized WebP variants locally; selecting a file does not upload it. Keep codec licenses and the generated runtime package-version manifest with the prepared assets. A future recipe change must also address immutable image identity: current committed paths are based on the largest encoded WebP variant hash and output width, so changing encoder output under an existing path is rejected rather than overwriting an earlier asset.

An explicit push creates an ordinary GitHub branch commit and creates or updates its draft PR. Existing PR/synchronize workflows can validate that pushed snapshot; opening/editing a local draft never starts CI. The service does not need a workflow-dispatch permission for ordinary PR checks.

No AI provider or AI workflow is configured in this implementation. A future image-analysis/content assistant should bind each job to the exact pushed commit, record identity, source asset hash and tool/model version. Treat its output as a typed proposal with field-level source revisions: apply reviewed proposals to durable local drafts and push them explicitly, or attach a separately reviewed PR commit. A delayed or retried result must not replace newer human work, silently expand an approved push, or publish without the cumulative PR review.

## Publication prerequisites

The service currently supports classic branch protection requiring at least one status check, strict up-to-date checks, and enforcement for administrators. It does not create those rules or bypass them. Required approvals and GitHub's clean merge state remain authoritative; missing readiness marks a draft ready for review but returns an actionable error before merging. Ruleset-only/merge-queue publication currently fails closed and remains available through GitHub until that path is implemented.

A publish request binds the cumulative reviewed PR head and current base. It validates all changed paths/regular file modes/content, verifies base ancestry and successful checks, then performs a normal head-SHA-guarded squash merge. A merge does not establish that production has deployed: keep **Merged / deploying** distinct from **Live**.

## Activation evidence before replacing the old CMS

These are the remaining verification steps after account/deployment actions are authorized:

1. Confirm the target Vercel project/team and Root Directory `app`. Inspect a local Vercel build/preview artifact and verify that `api/cms` is packaged with its server modules, shared schema and `yaml`, while public HTML remains static. Confirm `/api/cms?action=session` returns JSON/no-store rather than a static 404.
2. Confirm the intended GitHub App, exact callback, selected repository installation, server-only values and expiring user-token setting. Verify a writer can sign in and a public-repository reader cannot gain authoring access. Test expiry/revocation, CSRF and wrong-origin rejection.
3. On an agreed disposable editorial update, verify local text/media recovery, whole-record/dependency selection, exact reading review, one explicit atomic push, automatic draft PR creation and its static preview. Simulate an uncertain response and resume the exact durable operation instead of generating a second PR.
4. Verify another local edit remains local through that push. Verify later edits made during the request are not acknowledged as pushed. A replay receipt's `head` is the original operation snapshot; refresh `remoteHead` separately if the branch has advanced.
5. Review the full cumulative PR, including earlier commits and prepared images. Test on a second browser/device: unpublished images must load through the authenticated, exact-head media endpoint, without requiring this device's local Blob storage or a production deployment. Verify failing checks, changed head/base and missing protection block publication. Once approved, verify ordinary merge and observe the production deployment separately.
6. Confirm every required collection, image path, recovery/export and keyboard/mobile flow before removing `log/`, its OAuth integration, deployment, dependencies or CI job. Keep Git-based content validation/build checks.

Current local verification:

- 29 backend tests pass with injected fake GitHub transport, covering authorization, exact retry/recovery, precommit proof and private exact-head image access.
- Two isolated in-memory tests pass using the actual Flatbread configuration: new session filename/date routing, unchanged public image/variant paths, sanitized Markdown, and separate description/body fields for all six existing entity page collections.
- 72 focused authoring and existing navigation/filter/focus tests pass, including actual Chromium IndexedDB/WASM and desktop/mobile editorial flows, lost-response recovery, explicit conflict reconciliation, and fresh-device unpublished image loading. Together with the two public-source checks above, this is 74 focused tests. All five editorial acceptance flows also pass against the actual static export. Browser GitHub requests use a simulated service contract; microphone hardware is not exercised.
- Full application TypeScript and focused ESLint pass.
- The final `pnpm run build --port 5215` static export passes for all 448 pages. A separate export with two temporary new-content fixtures also passed; Chrome decoded their responsive pictures at desktop/mobile widths and rendered session/vendor Markdown. Those fixtures were removed before the final build. Public fixture visits requested no CMS API, image codec or editor runtime.
- Independent server validation passed for all 246 current source documents, and an unconfigured loopback HTTP smoke check returned honest configuration status.

These checks do not establish live OAuth, a real GitHub write, hosted CI, Vercel function packaging, deployment or activation. Real account/deployment checks remain separate evidence.
