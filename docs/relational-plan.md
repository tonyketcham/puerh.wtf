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
  - Route change: use React 19 `<ViewTransition>` (Next 16 `experimental.viewTransition`) to morph the clicked chip or peek header into the page title, and the peek inset into the hero map. *(Built on `document.startViewTransition` instead; see §7.)*
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
              (v3, §4.7.2: insets → detail cells public/maps/detail/cells/{z}-{x}-{y}.json + organic masks)
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
| Per-origin detail patch JSON (v1: per-session inset) | 8–20 KB (≈ 30–60 contour paths); built 2026-10-19: largest 14.4 KB, median 10.7 KB. Replaced by detail cells (§4.7.2 v3) |
| Detail cell JSON (§4.7.2 v3) | ≤ 25 KB; built: largest 24.9 KB, median 12.0 KB, 293 cells, 3.6 MB gz in all (10.0 MB on disk). With contour thinning (§4.7.8): largest 25.0 KB, median 12.3 KB, 295 cells, 3.86 MB gz (10.17 MB on disk) |
| Organic edge masks (PNG) | built: 14 regions + 3 frames, 40 KB in all |
| `/origins` base frame (locator + Yunnan + reference layers) | ≤ 150 KB; built: 90.9 KB; 92.4 KB with thinning |
| Six-mountains LOD (lazy on zoom) | ≤ 250 KB; built: 86.8 KB; 123.7 KB since v3 (padded for its organic edge); 127.9 KB with thinning |
| Ridgelines hero | ≤ 60 KB |
| Labels (`public/maps/labels.json`, §4.7.4) | ≤ 40 KB; built: 19.6 KB (1,031 labels) |
| CJK subset font | ≤ 50 KB (planned 15, then 16; raised for Map v2's label hanzi, see §7); built: 48.1 KB, 331 glyphs |
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
5. Click a cluster: zoom to the six-mountains frame and lazy-load the LOD (cross-fade 250 ms). The breadcrumb updates and the URL becomes `/origins/yiwu/` (shallow, no full navigation). *(Built as `/origins/?at=yiwu`; see §7.)*
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

### 4.7 Map v2: geographic legibility + pan/zoom everywhere (owner request 2026-10-19)

**Problem.** The v1 maps are contour art without reference. Nothing tells you you're near Laos, which town is nearby, which way the Mekong runs, or where the inset sits in Yunnan. Only `/origins` can pan and zoom. The session-panel inset and the origin heroes (e.g. `/origins/yiwu/`) are fixed crops.

**Goal.** Every map reads as a place at a glance and can be zoomed out and panned. The same terrain world is reached from the session panel, the origin page and `/origins`.

**1. One north-up shared space: Web Mercator.**

- `SHARED_PROJECTION` becomes `geoMercator`. Keep scale 30000, centered near 102°E 25°N, so 1 unit ≈ 190 m there.
- North-up everywhere: the v1 conic rotated Japan about 15° and Taiwan about 8°.
- The runtime needs no geo library. Mercator forward and inverse are a few lines of TS (`lib/components/map/projection.ts`). The pipeline writes control points into the manifest, and `geo:test` asserts that the TS math matches d3.

**2. Insets become detail patches in the shared space.**

- Each origin's inset contours are emitted in shared units with finer rounding (0.01 unit), at `public/maps/detail/{slug}.json`.
- They are the finest LOD layer, after locator → china-east/japan → yunnan → six-mountains → detail.
- Any detail patch in view loads at fine zoom, so panning from Yiwu to Guafengzhai stays detailed.
- Each layer sits on its own ground with a soft feathered edge (an SVG mask, not CSS blur), so coarser contours never show through.

**2b. v3 (owner request 2026-10-19): coverage-tiled detail with organic edges.** "Detailed topology tiles should exist on all the areas we cover rather than only having a single rectangle tile. At boundaries, feather this off smoothly so it's not reading as a slightly feathered rect."

- **Coverage.** Every origin of precision village, township, mountain-area, forest or county contributes a disk of R = min(radius_km, 40) + 15 km (`DETAIL.capKm`, `DETAIL.padKm`).
- **Cells.** The footprints of terrarium z10 tiles that meet a disk: axis-aligned rects in the shared Mercator, neighbours sharing their edge to the 0.01 unit. Each is contoured from z11 tiles, fetching only the z11 tiles that meet a disk; the rest of a cell's grid is a hole (outside every disk, so under a zero mask), blurred around (normalized convolution) and filled from the nearest data so contours run on instead of closing along it.
- **Seamless.** One interval in every cell (50 m, index every 250 m), one blur (σ 2.75 px) on a grid with a 48 px margin, simplification by a fixed threshold (mapshaper weighted Visvalingam, `interval=2` grid px, not a percentage), speckle judged on whole rings before clipping, paths clipped to the cell rect + 1.2 km. The runtime clips each cell to its exact rect, so no clip edge is drawn and the lines meet across the seam.
- **Files.** `public/maps/detail/cells/{z}-{x}-{y}.json` (bands, contour label anchors, reference context, as the patches had); the manifest's `detail.cells` lists each cell's `id`, `region`, `rect` and `bytes`, so the runtime picks the cells in view without fetching any. A cell over 25 KB gz (`DETAIL.splitAboveKb`) is replaced by its four z11 quarters (the steepest ground: 50 m over 3 km of relief).
- **Per-origin index.** The manifest's `details` keep what the panel, peek and hero need before any terrain arrives: `point`, `sideKm` (v2's patch square, the camera framing), `unitsPerKm`, `radius`, `precision`, `confidence`, `elevation_m`, `elevations` (the bands of the cells the square meets: the session's line is the nearest) and `region`. The per-origin patch files are gone.
- **Organic masks.** Per connected region of cells (8-neighbour: the Xishuangbanna cluster, Lincang–Pu'er, Anxi, Wuyishan, Huangshan, Taiwan, Kansai, …; each named after its widest disk) a coverage field: per disk a Gaussian (σ = 0.6 R′, R′ = R − 1 km) lowered to reach zero at R′, summed metaball-style, then smoothstep(0.04, 0.5): opaque to ≈ 0.58 R′, gone by ≈ 0.96 R′, no creases, no corners. Rasterized at ~1 km/px into an 8-bit grayscale PNG (`public/maps/detail/masks/{region}.png`), registered by a rect in shared units. The yunnan, six-mountains and japan frames get the same kind of mask from their members (disks shrunk to stay inside the frame; `public/maps/frames/masks/`); locator and china-east cover their boxes.
- **Runtime.** A region draws its cells into an offscreen layer, each clipped to its rect, then the mask with `destination-in` (drawImage, smoothing on), then that over the coarser layers. The sampled coverage test reads the mask's gray (bilinear) to know where a layer is opaque.

**3. Reference layers, all Natural Earth 10 m (public domain).** Lines and labels are clipped per frame and patch.

| Layer | Source | Treatment |
|---|---|---|
| Land vs sea | `ne_10m_land` | land fill a hair lighter than the sea ground |
| National borders | `ne_10m_admin_0_boundary_lines_land` | solid cream hairline at about 30% |
| Province lines | `ne_10m_admin_1_states_provinces_lines` | dashed at about 15%, CN/TW/JP |
| Coast | `ne_10m_coastline` | |
| Rivers and lakes | NE layers | with their names |

Plan §4.1 said "no national borders". **Superseded**: borders are needed to read the map. Use Natural Earth's default lines and don't draw disputed-area lines.

**4. Labels (`public/maps/labels.json`, one file).**

- Each entry: `{kind, name, name_zh, x, y, rank, angle?}`.
- `kind` is one of: country, province, city, town, river, lake, sea, origin.
- Sources:
  - countries: admin-0 label points
  - provinces: admin-1 label points
  - cities: `ne_10m_populated_places` by scalerank
  - seas: `ne_10m_geography_marine_polys` label points
  - rivers: name anchors along the line with angle
  - tea towns: a curated `content/geo/places.json` (Jinghong 景洪, Menghai 勐海, Mengla 勐腊, Pu'er 普洱, Lincang 临沧, Lancang 澜沧, Jinggu 景谷, Zhenyuan 镇沅, Yiwu town 易武镇, Xiangming 象明, Menghun 勐混, Kunming 昆明, …)
- Index contours get elevation labels (`1500`) at a few anchors per band, at fine zoom only.
- Runtime places labels in screen space with priority by rank and greedy collision, and recomputes on camera change (throttled).
- Type: Fira Code, letterspaced caps for countries and seas, hanzi from the subset font. The font budget is raised for the extra glyphs.

**5. Map furniture, computed at runtime.**

- A graticule with degree ticks labeled at the viewport edges (1° or 0.5° by zoom).
- A scale bar that updates with zoom.
- A cursor lat/lon readout.
- A locator minimap in the corner of compact maps, showing the current view as a rectangle; click it to jump.
- When zoomed out, contours dim and borders and labels strengthen. When zoomed in, the reverse.

**6. One interactive component: `TerrainMap`.** It generalizes the `/origins` camera and FrameLayers.

- **Used by:**
  - the session Properties inset
  - origin peeks (stay non-interactive, as a preview)
  - origin and entity heroes
  - `/origins` (OriginsMap keeps its rings, hulls, storage and supply layers as overlays)
- **Gestures:**
  - Drag pans, with a fling.
  - ⌘/Ctrl+wheel and trackpad pinch zoom around the cursor.
  - On embedded maps, plain wheel scrolls the page and shows a transient hint, "⌘ + scroll to zoom". `/origins` keeps its current behavior.
  - Double-click zooms in; shift+double-click zooms out.
  - Touch: two-finger pan and pinch; one finger scrolls the page with a hint.
  - Keyboard when focused: arrows pan, +/− zoom, 0 resets.
- **Controls:** + / − / reset to origin / expand.
- **Zoom range:** about a 3 km view out to the East Asia locator.
- **Expand:** opens a full-viewport overlay of the same view (shared-element morph from the panel; Esc closes and returns the view to the panel).
- **Reduced motion:** no fling and no flights.
- **Initial framing** matches v1 (the origin box), so the panel looks the same until you touch it.

**7. Budgets.**

- Labels JSON ≤ 40 KB gz.
- Land, borders and rivers fold into the frame JSONs.
- Detail patches keep the ≤ 20 KB gz inset budget. (v3: detail cells ≤ 25 KB gz each.)
- If panning a frame plus patches in SVG drops below about 50 fps on a laptop, move terrain strokes to `<canvas>` (`Path2D` from the same `d` strings). Labels and marks stay DOM/SVG.

**8. Contour thinning (owner request 2026-10-19).** "The topo lines are a bit too intense to be able to read the map. I like the detail but maybe cull in-between lines when heavily bunched?" On the Nannuo panel (a ~10 km scale bar) the steep slopes were a solid wall of 50 m lines, and the garden range lit in the liquor made it brighter still.

- **Ranks, per sheet** (its interval I, index interval X). Index contours (elev % X = 0) never thin. Rank 1: multiples of 2I; its lattice is the multiples of 2I and of X. Rank 2: the rest; its lattice is every contour. A line's gap is the elevation step to the nearer neighbour in its own lattice, so a rank-1 line never thins before a rank-2 line on the same slope.
- **Pipeline** (`scripts/geo/lib/thin.mjs`, from `renderTerrain`). For every spline segment of every intermediate ring, the slope |∇h| of the blurred DEM the contours were traced from, sampled where the segment's curve passes; the spacing to the lattice is gap ÷ |∇h| in shared units, and the stretch may show while the camera shows ≤ spacing ÷ 3 (`MIN_PX`) units per CSS px. That limit is smoothed along the ring (±3 segments, in log2), rounded to a whole log2 tier, runs shorter than 4 segments are folded into a neighbour, and rings under 12 segments take one tier. Tiers run from the sheet's coarsest zoom (`THIN`: a sheet is drawn at most at 1.45 × its size on a 200 px map) down six octaves; a stretch that shows at the coarsest is written as never thinning.
- **Data contract.** Bands gain an optional `thin` string (intermediates only, absent when nothing of the band ever thins): per ring of `d`, in order, joined by ",", runs of `<tier letter><segment count>` (the last run's count left out; "" = never thins; letter `a` + k = 2^(k − 8) units/px). No coordinates are repeated: the runtime cuts the rings it already parses. `*` + one letter gives every ring of the band that tier: the last resort of a z11 cell still over 25 KB (`THIN.maxCoarse`; before it, longer runs and wider smoothing, each step doubling the shortest run). `SCRIPT_VERSION` 3.1.0; `geo:test`'s fixture cell carries the tiers.
- **Runtime** (`contourThin.ts`). Each segment gets τ, its tier, ramped over two segments either side of a change (weights 1 2 2 2 1), and is stroked at alpha clamp(τ − log2(upp) + ½): fully there below half its limit, gone above twice it. So a stretch fades out along the line over a few px (no blunt cut ends) and fades in and out over an octave of zoom. On the canvas each band's spatial cell keeps one Path2D of the rings that never thin plus one per τ, built once when the cell is parsed; a render only picks the alpha of each. Fills still come from the whole band outlines, so Tanaka works as before: a stretch that isn't stroked is simply covered by the band above. The SVG draw-on copy (`Contours.tsx`, the focus cells) thins the same way at the camera's zoom (in eighths of an octave, while it shows), as a few paths per band of one alpha each.
- **Lit lines.** The session's own line (`keep` on its highlight style) is never thinned, on any sheet. The garden range keeps its liquor but thins with its bands.
- **Tone.** Intermediates sit back and the index contours carry the structure: hairlines 0.1 → 0.075 (index 0.22 → 0.24); Tanaka intermediates dark 0.6 → 0.5, light 0.15 → 0.11, line 0.1 → 0.075 (index line 0.26 → 0.28). `TONE` in `terrainCanvas.ts`, shared by the SVG copy. Labels keep their ground halo; over the thinned slopes they read clear.
- **Cost.** 68 KB gz of codes over all cells (~2% of the cells; ≤ 0.6 KB on the steepest) and 2 KB in the frames. Two z10 cells went over 25 KB and split (293 → 295 cells); one z11 cell at Alishan uses the band-wide fallback. Worker time in the full-screen scenario +1.6% (parsing); frame times unchanged (§4.7 status).

**Status (2026-10-19).** Both halves are built: the pipeline (`SCRIPT_VERSION` 3.0.0 since the v3 detail cells; 3.1.0 with contour thinning) and the runtime (`TerrainMap` and its parts in `src/lib/components/map/`). Divergences are in §7.

- [x] 1. `SHARED_PROJECTION` is `mercator` (rotate −102°, center 25°N, scale 30000). Every shared frame is north-up.
- [x] 1. `src/lib/components/map/projection.ts`: `createMercator(params)` → `forward`, `invert`, `unitsPerKm(lat)`, `kmToUnits`, `unitsToKm`, `unitsPerKmAtY`. `maps-manifest.json` `projection.controlPoints` holds `[lon, lat, x, y]` from d3. `geo:test` transpiles the TS in memory and checks it against d3 at 750 grid points (≤ 0.01 unit) and at the control points.
- [x] 2. Detail patches at `public/maps/detail/{slug}.json` (37), in shared units at 0.01. `public/maps/inset/` is gone, and the manifest lists `details` (with each patch's `viewBox` and `point`, so the runtime can find the patches in view without fetching). **Superseded by v3 (2b):** 293 cells (79 at z10, 214 z11 quarters of the 60 split ones) in 14 regions; largest 24.9 KB gz, median 12.0 KB, 3.6 MB gz and 10.0 MB on disk in all; 17 masks, 40 KB. The z11 data took 254 more terrarium tiles (15.7 MB, `.cache` only). `geo:test` covers coverage → cells → regions → mask (pixels round-tripped through pngjs; a mask PNG is rewritten only when its pixels change, since zlib output differs between builds) and one fixture cell with a tile left out of its grid.
- [x] 2b. Runtime: `TerrainLayers.tsx` stacks the frames (by interval) and then the detail regions; a region loads only the cells in view (`eager`: the rendered area) that the sampled coverage test says are seen, with an unloaded mask counted opaque so nothing beneath loads before it says so. A session page fetches its own cells and its region's mask (the Bulang panel: 6 cells, 69 KB gz, against v2's one 11 KB patch). The focus "patch" is now the cells the camera opens on (`focusCells`), drawn on in SVG through the region's mask; the session's line is lit on every layer within a radial reach of the origin (full to 0.6 of the framing square, gone by 1.0), so it never ends at a cell edge.
- [x] 2. Runtime (`TerrainLayers.tsx`, `terrainCanvas.ts`): frames and patches are one LOD stack, ordered by what they resolve (contour interval, then tile zoom, then size), the map's own origin on top. A patch loads the first time it would be seen; a session page fetches only its own patch until the reader reaches for the map. Each layer has its own sea, land and feathered edge (an SVG mask on the focus patch; on the canvas, the same horizontal × vertical ramp as two `destination-in` passes). A sampled coverage test skips whatever finer layers hide.
- [x] 3. `context` in every frame and patch: `land`, `coast`, `borders` (international boundaries only), `admin` (CN/TW/JP provinces), named `rivers` and `lakes`, all clipped. Land, coast and borders are simplified twice as hard as rivers.
- [x] 4. `public/maps/labels.json`: countries, provinces, cities, towns, origins, seas, lakes and river anchors (several per river, nested by tier), with `rank` = the lowest zoom tier. The tiers are in `params.mjs` `LABEL_TIERS` and copied into the file and the manifest. Curated places are in `content/geo/places.json`.
- [x] 4. `contourLabels` (`{elev, x, y, angle}`) on index contours in every frame and patch.
- [x] 4. The hanzi subset covers every `name_zh` in labels and contexts.
- [x] 4. Runtime label placement (`MapLabels.tsx`): screen-space HTML riding the camera's `--k/--ox/--oy`, re-placed a few times a second while moving and once at rest. Priority is rank, then kind, then what was already showing (no flicker); greedy collision against placed labels, the map's chrome, its degree ticks and its marks (rings, and on `/origins` the ring labels). Countries and seas in spaced capitals with hanzi beneath, provinces in small spaced capitals, a dot and a name for settlements, water italic in a cooler ink, rivers turned along their course. Elevations on index contours below 0.16 units/px.
- [x] 5. Furniture (`MapFurniture.tsx`): graticule at a zoom-fitted step (10° → 3′) with degrees along the top and left edges, a scale bar re-measured each frame at the view's latitude, the cursor's coordinate (the origin's own at rest), and the East Asia locator with the view as a box or reticle (click to go). Zoom emphasis: zoomed out, a veil of land lets contours recede while borders, coast, rivers and labels strengthen.
- [x] 6. `TerrainMap.tsx` + `camera.ts` + `gestures.ts`: drag with fling; ⌘/Ctrl + wheel and pinch (incl. Safari gesture events) zoom at the cursor; on embedded maps a plain wheel scrolls the page with a "⌘ + scroll to zoom" / "Ctrl + scroll to zoom" hint; double-click in, shift + double-click out; touch: two fingers pan and pinch, one finger scrolls with a hint; keys when focused: arrows, + / −, 0; controls + / − / back to the origin / expand; about a 3 km view to the locator, the view kept over the data; reduced motion: no fling, no flights. Expand opens the same view full screen: the overlay starts exactly over the panel, its clip grows to the viewport while the camera centers; Esc hands the view back and shrinks onto the panel.
- [x] 6. Wired in: the Properties inset (`OriginMap` variant panel: same framing as v1, contours draw on, the session's elevation line in its liquor with its tag, rings, blend hulls, a flight between origins in Yunnan; its chrome waits for hover, focus or touch), the origin hero (`/origins/[slug]/`, Tanaka), the peek (a preview: no gestures, labels and borders), and `/origins` (`OriginsMap` on `TerrainMap`: rings, hulls, storage and supply layers, the ridge hero, its keys and `?at=` kept). `InsetMap.tsx` and `FrameLayers.tsx` are gone.
- [x] 7. Performance, measured with a scripted rAF counter while panning a 1440×900 full-screen map with synthetic trackpad wheel events (headless Chrome, GPU raster, ~105 fps ceiling): SVG redrawn per frame panned at 31 fps over six-mountains and 42 fps over the detail patches, so terrain moved to `<canvas>` (§7). Now: 82–94 fps average, median frame 9.5 ms, p95 ~10 ms over six-mountains, patches, the region and a long straight pan; continuous ⌘-wheel zoom 82 fps. The remaining cost is one 100–160 ms frame when a fast pan runs past the rendered margin. **Superseded 2026-10-19 (owner: "a stable 120 fps or higher"; §7 "Terrain drawn in workers")**: frame cost measured with an in-page driver (one input event per animation frame, uncapped rAF, a 1 px composited tick so idle frames aren't held to 60 Hz) on a 1440×900 page at 2× in a production build, median of 3 runs: the full-screen map (expand, trackpad pan, ⌘-zoom across the LODs, drag and fling over cell and mask edges, close, twice) p95 7.3 → 5.8 ms, worst frame 1.55 s → 15–18 ms, frames over 16.7 ms 68 → 0–1; scrolling `/origins/xishuangbanna/` p95 151 → 2.2 ms, worst 684 → 13 ms, frames over 16.7 ms 68 → 0. Crisp again ~0.3–0.37 s after a gesture ends.
- [x] 8. Contour thinning (§4.7.8): `thin` on every intermediate band of every frame and cell, `thin.mjs` / `contourThin.ts`, applied on the canvas (worker and page) and the SVG draw-on copy; the session's line kept whole. Perf, production build, 1440×900 at 2×, median of 3 runs (two sets each): full-screen map p50 2.1 → 2.1 ms, p95 5.8 / 6.0 → 6.2 / 5.8 ms, max 21.7 / 21.7 → 22.5 / 22.2 ms, frames over 8.3 ms 102 / 128 → 121 / 117, over 16.7 ms 4 / 3 → 3 / 3; scrolling `/origins/xishuangbanna/` p50 1.7 → 1.7, p95 2.2 → 2.2, max 11.9 → 10.2 ms, over 8.3 ms 3 → 4, over 16.7 ms 0 → 0. Within noise.

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

## 7. Implementation notes (divergences from the plan)

Recorded 2026-10-19 while closing the completeness review. Each one is deliberate, and none changes a decision in §6.

| Plan | Built | Why |
|---|---|---|
| §3.2: route morphs with React 19 `<ViewTransition>` and `experimental.viewTransition` | `useMorphClick` drives `document.startViewTransition` by hand (`entity/page/viewTransition.ts`). The experimental flag is off. | Under the Next 16 App Router, a `<Link>` navigation commits outside any transition React considers, so `<ViewTransition>` never fired on the static export. A Suspense reveal on first load did start one, which meant a whole-page cross-fade on every hard load. Nothing uses React's component, so the flag is dropped. |
| §4.5 step 5: zooming to a cluster shallow-routes to `/origins/yiwu/` | `replaceState` to `/origins/?at=yiwu` | Under static export, `/origins/yiwu/` is a separate prerendered page (the origin's entity page), so a reload would land on a different page. The map reads `?at=` on load to restore the focus, and the query keeps filter params intact. |
| §4.4: CJK subset font ≤ 15 KB | 15.5 KB, with the budget raised to 16 KB (`scripts/geo/params.mjs`) | Taiwanese and Japanese origins keep their native forms (台灣 嘉義 朝宮 滋賀 静岡). These are five glyphs the simplified set doesn't share, about 1 KB together. Simplifying them would misname the places. |
| §4.3.1: `geo:check` in `build.yml` | As planned: a step in `build.yml`'s app-build job. The cross-OS `geo-test` matrix has its own `geo.yml` workflow. | The matrix runs on three OSes; the build job runs only on Ubuntu. |
| §4.6: `geo.elevation_m` is optional | Filled in for 32 tea origins (the puer mountains and villages, plus the oolong, green and white tea places) | Peeks, heroes and insets showed "unrecorded" for nearly every origin. The ranges are typical garden elevations, consistent with the sessions' recorded elevations where those are plausible. Counties, provinces and low-confidence placeholders (Weidong) stay unrecorded. |
| §4.7.4: countries from admin-0 label points, provinces from admin-1 label points | Curated in `content/geo/places.json`, with hanzi: 10 countries (several have a second anchor at province zoom near Xishuangbanna, e.g. LAOS south of Mengla), 18 Chinese provinces, 11 Kansai–Shizuoka prefectures, and 6 neighbouring provinces/states (Shan, Kachin, Phongsaly, Luang Namtha, Lai Châu, Lào Cai) | Natural Earth's label-point layers have no hanzi, and they hold one point per island (dozens for Zhejiang or Guangdong, with no way to pick the mainland one). |
| §4.7.4: `name_zh` from Natural Earth | Cities use the local form: `NAME_ZH` in mainland China, `NAME_ZHT` in Taiwan (臺 → 台, as the origins write it), kanji `NAME_JA` in Japan. Cities in other countries, and cities outside the tea areas that rank below the province tier and lie > 80 km from any origin, are labelled in Latin only. `places.json` overrides two river hanzi: Natural Earth gives the Lancang reach 湄公河 (now 澜沧江) and the Mae Klong 湄公河 (now none) | Each extra hanzi costs ~145 B of font. Hanzi for every Natural Earth city in the area would have cost ~90 more glyphs. |
| §4.4: CJK subset font ≤ 16 KB | 48.1 KB (331 glyphs), budget 50 KB | Map v2 labels: countries, provinces, seas, lakes, rivers, tea towns and cities. If the panel's first paint should stay light, a follow-up can split the subset into the origins font plus a second `@font-face` for the label-only glyphs with `unicode-range`, so the browser fetches it only when a label needs it. |
| §4.3 step 6: contour bands as quadratic B-splines written `q c m` per vertex | The same curve written `M m₀ q c₀ m₁ t m₂ m₃ … z`: SVG's smooth quadratic `t` reflects the previous control point through the shared midpoint, which is exactly the B-spline's next vertex. Spline vertices are snapped to even steps (0.2 unit in frames, 0.02 in patches), so every midpoint, and so every reflection, is exact and nothing drifts. | Half the numbers per vertex. Frames shrank 28–42% (gzip) even after gaining the land and border layers, and the largest patch is 14.4 KB at 0.01-unit precision (the largest v1 inset was 19.5 KB at 0.1 local units). The curves are the same. |
| §4.7.2: insets stay as `public/maps/inset/*` until the runtime switches | Removed. `public/maps/detail/*` replaces them; manifest `insets` → `details`; `origins.geo.json` `properties.inset` → `properties.detail`. `TerrainMap` (via `OriginMap`) draws the patches straight in shared units; `InsetMap.tsx` is gone. The client `MapPoint.inset` flag is `detail`. | Nothing else read the insets. |
| §4.7.4: tea towns include Yiwu town and Menghai | Kept in `places.json`, but a town or city within 8 km of an origin label of the same name (or hanzi prefix) is dropped in favour of the origin (Yiwu, Menghai, Jinghong) | Two labels of the same name on one spot would fight in collision. |
| §4.4, §4.7.7: SVG paths, canvas only if a frame passes ~5k paths | Terrain (every sheet and patch) is drawn on a `<canvas>` from `Path2D` of the same `d` strings, with the same Tanaka strokes, veil, reference lines and feathered edges (`terrainCanvas.ts`). Only the map's own origin patch stays SVG while it draws on (and as hidden geometry for the elevation tag); marks, labels and furniture are SVG/HTML. The camera renders the pane over the view plus a margin and pans it by compositor transform, re-rendering ("rebase") only past the margin, after a 25% zoom drift, or at rest; mid-zoom rebases are hairline drafts. A pan rebase moves the old bitmap and draws only the exposed strips; band rings are bucketed into spatial cells so only rings near the drawn region are stroked | Measured (§4.7 status): the SVG redrawn per frame panned at 31–42 fps. Moving the rendered SVG instead stalled 60–200 ms whenever a pan exposed new tiles: Chrome rasterizes SVG in 256 px tiles and every tile tessellates every contour band again. Two more findings: per-frame custom properties on an ancestor of the terrain restyle and repaint all of it (they now sit on the HTML overlays only), and a canvas tessellates a whole path whatever the clip (hence the cells). |
| §4.5: the inset's index contours lean ±2 px against the pointer (parallax) | Dropped | The inset is draggable now; contours sliding under the pointer while it drags read as lag. |
| §4.5: a click on the inset opens the origin page | The caption (`// 易武 Yiwu ↗`) opens it, with the same morph into the hero; the peek, which has no gestures, still opens from anywhere | A click on a pannable map is the start of a drag. |
| §4.7.4: tiers by `maxUnitsPerPx` | The runtime lets each tier in 1.6× sooner, and a small map also by `viewKm` (a 240 px panel shows little ground at any scale); a country, sea or province shows once per view whatever its anchors | Collision and a per-area cap already keep a crowded view legible; without the lead the Properties panel showed no towns until the view was a few km across, and zoomed out it named no country. |
| §4.7.2: frames, then detail patches above them | One stack ordered by contour interval, then tile zoom, then size | County patches (Mengla, Menghai, Jinghong: 200 m interval, zoom 8–9) sat over the finer six-mountains sheet (100 m, zoom 11) and hid its detail. |
| §4.7.2 v3: detail cells are z10 tile footprints (≈ 146) | 139 z10 cells survive the masks (6 are never reached by one); 60 of them, over 25 KB gz at 50 m (19 in the Xishuangbanna cluster, 18 around Lincang–Pu'er, 6 at Anxi, 5 at Alishan, …), are split into their z11 quarters: 293 files | The 25 KB budget and a uniform 50 m interval can't both hold on a 36 km cell with 3 km of relief; a coarser simplification only got the worst to 46 KB. Quarters keep the same parameters, so they join their neighbours as seamlessly as whole cells. |
| §4.7.2 v3: z11 data for every cell (≈ 243 tiles) | Only the z11 tiles that meet a coverage disk are fetched (254 tiles, 15.7 MB, the extra ones for the six-mountains frame's wider pad); the rest of each grid is a hole, filled from the nearest data after a normalized blur | Fetching every cell's full grid and margin would have been ~850 tiles. The holes lie outside every disk, so under a zero mask. |
| §4.7.2 v3: organic masks for six-mountains and yunnan | Also for japan (from its members). Six-mountains' pad grew 0.04° → 0.15° so its edge has room (frame 86.8 → 123.7 KB gz); its ridgelines keep v2's box (`RIDGES.pad`), byte for byte. Yunnan keeps its 0.35° pad: a wider frame needed ~60 more tiles, past the approved download, so its disks are shrunk to the frame where they meet it | A masked frame shows only around its members: zoomed out over Myanmar south-west of Bulang, the detail now gives way to china-east (500 m) where v2's yunnan rectangle showed 200 m. |
| §4.7.2 v3: the panel shows detail as v2 did | Detail fades in as the view's shorter side drops from 1.45 to 1.05 cells (≈ 52 → 38 km), as frames do against their size. A village's panel opens inside its detail (the rim of an isolated village, Junshan or Liubao, softens its corners); a county framed wider (Mengla, Menghai, Jinghong, mostly Suanzaoshu) opens on the six-mountains or yunnan sheet, without draw-on, its session line lit on that sheet's nearest contour | 50 m contours across a 150 km panel are a texture, and would mean fetching 20+ cells for a 240 px map. |
| §4.7.3: land a hair lighter than the sea ground | Land is the ground (`#121012`), the sea a shade deeper and cooler (`#0b0b0e`) | Same relation; the inset and hero, all land, keep the v1 ground. |
| §4.7.5: graticule at 1° or 0.5° | Step fitted to the zoom, from 10° down to 3′, labelled in degrees and minutes | At a 3 km view a 0.5° line is off screen. |
| §4.7.6: expand shows the same view | The full-screen view draws the Tanaka relief even when it opens from the hairline panel | Full screen has the room for relief; the hairlines read flat at that size. |
| §4.7.6: `/origins` keeps its gestures | On touch screens one finger scrolls the page past `/origins` (with the two-finger hint) instead of panning it | On a phone the map is most of the page; a one-finger pan trapped the scroll. |
| §4.7.6: Expand on every embedded map | Expand on maps of an origin with a detail patch (the inset and its hero); not on the hero of a county, province or country (`OriginsMap` in hero mode), which still pans and zooms in place | Its overlays (rings, ring labels) are laid out from its own camera's settled view; the full-screen copy would need its own. |

| §4.7.7: terrain on a page `<canvas>` (the row above) | **Terrain drawn in workers** (2026-10-19, owner: "a stable 120 fps or higher" on the full-screen map and scrolling an origin page). `terrain.worker.ts` + `terrainWorker.ts`: a pool of up to 4 workers (half the cores) fetches, parses and Path2D-izes the sheets and cells and draws them with the same `terrainCanvas.ts` onto *software* OffscreenCanvases, each worker a horizontal band of every render; the page shows the last finished render, placed by the area it was drawn for, so a rebase, a zoom coming to rest or new cells arriving never holds a frame. One render in flight per map, the newest waiting (older ones dropped). A render is copied into a hidden front/back page canvas a band per frame and then swapped in, so the picture changes in one frame. The highlight function becomes a table (interval → elevation → style); masks are handed over as ImageBitmaps; the hero's minor-contour fade is drawn at both ends (full, faded) and crossfaded by opacity. The page falls back to drawing itself without Worker/OffscreenCanvas or if the worker script fails to load. (The static build also copies the worker's `.ts` source into `out/_next/static/media`, so `tsconfig.json` excludes `out`.) | A page canvas records on the main thread but rasterizes in the GPU process, on the thread that also composites every frame: a Tanaka sheet with its masked regions took 100–800 ms there (5–9 s of GPU-main time a minute of gestures), and every frame waited, scrolling included. Software raster in a worker costs about the same wall time (one worker: ~500 ms full, 80–150 ms strips) on a core of its own; four bands bring the settle back to ~0.3 s |
| §4.7.7: every contour drawn at its alpha | **Contour thinning** (§4.7.8, 2026-10-19): an intermediate stretch whose spacing to its lattice falls under ~3 CSS px isn't stroked, rank 2 before rank 1, as the slope steepens or the view widens; the tiers come from the DEM slope in the pipeline (`thin` per band: run-length tiers per ring over its spline segments, no repeated coordinates); the runtime ramps them along the line and by zoom. Fills untouched, so Tanaka still occludes; the session's line never thins. Intermediates a little fainter (`TONE`) | On steep ground at panel zoom the 50 m lines were a solid wall, the liquor-lit garden range brighter still, and town labels drowned in it. Estimating spacing from the DEM costs nothing at runtime and ~2% of the cells' bytes; doing it geometrically in the worker would have cost a nearest-line search per cell. A z11 cell can't split again, so at the 25 KB edge it thins in longer runs, then band-wide (one at Alishan) |
| §4.7.7: the graticule in the map's SVG | On the terrain canvas (`graticule` in `terrainCanvas.ts`, the step from `MapFurniture`'s `graticuleFor`), dashes on a fixed device-px phase so pan strips line up | A dotted SVG path the size of the pane was ~40% of all GPU raster time: every rebase re-rasterized it (3.5 s of a minute's gestures) |
| §3.2: the hero fades its plain contours through `--minor-contours` on the relief | A React context (`map/contourFade.ts`) carries the motion value: the canvas crossfades by opacity, the drawn-on SVG copy sets the variable on its own group only while it shows | The variable, written on the hero every scroll frame, restyled every element of the map beneath it (10–15 ms frames); before the workers, it also redrew the whole canvas on every scroll frame (150–300 ms) |
| (runtime) layout reads per gesture event | The camera keeps the root's rect (re-measured on scroll, resize, pointer re-entry); the chrome rects the labels and ticks avoid are measured in a ResizeObserver; tick rects are computed from the camera; the graticule's state lives in `GraticuleTicks`; label placement and the full-screen mount are transitions; the settled draw-on SVG leaves the layout (`display: none`); the panel's SVG sits out while the full-screen view covers it; the view is handed back a frame after the close starts; the document's overflow is locked only when the document scrolls | Each `getBoundingClientRect` in a wheel or pointer handler forced a style and layout pass mid-frame (2.8 s of a minute's gestures); the others were single 10–25 ms frames on expand and close |
| (page) session cards on an origin page | `SessionsList` puts each card on its own layer (`will-change: transform`) | The first scroll past the sessions rasterized their tape textures (SVG turbulence, blur and drop-shadow filters in `TornTape`) in one 100–340 ms GPU task; on layers they rasterize ahead in small pieces. The filters themselves are the cost (removing them removes it) and belong to `TornTape` |
| §4.7.6 / §4.7.4: zoom moves through the LODs; labels re-placed a few times a second | **Smooth zoom transitions** (2026-10-19, owner: "the map labels and topology can flicker when moving through zoom levels"). *Terrain* (`TerrainLayers.tsx`, `camera.ts`): every new picture fades in over the one before instead of replacing it (a ring of four slots, each a picture placed by its own area, so outgoing and incoming register; a compositor opacity animation, 120 ms mid-gesture, 240 ms at rest, 280 ms when new cells or masks arrive; when it is opaque the slots beneath are freed, and a render that finds none free waits for one). A pan's strip render (the last picture moved) still lands at once, but only onto the picture it extends; otherwise it fades too. Drafts mid-zoom keep the map's ink (Tanaka stays Tanaka) at fewer device px (≤ 3 M) instead of switching to hairlines; the pan margin (`cheap`) keeps the ink too, without elevations, and elevations draw in drafts. The camera renders every 0.15 of ln zoom (was 0.25), so the LOD mix, thinning and zoom emphasis each render bakes in move in small steps, each crossfaded. A draft zooming out covers more than the view: as far as the zoom will have gone by the time it shows (rate × the measured reveal latency, 1.6–4 views across). Under everything a backdrop, four views across at ~2 M px, drawn as the map looks at twice the view's width, once the camera rests and again whenever a zoom out outruns it. Slot canvases only grow (drawn into their top-left, shown through a clipping box). `zoomAt` held at a limit leaves the camera alone, so it rests and sharpens. *Labels* (`MapLabels.tsx`, `map.css`): each fades in and out (an opacity transition, 200 / 220 ms; a leaving label stays in the DOM until faded, one changing side crossfades); a label showing stays until its tier's threshold × 1.3 (hysteresis), outranks newcomers by 1.5 ranks in collisions, keeps its side of the dot, may run 24 px past the edge, and a second anchor of a river must be 220 px away to come in but stays down to 170 px; while moving, a newcomer shows only once two passes running have placed it (at rest, at once). Positions still ride the camera's variables (rigid, no per-frame layout). | Measured with a flicker harness (in-page ⌘-zoom per frame, slow 0.9 ln/s, fast 3.5 ln/s and a back-and-forth pinch, village detail ↔ locator, on the expanded map and the Properties panel over Xishuangbanna; a lossless CDP screencast at ~95 fps, each shot compared with the last warped by the recorded camera, plus per-frame label opacity and position): full screen, frame-to-frame pops 49 → 19, 99th percentile of changed pixels 3.5% → 0.26%, worst 12% → 4.7%, luminance steps over 1 gray level 36 → 0, area left bare zooming out (worst) 73% → 12% (share of frames 13% → 0); panel, pops 43 → 24, luminance steps 37 → 1, worst changed pixels 99% (a blank frame) → 13%. Labels on → off → on within 300 ms 719 → 48 (full screen) and 85 → 24 (panel); hard pops (a jump in opacity over 0.35 in a frame) 721 → 13 and 113 → 2; position jitter 0.01 px before and after. Frame cost (production build, 1440×900 at 2×, in-page driver): full-screen scenario p95 5.1 → 4.7–5.5 ms (same-session interleaved: 5.8 → 5.4), frames over 8.3 ms 61 → 52–67 (116 → 75 interleaved), max ~22 ms unchanged; `/origins/xishuangbanna/` scrolling p95 2.3 → 2.2–2.3, max 11.8 → 10–11.7. Settled pictures are pixel-identical (only the animated rings and hatches differ). Drafts are softer (up to ~4× upscaled at the worst moment of a fast zoom, vs ~2.5×), the price of keeping the ink and covering the edges; frames over 16.7 ms: 2 in every baseline run, 2–4 after (median 2–3; each extra one is a V8 major GC, as many as before, landing on a zoom frame) |
| (runtime) restyles and GC on the full-screen map (goal: 0 frames over 16.7 ms, p95 ≤ 8.3 ms, no GC on long frames) | **Restyle and GC work** (2026-10-20). *Overlay pins* (`camera.ts`, `MapLabels.tsx`, `MapFurniture.tsx`, `OriginsMap.tsx`, `StorageLayer.tsx`, `OriginMap.tsx`): `camera.pin` writes plain-px transforms on each label, degree tick and ring. It writes them on a zoom and once 150 ms after a pan stops. During a pan or fling only one `will-change: transform` mover box per overlay group moves. The camera no longer writes `--k/--ox/--oy`. *SVG scale*: `camera.setSvgView` writes `scale()`/`translate()` directly onto the ~620 elements that use them; before, every element inherited `--upp/--tanaka` from the svg root. The Tanaka strokes are grouped per band and side (418 groups for 846 paths). *Close* (`TerrainMap.tsx`, `map.css`): the covered hero svg is hidden with `content-visibility: hidden`, not `display: none`. The reveal classes are a `.map-reveal` rule with plain descendant selectors, not Tailwind `group-*/map:`. The page under the open overlay is hidden the same way and keeps its measured `contain-intrinsic-size`. On close it comes back one quarter-viewport slice per frame, before the shrink starts. *Hero*: the drawn-on SVG copy unmounts once it settles (3,745 → 18 svg elements on `/origins/yiwu/`). *Expand* (`TerrainLayers.tsx`, `Marks.tsx`): a `createImageBitmap` seed is shown in a bitmaprenderer canvas. The mount takes two commits, the terrain first and then the chrome in a transition. The duplicate mount render is gone. The overlay's rings stay drawn instead of drawing on again. This replaces two notes above: "positions ride the camera's variables" and "the settled draw-on SVG leaves the layout". | Chrome invalidation tracking found the costs. Tailwind's `group-data-[…]/map:` compiles to `:is(.group\/map[…] *)`, and Chrome restyles the whole map subtree for that selector (4,415 elements, 17–28 ms) on every handBack, hover or focus. The inherited variables on the svg root restyled ~3,000 elements on every rescale (15–20 ms). The per-frame `var()` transforms restyled every label on every pan frame, and most of the embedder (Oilpan) garbage came from them. *Verification*: production build, 1440×900 at 2×, in-page driver, GC traced, 5 runs per row against the build from before this work (`gc/out-baseline`). Figures are medians; brackets give the worst run. Full-screen map, uncapped, opacity / transform tick: p95 3.1 / 3.8 → 1.1 / 1.2 ms; max 21.4 / 21.8 → 10.5 / 9.4 ms [11.7 / 14.2]; frames over 8.3 ms 30 / 37 → 2 / 2; over 16.7 ms 3 / 3 → 0 / 0. GC on frames over 8.3 ms 10 / 12 → 0 / 1 [1 / 2]; GC on frames over 16.7 ms 1 → 0; GC pause union 104 / 107 → 69 / 77 ms; embedder allocation 135 / 150 → 75 / 103 MB/s. Paced at ~118 Hz: p95 5.6 → 3.3 ms, max 23.2 → 11.8 ms, frames over 8.3 ms 21 → 6, over 16.7 ms 2 → 0, GC on frames over 8.3 ms 8 → 4. Scrolling `/origins/xishuangbanna/` is unchanged: p95 1.5–1.6 ms, max ~10 ms, no frame over 16.7 ms. Settled frames are pixel-identical: the full-screen views whole and the hero map cropped. The goal is not fully met. GC still lands on frames over 8.3 ms: 0–2 per uncapped run and 3–4 per paced run (5–11 ms "finalize incremental marking" majors in zoom-out, zoom-in-2 and expand), plus one per paced scroll run. The first scroll frame of the origin page takes 8.4–10.8 ms. |

One addition outside the plan: the static build shares one Flatbread client (`lib/flatbread.ts`). It memoizes queries per worker, caps the requests in flight and retries connection errors. Without it, the 21 prerender workers each asked for every collection on each of about 445 pages. That overwhelmed the single Flatbread server, which refused connections (ECONNREFUSED).

## Sources

- Terrain Tiles format, zoom levels and source datasets: [FME Terrain Tiles on AWS reader](https://docs.safe.com/fme/html/FME-Form-Documentation/FME-ReadersWriters/terraintilesaws/terraintilesaws.htm), [Metabunk custom terrain sources](https://www.metabunk.org/sitrec/docs/dev/CustomTerrainSources.html), official page [aws.amazon.com/public-datasets/terrain](https://aws.amazon.com/public-datasets/terrain/)
- Next 16 view transitions (experimental; `import { ViewTransition } from "react"`; fires on navigations, Suspense and transitions): [next.config viewTransition](https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition), [Next.js view transitions guide](https://nextjs.org/docs/app/guides/view-transitions)
- Tanaka illuminated contours: Kitirō Tanaka, "The Relief Contour Method of Representing Topography on Maps", *Geographical Review* 40(3), 1950
