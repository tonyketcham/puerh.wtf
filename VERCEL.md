# Vercel Deployment

This repo deploys as two static Vercel projects from the same pnpm workspace.

## Projects

| Project  | Root directory | Build command | Output directory |
| -------- | -------------- | ------------- | ---------------- |
| Frontend | `app`          | `pnpm build`  | `out`            |
| Tea log  | `log`          | `pnpm build`  | `dist`           |

Each package has its own `vercel.json` so the CLI and dashboard use the same build settings.

## CLI Setup

From the repository root:

```bash
vercel whoami
```

Link this monorepo with repo-level linking:

```bash
vercel link --repo
```

Add the second project to the repo link if prompted or after the first link is created:

```bash
vercel link add
```

When linking, create or select two Vercel projects and set their root directories to `app` and `log` in the Vercel dashboard.

To deploy manually from each project root:

```bash
cd app
vercel
vercel --prod

cd ../log
vercel
vercel --prod
```

For Git-backed deploys, configure both Vercel projects to use this repository with the matching root directory.

## Tea Log Auth

The tea log is a static Netlify CMS app using the GitHub backend. On Vercel it no longer uses Netlify Identity, so GitHub login needs an external OAuth proxy.

Add these fields under `backend` in `log/public/admin/config.yml` after deploying the proxy:

```yaml
backend:
  name: github
  repo: tonyketcham/puerh.wtf
  branch: main
  base_url: https://your-oauth-proxy.vercel.app
  auth_endpoint: auth
```

The OAuth proxy needs a GitHub OAuth app whose callback URL points at the proxy callback route.
