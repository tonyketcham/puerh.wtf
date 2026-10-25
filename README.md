# puerh.wtf

A personal tea logbook for learning puer and other teas: tasting notes, brewing observations,
origins, vendors, storage and the questions that connect them.

## Working on the site

Install the pnpm workspace from the repository root:

```sh
pnpm install
pnpm dev
```

The main site is `app/`: Next starts on `http://localhost:3000` and Flatbread on :5057.
From `app/`, `pnpm build` produces the static export in `out/`.
Root `pnpm build` also builds the retained `log/` CMS fallback.

Start with the [architecture and ownership map](docs/architecture.md) for source content,
generated assets, state, shared components and server boundaries. The [app quickstart](app/README.md)
and [test instructions](app/tests/README.md) cover development and export verification.

## Editing content

To use the in-app CMS, open the command bar and choose **Enable editing**.
It keeps local drafts until explicit review and push. Server-side GitHub authorization,
the native production endpoint, sign-in and catalog loading have been verified.
Editorial push/publication acceptance remains separate; preserve the existing `log/` CMS
and deployment until that checklist is complete.

[CMS setup and activation evidence](docs/in-app-cms-setup.md) is the current operational
guide. [Vercel deployment](VERCEL.md) describes the static frontend, its native CMS API
and the retained standalone fallback.

## Verification

Playwright needs its browser once per machine: `npx playwright install chromium` (from `app/`).
Tests start this checkout's own dev server on :3000 and Flatbread on :5057. Occupied ports
fail instead of reusing another checkout. Set `PW_PORT` to choose another pair
(`PW_PORT=3200 pnpm test`; in PowerShell, `$env:PW_PORT=3200; pnpm test`). Flatbread then
runs on `PW_PORT + 2000`, or `PW_FLATBREAD_PORT`. Use `PW_REUSE_SERVER=1` only after verifying
the existing server's checkout.

From `app/`, `pnpm test:dev` runs the development lane and `pnpm test:export` tests an
existing `out/` build. The export suite needs a build with `PUERH_TEST_FIXTURES=1` to include
the radar and Explorer fixtures. See [testing instructions](app/tests/README.md) for both lanes.
