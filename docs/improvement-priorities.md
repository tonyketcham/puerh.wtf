# Qualified improvement priorities

Reviewed the Claude chat **puerh.wtf improvement priorities** (2026-11-04), including its
correction that the first review used the old `feat/delight-mechanics` checkout. Implementation
is based on main `466e810b3c596674172daf61b66340dd8c16ba5c`, which includes metadata PR #658.

## Order of work

1. Reduce repeated entry: start another session from a tea, and capture optional steep notes
   beside the main writing area. Preserve local autosave and explicit review/push/publication.
2. Fix the demonstrated desktop reading problem and give each session a way onward.
3. Extend responsive images to the existing collection; add RSS beside upstream's metadata.
4. Validate the editor on a phone, the public pages in a static export, and the trusted CMS
   service separately. Measure the export before drawing conclusions from an older build.

## CMS findings

- **Logging effort — partly current.** Main already has a prose-first phone layout, persistent
  drafts, dictation, radar controls and local image preparation. The captured review did not
  establish that form friction caused the gap in published sessions. This change adds an
  optional compact steep log without requiring completion of brewing/flavor fields.
- **Netlify CMS — stale as the primary experience.** The in-app editor is already on main.
  `log/` remains a documented fallback pending live editorial acceptance. Removing it is
  separate from making the current editor easier to use; retain its operational gate.
- **Storage place — current.** The field now selects shared `STORAGE_PLACES` entries, with an
  explicit Other option for names with no known coordinates. Existing custom names survive.
- **Doubled vessel/storage fields — current presentation ambiguity.** Keep both representations
  for compatibility. Label the free-text fields as additional notes and explain that the
  relation/history holds the primary data. No old observations are discarded or reinterpreted.
- **Cultivar label — already corrected.** Main calls the collection and control Cultivars.
- **Tag color validation — current.** Client review and trusted service now require a valid
  three- or six-digit hex color when a value is present. Existing checked-in colors remain valid.
- **Preview — already implemented.** Main's Read view uses the journal and radar. Structured
  steep notes now use the same escaped rendering helper in the public page and preview.
- **Infusions — current.** Optional `infusions` frontmatter records an explicit number, measured
  seconds, a note and optional date/time. The build indexes these optional fields independently
  of Flatbread's inferred schema. The gutter respects explicit numbers, including skipped cups.
  Legacy Markdown stays intact and continues to supply its original steep markers.
- **Misleading defaults — already corrected.** Main's new drafts have no rating, temperature,
  leaf amount or flavor defaults. A new steep gets a sequence number, not an invented duration.
  This change also removes the preview's fabricated zero rating for an unscored draft and
  keeps a steep-only preview free of placeholder article text.
- **Revisits — current workflow gap.** “New session of this tea” carries provenance into a new
  stable record and records `previous_session`. Notes, measurements, ratings, images, storage
  observations and tasting date are not copied. Explicit revisit chains appear on public pages
  after publication. A separate Tea collection and historical cake-identity migration are
  deferred: matching titles alone cannot establish that two sessions used the same cake.
- **Publishing latency — expected policy.** Local notes save immediately; making them public
  still requires explicit review, a content PR, checks, merge and rebuild. Keep that separation.

## Reader findings

- **Session metadata / share cards / sitemap — fixed upstream in #658.** Revalidated on the
  integrated branch. RSS was still absent; this change adds a static feed with discovery links.
- **Dead-end session pages — current.** Add older/newer sessions, explicit revisit connections,
  vendor/origin links, all sessions and the RSS feed below the notes.
- **Desktop prose — reproduced.** At 1440px, the 744px article wrapped into short runs on both
  sides of the cube. Wrapping now requires substantially more room; ordinary desktop widths
  stack the cube above an uninterrupted article. Wide layouts retain the existing treatment.
- **Chrome — a design tradeoff, not a demonstrated separate defect.** Keep the established
  Explorer/properties interaction and responsive drawers. Reassess after the reading-width fix
  rather than introducing another shell or hiding useful context by default.
- **Throwaway excerpts — editorial judgment.** Preserve the author's words. Upstream metadata
  now includes provenance/date context; changing the tone of 70 personal observations needs
  author review, rather than generated replacements.
- **Public test pages — qualified.** Production fixture content already requires the explicit
  build flag `PUERH_TEST_FIXTURES=1`; CI alone cannot enable it. Test builds intentionally carry
  fixtures. A deployment build must omit that flag.
  Verified without the flag: fixture content is unavailable. Static unavailable-page routes
  may still return HTTP 200; this is not a claim that the routes disappear from the export.
- **Image weight — current for legacy uploads.** Main already has browser-created WebP variants
  and `ResponsiveImage`, but its index covered one authored image. The new build step prepares
  320/640/960/1600px WebP candidates (never upscaling) for referenced older uploads. Public
  readers use these through the existing picture component. Originals and source URLs stay
  available; lower transfer weight does not imply that originals vanished from the export.
- **Rating explanation — current.** Explain personal enjoyment out of 100 in both authoring and
  reading. Do not invent numeric quality bands for historical ratings.
- **735MB export — unqualified historical observation.** The old local `out/` was not evidence
  about this main revision or bytes transferred for one visit. Record a fresh export breakdown
  separately; repeated static HTML/Flight payloads are not automatically a client download or
  evidence that the source data is duplicated incorrectly.

## Measured follow-up

The fresh optimized test export contains 5,245 files and 831,393,425 bytes (fixtures enabled).
HTML accounts for 258,170,778 bytes and Flight `.txt` files for 405,506,169 bytes; together they
make up about 80% of the artifact. Originals plus derivatives occupy 150,620,398 bytes.
This confirms a large hosting artifact, not an 831MB page download. The next bounded task is
to measure repeated root catalog data in those HTML/Flight payloads, then compare one shared
versioned static catalog against current hydration, immediate search, peeks and navigation.
Do not replace synchronous availability without measuring that interaction tradeoff.

In the captured ZSL Yi Shan Mo session, at 1440px and 390px viewports with device scale 1,
the four distinct photos select 248,240 bytes of WebP instead of 1,030,442 bytes of originals
(about 76% less). This is a page-specific selection comparison, not a site-wide transfer or
target-phone benchmark. The 134-image derivative set occupies 52,625,450 bytes across sizes;
originals remain available, so total image storage increases while requested sizes decrease.

## Local validation

- TypeScript and optimized static builds passed with fixtures enabled and disabled.
- All 141 browser scenarios passed against the test export. Subsequent preview polish is
  covered by a final affected-scenario run against the deployment build.
- All 42 CMS/static-server Node tests passed. This includes real service validation of valid
  scalar revisit links, cyclic lineage, malformed steep data and invalid colors.
- The standalone development draft harness initially lacked the shared validator dependency;
  after correcting its module fixture, all 28 affected development checks passed.
- Windows static segment routing now handles the nested files produced by Next as well as
  flat exports. Fourteen public navigation/filter checks passed after that correction.
- Three passing scenarios capture phone logging, revisits and public reading as WebM videos.
- The sample RSS feed parses as XML and contains 70 items; captured public pages have no
  runtime exceptions or horizontal overflow at 1440px and 390px.

## Content and verification boundaries

No historical tasting prose, scores or identities are migrated. Device-save, preview and
captured push tests use the repository's simulated GitHub contract. Trusted-service tests
exercise validation and publication guards separately. They do not constitute a live editorial
push, production deployment or evidence of phone hardware performance.

Run asset preparation before development/builds. `session-journal.json` and `legacy-images.json`
are generated indexes. `public/images/derived/` is build output; originals remain canonical.
