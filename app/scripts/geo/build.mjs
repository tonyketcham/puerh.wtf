#!/usr/bin/env node
/**
 * Origin map build (plan §4.3). Node only, no GDAL, no shell.
 *
 *   0. origins   content/origins/*.md geo frontmatter → src/generated/origins.geo.json
 *   1. frames    locator · china-east · japan · yunnan · six-mountains (shared conic) + per-origin insets
 *   2. fetch     terrarium tiles → {cache}/terrain/{z}/{x}/{y}.png  (concurrency 6, retries, resumable)
 *   3. grid      stitch → Float32Array meters → Gaussian blur
 *   4. contour   d3-contour bands (≥ elev MultiPolygons)
 *   5. simplify  mapshaper applyCommands, weighted Visvalingam, keep-shapes
 *   6. project   d3-geo → SVG path strings in 0.1 px, grouped by elevation band
 *   7. emit      public/maps/frames/{id}.json · public/maps/inset/{slug}.json · public/maps/ridges/six-mountains.json
 *   8. font      hanzi subset of Noto Sans SC → public/fonts/origins-sc.woff2
 *
 * Output format (all coordinates are already projected; the client needs no geo code):
 *   frame/inset: { viewBox: [x, y, w, h], bands: [{ elev, index, d }], context: { coast, admin, rivers[], lakes[] } }
 *   Each band `d` is the closed outline of the ground at or above `elev` (fill-rule evenodd):
 *   stroke it for the contour line, clip by it for Tanaka light/dark offset strokes.
 *   Grids run a few percent past the viewBox, so clip to the viewBox when drawing.
 *
 * Usage: pnpm geo              fetch missing data, regenerate everything
 *        pnpm geo --offline    regenerate from the cache only; fails if anything is missing
 *        pnpm geo --verbose    per-frame detail
 * Cache: app/.cache (or PUERH_GEO_CACHE): terrain/, naturalearth/, fonts/
 */
import { readdir, unlink, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { geoCircle } from "d3-geo"
import {
	ATTRIBUTION,
	BUDGETS,
	FONT,
	FRAMES,
	INSET,
	NATURAL_EARTH,
	RIDGES,
	SCRIPT_VERSION,
	SHARED_PROJECTION,
	TERRAIN,
} from "./params.mjs"
import { frameContext, loadContext } from "./lib/context.mjs"
import { subsetHanzi } from "./lib/font.mjs"
import { deriveFrames, deriveInsets } from "./lib/frames.mjs"
import { inputHash } from "./lib/inputs.mjs"
import { hanziSet, readOrigins } from "./lib/origins.mjs"
import { CLIP_PAD, renderInset, windowBBox } from "./lib/inset.mjs"
import { clipRect, makeProjection, projectBBox } from "./lib/project.mjs"
import { renderRidges, renderTerrain } from "./lib/render.mjs"
import { createTileSource, fitZoom, pixelWindow, tilesFor } from "./lib/tiles.mjs"
import {
	cacheRoot,
	log,
	paths,
	publicUrl,
	relativeToApp,
	round,
	stringify,
	writeText,
} from "./lib/util.mjs"

const offline = process.argv.includes("--offline")
const KM_PER_DEG = 111.195

const kb = (bytes) => bytes / 1024
const gz = (text) => gzipSync(Buffer.from(text), { level: 9 }).length

/** Width of a lon/lat bbox in km at its middle latitude */
function widthKm([w, s, e, n]) {
	return (e - w) * KM_PER_DEG * Math.cos((((s + n) / 2) * Math.PI) / 180)
}

/** Inset interval candidates: the 50 m floor scales up with boxes wider than INSET.fineSideKm */
function insetIntervals(sideKm) {
	const floor = INSET.intervals[0] * Math.max(1, sideKm / INSET.fineSideKm)
	const ok = INSET.intervals.filter((iv) => iv >= floor)
	return ok.length ? ok : INSET.intervals.slice(-1)
}

/** lon/lat box covering a projected [x, y, w, h] (edges sampled, inverted) */
function coverBBox([x, y, w, h], invert) {
	const pts = []
	for (let i = 0; i <= 32; i++) {
		const t = i / 32
		pts.push([x + w * t, y], [x + w * t, y + h], [x, y + h * t], [x + w, y + h * t])
	}
	const ll = pts.map(invert)
	const lons = ll.map((p) => p[0])
	const lats = ll.map((p) => p[1])
	return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].map((v) =>
		round(v, 4)
	)
}

async function removeStale(dir, keep) {
	let files = []
	try {
		files = await readdir(dir)
	} catch {
		return
	}
	for (const f of files) {
		if (f.endsWith(".json") && !keep.has(f)) {
			await unlink(path.join(dir, f))
			log.info(`  removed stale ${f}`)
		}
	}
}

async function main() {
	const started = Date.now()
	const cache = cacheRoot()
	log.info(`geo ${SCRIPT_VERSION}${offline ? " (offline)" : ""} · cache ${cache}`)

	// 0. origins -------------------------------------------------------------
	const origins = await readOrigins(paths.origins)
	const placed = origins.filter(
		(o) => o.geo && Number.isFinite(o.geo.lat) && Number.isFinite(o.geo.lon)
	)
	const hash = inputHash(origins)

	// 1. frames --------------------------------------------------------------
	const sharedProjection = makeProjection(SHARED_PROJECTION)
	const shared = (p) => sharedProjection(p)
	const frames = deriveFrames(placed, FRAMES).map((f) => {
		const viewBox = projectBBox(f.bbox, shared)
		// Conic parallels are arcs, so the viewBox reaches past the lon/lat box: grid what it shows.
		const cover = coverBBox(viewBox, (p) => sharedProjection.invert(p))
		return { ...f, viewBox, cover, zoom: fitZoom(cover, f.maxGridPx, TERRAIN.maxZoom) }
	})
	const insets = deriveInsets(placed, INSET).map((f) => ({
		...f,
		zoom: fitZoom(f.bbox, INSET.maxGridPx, TERRAIN.maxZoom),
	}))

	// 2. fetch ---------------------------------------------------------------
	const source = createTileSource({
		dir: path.join(cache, "terrain"),
		url: TERRAIN.url,
		offline,
		concurrency: TERRAIN.concurrency,
		retries: TERRAIN.retries,
		timeoutMs: TERRAIN.timeoutMs,
	})
	const wanted = [...frames.map((f) => ({ ...f, bbox: f.cover })), ...insets].flatMap((f) =>
		tilesFor(pixelWindow(f.bbox, f.zoom, TERRAIN.margin))
	)
	const fetched = await source.ensure(wanted)
	log.info(
		`terrain: ${fetched.total} tiles (${fetched.fetched} fetched, ${(fetched.bytes / 1e6).toFixed(
			1
		)} MB)`
	)

	const locator = frames.find((f) => f.id === "locator")
	const ctx = await loadContext({
		dir: path.join(cache, "naturalearth"),
		ne: NATURAL_EARTH,
		bbox: windowBBox(pixelWindow(locator.bbox, locator.zoom, TERRAIN.margin)),
		offline,
	})

	const sizes = { frames: {}, insets: {} }
	const manifest = {
		version: SCRIPT_VERSION,
		inputHash: hash,
		attribution: ATTRIBUTION,
		projection: SHARED_PROJECTION,
		frames: [],
		insets: [],
		ridges: null,
		font: null,
		origins: null,
	}

	// 3–7. shared frames -------------------------------------------------------
	for (const frame of frames) {
		const { viewBox, cover } = frame
		const unitsPerPx = viewBox[2] / frame.displayPx
		const clip = clipRect(viewBox, viewBox[2] * CLIP_PAD)
		const win = pixelWindow(cover, frame.zoom, TERRAIN.margin)
		const { raw, bands, interval, indexInterval } = await renderTerrain({
			bbox: cover,
			zoom: frame.zoom,
			margin: TERRAIN.margin,
			blurSigma: frame.blurSigma,
			intervals: frame.intervals,
			indexEvery: frame.indexEvery,
			simplify: frame.simplify,
			project: shared,
			minArea: (unitsPerPx * 2) ** 2,
			clip,
			source,
		})
		const context = await frameContext(ctx, {
			bbox: windowBBox(win),
			clip,
			project: shared,
			unitsPerPx,
			kmPerPx: widthKm(frame.bbox) / frame.displayPx,
			rivers: frame.rivers,
			lakes: frame.lakes,
		})
		const json = {
			id: frame.id,
			kind: "frame",
			space: "shared",
			bbox: frame.bbox,
			viewBox,
			zoom: frame.zoom,
			interval,
			indexInterval,
			members: frame.members,
			bands,
			context,
		}
		const text = stringify(json)
		const file = path.join(paths.maps, "frames", `${frame.id}.json`)
		const bytes = await writeText(file, text)
		sizes.frames[frame.id] = gz(text)
		manifest.frames.push({
			id: frame.id,
			url: publicUrl("maps", "frames", `${frame.id}.json`),
			bbox: frame.bbox,
			viewBox,
			zoom: frame.zoom,
			bands: bands.length,
			bytes,
		})
		log.info(
			`frame ${frame.id.padEnd(14)} z${frame.zoom} ${win.width}×${win.height}px ${String(
				bands.length
			).padStart(3)} bands  ${kb(bytes).toFixed(0).padStart(5)} KB  gz ${kb(
				sizes.frames[frame.id]
			).toFixed(1)} KB`
		)

		if (frame.id === RIDGES.frame) {
			const ridges = { id: frame.id, bbox: frame.bbox, ...renderRidges(raw, frame.bbox, RIDGES) }
			const rtext = stringify(ridges)
			const rbytes = await writeText(path.join(paths.maps, "ridges", `${frame.id}.json`), rtext)
			sizes.ridges = gz(rtext)
			manifest.ridges = {
				id: frame.id,
				url: publicUrl("maps", "ridges", `${frame.id}.json`),
				rows: ridges.rows.length,
				bytes: rbytes,
			}
			log.info(
				`ridges ${frame.id} ${ridges.rows.length} rows  gz ${kb(sizes.ridges).toFixed(1)} KB`
			)
		}
		source.clear()
	}
	await removeStale(path.join(paths.maps, "frames"), new Set(frames.map((f) => `${f.id}.json`)))

	// 3–7. insets ------------------------------------------------------------------
	const insetUrl = new Map()
	for (const inset of insets) {
		const o = inset.origin
		const json = await renderInset({
			id: inset.id,
			lon: o.geo.lon,
			lat: o.geo.lat,
			sideKm: inset.sideKm,
			bbox: inset.bbox,
			zoom: inset.zoom,
			origin: o.geo,
			params: { ...INSET, intervals: insetIntervals(inset.sideKm) },
			margin: TERRAIN.margin,
			source,
			ctx,
			shared,
		})
		const { interval, bands } = json
		const text = stringify(json)
		const bytes = await writeText(path.join(paths.maps, "inset", `${inset.id}.json`), text)
		sizes.insets[inset.id] = gz(text)
		const url = publicUrl("maps", "inset", `${inset.id}.json`)
		insetUrl.set(inset.id, url)
		manifest.insets.push({
			id: inset.id,
			url,
			sideKm: inset.sideKm,
			zoom: inset.zoom,
			interval,
			bands: bands.length,
			bytes,
		})
		log.debug(
			`inset ${inset.id.padEnd(16)} ${String(inset.sideKm).padStart(6)} km z${inset.zoom} ${String(
				interval
			).padStart(3)} m ${String(bands.length).padStart(3)} bands  gz ${kb(
				sizes.insets[inset.id]
			).toFixed(1)} KB`
		)
		source.clear()
	}
	await removeStale(path.join(paths.maps, "inset"), new Set(insets.map((f) => `${f.id}.json`)))
	log.info(`insets: ${insets.length}`)

	// 0. origins.geo.json --------------------------------------------------------
	const r5 = (v) => round(v, 5)
	const features = []
	for (const o of placed) {
		const [x, y] = shared([o.geo.lon, o.geo.lat])
		const km = o.geo.radius_km ?? 0
		const [, ny] = shared([o.geo.lon, o.geo.lat + km / KM_PER_DEG])
		features.push({
			type: "Feature",
			id: o.slug,
			properties: {
				slug: o.slug,
				id: o.id,
				title: o.title,
				hanzi: o.hanzi,
				pinyin: o.pinyin,
				kind: o.kind,
				parent: o.parentSlug,
				ancestors: o.ancestors,
				groups: o.groups,
				precision: o.geo.precision,
				radius_km: o.geo.radius_km,
				elevation_m: o.geo.elevation_m,
				confidence: o.geo.confidence,
				source: o.geo.source,
				shared: { x: round(x, 1), y: round(y, 1), r: round(Math.abs(y - ny), 1) },
				frames: frames
					.filter(
						({ bbox: [w, s, e, n] }) =>
							o.geo.lon >= w && o.geo.lon <= e && o.geo.lat >= s && o.geo.lat <= n
					)
					.map((f) => f.id),
				inset: insetUrl.get(o.slug) ?? null,
			},
			geometry: { type: "Point", coordinates: [r5(o.geo.lon), r5(o.geo.lat)] },
		})
		if (o.geo.precision !== "village" && km > 1) {
			const ring = geoCircle()
				.center([o.geo.lon, o.geo.lat])
				.radius(km / KM_PER_DEG)
				.precision(12)()
				.coordinates[0].map(([lon, lat]) => [r5(lon), r5(lat)])
			features.push({
				type: "Feature",
				id: `${o.slug}#area`,
				properties: { slug: o.slug, role: "area", radius_km: km },
				geometry: { type: "Polygon", coordinates: [ring] },
			})
		}
	}
	const originsText = stringify({ type: "FeatureCollection", features })
	const originsBytes = await writeText(paths.originsGeo, originsText)
	manifest.origins = {
		file: relativeToApp(paths.originsGeo),
		count: placed.length,
		bytes: originsBytes,
	}

	// 8. font ------------------------------------------------------------------------
	const glyphs = hanziSet(origins)
	const woff2 = await subsetHanzi({
		dir: path.join(cache, "fonts"),
		font: FONT,
		text: glyphs,
		offline,
	})
	await mkdir(path.dirname(paths.font), { recursive: true })
	await writeFile(paths.font, woff2)
	sizes.font = woff2.length // already compressed; the budget is on the wire size
	manifest.font = {
		url: publicUrl("fonts", "origins-sc.woff2"),
		family: "Noto Sans SC",
		weight: FONT.weight,
		glyphs,
		bytes: woff2.length,
	}
	log.info(`font: ${[...glyphs].length} glyphs, ${kb(woff2.length).toFixed(1)} KB`)

	// manifest -------------------------------------------------------------------------
	await writeText(paths.manifest, stringify(manifest))

	// budgets (plan §4.4) -----------------------------------------------------------------
	const rows = []
	const check = (label, valueKb, budgetKb) =>
		rows.push({ label, valueKb, budgetKb, ok: valueKb <= budgetKb })
	const insetSizes = Object.values(sizes.insets)
	check("inset (largest)", kb(Math.max(0, ...insetSizes)), BUDGETS.inset)
	check(
		"base (locator + yunnan)",
		kb((sizes.frames.locator ?? 0) + (sizes.frames.yunnan ?? 0)),
		BUDGETS.base
	)
	for (const id of ["china-east", "japan"])
		if (sizes.frames[id]) check(`frame ${id}`, kb(sizes.frames[id]), BUDGETS.frame)
	check("six-mountains LOD", kb(sizes.frames["six-mountains"] ?? 0), BUDGETS.cluster)
	check("ridgelines", kb(sizes.ridges ?? 0), BUDGETS.ridges)
	check("CJK subset font", kb(sizes.font), BUDGETS.font)
	log.info("\nbudgets (gzip)")
	for (const r of rows) {
		log.info(
			`  ${r.ok ? "ok  " : "OVER"} ${r.label.padEnd(26)} ${r.valueKb.toFixed(1).padStart(6)} / ${
				r.budgetKb
			} KB`
		)
	}
	const median = insetSizes.sort((a, b) => a - b)[Math.floor(insetSizes.length / 2)] ?? 0
	log.info(`  insets: median ${kb(median).toFixed(1)} KB gz across ${insetSizes.length}`)
	log.info(`\ndone in ${((Date.now() - started) / 1000).toFixed(1)}s`)
	if (rows.some((r) => !r.ok) && process.argv.includes("--strict")) process.exitCode = 1
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
