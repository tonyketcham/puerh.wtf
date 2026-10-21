#!/usr/bin/env node
/**
 * Origin map build (plan §4.3, §4.7). Node only, no GDAL, no shell.
 *
 *   0. origins   content/origins/*.md geo frontmatter → src/generated/origins.geo.json
 *   1. frames    locator · china-east · japan · yunnan · six-mountains + coverage-tiled detail cells
 *                (z10 tile footprints around the precise origins), all in one north-up Web Mercator
 *                ("shared units"); organic edge masks for the detail regions and the finer frames
 *   2. fetch     terrarium tiles → {cache}/terrain/{z}/{x}/{y}.png  (concurrency 6, retries, resumable)
 *   3. grid      stitch → Float32Array meters → Gaussian blur
 *   4. contour   d3-contour bands (≥ elev MultiPolygons)
 *   5. simplify  mapshaper applyCommands, weighted Visvalingam, keep-shapes
 *   6. project   d3-geo → SVG path strings (frames 0.1 unit, cells 0.01 unit), grouped by band
 *   7. emit      public/maps/frames/{id}.json (+ masks/{id}.png) · public/maps/detail/cells/{z}-{x}-{y}.json ·
 *                public/maps/detail/masks/{region}.png · public/maps/labels.json ·
 *                public/maps/ridges/six-mountains.json
 *   8. font      hanzi subset of Noto Sans SC (origins + every label) → public/fonts/origins-sc.woff2
 *
 * Output format (all coordinates are already projected; the client needs no geo library):
 *   frame:  { id, kind: "frame", space: "shared", bbox, viewBox: [x, y, w, h], zoom, interval,
 *             indexInterval, members, bands: [{ elev, index, d }], contourLabels: [{ elev, x, y, angle }],
 *             context: { land, coast, borders, admin, rivers: [{ name, name_zh, d }], lakes: [...] } }
 *   cell:   { id: "z-x-y", kind: "cell", space: "shared", tile: [z, x, y], region, bbox, viewBox (the
 *             tile's exact rect), zoom (data), interval, indexInterval, bands, contourLabels, context }
 *   mask:   8-bit grayscale PNG mapped onto a rect in shared units (manifest: { url, rect, size, bytes })
 *   manifest.detail:  { zoom, dataZoom, interval, indexInterval, cellUrl, regions: [{ id, rect, mask,
 *             members, cells }], cells: [{ id, region, rect, bytes }] }
 *   manifest.details: per origin { id, region, point, sideKm, unitsPerKm, radius, precision, confidence,
 *             elevation_m, elevations }  (what the panel, peek and hero frame and highlight by)
 *   labels: { version, tiers, labels: [{ id, kind, name, name_zh, x, y, rank, angle? }] }
 *   Each band `d` is the closed outline of the ground at or above `elev` (fill-rule evenodd):
 *   stroke it for the contour line, clip by it for Tanaka light/dark offset strokes.
 *   Grids and paths run a few percent past the viewBox (a cell: clipPadKm), so clip to the viewBox
 *   when drawing.
 *
 * Usage: pnpm geo              fetch missing data, regenerate everything
 *        pnpm geo --offline    regenerate from the cache only; fails if anything is missing
 *        pnpm geo --verbose    per-cell detail
 * Cache: app/.cache (or PUERH_GEO_CACHE): terrain/, naturalearth/, fonts/
 */
import { readdir, rm, unlink, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { geoCircle } from "d3-geo"
import {
	ATTRIBUTION,
	BUDGETS,
	CONTEXT,
	CONTOUR_LABELS,
	CONTROL_POINTS,
	DETAIL,
	FONT,
	FRAMES,
	LABEL_TIERS,
	LABELS,
	MASK,
	NATURAL_EARTH,
	RIDGES,
	SCRIPT_VERSION,
	SHARED_PROJECTION,
	TERRAIN,
	THIN,
} from "./params.mjs"
import { cellId, cellRect, coverageDisks, deriveCells, deriveRegions } from "./lib/cells.mjs"
import { frameContext, loadContext } from "./lib/context.mjs"
import { CLIP_PAD, cellWindow, renderCell, unitsPerKmAt, windowBBox } from "./lib/detail.mjs"
import { subsetHanzi } from "./lib/font.mjs"
import { deriveDetails, deriveFrames } from "./lib/frames.mjs"
import { inputHash } from "./lib/inputs.mjs"
import { buildLabels, hanziOf } from "./lib/labels.mjs"
import {
	coverageField,
	fieldDisks,
	frameDisks,
	maskMeta,
	maskTouches,
	rasterMask,
	writeMask,
} from "./lib/masks.mjs"
import { readOrigins, readPlaces } from "./lib/origins.mjs"
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

async function removeStale(dir, keep, ext = ".json") {
	let files = []
	try {
		files = await readdir(dir)
	} catch {
		return
	}
	for (const f of files) {
		if (f.endsWith(ext) && !keep.has(f)) {
			await unlink(path.join(dir, f))
			log.info(`  removed stale ${f}`)
		}
	}
}

/** Every name_zh in a frame or cell context */
const contextHanzi = (context) => [...context.rivers, ...context.lakes].map((r) => r.name_zh)

async function main() {
	const started = Date.now()
	const cache = cacheRoot()
	log.info(`geo ${SCRIPT_VERSION}${offline ? " (offline)" : ""} · cache ${cache}`)

	// 0. origins -------------------------------------------------------------
	const origins = await readOrigins(paths.origins)
	const places = await readPlaces(paths.places)
	const placed = origins.filter(
		(o) => o.geo && Number.isFinite(o.geo.lat) && Number.isFinite(o.geo.lon)
	)
	const hash = inputHash(origins, places)

	// 1. frames --------------------------------------------------------------
	const sharedProjection = makeProjection(SHARED_PROJECTION)
	const shared = (p) => sharedProjection(p)
	const unitsPerKm = (lat) => unitsPerKmAt(SHARED_PROJECTION.scale, lat)
	const frames = deriveFrames(placed, FRAMES).map((f) => {
		const viewBox = projectBBox(f.bbox, shared)
		const cover = coverBBox(viewBox, (p) => sharedProjection.invert(p))
		return { ...f, viewBox, cover, zoom: fitZoom(cover, f.maxGridPx, TERRAIN.maxZoom) }
	})
	const scale = SHARED_PROJECTION.scale
	// the frames that give way to the next layer through an organic edge (masks.mjs)
	const frameMasks = new Map()
	for (const f of frames) {
		if (!f.mask) continue
		const members = placed.filter((o) => f.members.includes(o.slug))
		const disks = frameDisks(members, f.viewBox, f.mask, shared, scale)
		const field = coverageField(fieldDisks(disks, scale, MASK.insetKm), MASK)
		const midLat = sharedProjection.invert([0, f.viewBox[1] + f.viewBox[3] / 2])[1]
		frameMasks.set(f.id, rasterMask(f.viewBox, f.mask.kmPerPx * unitsPerKm(midLat), field))
	}

	// detail: coverage disks → cells → regions, each with its organic mask --------------
	const details = deriveDetails(placed, DETAIL)
	const disks = coverageDisks(placed, DETAIL, sharedProjection, scale)
	const allCells = deriveCells(disks, DETAIL.zoom, sharedProjection, DETAIL.decimals)
	const regions = deriveRegions(allCells, disks).map((r) => {
		const field = coverageField(fieldDisks(r.disks, scale, MASK.insetKm), MASK)
		const midLat = sharedProjection.invert([0, r.rect[1] + r.rect[3] / 2])[1]
		const mask = rasterMask(r.rect, DETAIL.mask.kmPerPx * unitsPerKm(midLat), field)
		// a cell the mask never reaches would never show
		const cells = r.cells.filter((c) => maskTouches(mask, c.rect))
		return { ...r, field, mask, cells }
	})
	const cells = regions.flatMap((r) => r.cells.map((c) => ({ ...c, region: r })))
	// the data tiles that meet a disk; the rest of every grid is left empty (under a zero mask)
	const covered = new Set(
		deriveCells(disks, DETAIL.dataZoom, sharedProjection, DETAIL.decimals).map(
			(c) => `${c.tile.x}/${c.tile.y}`
		)
	)
	const hasData = (t) => t.z === DETAIL.dataZoom && covered.has(`${t.x}/${t.y}`)

	// 2. fetch ---------------------------------------------------------------
	const source = createTileSource({
		dir: path.join(cache, "terrain"),
		url: TERRAIN.url,
		offline,
		concurrency: TERRAIN.concurrency,
		retries: TERRAIN.retries,
		timeoutMs: TERRAIN.timeoutMs,
	})
	const wanted = [
		...frames.flatMap((f) => tilesFor(pixelWindow(f.cover, f.zoom, TERRAIN.margin))),
		...cells.flatMap((c) =>
			tilesFor(cellWindow(c.tile, DETAIL.dataZoom, DETAIL.marginPx)).filter(hasData)
		),
	]
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
		bbox: windowBBox(pixelWindow(locator.cover, locator.zoom, TERRAIN.margin)),
		offline,
	})

	const sizes = { frames: {}, cells: {} }
	const hanzi = []
	const manifest = {
		version: SCRIPT_VERSION,
		inputHash: hash,
		attribution: ATTRIBUTION,
		projection: {
			...SHARED_PROJECTION,
			// [lon, lat, x, y] through d3; projection.ts must reproduce these (geo:test checks)
			controlPoints: CONTROL_POINTS.map(([lon, lat]) => {
				const [x, y] = shared([lon, lat])
				return [lon, lat, round(x, 3), round(y, 3)]
			}),
		},
		frames: [],
		detail: null,
		details: [],
		labels: null,
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
		const { raw, bands, interval, indexInterval, contourLabels } = await renderTerrain({
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
			viewBox,
			displayPx: frame.displayPx,
			labels: CONTOUR_LABELS,
			thinMaxUpp: (viewBox[2] * THIN.lodFade) / THIN.mapPx,
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
			linePx: CONTEXT.linePx,
			hardPx: CONTEXT.hardPx,
		})
		hanzi.push(...contextHanzi(context))
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
			contourLabels,
			context,
		}
		const text = stringify(json)
		const file = path.join(paths.maps, "frames", `${frame.id}.json`)
		const bytes = await writeText(file, text)
		sizes.frames[frame.id] = gz(text)
		const mask = frameMasks.get(frame.id)
		const maskBytes = mask
			? await writeMask(path.join(paths.maps, "frames", "masks", `${frame.id}.png`), mask)
			: 0
		manifest.frames.push({
			id: frame.id,
			url: publicUrl("maps", "frames", `${frame.id}.json`),
			bbox: frame.bbox,
			viewBox,
			zoom: frame.zoom,
			interval,
			bands: bands.length,
			bytes,
			mask: mask
				? maskMeta(publicUrl("maps", "frames", "masks", `${frame.id}.png`), mask, maskBytes)
				: null,
		})
		log.info(
			`frame ${frame.id.padEnd(14)} z${frame.zoom} ${win.width}×${win.height}px ${String(
				bands.length
			).padStart(3)} bands  ${kb(bytes).toFixed(0).padStart(5)} KB  gz ${kb(
				sizes.frames[frame.id]
			).toFixed(1)} KB`
		)

		if (frame.id === RIDGES.frame) {
			// the members' areas + RIDGES.pad: the frame itself is padded for its organic edge
			const inset = frame.pad - RIDGES.pad
			const [w, s, e, n] = frame.bbox
			const bbox = [w + inset, s + inset, e - inset, n - inset].map((v) => round(v, 3))
			const ridges = { id: frame.id, bbox, ...renderRidges(raw, bbox, RIDGES) }
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
	await removeStale(
		path.join(paths.maps, "frames", "masks"),
		new Set([...frameMasks.keys()].map((id) => `${id}.png`)),
		".png"
	)

	// 3–7. detail cells ----------------------------------------------------------------------
	const cellDir = path.join(paths.maps, "detail", "cells")
	const maskDir = path.join(paths.maps, "detail", "masks")
	const cellBands = new Map()
	const cellRows = []
	let cellBytes = 0
	const written = []
	// a cell over budget gives way to its four children (those the mask reaches)
	const queue = [...cells]
	while (queue.length) {
		const cell = queue.shift()
		const { field } = cell.region
		const json = await renderCell({
			tile: cell.tile,
			region: cell.region.id,
			params: {
				...DETAIL,
				thinMaxUpp: (((2 * Math.PI * scale) / 2 ** DETAIL.zoom) * THIN.lodFade) / THIN.mapPx,
				thinCoarse: cell.thinCoarse ?? 0,
			},
			contextParams: CONTEXT,
			labelParams: CONTOUR_LABELS,
			has: hasData,
			// elevations only where the mask shows the line well
			labelAccept: (x, y) => field(x, y) >= 0.6,
			scale,
			source,
			ctx,
			projection: sharedProjection,
		})
		const text = stringify(json)
		const size = gz(text)
		if (size > DETAIL.splitAboveKb * 1024 && cell.tile.z < DETAIL.maxZoom) {
			const { z, x, y } = cell.tile
			const children = []
			for (const [dx, dy] of [
				[0, 0],
				[1, 0],
				[0, 1],
				[1, 1],
			]) {
				const tile = { z: z + 1, x: 2 * x + dx, y: 2 * y + dy }
				const rect = cellRect(tile, sharedProjection, DETAIL.decimals)
				if (maskTouches(cell.region.mask, rect))
					children.push({ id: cellId(tile), tile, rect, region: cell.region })
			}
			log.debug(
				`cell ${cell.id.padEnd(12)} gz ${kb(size).toFixed(1)} KB → ${children.length} cells`
			)
			queue.unshift(...children)
			continue
		}
		// at the finest cell, longer thinning runs (fewer bytes) before going over budget
		if (size > DETAIL.splitAboveKb * 1024 && (cell.thinCoarse ?? 0) < THIN.maxCoarse) {
			log.debug(`cell ${cell.id.padEnd(12)} gz ${kb(size).toFixed(1)} KB → coarser thinning`)
			queue.unshift({ ...cell, thinCoarse: (cell.thinCoarse ?? 0) + 1 })
			continue
		}
		hanzi.push(...contextHanzi(json.context))
		const bytes = await writeText(path.join(cellDir, `${cell.id}.json`), text)
		cellBytes += bytes
		sizes.cells[cell.id] = size
		cellBands.set(
			cell.id,
			json.bands.map((b) => b.elev)
		)
		written.push(cell)
		cellRows.push({ id: cell.id, region: cell.region.id, rect: cell.rect, bytes })
		log.debug(
			`cell ${cell.id.padEnd(12)} ${cell.region.id.padEnd(14)} ${String(json.bands.length).padStart(
				3
			)} bands  gz ${kb(size).toFixed(1)} KB`
		)
		// a cell's grid shares tiles with its neighbours; keep the decoded ones for the next cell
		if (cellRows.length % 8 === 0) source.clear()
	}
	source.clear()
	await removeStale(cellDir, new Set(written.map((c) => `${c.id}.json`)))
	for (const r of regions) r.written = written.filter((c) => c.region === r).length
	const regionRows = []
	for (const r of regions) {
		const file = `${r.id}.png`
		const bytes = await writeMask(path.join(maskDir, file), r.mask)
		regionRows.push({
			id: r.id,
			rect: r.rect,
			mask: maskMeta(publicUrl("maps", "detail", "masks", file), r.mask, bytes),
			members: r.disks.map((d) => d.slug),
			cells: r.written,
		})
	}
	await removeStale(maskDir, new Set(regions.map((r) => `${r.id}.png`)), ".png")
	// v2's per-origin patches (public/maps/detail/{slug}.json) and v1's insets are gone
	await removeStale(path.join(paths.maps, "detail"), new Set())
	await rm(path.join(paths.maps, "inset"), { recursive: true, force: true })
	manifest.detail = {
		zoom: DETAIL.zoom,
		dataZoom: DETAIL.dataZoom,
		interval: DETAIL.interval,
		indexInterval: DETAIL.interval * DETAIL.indexEvery,
		cellUrl: publicUrl("maps", "detail", "cells", "{id}.json"),
		regions: regionRows,
		cells: cellRows,
	}
	const cellGz = Object.values(sizes.cells)
	log.info(
		`detail: ${written.length} cells (${cells.length} at z${DETAIL.zoom}, ${
			allCells.length - cells.length
		} outside the masks dropped, the heaviest split) in ${regions.length} regions, ${(
			cellBytes / 1e6
		).toFixed(2)} MB raw, ${(cellGz.reduce((a, b) => a + b, 0) / 1e6).toFixed(2)} MB gz`
	)
	for (const r of regionRows)
		log.debug(
			`  region ${r.id.padEnd(14)} ${String(r.cells).padStart(3)} cells  mask ${r.mask.size.join(
				"×"
			)}`
		)

	// the per-origin index: what the panel, the peek and the hero frame and highlight by
	const regionOf = new Map()
	for (const r of regions) for (const d of r.disks) regionOf.set(d.slug, r.id)
	const detailRegion = new Map()
	for (const d of details) {
		const o = d.origin
		const [px, py] = shared([o.geo.lon, o.geo.lat])
		const upk = unitsPerKm(o.geo.lat)
		const half = (d.sideKm * upk) / 2
		const elevs = new Set()
		for (const c of written) {
			const [cx, cy, cw, ch] = c.rect
			if (cx > px + half || cx + cw < px - half || cy > py + half || cy + ch < py - half) continue
			for (const e of cellBands.get(c.id) ?? []) elevs.add(e)
		}
		const region = regionOf.get(o.slug) ?? null
		detailRegion.set(o.slug, region)
		manifest.details.push({
			id: o.slug,
			region,
			point: [round(px, DETAIL.decimals), round(py, DETAIL.decimals)],
			sideKm: d.sideKm,
			unitsPerKm: round(upk, 4),
			radius: round((o.geo.radius_km ?? 0) * upk, DETAIL.decimals),
			precision: o.geo.precision,
			confidence: o.geo.confidence,
			elevation_m: o.geo.elevation_m,
			elevations: [...elevs].sort((a, b) => a - b),
		})
	}

	// labels ---------------------------------------------------------------------------------
	const labels = await buildLabels({
		dir: path.join(cache, "naturalearth"),
		ne: NATURAL_EARTH,
		offline,
		project: shared,
		unitsPerKm,
		places,
		origins: placed,
		ctx,
		params: LABELS,
		tiers: LABEL_TIERS,
	})
	const labelsText = stringify({ version: SCRIPT_VERSION, tiers: LABEL_TIERS, labels })
	const labelsBytes = await writeText(path.join(paths.maps, "labels.json"), labelsText)
	sizes.labels = gz(labelsText)
	hanzi.push(...labels.map((l) => l.name_zh))
	const byKind = {}
	for (const l of labels) byKind[l.kind] = (byKind[l.kind] ?? 0) + 1
	manifest.labels = {
		url: publicUrl("maps", "labels.json"),
		count: labels.length,
		tiers: LABEL_TIERS,
		bytes: labelsBytes,
	}
	log.info(
		`labels: ${labels.length} (${Object.entries(byKind)
			.map(([k, n]) => `${n} ${k}`)
			.join(", ")})  gz ${kb(sizes.labels).toFixed(1)} KB`
	)

	// 0. origins.geo.json --------------------------------------------------------
	const r5 = (v) => round(v, 5)
	const features = []
	for (const o of placed) {
		const [x, y] = shared([o.geo.lon, o.geo.lat])
		const km = o.geo.radius_km ?? 0
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
				shared: { x: round(x, 1), y: round(y, 1), r: round(km * unitsPerKm(o.geo.lat), 1) },
				frames: frames
					.filter(
						({ bbox: [w, s, e, n] }) =>
							o.geo.lon >= w && o.geo.lon <= e && o.geo.lat >= s && o.geo.lat <= n
					)
					.map((f) => f.id),
				// the detail region whose cells cover it
				detail: detailRegion.get(o.slug) ?? null,
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
	const glyphs = hanziOf([...origins.map((o) => o.hanzi), ...hanzi])
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

	// budgets (plan §4.4, §4.7.7) -------------------------------------------------------------
	const rows = []
	const check = (label, valueKb, budgetKb) =>
		rows.push({ label, valueKb, budgetKb, ok: valueKb <= budgetKb })
	check("detail cell (largest)", kb(Math.max(0, ...cellGz)), BUDGETS.cell)
	check(
		"base (locator + yunnan)",
		kb((sizes.frames.locator ?? 0) + (sizes.frames.yunnan ?? 0)),
		BUDGETS.base
	)
	for (const id of ["china-east", "japan"])
		if (sizes.frames[id]) check(`frame ${id}`, kb(sizes.frames[id]), BUDGETS.frame)
	check("six-mountains LOD", kb(sizes.frames["six-mountains"] ?? 0), BUDGETS.cluster)
	check("ridgelines", kb(sizes.ridges ?? 0), BUDGETS.ridges)
	check("labels", kb(sizes.labels), BUDGETS.labels)
	check("CJK subset font", kb(sizes.font), BUDGETS.font)
	log.info("\nbudgets (gzip)")
	for (const r of rows) {
		log.info(
			`  ${r.ok ? "ok  " : "OVER"} ${r.label.padEnd(26)} ${r.valueKb.toFixed(1).padStart(6)} / ${
				r.budgetKb
			} KB`
		)
	}
	const sorted = [...cellGz].sort((a, b) => a - b)
	const median = sorted[Math.floor(sorted.length / 2)] ?? 0
	log.info(
		`  detail cells: median ${kb(median).toFixed(1)} KB gz across ${sorted.length}, ${(
			cellBytes / 1e6
		).toFixed(2)} MB on disk`
	)
	log.info(`\ndone in ${((Date.now() - started) / 1000).toFixed(1)}s`)
	if (rows.some((r) => !r.ok) && process.argv.includes("--strict")) process.exitCode = 1
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
