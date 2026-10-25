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

The in-app CMS is implemented: open the command bar and choose **Enable editing**.
It keeps local drafts until explicit review and push. Server-side GitHub authorization,
the native production endpoint, sign-in and catalog loading have been verified.
Editorial push/publication acceptance remains separate; preserve the existing `log/` CMS
and deployment until that checklist is complete.

[CMS setup and activation evidence](docs/in-app-cms-setup.md) is the current operational
guide. [Vercel deployment](VERCEL.md) describes the static frontend, its native CMS API
and the retained standalone fallback.
