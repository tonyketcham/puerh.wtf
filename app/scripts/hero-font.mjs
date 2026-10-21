/**
 * The home hero's hanzi (普洱茶記, set vertically like a wrapper's title column): a subset of the
 * same pinned Noto Sans SC the origin maps use, at a heavier weight, written to
 * static/fonts/Hero_SC/hero-sc.woff2. Reuses the geo cache, so `pnpm geo` (or PUERH_GEO_CACHE
 * pointing at a cache that holds the font) must have fetched it once.
 *
 *   node scripts/hero-font.mjs [--offline]
 */
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { subsetHanzi } from "./geo/lib/font.mjs"
import { cacheRoot } from "./geo/lib/util.mjs"
import { FONT } from "./geo/params.mjs"

/** every glyph the hero sets; keep in step with Hero.tsx */
export const HERO_TEXT = "普洱茶記"
const WEIGHT = 600

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const out = path.join(appRoot, "static", "fonts", "Hero_SC", "hero-sc.woff2")
const woff2 = await subsetHanzi({
	dir: path.join(cacheRoot(), "fonts"),
	font: { ...FONT, weight: WEIGHT },
	text: HERO_TEXT,
	offline: process.argv.includes("--offline"),
})
await writeFile(out, woff2)
console.log(`hero-sc.woff2 · ${HERO_TEXT} · wght ${WEIGHT} · ${(woff2.length / 1024).toFixed(1)} KB`)
