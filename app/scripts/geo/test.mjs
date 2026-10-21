#!/usr/bin/env node
/**
 * geo:test (CI matrix, no network):
 *
 * 1. Run the real pipeline on a committed fixture (4 terrarium tiles at z12 around Yiwu +
 *    synthetic reference layers) and compare the output with fixtures/snapshot.json byte for
 *    byte: coverage disks → cells → regions → organic mask, one detail cell (a z13 footprint from
 *    z12 data, one of its tiles left out to exercise the gap fill, with contour thinning tiers),
 *    a frame and ridges. Proves determinism and path handling on Windows, macOS and Linux. The mask PNG round-trips through
 *    pngjs (pixels, not bytes, are compared: zlib output may differ between builds).
 * 2. Check the runtime projection (src/lib/components/map/projection.ts, transpiled in memory
 *    with the TypeScript compiler) against d3-geo to within 0.01 shared unit, both for a grid of
 *    points and for the control points committed in maps-manifest.json.
 *
 * The parameters below are fixed on purpose: tuning params.mjs never touches the snapshot, but a
 * change to pipeline code that alters output does.
 *
 * Usage: pnpm geo:test            compare
 *        pnpm geo:test --update   rewrite the snapshot (review the diff!)
 */
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"
import { PNG } from "pngjs"
import { riverAnchors } from "./lib/annotate.mjs"
import { coverageDisks, deriveCells, deriveRegions, unitsPerKmAt } from "./lib/cells.mjs"
import { renderCell } from "./lib/detail.mjs"
import { coverageField, encodeMask, fieldDisks, maskRows, rasterMask } from "./lib/masks.mjs"
import { makeProjection } from "./lib/project.mjs"
import { renderRidges, renderTerrain } from "./lib/render.mjs"
import { createTileSource, pxToLat, pxToLon } from "./lib/tiles.mjs"
import { appRoot, paths, stringify } from "./lib/util.mjs"

const Z = 12
// The shared corner of tiles 3202–3203 × 1791–1792
const LON = pxToLon(3203 * 256, Z)
const LAT = pxToLat(1792 * 256, Z)
const SIDE_KM = 12
// one z13 footprint inside the four z12 tiles, with room for its grid margin
const CELL = { z: 13, x: 6405, y: 3583 }
// left out of the grid, as an uncovered tile is in `pnpm geo`
const MISSING = "3203/1792"

const FIXTURE = {
	projection: {
		type: "mercator",
		rotate: [-102, 0],
		center: [0, 25],
		scale: 30000,
		translate: [0, 0],
	},
	detail: {
		precision: ["village", "mountain-area"],
		capKm: 40,
		padKm: 3,
		dataZoom: 12,
		marginPx: 48,
		clipPadKm: 0.6,
		decimals: 2,
		displayPx: 360,
		blurSigma: 2.5,
		interval: 50,
		indexEvery: 5,
		simplify: "weighted interval=2",
		rivers: 10,
		lakes: 10,
		// contour thinning tiers on the cell (thin.mjs), coarsest at this many units per CSS px
		thinMaxUpp: 0.4,
	},
	mask: { sigmaFrac: 0.6, insetKm: 0.5, lo: 0.05, hi: 0.35, kmPerPx: 0.25 },
	origins: [
		{ slug: "a", dLon: 0.004, dLat: -0.012, radius_km: 1, precision: "village" },
		{ slug: "b", dLon: 0.03, dLat: -0.03, radius_km: 2, precision: "mountain-area" },
		{ slug: "c", dLon: 0.4, dLat: 0.4, radius_km: 1, precision: "village" },
	],
	context: { linePx: 0.6, hardPx: 1.2 },
	contourLabels: { perBand: 3, areaPx: 360, spacingPx: 80, insetPx: 16, minRunPx: 9 },
	tiers: [
		{ rank: 0, maxUnitsPerPx: null },
		{ rank: 1, maxUnitsPerPx: 10 },
		{ rank: 2, maxUnitsPerPx: 2.5 },
		{ rank: 3, maxUnitsPerPx: 0.66 },
		{ rank: 4, maxUnitsPerPx: 0.16 },
	],
	rivers: { spacingPx: 150, chordPx: 40, joinUnits: 0.5, maxRank: 4 },
	ridges: {
		rows: 12,
		samples: 60,
		width: 300,
		spacing: 10,
		amplitude: 4,
		taper: 0.15,
		blurSigma: 3,
	},
	margin: 0.04,
}

async function run() {
	const source = createTileSource({ dir: path.join(paths.fixtures, "terrain"), offline: true })
	const raw = JSON.parse(await readFile(path.join(paths.fixtures, "context.json"), "utf8"))
	const ctx = { lines: raw.lines, lakes: raw.lakes, land: raw.land }
	const projection = makeProjection(FIXTURE.projection)
	const shared = (p) => projection(p)

	const scale = FIXTURE.projection.scale

	// coverage → cells → regions → the organic mask
	const origins = FIXTURE.origins.map((o) => ({
		slug: o.slug,
		kind: o.precision,
		geo: { lon: LON + o.dLon, lat: LAT + o.dLat, precision: o.precision, radius_km: o.radius_km },
	}))
	const disks = coverageDisks(origins, FIXTURE.detail, projection, scale)
	const cells = deriveCells(disks, CELL.z, projection, FIXTURE.detail.decimals)
	const regions = deriveRegions(cells, disks)
	const region = regions.find((r) => r.cells.some((c) => c.id === `${CELL.z}-${CELL.x}-${CELL.y}`))
	if (!region) throw new Error("geo:test: the fixture cell is not covered")
	const field = coverageField(fieldDisks(region.disks, scale, FIXTURE.mask.insetKm), FIXTURE.mask)
	const unitsPerKm = unitsPerKmAt(scale, LAT)
	const mask = rasterMask(region.rect, FIXTURE.mask.kmPerPx * unitsPerKm, field)
	const decoded = PNG.sync.read(encodeMask(mask))
	for (let i = 0; i < mask.data.length; i++)
		if (decoded.data[i * 4] !== mask.data[i])
			throw new Error("geo:test: the mask PNG does not round-trip")

	const cell = await renderCell({
		tile: CELL,
		region: region.id,
		params: FIXTURE.detail,
		contextParams: FIXTURE.context,
		labelParams: FIXTURE.contourLabels,
		has: (t) => `${t.x}/${t.y}` !== MISSING,
		labelAccept: (x, y) => field(x, y) >= 0.6,
		scale,
		source,
		ctx,
		projection,
	})

	// The whole fixture as plain polylines in the shared projection (frame code path)
	const bbox = [LON - SIDE_KM / 222, LAT - SIDE_KM / 222, LON + SIDE_KM / 222, LAT + SIDE_KM / 222]
	const frame = await renderTerrain({
		bbox,
		zoom: Z,
		margin: FIXTURE.margin,
		blurSigma: 1.5,
		intervals: [100],
		indexEvery: 5,
		simplify: 0.1,
		project: shared,
		minArea: 0.5,
		curve: false,
		source,
	})
	const ridges = renderRidges(frame.raw, bbox, FIXTURE.ridges)

	// River name anchors along the fixture river
	const rivers = raw.lines
		.filter((f) => f.properties.layer === "rivers")
		.map((f) => ({
			name: f.properties.name,
			name_zh: f.properties.name_zh,
			rank: 3,
			lines: [f.geometry.coordinates.map((c) => shared(c))],
		}))
	const anchors = riverAnchors(rivers, FIXTURE.tiers, FIXTURE.rivers)

	return stringify({
		coverage: {
			disks: disks.map((d) => ({ slug: d.slug, km: d.km, r: Math.round(d.r * 100) / 100 })),
			cells: cells.map((c) => ({ id: c.id, rect: c.rect, disks: c.disks })),
			regions: regions.map((r) => ({ id: r.id, rect: r.rect, cells: r.cells.map((c) => c.id) })),
		},
		mask: { rect: mask.rect, size: [mask.width, mask.height], rows: maskRows(mask, 2) },
		cell,
		frame: { interval: frame.interval, bands: frame.bands },
		ridges,
		riverAnchors: anchors,
	})
}

/** Import the runtime projection module (TypeScript) without a TS loader */
async function loadRuntimeProjection() {
	const file = path.join(appRoot, "src", "lib", "components", "map", "projection.ts")
	const { outputText } = ts.transpileModule(await readFile(file, "utf8"), {
		compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
	})
	return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`)
}

/** projection.ts vs d3, and vs the committed manifest's control points */
async function checkProjection() {
	const { createMercator } = await loadRuntimeProjection()
	const failures = []
	const TOL = 0.01
	const check = (label, a, b, tol = TOL) => {
		const err = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))
		if (!(err <= tol)) failures.push(`${label}: ${a} vs ${b} (off by ${err})`)
	}

	const manifest = JSON.parse(await readFile(paths.manifest, "utf8"))
	const params = [FIXTURE.projection, manifest.projection]
	let n = 0
	for (const p of params) {
		const d3 = makeProjection({ ...p, type: "mercator" })
		const rt = createMercator(p)
		for (let lon = 90; lon <= 150; lon += 2.5) {
			for (let lat = 10; lat <= 45; lat += 2.5) {
				const xy = d3([lon, lat])
				check(`forward ${lon},${lat}`, rt.forward(lon, lat), xy)
				check(`invert ${xy}`, rt.invert(xy[0], xy[1]), d3.invert(xy), 1e-7)
				n++
			}
		}
	}
	const rt = createMercator(manifest.projection)
	for (const [lon, lat, x, y] of manifest.projection.controlPoints ?? []) {
		check(`control point ${lon},${lat}`, rt.forward(lon, lat), [x, y])
		n++
	}
	if (!manifest.projection.controlPoints?.length)
		failures.push("maps-manifest.json has no projection.controlPoints; run `pnpm geo`")
	return { n, failures }
}

async function main() {
	const projection = await checkProjection()
	if (projection.failures.length) {
		console.error(
			`geo:test: projection.ts disagrees with d3-geo:\n  ${projection.failures
				.slice(0, 10)
				.join("\n  ")}`
		)
		process.exit(1)
	}

	const snapshotFile = path.join(paths.fixtures, "snapshot.json")
	const actual = await run()
	if (process.argv.includes("--update")) {
		await writeFile(snapshotFile, actual, "utf8")
		console.log(`geo:test: snapshot updated (${Buffer.byteLength(actual)} bytes)`)
		return
	}
	let expected
	try {
		expected = await readFile(snapshotFile, "utf8")
	} catch {
		console.error("geo:test: fixtures/snapshot.json is missing. Run `pnpm geo:test --update`.")
		process.exit(1)
	}
	if (actual === expected) {
		console.log(
			`geo:test ok · ${Buffer.byteLength(
				actual
			)} bytes match the snapshot · projection.ts matches d3 at ${projection.n} points`
		)
		return
	}
	let i = 0
	while (i < actual.length && actual[i] === expected[i]) i++
	const line = actual.slice(0, i).split("\n").length
	console.error(
		[
			`geo:test: output differs from fixtures/snapshot.json at line ${line} (char ${i}).`,
			`  expected: ${JSON.stringify(expected.slice(Math.max(0, i - 40), i + 40))}`,
			`  actual:   ${JSON.stringify(actual.slice(Math.max(0, i - 40), i + 40))}`,
			"If the pipeline change is intended, run `pnpm geo:test --update` and review the diff.",
		].join("\n")
	)
	process.exit(1)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
