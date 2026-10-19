#!/usr/bin/env node
/**
 * geo:test (CI matrix, no network): run the real pipeline on a committed fixture
 * (4 terrarium tiles at z12 around Yiwu + synthetic context lines) and compare the
 * output with fixtures/snapshot.json byte for byte. Proves determinism and path
 * handling on Windows, macOS and Linux.
 *
 * The parameters below are fixed on purpose: tuning params.mjs never touches the
 * snapshot, but a change to pipeline code that alters output does.
 *
 * Usage: pnpm geo:test            compare
 *        pnpm geo:test --update   rewrite the snapshot (review the diff!)
 */
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { renderInset } from "./lib/inset.mjs"
import { makeProjection } from "./lib/project.mjs"
import { renderRidges, renderTerrain } from "./lib/render.mjs"
import { createTileSource, pxToLat, pxToLon } from "./lib/tiles.mjs"
import { paths, stringify } from "./lib/util.mjs"

const Z = 12
// The shared corner of tiles 3202–3203 × 1791–1792
const LON = pxToLon(3203 * 256, Z)
const LAT = pxToLat(1792 * 256, Z)
const SIDE_KM = 12

const FIXTURE = {
	projection: {
		type: "conicEqualArea",
		parallels: [20, 30],
		rotate: [-102, 0],
		center: [0, 25],
		scale: 30000,
		translate: [0, 0],
	},
	inset: {
		size: 360,
		displayPx: 360,
		blurSigma: 2.5,
		intervals: [50, 100],
		maxBands: 30,
		indexEvery: 5,
		simplify: 0.06,
		rivers: 10,
		lakes: 10,
	},
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
	const ctx = { lines: raw.lines, lakes: raw.lakes }
	const sharedProjection = makeProjection(FIXTURE.projection)
	const shared = (p) => sharedProjection(p)

	const KM_PER_DEG = 111.195
	const half = (SIDE_KM / 2) * 1.08 // as deriveInsets: cover the square's corners
	const dLat = half / KM_PER_DEG
	const dLon = half / (KM_PER_DEG * Math.cos((LAT * Math.PI) / 180))
	const bbox = [LON - dLon, LAT - dLat, LON + dLon, LAT + dLat].map(
		(v) => Math.round(v * 1e3) / 1e3
	)

	const inset = await renderInset({
		id: "fixture",
		lon: LON,
		lat: LAT,
		sideKm: SIDE_KM,
		bbox,
		zoom: Z,
		origin: { precision: "village", confidence: "high", radius_km: 1, elevation_m: [1200, 1400] },
		params: FIXTURE.inset,
		margin: FIXTURE.margin,
		source,
		ctx,
		shared,
	})

	// The same grid as plain polylines in the shared projection (frame code path)
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

	return stringify({
		inset,
		frame: { interval: frame.interval, bands: frame.bands },
		ridges,
	})
}

async function main() {
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
		console.log(`geo:test ok · ${Buffer.byteLength(actual)} bytes match the snapshot`)
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
