# Architecture and ownership

This map accompanies the scoped architecture cleanup. The content and shared-component
paths below include its agreed destinations; branches that predate those moves can still
have the previous imports. Routes, public behavior and content identities stay the same.

## Content, assets and generated files

- `app/content/` is the canonical Markdown/frontmatter source. Preserve record IDs, stored
  dates and relation keys when editing. `app/flatbread.config.ts` defines collections,
  references and sanitized Markdown transformation.
- `app/public/images/uploads/` contains committed public media, including prepared authoring
  variants. `app/static/` holds authored fonts and other imported assets. Edit the source
  record/media, rather than rendered HTML or an export.
- `app/src/generated/graphql.ts` comes from `pnpm codegen`;
  `app/src/generated/liquor-colors.json` from `pnpm liquor`. `pnpm geo` writes
  `app/src/generated/origins.geo.json`, `app/src/generated/maps-manifest.json`,
  `app/public/maps/` and `app/public/fonts/origins-sc.woff2`.
  Change their generators or source inputs, then regenerate.
- `pnpm authoring:assets` prepares same-origin codecs in `app/public/authoring-codecs/`
  and the image index `app/src/generated/authoring-images.json`.
  It runs before app development and builds.
- `app/.cache/`, `app/.next/`, `app/out/`, browser results and reports are derived
  working output. Geo downloads/cache are reusable inputs to the generator, not authored content.

## Server data and browser contracts

`app/src/lib/flatbread.ts` owns the build/development GraphQL transport and production
request caching. `lib/api.ts`, `lib/entityDetails.server.ts` and
`lib/content/entities.server.ts` own the route, peek and entity projections.
Keep transport/query execution behind the server-only boundary.

Pure payloads belong in `lib/types/`, `lib/entityDetails.ts` and
`lib/content/entities.ts`. Browser code can import these contracts and constants without
pulling in a GraphQL client. Query projections must match their return types; a route-only
query is not a complete session for presentation.

## Routes, features and shared presentation

- `src/app/` owns route composition, static params and metadata. Per-kind layouts preserve
  the session/entity/lexicon chrome across navigation.
- `lib/components/containers/` owns frames and panels, including `PropertiesPanel`.
  Its data attributes and CSS variables also position the command bar and overlays.
- `lib/components/session/` owns the session reading experience and photo carousel.
  The reusable cube renderer lives in `lib/components/BoxCarousel.tsx`.
- `lib/components/entity/` owns entity references, peek presentation, page views and indexes.
  `lib/components/lexicon/` holds the word reference and model shared with Explorer;
  route-only lexicon composition can remain beside its routes.
- `lib/sessionAnalysis.ts` contains the shared session-summary contract, vintage ordering
  and color math. A lexicon summary has no fabricated entity identity. Session lists receive
  an explicit origin/category grouping capability when their caller needs it.
- `lib/components/map/` owns camera/gesture behavior, shared asset caches, terrain layers
  and the worker protocol. Geometry/source generation belongs in `app/scripts/geo/`.

## State and navigation

`lib/store/store.ts` is the client store used by React and imperative callbacks.
The root hydrates `explorerSessionsAtom`; `relationIndexAtom` derives the shared entity
index. Consumers with a separate dataset must keep that dataset's index separate.

`filtersAtom` is the authoritative live filter state. `FilterUrlSync` reads the URL as an
initial seed and writes it lazily afterward. Do not introduce a second URL-derived live
state or route navigation for every scrub sample.

Session state is published/retired by `SetSessionState`, including the per-session reset.
`flavorPhaseMotion` owns the continuous animation value; its quantized atom serves labels
and accessibility. Persistent layouts, focus restoration, Back/Forward and shared element
transitions are part of the interaction contract when moving components.

## Editing and deployment

`lib/authoring/` owns the contextual editor, durable local drafts and media preparation.
`app/server/cms/` owns authorization and GitHub operations; `app/api/cms.ts` is its native
Vercel entry. The shared schema is data, not a place for credentials.

The public app exports static pages to `app/out/`. Its native CMS function is packaged
separately. `log/` is the retained standalone CMS fallback, built to `log/dist/`; retirement
depends on the editorial acceptance checks in [CMS setup](in-app-cms-setup.md).
See [deployment](../VERCEL.md) for project roots and outputs.

## Commands and verification

Run from `app/`, after installing from the repository root:

- `pnpm codegen`, `pnpm liquor`, `pnpm geo` regenerate their respective artifacts.
  `pnpm geo:check` and `pnpm geo:test` validate the geographic pipeline.
- `pnpm dev` starts Next on :3000 and Flatbread on :5057. `pnpm build` exports the public app.
- `pnpm test:dev` exercises development behavior. Build with `PUERH_TEST_FIXTURES=1`,
  then `pnpm test:export` exercises the actual export. Rebuild without the flag for deployment.
- `pnpm cms:test` exercises the trusted service; authoring browser tests use a simulated
  GitHub service contract. Follow [CMS setup](in-app-cms-setup.md) for live activation evidence.
- `pnpm perf:interaction [URL] [output.json] --scenario vintage|map-pan-zoom|origin-scroll`
  records real-input frame intervals and long tasks. Optional `--build`/`--source` labels are
  caller supplied and unverified; they do not identify a served build automatically.
  `--headless` is useful for collector validation, while the default remains headed.

Performance output includes idle calibration, environment metadata, per-action percentiles,
threshold counts and raw observations. It measures animation-frame intervals, not a promise
of a particular FPS. Preserve the browser, viewport, scenario and served artifact when
comparing runs. See [test instructions](../app/tests/README.md) for the browser lanes.

[The relational plan](relational-plan.md) retains historical research and implementation
notes; use this map and current code for ownership and entry points.
