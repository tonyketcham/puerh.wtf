# puerh.wtf app

The public tea notebook is a Next App Router application exported as static pages.
Flatbread reads the canonical Markdown/frontmatter in `content/` during development/build.
The contextual editor uses a separate trusted CMS endpoint.

## Quickstart

Install dependencies from the repository root with `pnpm install`. Then, from `app/`:

```sh
pnpm dev
```

Open `http://localhost:3000`. This command starts Flatbread as well; its GraphQL endpoint
defaults to `http://localhost:5057/graphql`. `FLATBREAD_URL` selects an intentionally different
content endpoint. Asset preparation runs through `predev` and `prebuild`.

`pnpm build` writes `out/`. Serve that directory to inspect the exported site; it does not
require a Next runtime server. The maintained export-test server serves its real HTML,
Flight payloads, workers and assets.

## Verify

```sh
pnpm exec playwright install chromium
pnpm test:dev
```

Use `PW_PORT` and `PW_FLATBREAD_PORT` to isolate a checkout's test servers. For the
production-export lane, build with fixtures explicitly enabled:

```sh
PUERH_TEST_FIXTURES=1 pnpm build
pnpm test:export
```

In PowerShell set `$env:PUERH_TEST_FIXTURES="1"` before the build and remove that environment
value afterward. Rebuild without the fixture flag before using the output for deployment.
See [test instructions](tests/README.md) for both lanes, browser channels and report locations.

`pnpm perf:interaction [URL] [output.json] --scenario vintage|map-pan-zoom|origin-scroll`
collects real-input frame intervals and long tasks. The default is headed; `--headless`
validates the collector. Build/source labels supplied with `--build`/`--source` remain unverified.

## Find the owner

See the [architecture map](../docs/architecture.md) before editing content readers, generated
files, shared session/lexicon UI, filters or map workers. Use `pnpm codegen`, `pnpm liquor`,
`pnpm geo` and `pnpm authoring:assets` for their generated artifacts.

For contextual editing, local service configuration and verified production status, follow
[CMS setup](../docs/in-app-cms-setup.md). Public static pages and the native
`api/cms.ts` function have separate deployment responsibilities; see [Vercel deployment](../VERCEL.md).
