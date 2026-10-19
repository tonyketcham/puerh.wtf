# puerh.wtf: relational plan

Research and design plan, not an implementation. It makes every entity a session points at explorable, and adds a line-drawn topographic origin map. Written 2026-10-18 against branch `feat/delight-mechanics` (commit `24a8858` plus uncommitted work).

**Status: approved by the owner on 2026-10-18, all recommendations included. The decisions are in §6.** Implementation starts with Phase 0.

---

## 0. Top recommendations

1. **Fix the five data bugs first (half a day).** The Cultivar→Style ref is broken: the config key is `style` but the content uses `styles`, so it never resolves. Two cultivars are duplicates. Three origin slugs have typos and one is wrong (`manzhi-yun-county-lincang…` is Mangzhi in Xishuangbanna). `genre` holds ids that point nowhere. The Wistaria vendor logo is an expired Facebook CDN URL. Everything relational below depends on clean refs.
2. **Show the data you already have.** Rating (70/70), vendor (70/70), tags (69/70), purchase link (60/70), origin (46/70), season (36), picking (34), aging (25) and elevation (21) are all populated, but none of them appear on the session page. A dead component, `SessionDetailsSidebar.tsx`, already renders some of them. Replace the Properties panel's two-row "Metadata" section with **Provenance / Source / Record** sections (§3.4).
3. **Add one `EntityPeek` primitive and one `EntityPage` template.** In IDE terms, a peek is "Peek Definition" and a page is "Go to Definition". Peeks are hover/focus popovers for every entity type. Pages exist for vendor, origin, style/category and cultivar, and later for the flavor lexicon and teaware. Tags, years, authors and storage stay inline and act as Explorer filters.
4. **Make origins a tree.** Add `parent`, `kind`, `hanzi`, `pinyin` and `geo` to the Origin frontmatter. Then Yiwu rolls up Ding Jia Zhai, Gua Feng Zhai, Guoyoulin and Luoshuidong (7 → 11 sessions), and the session page gets a breadcrumb: `China › Yunnan › Xishuangbanna › Yiwu › Gua Feng Zhai`. Fold the one-file `countries` collection into this tree.
5. **Compute a flavor centroid per entity**, meaning the mean of `flavor_axes` across that entity's sessions. A tiny radar of "what Yiwu tastes like" next to "what Bulang tastes like" is the terroir lesson the site's own home page promises. It's cheap because the radar component already exists.
6. **Origin map: precompute everything at build time, ship SVG path strings, and use no map library at runtime.** The build runs AWS Terrain Tiles (no auth, small PNGs) → `d3-contour` → mapshaper simplify → paths pre-projected with `d3-geo`. It uses only pure JS or WASM dependencies and no shell, so it runs the same on Windows, macOS and Linux CI (§4.3.1). Hillshade comes from **Tanaka (illuminated) contours**, drawn as offset light and dark strokes. Origins are liquor-colored rings, one ring per session. A per-session inset highlights the contour at the tea's recorded elevation.
7. **DEM data (download approved 2026-10-18).** v1 needs about 30–60 MB of terrain tiles, cached outside git. The full GLO-30 route would be about 250 MB or more. Details are in §4.2.

---

## 1. Data audit

Source: `app/flatbread.config.ts`, every markdown file under `app/content/` (scanned with gray-matter), `app/src/lib/api.ts`, `app/src/lib/types/*`, and a grep of `app/src` for where each field is rendered.

### 1.1 Collections

| Folder | Flatbread collection | Files | Referenced by sessions | Notes |
|---|---|---|---|---|
| tastings | Session | 70 | n/a | refs: author, style, cultivar→Varietal, origin, vendor, tags |
| authors | Author | 3 | 2 (tony 70, daes 3) | erika unused; her id is a non-UUID (`67kM9…`) |
| categories | Category | 9 | via Style | each has `color`; only 1 has a description |
| styles | Style | 37 | 29 | ref category; 20 have descriptions; 6 have `color`; 2 have legacy `genre_id` |
| cultivars | Varietal | 22 | 16 | **ref broken**: config `style`, content `styles` (14 files) |
| origins | Origin | 37 | 35 | flat; free-text `location / municipality / country`; 10 descriptions |
| vendors | Vendor | 13 | 12 | wistaria unused; links + image + location |
| tags | Tags | 29 | 28 | `color` on all; no descriptions; big-smoke unused |
| countries | **not in config** | 1 | 0 | `china.md` with only `title`, no id |

How many sessions each entity covers:

- **Vendor:** white2tea 22, Liquid Proust 18, Mei Leaf 12, Yunnan Sourcing 6, Tea Encounter 4, Verdant 2, six others with 1 each.
- **Style:** Single Origin Sheng (`young-gushu.md`) 20, Blended Sheng 15, Factory Sheng 4, Blended Shou 4, five with 2 each, twenty with 1 each.
- **Cultivar:** Da Ye Zhong 39, the other 15 with 1 each.
- **Origin:** Yiwu 7, "It's a mystery" 5, Jingmai 3, five with 2 each, twenty-seven with 1 each. One session (Yang Qing Hao Qixiang) has 6 origins.
- **Tags:** fun-zone 21, lot-goin-on 17, transformer 15, ok-woa 11, gushu 11, spiced-up 9, and so on down to 1.
- **Production year:** 19 distinct years from 1988 to 2021, with 2020 alone at 26.
- **Vessel:** 15 free-text strings that resolve to about 9 real vessels.
- **Flavor descriptors:** about 1,100 raw comma-split terms. 204 appear in 2 or more sessions and 28 in 5 or more (honey 12, oily 9, smooth 9, vanilla 8, apricot 8, dark chocolate 7…).

### 1.2 Session field audit

Columns, for where each field appears in the UI:

- **Page**: center editor of the session page
- **Props**: right Properties panel
- **Status**: bottom status bar
- **Expl**: Explorer tree, search and filters
- **Cmd**: command bar
- **Cards**: `SessionCard` on the home, vendor and category pages

✓ = shown, f = used for filtering or search only, · = not used.

| Field | Populated | Page | Props | Status | Expl | Cmd | Cards | Verdict |
|---|---|---|---|---|---|---|---|---|
| title | 70 | ✓ Rock 3D | · | · | ✓ | ✓ | ✓ | – |
| `_content` (synopsis) | 70 (609–4,700 chars) | ✓ | · | · | · | · | · | – |
| excerpt | 70 | · | · | · | f | ✓ | ✓ | **not on session page** |
| date (session date) | 70 (2020–22) | · | · | ✓ | sort | · | tape | – |
| production_year | 70 | · | ✓ | ✓ age | ✓ + YearRuler | ✓ | ✓ | – |
| author → Author | 70 | · | · | · | · | · | · | **invisible** (3 have co-author daes) |
| vendor → Vendor | 70 | · | · | · | f | ✓ facet | (vendor page) | **invisible on session page** |
| style → Style → Category | 69 | · | · | · | ✓ color icon, f | ✓ facet (category) | ✓ color | **style title never shown** |
| tags → Tags | 69 (1–6 each) | · | · | · | f | ✓ facet | · | **invisible** |
| rating | 70 (62–93.58) | · | · | · | · | · | · | **invisible, not even sortable** |
| flavor_axes (10 axes × start/finish) | 70 | · | ✓ radar + scrubber | ✓ phase | · | ✓ flavor | · | – |
| notes (7 stages) | 70 / 70 each | descriptor hl | ✓ NotesPanel | · | find-refs | ✓ descriptors | · | – |
| brewing.temperature (°F) | 70 | gutter | · | ✓ | · | ✓ | · | – |
| brewing.material_amount / liquid_amount | 70 | · | · | ✓ g/ml/ratio | · | · | · | – |
| brewing.first_infusion_duration / increment | 70 | ✓ steep gutter | · | ✓ | · | ✓ | · | – |
| brewing.vessel | 70 (15 strings) | · | · | ✓ text | · | · | · | shown, not relational |
| purchase_link | 60 | · | · | · | · | · | · | **invisible** (2 are web.archive) |
| cultivar → Varietal | 53 (+1 empty `[]`) | · | ✓ chip (not linked) | · | f | search | · | shown, not linked |
| origin → Origin | 46 (24 missing) | · | · | · | f, search | search | · | **invisible** |
| images | 38 (157 refs, 32 legacy Cloudinary across 8 sessions) | ✓ cube / flow | ✓ per note | · | · | · | ✓ | – |
| liquor color (generated) | 26 / 70 (`confidence: alt`) | ✓ title fill | ✓ | ✓ swatch | ✓ mark | ✓ | ✓ | coverage gap |
| season | 36 (free text) | · | · | · | · | · | · | **invisible** |
| picking | 34 (free text) | · | · | · | · | · | · | **invisible** |
| aging_conditions | 25 (free text) | · | · | · | · | · | · | **invisible** (rich: places + years) |
| elevation (meters) | 21 (150–2125) | · | · | · | · | · | · | **invisible** (good for the map) |
| genre (legacy) | 4 | · | · | · | · | · | · | dead: ids resolve nowhere |
| tea_name | 1 | · | · | · | f | f | · | – |

Notes on the table:

- `SessionDetailsSidebar.tsx` renders excerpt, vendor, aging, purchase link, season, elevation and genre, but **no file imports it**. It's dead code to mine for parts.
- `getSession()` already queries author, tags, origin, rating, purchase_link, aging, season, elevation and picking. The data reaches the client (`sessionAtom`) and is simply never drawn.
- `getExplorerSessions()` loads origin, cultivar, tags and rating for all 70 sessions in the root layout. A relation index can be built on the client from that alone, with no extra query.

### 1.3 Related-entity field audit

| Entity.field | Populated | Shown where | Verdict |
|---|---|---|---|
| Vendor.title / image | 13 / 10 | vendor page, cmd facet | image: 1 legacy Cloudinary, 1 **expired fbcdn** (wistaria), 3 missing |
| Vendor.location / municipality / country | 10 / 9 / 11 | vendor page | "USA" vs "United States"; verdant has nothing |
| Vendor.links.* | 10 | vendor page | – |
| Vendor.description / body | 4 | vendor page | – |
| Origin.location / municipality / country | 36 / 37 / 37 | Explorer search, filter-token label | free-text admin chains; not displayed |
| Origin.description | 10 | **nowhere** | invisible |
| Style.title / category | 37 | never shown as text | invisible |
| Style.description | 20 | **nowhere** | invisible, and rich |
| Style.color | 6 | nowhere | sparse; the category color is the one used |
| Category.title / color | 9 | Explorer icon, cards, category page, cmd | – |
| Varietal.title | 22 | Props chip | – |
| Varietal.description | 8 | **nowhere** | invisible, and rich (Zi Juan, Ye Sheng, Sayama Kaori…) |
| Varietal.styles | 14 | **unresolvable** (config bug) | – |
| Tags.title / color | 29 | cmd facet only | colors unused |
| Author.title / image / links | 3 | nowhere | – |

### 1.4 Data-quality issues (fix list)

| # | Issue | Fix |
|---|---|---|
| D1 | `flatbread.config.ts` has `Varietal refs: { style }` but 14 cultivar files use `styles:` | rename the config key to `styles` |
| D2 | Duplicate cultivar `zhong-xiao-ye-zhong.md` (used by Paradise Snapper, no description) and `zhōng-xiǎo-yè-zhǒng.md` (unused, has hanzi + description) | merge into one ASCII-slug file; repoint the ref |
| D3 | `young-gushu.md` is titled "Single Origin Sheng"; `aged-gushu.md` is unused; tag files `minerals.md` → "v mineral" and `money-money-money.md` → "pricey"; tag title casing is mixed | rename files to match titles (refs are by id, so this is safe); standardize case |
| D4 | Origin slugs: `manzhi-yun-county-lincang-…` is Mangzhi (Xishuangbanna); three files say `xishuangbana`; `municipality` holds anything from province to county-plus-prefecture chains; `location` holds comma chains ("Ding Jia Zhai, Yiwu") | rename files; replace with `title` + `parent` tree + `kind` (§3.3) |
| D5 | Pseudo-origin `its-a-mystery-yunnan-china` (5 sessions) mixes "unknown" with "blend". The 24 sessions with no origin are mostly blends or factory cakes | add `origin_note: blend \| undisclosed \| unknown` (or `kind: unknown` on the mystery node) |
| D6 | `genre` on 4 sessions and `genre_id` on 2 styles point at ids that exist nowhere. 1998 River Song has no style at all | delete `genre`; give River Song a style |
| D7 | `content/countries/china.md` isn't a Flatbread collection; country is free text on origins and vendors | fold into the origin tree (`kind: country`); delete the folder |
| D8 | ~~Elevation has no unit; Milk Float Nomad = 5000~~ **Resolved 2026-10-18:** the unit is meters (owner), and Milk Float Nomad is fixed to 1500 (≈4,921 ft) | document the unit in the content schema; optionally `elevation: [min, max]` |
| D9 | `brewing.vessel` has 15 strings for about 9 vessels (5 spellings of the Jianshui Zitao xishi; "Cat Gaiwan with the lid off") | `vessels` collection + top-level `vessel` ref (§3.2) |
| D10 | `season` is free text ("June", "mid-April", "2018 & 2019", "Spring (April)") | `harvest: { season: spring\|summer\|autumn\|winter, month?, years? }`, keep the raw text as `season_note` |
| D11 | `aging_conditions` is free text with places + years ("Menghai for 7.5 years, Guangzhou for 7 years") | later: structured `storage: [{ place, from, to, humidity }]` (§3.5) |
| D12 | 32 image refs on 8 sessions are `res.cloudinary.com`; 1 vendor logo too | migrate into `/images/uploads` (outside this plan) |
| D13 | Liquor colors cover only 26/70 sessions (38 have images) | fall back to the category color for map rings; extend sampling when photos are added |
| D14 | Mori-machi Dark: vendor = Liquid Proust but `purchase_link` = denstea.com | confirm the vendor |
| D15 | `2020-moon-bear-white` has production_year 2021 | confirm |

---

## 2. Information architecture

### 2.1 The IDE metaphor, extended

The app is already an IDE: an Explorer, an editor, Properties, a status bar and a command palette. Relational navigation should borrow the IDE verbs people already know:

| IDE concept | puerh.wtf |
|---|---|
| Hover / Peek Definition | **EntityPeek**: popover on any entity reference |
| Go to Definition (F12 / ⌘-click) | open the entity page in the editor |
| Find All References (⇧F12) | the "Sessions" list on any entity (already exists for descriptors) |
| Breadcrumbs | origin path above the session title |
| Activity bar (left icon rail) | switch the Explorer's view: **Sessions · Origins (map) · Vendors · Styles · Lexicon** |
| Editor tab "file type" | entity pages titled like files: `yiwu.origin`, `white2tea.vendor`, `dian-hong.style` |
| Quick-open prefixes | command bar: `@` vendor, `#` tag, `^` origin, `~` style, `:` year |

### 2.2 Entity → treatment

Treatments: (a) inline metadata only · (b) preview card (EntityPeek) · (c) browse page with its sessions listed.

| Entity | Count (used) | Sessions/entity | Content to show | Treatment | Why |
|---|---|---|---|---|---|
| **Vendor** | 13 (12) | 22 / 18 / 12 / 6 / 4 / 2 / 1×6 | logo, city, links, description, origins sourced, style mix, avg rating, flavor centroid | **(b)+(c)** | Few entities and heavy sessions, so lists are long; strong cross-links (vendor ↔ origin) |
| **Origin** (village → country tree) | 37 (35) → about 55 nodes with parents | flat: mostly 1. Rolled up: Yiwu 10, Xishuangbanna ~25, Yunnan ~40 | map inset, hanzi/pinyin, elevation, description, children, vendors, styles, centroid | **(b)+(c)** | Thin as leaves, rich as a tree (Yiwu 11, Xishuangbanna ~25, Yunnan ~40); the map is its index |
| **Country** | 3 used (CN 33, JP 3, TW 1) | huge | n/a | **(a)** as a breadcrumb root plus a map zoom level | 3 values; no page |
| **Category** | 9 | sum of its styles | color, styles within, centroid | **(b)+(c)** (page exists) | Top of the style tree; already has a route |
| **Style** | 37 (29) | 20 / 15 / 4 / 4 / 2×5 / 1×20 | description (20!), category, cultivars, origins, vendors | **(b)+(c)** | Descriptions are the best untapped prose in the repo |
| **Cultivar** | 22 (16) | 39 / 1×15 | description (8), hanzi, styles, origins | **(b)+(c)**, with the page for da-ye-zhong first | Peek covers most; a page is cheap with the shared template |
| **Tag** | 29 (28) | 21 … 1 | color, count, co-occurring tags | **(a)** colored chips that **filter the Explorer** (`?tags=`) | Subjective moods with nothing to say; a filter *is* their page |
| **Author** | 3 (2) | 70 / 3 | avatar, links | **(a)** byline; tiny peek optional | Single-author log |
| **Vessel** | about 9 real | 20 / 18 / 14 / 6 / 4 / 1… | photo, clay, ml, avg temp/ratio, sessions | **(b)**, later a **(c)** index `/teaware` | Fun and personal; needs a collection first |
| **Vintage year** | 19 | 26 … 1 | count, age | **(a)** + click → year filter (YearRuler exists) | The Explorer ruler already is the browse UI |
| **Flavor descriptor** | ~1,100 (204 in ≥2 sessions) | 12 … 1 | stage distribution, sessions + snippets, axis | **(b)** (extend find-refs), later **(c)** `/lexicon` | High count, low depth per term; a lexicon index is a striking page |
| Season / picking / elevation / storage | free text | n/a | n/a | **(a)**; elevation also drives the map | Attributes, not entities (storage places could become map nodes later) |
| Rating | 70 | n/a | n/a | **(a)** + Explorer sort | – |

### 2.3 URL structure (static export: every page needs `generateStaticParams`)

```
/                                   home (recents)
/sessions/[year]/[month]/[slug]/    existing
/origins/                           NEW  map + tree index
/origins/[slug]/                    NEW  any node: country, province, mountain, village (flat short slugs, breadcrumb from parent chain)
/vendors/                           NEW  index (currently missing)
/vendors/[slug]/                    existing (upgrade to EntityPage)
/styles/                            NEW  index: categories as sections, styles beneath
/styles/[slug]/                     NEW
/categories/[slug]/                 existing (keep; becomes a style-group page)
/cultivars/  /cultivars/[slug]/     NEW
/lexicon/  /lexicon/[term]/         LATER (descriptor index; /lexicon/[term] only for terms in ≥2 sessions, about 204 pages)
/teaware/  /teaware/[slug]/         LATER
filters: ?tags=…&years=…&vendors=… on any route (existing lib/filters.ts)
```

Rename origin files to short slugs (`yiwu.md`, `gua-feng-zhai.md`). Refs are by `id`, so this only changes `_slug`. Filter URLs that use the old origin `_slug` will break, so accept both or use the id.

### 2.4 Cross-links (from a relation index)

Build `lib/relations.ts` from `getExplorerSessions()` (already loaded in the root layout). Pure functions:

- `sessionsOf(kind, id)`, plus roll-up through the origin and style trees.
- `cooccur(kindA, kindB)`, which counts pairs: origin↔vendor, origin↔style, style↔cultivar, vendor↔style, tag↔tag.
- `stats(kind, id)` → `{ count, years: [min, max], avgRating, centroid: FlavorAxes, liquor: hex[] }`.

The page cross-links follow from those pairs:

| From | Link to |
|---|---|
| Origin | child origins, **vendors who sourced here**, styles made here, cultivars grown here, nearest sibling origins (by distance, from geo) |
| Vendor | **origins they source** (mini map of their points), styles they sell (category bar), years span, tags it attracts |
| Style | category, **cultivars used**, origins, vendors, sibling styles in the category |
| Category | its styles (with counts), origins (map with only this category's rings) |
| Cultivar | styles, origins (map), vendors |
| Descriptor | flavor axis it belongs to, co-occurring descriptors, the origins and styles where it shows up most |

### 2.5 Command bar and Explorer

- **Command bar:** add Origins, Styles and Cultivars facet groups (vendors, categories and tags exist). Add the quick-open prefixes from §2.1. Entity results open the page; ⇧-Enter applies a filter instead.
- **Explorer:** add an activity rail. The Origins view is a collapsible tree `China › Yunnan › Xishuangbanna › Yiwu (10)` with counts, plus a "Show on map" toggle. The Vendors and Styles views are grouped lists with counts. Hovering a row lights the matching map ring or peek.
- **Explorer sort:** add rating.

---

## 3. Pages and components (wireframe level)

All motion uses `motion` v12, which is already a dependency. Shared tokens: `spring = { type: "spring", stiffness: 520, damping: 38 }` for UI chrome and `ease = [0.22, 1, 0.36, 1]` at 0.45 s for content. Every animation honors `prefers-reduced-motion` with an opacity cross-fade and no draw-ons.

### 3.1 `EntityPeek` (the preview card)

- **Trigger:** any `EntityRef` chip or link.
  - Hover with 250 ms intent delay, or keyboard focus, or long-press on touch.
  - Click goes to the page.
  - ⌥-click (or `p` while focused) pins the card.
  - Esc closes it.
- **Layout** (about 320 px wide, Fira Code, `#121012` with a 1px `#fff2ca/10` border):

```
┌ ^ origin ─────────────────────── 10 sessions ┐
│ 易武  Yiwu                       ⌐ 2000–2020 │
│ Xishuangbanna › Mengla · 1,100–1,900 m       │
│ ┌──────────── mini contour inset ──────────┐ │   (origin: map; vendor: logo + city;
│ │   ◎ rings in each session's liquor color  │ │    style: category stripe + cultivar chips;
│ └───────────────────────────────────────────┘ │    descriptor: 7-stage bar)
│ soft, silky, thick aroma … (description, 2 ln)│
│ ◔ flavor centroid radar (48px)   avg 84.7     │
│ ▪ 2020 Vesper Chan   ▪ 2009 Yiwu   ▪ +8      │  (liquor swatches)
│ [Open yiwu.origin ↵]  [Filter ⇧↵]  [Compare]  │
└───────────────────────────────────────────────┘
```

- **Motion:**
  - The card enters from its trigger: `transformOrigin` is set to the anchor side, `scale 0.96→1`, `y 4→0` and opacity, with `spring`.
  - The inset contours draw on (`pathLength 0→1`, staggered 12 ms per elevation band, 300 ms total).
  - Moving between adjacent triggers *morphs* one card (shared `layoutId="peek"`) instead of closing and reopening it.
- **Implementation:**
  - Floating UI is not in the deps; `@floating-ui/react` is about 10 KB, or use CSS anchor positioning with a fallback.
  - Data comes from the client-side relation index, so no fetch is needed. The map inset fetches `/maps/inset/[slug].json` on first open.

### 3.2 `EntityPage` template (vendor, origin, style, category, cultivar)

The page lives in the center editor column; the Explorer and status bar persist.

```
 breadcrumb: China › Yunnan › Xishuangbanna › Yiwu            [yiwu.origin]
 ╔══════════════════════════════════════════════════════════════════════╗
 ║ YIWU  (Rock 3D, filled with a blend of its sessions' liquor colors)   ║
 ║ 易武 · Yìwǔ · mountain-area · 22.0°N 101.4°E ±6 km                    ║
 ╚══════════════════════════════════════════════════════════════════════╝
 [ HERO ]  origin: topographic map, zoomed      vendor: logo + "sourcing map"
           style: category color field + description prose
 ── At a glance ──  10 sessions · 2000–2020 · avg 84.7 · centroid radar
                    vs. parent (Xishuangbanna) radar ghosted underneath  ← terroir
 ── Sessions (Find all references) ──  SessionCard list, sortable
                    (date / vintage / rating), grouped by child origin
 ── Related ──  Vendors here (logos, counts) · Styles · Cultivars · Nearby origins
 ── Notes ──  markdown body / description
```

- **Properties panel on entity pages:**
  - It shows the entity's centroid radar, with the phase scrubber still working on averaged start/finish.
  - Metadata: kind, parent, coordinates and precision, source link.
  - **Top descriptors** for the entity: descriptor frequency across its sessions, so you can click "camphor" to find references inside Yiwu.
- **Status bar:** `^ origin · 10 refs · 22.07°N 101.42°E · ±6 km · precision: mountain-area`.
- **Motion:**
  - Route change: use React 19 `<ViewTransition>` (Next 16 `experimental.viewTransition`) to morph the clicked chip or peek header into the page title, and the peek inset into the hero map.
  - Fallback: cross-fade.
  - Session cards enter staggered (reuse `enterIndex` from `SessionCard`).
  - Scroll-linked: the hero map tilts very slightly via `useScroll` → `rotateX 0→6°`, and contours fade toward index contours only.

### 3.3 Index pages

- **`/origins`:** the full map (§4) on the left two-thirds, the tree with counts on the right. "Unplaced" tray at the bottom: 24 sessions with no origin plus 5 mystery, drawn on a hatched "terra incognita" strip.
- **`/vendors`:** cards in a grid sorted by session count.
  - Each card shows the logo, city, count, category mix bar and a small dot-map of the origins they sourced from.
  - Optional "supply lines" overlay on the world view: an arc from each origin to the vendor's city.
- **`/styles`:** nine category bands in their category colors; styles listed with counts and the first description line. Unused styles are greyed ("not yet tasted"), which nudges exploration.
- **`/cultivars`:** list with hanzi, a "leaf size" glyph (da ye / zhong xiao ye / xiao ye) and counts.
- **`/lexicon` (later):** a field of descriptor words sized by frequency, grouped into the 10 flavor axes like a periodic table. Clicking a word opens find-references.

### 3.4 The session page's Metadata section becomes three sections

Replace `SessionProperties` › "Metadata" (production year + cultivar chips) with:

```
── Provenance ───────────────────────────────────────
 China › Yunnan › Xishuangbanna › Yiwu › Gua Feng Zhai   (each crumb = EntityRef)
 ┌ contour inset 280×160 ─────────────────────────────┐
 │ highlighted contour at 1,200 m in liquor color      │
 │ ◎ point  · scale bar 5 km · 22.2°N 101.5°E ±2 km     │
 └─────────────────────────────────────────────────────┘
 elevation 1,200 m · harvest Spring · picking bud + 3
 style  Single Origin Sheng ‹Sheng›   cultivar  Da Ye Zhong
 vintage 2020 · storage  ‹ timeline: Menghai 7.5y → Guangzhou 7y › (when present)
── Source ───────────────────────────────────────────
 [logo] Mei Leaf ›   ↗ listing (archived)    vessel  Cat Gaiwan ›
── Record ───────────────────────────────────────────
 rating 89.96  ▮▮▮▮▮▮▮▮▮▯ (rank 6/70)   by Tony (+Daes)
 tags  ● transformer  ● gushu  ● fun zone   (filter chips)
```

- Every `›` value is an EntityRef: hover peeks, click opens the page.
- Tags filter the Explorer.
- The breadcrumb also renders small above the Rock 3D title in the editor, VS Code style.
- When there's no origin, Provenance shows "blend · undisclosed" with the hatched pattern, which is honest and on-brand.
- **Motion:** sections stagger in on session change, keyed by slug like the title. When you switch sessions, the inset *pans* between origins rather than cross-fading if both are in the same pre-projected frame (shared projection; see §4.5). That gives a strong sense of place when you arrow through the Explorer.

### 3.5 Later data upgrades that unlock UI

- `storage: [{ place, from, to, humidity: dry|natural|wet }]` from `aging_conditions` (25 sessions). This draws a storage timeline and lets the map show "where it aged" (Guangzhou, Hong Kong, Kunming, Taiwan, Malaysia) as a second, dimmer layer.
- `vessels` collection: `{ title, kind, material, volume_ml, image }`, plus a top-level `vessel` ref on sessions. Keep `brewing.vessel` as a note, because Flatbread refs on nested fields are unverified.

---

## 4. Origin map

### 4.1 Aesthetic

- **Ground and contours:**
  - Ground is `#121012`.
  - Normal contours: hairlines in cream `#fff2ca` at about 8–12% alpha, 0.5 px, `vector-effect: non-scaling-stroke`.
  - Every fifth contour is an index line at about 20% alpha, 0.8 px.
- **Tanaka illuminated contours** give hillshade with lines only. Each contour band polygon is stroked twice: a light stroke offset (−0.6, −0.6) px and a dark stroke offset (+0.6, +0.6) px, both clipped to the band. Slopes facing the NW light glow; lee slopes sink. This avoids any raster or fake material, which matches the owner's "no CSS-faked materials" note.
- **Hero alternative:** "Unknown Pleasures" ridgelines over the six ancient tea mountains. These are stacked horizontal elevation profiles, each filled `#121012` to occlude the one behind. They come from the same grid and are very striking as the `/origins` header at load.
- **Context lines:**
  - Coastlines and the Mekong/Lancang and Red River in Natural Earth 10 m, as single slightly cooler grey lines.
  - Dongting Lake outlined for Junshan.
  - Province outlines dashed at 6% alpha.
  - **No national borders** (contested lines, and they aren't needed).
- **Labels:**
  - Fira Code small caps for pinyin; hanzi in a **subset** Noto Sans SC or Serif SC (only the ~80 glyphs used, generated at build time with `subset-font`, < 15 KB). Fira Code has no CJK.
  - Labels are IDE comments: `// 易武 Yiwu · 1,350 m` with a hairline leader.
- **Origin markers by precision:**

| Precision | Marker |
|---|---|
| village | solid 3 px dot + liquor ring per session |
| mountain-area / township | dashed circle at `radius_km` |
| county / prefecture | faint hatched disc |
| province / unknown | dotted ellipse over the province + `?` glyph |

- **Multiple sessions at one origin** draw as concentric rings in each session's liquor color (fallback: category color). Yiwu becomes a 10-ring target. Blends with several origins (Qixiang: 6) draw a dotted convex hull "blend region".

### 4.2 Data sources

| Need | Source | License | Size for our extents | Verdict |
|---|---|---|---|---|
| DEM, v1 | **AWS Terrain Tiles** (`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, 256 px, `h = R·256 + G + B/256 − 32768` m). Built from 3DEP, SRTM, GMTED and ETOPO1; in Asia it's SRTM, so detail stops improving past about z12 (higher zooms are oversampled) | attribution required (see the AWS terrain page) | about 30–60 MB cached across zooms 6–12 (tiles 50–150 KB) | **use**: no auth, plain HTTP, decodable in Node with `pngjs` |
| DEM, high fidelity | Copernicus GLO-30 COGs on AWS (`copernicus-dem-30m`) | free with attribution (© DLR/Airbus, Copernicus) | 1° tiles ~20–40 MB; Yunnan ~10 tiles ≈ 250 MB+ | later, only if v1 looks mushy at village scale; read with `geotiff.js` |
| DEM, overview | ETOPO 2022 (60″) or terrain tiles z4–5 | public domain | ETOPO global ~0.5 GB; tiles ~1 MB | tiles z4–5 |
| Coast, rivers, lakes, provinces | Natural Earth 10 m (`coastline`, `rivers_lake_centerlines`, `lakes`, `admin_1`) | public domain | each 1–20 MB zipped, clipped to ~50–200 KB | use |
| Counties (optional faint context) | geoBoundaries CHN ADM2/ADM3 | CC BY 4.0 (check per-country licence) | ~10–40 MB | optional |
| Origin points | **hand-curated** (§4.6) | own | < 20 KB | required: precise puer villages aren't reliably geocodable |

### 4.3 Build pipeline (`app/scripts/geo/*.mjs`, Node only, no GDAL)

This follows the pattern of `scripts/liquor-colors.mjs` and writes into `src/generated/` and `public/maps/`.

```
0. origins:   content/origins/*.md (geo frontmatter) ─► generated/origins.geo.json (Points + area circles)
1. frames:    derive map frames from origins:
                world/asia locator · china-east · yunnan · six-mountains cluster · per-origin inset (24 km box, or area bbox + 30%)
2. fetch:     terrarium tiles per frame at fitting zoom → .cache/terrain/{z}/{x}/{y}.png  (gitignored, resumable)
3. grid:      stitch → Float32Array (meters) → light Gaussian blur σ≈1–1.5 px (kills SRTM speckle; better contours)
4. contour:   d3-contour thresholds  (inset 50 m, index 250 m · yunnan 200 m · cluster 100 m)
              → MultiPolygons in pixel space → affine → lon/lat
5. simplify:  mapshaper (npm, programmatic) -simplify weighted 8–15% keep-shapes, -clean
6. project:   d3-geo geoAzimuthalEqualArea / geoConicEqualArea per frame → SVG path `d` strings,
              rounded to 0.1 px; grouped by elevation band
7. emit:      public/maps/frames/{frame}.json  { bbox, projection params, bands:[{elev, d}], context:{coast,rivers,lakes} }
              public/maps/inset/{originSlug}.json  (inset frame; also lists elevation of each band for highlight)
              public/maps/ridges/six-mountains.json  (ridgeline polylines)
8. fonts:     collect hanzi from origins → subset Noto Sans SC → public/fonts/origins-sc.woff2
```

- **Why pre-projected paths instead of TopoJSON + d3 at runtime:** zero runtime geo dependencies, the first paint is just `<path d>`, and the static export stays happy. Zooming is a transform on a `<g>` with non-scaling strokes. The full map keeps one shared projection (e.g. `geoConicEqualArea` with parallels 20°/30°, centered 102°E 25°N), so the cluster and Yunnan frames register exactly and LOD layers cross-fade in place.
- **Run cadence:** `pnpm geo` runs manually when origins change, like `pnpm liquor`. Outputs are committed (small), and the DEM cache isn't.

#### 4.3.1 Cross-platform: Windows, macOS, Linux and CI

The pipeline has to run the same on Windows (main dev), macOS (other devices), and Linux: GitHub Actions `ubuntu-latest` on Node 20, plus Vercel. Rules:

- **Pure JS or WASM dependencies only:**
  - `pngjs` decodes terrain tiles.
  - `d3-contour` and `d3-geo` handle contours and projection.
  - `mapshaper` simplifies; it's pure JS and used through its programmatic `applyCommands` API, not the CLI binary.
  - `subset-font` subsets the CJK font using harfbuzzjs (WASM).
  - `gray-matter` is already in the tree.
  - **No GDAL, Python, `sharp`, `node-canvas` or other native or system binaries.** Even with prebuilt binaries for each OS, they add install-time failure modes.
- **No shell in the pipeline:**
  - Scripts are `.mjs` files invoked as `node scripts/geo/build.mjs …` from `package.json`.
  - No bash, `test`, `rm -rf`, inline `VAR=x` env prefixes or `&&`-chained logic. Flags go through `process.argv`, env through `process.env`.
  - Paths use `node:path` plus `fileURLToPath(import.meta.url)`, and are never hard-coded with `/` or `\`.
  - URLs written into the JSON outputs always use `/`.
  - The existing `build`/`prebuild` scripts are bash-only (`./scripts/build-with-exit-code.sh`, `test "$CI" = true`). They're outside this plan, so don't add more like them.
- **Node 20 floor:** CI pins Node 20.
  - Use only APIs that are stable in Node 20: global `fetch`, `fs/promises`, `AbortSignal.timeout`.
  - Avoid newer additions such as `fs.glob`, `require(esm)` or type stripping.
  - Add `"engines": { "node": ">=20" }` and an `.nvmrc` with `20` so every machine matches. `engine-strict=true` is already in `.npmrc`.
- **Deterministic, byte-identical output on every OS**, so regenerating on a Mac never churns a diff made on Windows:
  - Round coordinates to 0.1 px in projected paths and 1e-5° in GeoJSON.
  - Sort features by slug and bands by elevation.
  - Write JSON with a fixed key order and `\n` line endings plus a trailing newline.
  - Pin d3 and mapshaper versions in the lockfile. V8's math is consistent across platforms, and the rounding absorbs the rest.
  - Add a `.gitattributes` entry so `autocrlf` on Windows doesn't rewrite the outputs: `app/public/maps/** -text` and `app/src/generated/*.json text eol=lf`.
- **Builds never need the network or the DEM:**
  - `next build` (CI, Vercel) only reads the committed `public/maps/*` and `src/generated/*`.
  - Terrain tiles are fetched only by `pnpm geo` on a dev machine.
  - Fetching runs at concurrency 6 with retries and backoff, and resumes from cache.
- **Cache location:**
  - Default is `app/.cache/terrain/`, gitignored.
  - `PUERH_GEO_CACHE` overrides it, so a Mac and a PC can each keep the cache outside the repo or on a shared drive.
  - The cache layout is `{z}/{x}/{y}.png`, the same on every OS.
- **Commands:**

| Command | Network | Used by | Does |
|---|---|---|---|
| `pnpm geo` | yes (first run) | dev (any OS) | fetch missing tiles → regenerate everything → update `maps-manifest.json` |
| `pnpm geo --offline` | no | dev | regenerate from cache only; fail clearly if a tile is missing |
| `pnpm geo:check` | no | CI | hash the inputs (origin `geo` frontmatter + pipeline params + script version) and compare with the committed `maps-manifest.json`; fail with "origins changed, run `pnpm geo`" |
| `pnpm geo:test` | no | CI matrix | run the full pipeline on a committed fixture (about 4 tiles, ~300 KB, in `scripts/geo/fixtures/`) and compare with a committed snapshot byte for byte |

- **CI additions:**
  - `geo:check` goes into the existing `build.yml` job on Ubuntu; it's cheap.
  - A new small `geo-test` job runs on a matrix of `ubuntu-latest`, `macos-latest` and `windows-latest`. It proves determinism and path handling on all three OSes without any DEM download.
  - Regenerating maps inside CI isn't recommended. If it's ever wanted, cache `.cache/terrain` with `actions/cache` keyed on the manifest's input hash.

### 4.4 Budgets

| Asset | Target (gzip) |
|---|---|
| Per-session inset JSON | 8–20 KB (≈ 30–60 contour paths) |
| `/origins` base frame (locator + Yunnan + context lines) | ≤ 150 KB |
| Six-mountains LOD (lazy on zoom) | ≤ 250 KB |
| Ridgelines hero | ≤ 60 KB |
| CJK subset font | ≤ 15 KB |
| Runtime JS added | ~0 beyond components (motion already present; no d3-geo/maplibre at runtime) |

Rejected options:

- **MapLibre with a custom style:** about 220 KB gz plus a tile pipeline, and too "map-app".
- **deck.gl:** heavy, and WebGL is overkill for line art.
- **Canvas** remains a fallback only if SVG path counts exceed about 5k on the cluster LOD. If needed, draw the LOD to `<canvas>` with `Path2D(d)`, which reuses the same strings.

### 4.5 Interactions and motion

**Per-session inset (Properties › Provenance):**

- It draws on when the session mounts: contours rise from low to high (stagger by band, 400 ms total, `pathLength`).
- If `elevation` is known (21 sessions), the nearest contour is re-stroked in the session's liquor color at 1.2 px with a tiny label `1,200 m`. The idea is "your tea grew on this line."
- On hover, a subtle parallax: index contours translate ±2 px against the mouse, giving relief without 3D.
- When arrowing through sessions, if both origins fall inside the shared Yunnan frame, the inset **pans/zooms** between them (spring on the `<g>` transform) instead of swapping images.
- Click morphs to `/origins/[slug]` (`ViewTransition`).

**Full `/origins` page:**

1. Load: the ridgeline hero draws line by line (top → bottom, 20 ms stagger), then scroll scrubs it into the plan-view contour map. Crossfade at the shared bbox; `useScroll` drives a ridge "flattening" scaleY.
2. Camera: a locator (East Asia coast) → Yunnan frame. Spring-animated `viewBox` (motion value → `attr`).
3. Rings pop in by vintage year order, so the oldest tea appears first. The YearRuler filter dims rings outside the selected years.
4. Hover a ring: EntityPeek. Hover an Explorer row: its ring pulses and a hairline leader draws from the map edge.
5. Click a cluster: zoom to the six-mountains frame and lazy-load the LOD (cross-fade 250 ms). The breadcrumb updates and the URL becomes `/origins/yiwu/` (shallow, no full navigation).
6. Keyboard: ←/→ cycles origins by longitude, Enter opens, Esc zooms out, `f` toggles "filter Explorer to visible".
7. Layer toggles (status bar, IDE-style): `contours · ridges · rivers · storage · supply lines`.

### 4.6 Hand-curated origins dataset

The source of truth is the **Origin frontmatter**, so it's CMS-editable and Flatbread-exposed. The build emits GeoJSON.

```yaml
# content/origins/gua-feng-zhai.md
id: …                          # keep existing ids
title: Gua Feng Zhai           # replaces location
hanzi: 刮风寨
pinyin: Guāfēng Zhài
kind: village                  # country|province|prefecture|county|mountain-area|township|village|forest|unknown
parent: <id of yiwu>           # Origin → Origin self-ref (verify Flatbread supports self-refs; else resolve in lib/relations.ts)
groups: [six-ancient-tea-mountains]   # optional cross-cutting sets
geo:
  lat: 22.xx
  lon: 101.xx
  precision: village           # what the point actually means
  radius_km: 3                 # uncertainty / area circle drawn on the map
  elevation_m: [1200, 1800]    # typical garden range, optional
  confidence: medium           # high | medium | low
  source: https://…            # where the coordinate came from
description: …
```

- **New parent nodes** to create (about 18): China, Japan, Taiwan; Yunnan, Fujian (exists as `fujian-china`), Anhui, Zhejiang, Guangdong, Guangxi, Hunan, Shandong, Shizuoka, Kyoto, Shiga, Chiayi; Xishuangbanna, Lincang, Pu'er.
- **Optional mountain-area polygons:** hand-drawn in geojson.io for Yiwu, Nannuo, Bulang, Jingmai, Mengku and Lincang, stored at `content/geo/areas/{slug}.geojson`. v1 can use circles.

#### Suggested coordinates for every origin in `app/content/origins`

These are research-grade suggestions: OSM/Nominatim lookups of the hanzi or kanji names, GeoNames, zh.wikipedia, vendor pages, and a 1996 survey from the Xishuangbanna Tropical Botanical Garden (XTBG). Treat every point as ±1 km at best. **Rows at low or low-med confidence must render as fuzzy areas, never pins.** The full admin chains and per-row source URLs are in the session notes file `origins-geocode.md`; copy the `source` URLs into frontmatter in Phase 4.

| Current slug → proposed short slug | Name | Hanzi | Kind / precision | lat, lon | radius | Conf. | Notes |
|---|---|---|---|---|---|---|---|
| alishan-chiayi-taiwan → `alishan` | Alishan | 阿里山 | mountain-area | 23.475, 120.700 | 12 km | med | tea belt is Zhuqi/Shizhuo, not the township seat (23.515, 120.810) |
| anxi-fujian-china → `anxi` | Anxi | 安溪 | county | 25.142, 117.905 | 30 km | high | Tieguanyin heartland Xiping 25.024, 117.943 |
| asamiya-shiga-japan → `asamiya` | Asamiya | 朝宮 | township | 34.864, 135.987 | 3 km | high | Shigaraki, Kōka |
| banpo-lao-zhai-nannou-… → `banpo-laozhai` | Banpo Laozhai | 半坡老寨 | village (parent: Nannuo) | 21.943, 100.600 | point | med-high | slug typo "nannou"; currently unused |
| bulang-yunnan-china → `bulang` | Bulang Shan | 布朗山 | mountain-area | 21.650, 100.450 | 15 km | med | Laobanzhang 21.732, 100.497 |
| ding-jia-zhai-yiwu-… → `dingjiazhai` | Dingjiazhai | 丁家寨 | village (parent: Yiwu) | 22.066, 101.477 | point | high | about 9.5 km N of Yiwu town |
| feng-qing-lincang-… → `fengqing` | Fengqing | 凤庆 | county | 24.597, 99.909 | 30 km | high | Lincang |
| fuding-fujian-china → `fuding` | Fuding | 福鼎 | county | 27.222, 120.211 | 25 km | high | |
| fujian-china → `fujian` | Fujian | 福建 | province | 26.193, 118.221 | 250 km | high | becomes a parent node |
| gedeng-xishuangbana-… → `gedeng` | Gedeng | 革登 | mountain-area | 22.120, 101.225 | 4 km | low-med | anchored on the OSM 革登 tea factory; typo "xishuangbana" |
| gua-feng-zhai-… → `guafengzhai` | Guafengzhai | 刮风寨 | village (parent: Yiwu) | 22.035, 101.602 | point (6 km gardens) | med-high | |
| guoyoulin-… → `guoyoulin` | Guoyoulin | 国有林 | forest (parent: Yiwu) | 21.850, 101.500 | 10 km | **low** | only source says "between Yiwu and Mengla town" |
| he-kai-yunnan-china → `hekai` | Hekai | 贺开 | mountain-area | 21.785, 100.495 | 6 km | med | Menghun, Menghai; slug omits Menghai |
| hou-gu-huang-shan-… → `houkeng` | Houkeng ("Hou Gu") | 猴坑 | village | 30.370, 118.172 | point | med-high | Taiping Houkui origin; "Hou Gu" likely 猴坑/猴岗 |
| huangshan-anhui-china → `huangshan` | Huangshan | 黄山 | mountain-area | 30.138, 118.160 | 12 km | med | mountain, not Tunxi city |
| its-a-mystery-yunnan-china → `yunnan-unknown` (or `kind: unknown` under Yunnan) | (unknown) | 云南 | unknown | 25.000, 101.500 | 350 km | low | placeholder: render as dotted province ellipse + "?" |
| jing-mai-yunnan-china → `jingmai` | Jingmai Shan | 景迈山 | mountain-area | 22.185, 99.988 | 5 km | high | **Lancang, Pu'er**, not Xishuangbanna |
| laoshan-qingdao-… → `laoshan` | Laoshan | 崂山 | mountain-area | 36.150, 120.580 | 12 km | med | |
| luoshuidong-mengla-… → `luoshuidong` | Luoshuidong | 落水洞 | village (parent: Yiwu) | 22.007, 101.482 | point | med | OSM: about 3 km NNE of Yiwu town (the stored description says 7 km NW) |
| manzhi-yun-county-lincang-… → `mangzhi` | Mangzhi | 莽枝 | mountain-area | 22.090, 101.215 | 4 km | low-med | **wrong admin path in slug**: Xiangming, Mengla, Xishuangbanna |
| manzhuan-xishuangbana-… → `manzhuan` | Manzhuan | 蛮砖 | mountain-area | 22.090, 101.340 | 8 km | **low** | hand-placed SE of Xiangming |
| menghai-xishuangbanna-… → `menghai` | Menghai | 勐海 | county | 21.960, 100.451 | 40 km | high | parent of Bulang, Nannuo, Hekai |
| mengla-county-… → `mengla` | Mengla | 勐腊 | county | 21.655, 101.479 | 60 km | high | parent of Yiwu and the Xiangming mountains |
| mori-machi-shizuoka-japan → `mori-machi` | Mori-machi | 森町 | township | 34.836, 137.927 | 8 km | high | Shizuoka (not the Hokkaido Mori) |
| nannuo-yunnan-china → `nannuo` | Nannuo Shan | 南糯山 | mountain-area | 21.945, 100.600 | 6 km | high | |
| ping-keng-tou-guangdong-china → `pingkengtou` | Pingkengtou | 平坑头 | township | 23.940, 116.665 | 5 km | **low** | no gazetteer point; placed near Fenghuang/Wudong |
| qianjiazhai-yunnan-china → `qianjiazhai` | Qianjiazhai | 千家寨 | mountain-area | 24.196, 101.228 | 10 km | low-med | Ailao Shan, Zhenyuan; trees at 2,100–2,500 m |
| suan-zao-shu-ninger-… → `suanzaoshu` | Suan Zao Shu | 酸枣树 (unverified) | village; point is a county-level placement | 23.502, 100.711 | 35 km | **low** (place) / high (admin) | **owner confirmed 2026-10-18: Jinggu area, Pu'er (Simao)**; the slug's "Ning'er" is wrong. `municipality` is fixed; rename the slug in Phase 0. No gazetteer point found; YS says about 2 h from Jinggu town, at 1,800 m |
| uji-kyoto-japan → `uji` | Uji | 宇治 | county | 34.885, 135.800 | 6 km | high | |
| weidong-meng-noy-bulang-… → `weidong` | Weidong (Meng Noy) | 卫东? | township guess | 21.586, 100.417 | 15 km | **low** | not found; possibly 曼诺 Mannuo (21.559, 100.399); currently unused |
| wuyi-zhejiang-china → `wuyi-zhejiang` | Wuyi County | 武义 | county | 28.897, 119.812 | 25 km | high | 武义 ≠ 武夷: keep the labels distinct |
| wuyishan-fujian-china → `wuyishan` | Wuyishan | 武夷山 | county | 27.759, 118.030 | 15 km | med-high | scenic core about 27.71, 117.97 |
| wuzhou-guangxi-china → `liubao` | Liubao | 六堡 | township | 23.814, 111.373 | point | high | use the Liubao town point, not Wuzhou city |
| yibang-xishuangbanna-… → `yibang` | Yibang | 倚邦 | village | 22.210, 101.324 | point (6 km mtn) | high | |
| yiwu-xishuangbanna-… → `yiwu` | Yiwu | 易武 | mountain-area | 21.981, 101.469 | 15 km | high | town point; mountain area about 15 km |
| youle-xishuangbana-… → `youle` | Youle / Jinuo Shan | 攸乐 / 基诺山 | mountain-area | 22.010, 101.040 | 8 km | med | **Jinghong**, not Mengla; typo "xishuangbana" |
| yueyang-hunan-china → `junshan` | Junshan Island | 君山岛 | village | 29.355, 113.000 | point | high | island in Dongting Lake |

Notes:

- **Proposed tree.**
  - Xishuangbanna has three branches:
    - Mengla (Yiwu with its villages, plus Gedeng, Mangzhi, Manzhuan and Yibang)
    - Menghai (Bulang with Weidong, Nannuo with Banpo Laozhai, and Hekai)
    - Jinghong (Youle)
  - Pu'er holds Jingmai, Qianjiazhai and Suan Zao Shu.
  - Lincang holds Fengqing.
  - Group `six-ancient-tea-mountains` = Yiwu, Gedeng, Mangzhi, Manzhuan, Yibang, Youle.
  - With the tree, Yiwu rolls up to 11 sessions (7 direct, plus Ding Jia Zhai, Gua Feng Zhai, Guoyoulin and Luoshuidong).
- **Map frames (S, W, N, E):**

| Frame | Bounds | Note |
|---|---|---|
| Six mountains | 21.78, 100.95, 22.28, 101.68 | widen to W 100.35 / S 21.55 for Nannuo, Bulang and Hekai |
| Yunnan | 21.50, 99.85, 24.65, 101.70 | |
| China + Taiwan | 21.4, 99.7, 36.4, 121.0 | too wide for one frame, so show Yunnan as an inset |
| Japan | 34.3, 135.5, 35.4, 138.3 | separate locator inset |

- **No current origin is in Mengku or other named Lincang villages.** Only Fengqing is in Lincang. Add those as nodes when sessions arrive; the schema handles them.

---

## 5. Phased build order

| Phase | Scope | Effort |
|---|---|---|
| **0. Data hygiene** | D1–D10 fixes; origin renames + `title/hanzi/pinyin/kind/parent`; new parent nodes; delete `countries/`; vendor image fixes | 0.5–1 day |
| **1. Make it visible** | `lib/relations.ts` (index, roll-ups, stats, centroids); `EntityRef` chip; Properties → Provenance / Source / Record (no map yet); rating sort; tag chips → filters; editor breadcrumb | 2–3 days |
| **2. Peek** | `EntityPeek` with per-kind bodies (vendor, origin, style, category, cultivar, descriptor, vessel stub); morphing between triggers; keyboard pinning | 2 days |
| **3. Pages** | `EntityPage` template; `/vendors` index + upgrade `[slug]`; `/styles`, `/styles/[slug]`; `/cultivars`(+slug); `/origins/[slug]` without map; category page upgrade; command-bar facets + prefixes; activity rail (Sessions / Origins tree / Vendors / Styles) | 3–4 days |
| **4. Map pipeline** | (DEM download approved) geocode frontmatter; `scripts/geo/*` (fetch, grid, contour, simplify, project, emit, font subset); cross-platform guarantees: `geo:check` in CI, fixture snapshot on an Ubuntu/macOS/Windows matrix, `.gitattributes`, Node 20 pin; per-session inset with elevation highlight + pan between sessions | 4–5 days |
| **5. Origins page** | full map: frames + LOD, Tanaka strokes, rings, ridgeline hero, camera, Explorer cross-highlight, layer toggles, unplaced tray; ViewTransition morphs inset → hero | 3–5 days |
| **6. Later** | `/lexicon`; `vessels` collection + `/teaware`; structured `storage` + storage/supply-line layers; GLO-30 upgrade for village insets; mountain-area polygons | 3–6 days |

Phases 1–3 don't depend on the map. Phase 4 can start in parallel once Phase 0's origin frontmatter lands.

## 6. Decisions (approved by the owner 2026-10-18)

The owner approved every recommendation in this plan, §0 through §5 as written, including the treatments in §2.2, the URL structure in §2.3, the map approach in §4 and the phase order in §5. The individual open questions resolved as follows:

| # | Question | Decision |
|---|---|---|
| 1 | DEM download | **Approved.** Fetch AWS Terrain Tiles for v1 (about 30–60 MB, cached in `app/.cache/terrain` or `PUERH_GEO_CACHE`, never committed). A GLO-30 upgrade (about 250 MB+) stays in Phase 6 and would need its own go-ahead. |
| 2 | Origin slug renames | **Approved.** Use short flat slugs (`/origins/yiwu/`). Explorer filters should accept the old slug or the `id` during the transition. |
| 3 | Mystery and origin-less sessions | **Show them** in an "unplaced" tray (hatched "terra incognita" strip). Add `origin_note: blend \| undisclosed \| unknown`. |
| 4 | Elevation | **Meters.** Milk Float Nomad is fixed to 1500. |
| 5 | Vessels and storage | **Make them entities:** a `vessels` collection with a top-level `vessel` ref, and structured `storage: [{ place, from, to, humidity }]` (Phase 6, per §3.5). |
| – | Suan Zao Shu admin path | **Jinggu area, Pu'er (Simao)** per the owner. `municipality` is fixed; the slug gets renamed in Phase 0. |

Still open (facts only the owner has; they don't block any phase):

- D14: the vendor for Mori-machi Dark (Liquid Proust vs Den's Tea)
- D15: Moon Bear White's production year (2020 or 2021)
- A village-level point for Suan Zao Shu (township or vendor map)

## Sources

- Terrain Tiles format, zoom levels and source datasets: [FME Terrain Tiles on AWS reader](https://docs.safe.com/fme/html/FME-Form-Documentation/FME-ReadersWriters/terraintilesaws/terraintilesaws.htm), [Metabunk custom terrain sources](https://www.metabunk.org/sitrec/docs/dev/CustomTerrainSources.html), official page [aws.amazon.com/public-datasets/terrain](https://aws.amazon.com/public-datasets/terrain/)
- Next 16 view transitions (experimental; `import { ViewTransition } from "react"`; fires on navigations, Suspense and transitions): [next.config viewTransition](https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition), [Next.js view transitions guide](https://nextjs.org/docs/app/guides/view-transitions)
- Tanaka illuminated contours: Kitirō Tanaka, "The Relief Contour Method of Representing Topography on Maps", *Geographical Review* 40(3), 1950
