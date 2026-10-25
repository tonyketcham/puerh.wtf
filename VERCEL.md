# Vercel deployment

The pnpm workspace has two deployment roots.

- **Frontend — `app/`:** `pnpm build` exports public pages to `out/`. Keep
  `framework: null` and `outputDirectory: "out"` as checked in `app/vercel.json`.
  The project-root `api/cms.ts` is a native Node function, packaged separately from the static
  export. It delegates to `server/cms/`; it is not a Next App Router API route.
- **Retained CMS fallback — `log/`:** `pnpm build` produces the standalone static CMS in
  `dist/`, using `log/vercel.json`. Keep it available until the in-app editorial acceptance
  checks are complete.

Set the matching Root Directory on each Git-backed Vercel project. Root workspace
`pnpm build` builds both packages; a project rooted at `app` runs the app package's command.

## Link or deploy manually

From the repository root, inspect the signed-in account and link each package directory
to its existing project:

```sh
vercel whoami
vercel link app
vercel link log
```

The [`vercel link` command](https://vercel.com/docs/cli/link) accepts the directory path
as its optional argument.

For a manual deployment, run `vercel` from the intended package directory. Use
`vercel --prod` only for an approved production publication. Project linking and a successful
Next export do not establish that the native function or production credentials work.

## In-app CMS

Follow [CMS setup and activation evidence](docs/in-app-cms-setup.md) for the registered GitHub
App, server-only values, local development, native function packaging and remaining editorial
push/publication checks. Keep that evidence distinct from mocked service/browser tests and
from a merged commit whose production deployment is still pending.

`CMS_DEV_URL` supplies a development-only Next rewrite to a separate local CMS service.
Production uses the native `api/cms.ts` entry and the checked-in function configuration;
no production catch-all rewrite or separate CMS project is required.

## Retained standalone CMS authentication

The `log/` app uses the GitHub backend and an external OAuth proxy. Its backend settings
belong in `log/public/admin/config.yml`:

```yaml
backend:
  name: github
  repo: tonyketcham/puerh.wtf
  branch: main
  base_url: https://your-oauth-proxy.vercel.app
  auth_endpoint: auth
```

The proxy requires its own matching GitHub OAuth callback. This fallback integration is
separate from the dedicated in-app authoring GitHub App; retain it until the documented
retirement checks pass.
