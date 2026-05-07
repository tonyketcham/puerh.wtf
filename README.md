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

## Rough Stack

- Next.js, React, and TypeScript for the main site in `app/`
- [Flatbread](https://flatbread.dev/) as a just-in-time relational database and GraphQL provider
- Netlify CMS for content editing, pending migration to a custom tool
- Tailwind CSS for styling
- Playwright for app tests
- Vite-based `log/` package for the CMS/admin log tooling
