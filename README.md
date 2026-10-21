# puerh.wtf

A personal tea logbook for learning puer and other teas.

The site is meant to collect tasting notes, brewing observations, references, and evolving thoughts as I learn by drinking. It is less a polished guide than a working notebook: a place to track what I tried, what I noticed, what changed over time, and what I want to understand next.

Over time, it can become a map of teas, sessions, vendors, storage, preparation methods, and the questions that make tea interesting.

## Development

This is a pnpm monorepo. Install dependencies from the repo root:

```bash
pnpm install
```

Run the main site locally:

```bash
pnpm dev
```

Build everything:

```bash
pnpm build
```

Run the app test suite:

```bash
pnpm test
```

Playwright needs its browser once per machine: `npx playwright install chromium` (from `app/`).
Tests reuse a dev server already on :3000, which may be another checkout's. Set `PW_PORT` to
start this checkout's own server on that port instead (`PW_PORT=3200 pnpm test`; in PowerShell,
`$env:PW_PORT=3200; pnpm test`). Flatbread then runs on `PW_PORT + 2000`, or `PW_FLATBREAD_PORT`.

## Rough Stack

- Next.js, React, and TypeScript for the main site in `app/`
- [Flatbread](https://flatbread.dev/) as a just-in-time relational database and GraphQL provider
- Netlify CMS for content editing, pending migration to a custom tool
- Tailwind CSS for styling
- Playwright for app tests
- Vite-based `log/` package for the CMS/admin log tooling
