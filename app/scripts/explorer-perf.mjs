import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { chromium, expect } from "@playwright/test"

// Keep the original positional URL/output interface and headed default.
const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		scenario: { type: "string", default: "vintage" },
		headless: { type: "boolean", default: false },
		build: { type: "string" },
		source: { type: "string" },
	},
})
const routes = {
	vintage: "/vendors/",
	"map-pan-zoom": "/origins/?at=yiwu",
	"origin-scroll": "/origins/xishuangbanna/",
}
assert.ok(Object.hasOwn(routes, values.scenario), "Unknown interaction scenario")
assert.ok(positionals.length <= 2, "Expected at most positional URL and output.json")
const scenario = values.scenario
const url = new URL(positionals[0] || "http://localhost:3000" + routes[scenario])
assert.ok(["http:", "https:"].includes(url.protocol), "Use an HTTP(S) page URL")
const output = path.resolve(positionals[1] || ".cache/explorer-perf/latest.json")
const viewport = { width: 1600, height: 1000 }
const channel = process.env.PW_CHANNEL || "msedge"
const tailMs = 600
const report = {
	scenario,
	requestedURL: url.href,
	callerSuppliedIdentity: {
		build: values.build ?? null,
		source: values.source ?? null,
		verified: false,
	},
	environment: {
		engine: "chromium",
		channel,
		headless: values.headless,
		mode: values.headless ? "headless validation" : "headed",
		viewport,
	},
	measurement: {
		kind: "requestAnimationFrame intervals and observed long tasks",
		window: "first input marker through 600 ms after input completion",
		frameInclusion: "intervals whose ending timestamp is inside the window",
		percentile: "nearest rank",
		postInputMs: tailMs,
	},
	actions: [],
	errors: [],
}
const browser = await chromium.launch({ channel, headless: values.headless })
let page

function summarize(frames) {
	const intervals = frames.map((frame) => frame.dt).filter((dt) => dt > 0).sort((a, b) => a - b)
	assert.ok(intervals.length, "Collector produced no positive frame-interval samples")
	const percentile = (p) => intervals[Math.max(0, Math.ceil(intervals.length * p) - 1)]
	return {
		frameSamples: intervals.length,
		p50Ms: percentile(0.5),
		p95Ms: percentile(0.95),
		maxMs: intervals.at(-1),
		framesOver8_33Ms: intervals.filter((dt) => dt > 8.33).length,
		framesOver16_67Ms: intervals.filter((dt) => dt > 16.67).length,
		framesOver25Ms: intervals.filter((dt) => dt > 25).length,
	}
}

async function readWindow(start, end) {
	return page.evaluate(({ start, end }) => {
		const state = window.__interactionPerf
		if (!state) throw new Error("Interaction collector disappeared; the page may have navigated")
		state.flushTasks()
		return {
			frames: state.frames.filter((frame) => frame.t >= start && frame.t < end),
			inputs: state.inputs.filter((event) => event.t >= start && event.t < end),
			longTasks: state.tasks.filter(
				(task) => task.start < end && task.start + task.duration > start
			),
		}
	}, { start, end })
}

async function measureAction(label, perform, snapshot, verify) {
	report.activeAction = label
	const before = await snapshot()
	const invokedMs = await page.evaluate(() => performance.now())
	await perform()
	const inputCompletedMs = await page.evaluate(() => performance.now())
	const endMs = inputCompletedMs + tailMs
	await page.waitForTimeout(tailMs)
	const after = await snapshot()
	const samples = await readWindow(invokedMs, endMs)
	assert.ok(samples.inputs.length > 0, label + ": no trusted input events were observed")
	const startMs = samples.inputs[0].t
	const frames = samples.frames.filter((frame) => frame.t >= startMs)
	const longTasks = samples.longTasks.filter((task) => task.start + task.duration > startMs)
	const action = {
		action: label,
		invokedMs,
		startMs,
		inputCompletedMs,
		endMs,
		before,
		after,
		inputEvents: samples.inputs.length,
		...summarize(frames),
		longTasks,
		effectVerified: false,
	}
	report.actions.push(action)
	verify(before, after)
	action.effectVerified = true
	delete report.activeAction
}

async function cameraSnapshot(map) {
	return map.evaluate((root) => {
		const svg = root.querySelector("[data-map-pane] > svg")
		if (!(svg instanceof SVGSVGElement)) throw new Error("Map has no rendered SVG")
		const view = (svg.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number)
		if (view.length !== 4 || !view.every(Number.isFinite) || view[2] <= 0)
			throw new Error("Map has no valid camera viewBox")
		const bounds = root.getBoundingClientRect()
		const screen = svg.getScreenCTM()
		if (!screen || bounds.width <= 0 || bounds.height <= 0)
			throw new Error("Map has no measurable screen transform")
		// The viewBox is an overscanned backing area; live panning also uses a CSS
		// transform. Read world coordinates at fixed map-root screen positions.
		const inverse = screen.inverse()
		const y = bounds.top + bounds.height / 2
		const left = new DOMPoint(bounds.left, y).matrixTransform(inverse)
		const right = new DOMPoint(bounds.right, y).matrixTransform(inverse)
		const center = new DOMPoint(bounds.left + bounds.width / 2, y).matrixTransform(inverse)
		const worldWidth = Math.hypot(right.x - left.x, right.y - left.y)
		if (![center.x, center.y, worldWidth].every(Number.isFinite) || worldWidth <= 0)
			throw new Error("Map screen transform has no finite world coordinates")
		return { viewBox: view, worldCenter: { x: center.x, y: center.y }, worldWidth }
	})
}

async function clearMapPoint(map) {
	return map.evaluate((root) => {
		const r = root.getBoundingClientRect()
		for (const y of [0.4, 0.6, 0.3, 0.7])
			for (const x of [0.35, 0.65, 0.5]) {
				const px = r.left + x * r.width
				const py = r.top + y * r.height
				const element = document.elementFromPoint(px, py)
				if (
					element &&
					root.contains(element) &&
					!element.closest("a, button, input, select, textarea, [data-map-ui]")
				)
					return { x: px, y: py }
			}
		throw new Error("No clear map surface to pan")
	})
}

async function documentGutterPoint() {
	return page.locator("main").first().evaluate((main) => {
		const r = main.getBoundingClientRect()
		for (const offset of [8, 16, 24])
			for (const fraction of [0.45, 0.6, 0.3]) {
				const x = r.left + offset
				const y = innerHeight * fraction
				const element = document.elementFromPoint(x, y)
				if (
					element &&
					main.contains(element) &&
					!element.closest(
						"a, button, input, select, textarea, [data-map-pane], [data-origins-map], " +
						"[data-map-ui], .simplebar-content-wrapper, [data-overlay-panel]"
					)
				)
					return { x, y }
			}
		throw new Error("No unobstructed main gutter for document scrolling")
	})
}

try {
	report.environment.browserVersion = browser.version()
	page = await browser.newPage({ viewport })
	await page.emulateMedia({ reducedMotion: "no-preference" })
	page.on("pageerror", (error) => report.errors.push(error.message))
	await page.goto(url.href)
	if (scenario === "vintage")
		await expect(page.getByRole("group", { name: "Filter by vintage" })).toBeVisible()
	else if (scenario === "map-pan-zoom")
		await expect(
			page.locator("[data-origins-map=index] [data-map-pane] > svg").first()
		).toBeVisible()
	else
		await expect(page.locator("[data-entity-root][data-entity-kind=origin]")).toBeVisible()
	await page.waitForTimeout(1200)
	report.environment = {
		...report.environment,
		...await page.evaluate(() => ({
			userAgent: navigator.userAgent,
			reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
			actualViewport: { width: innerWidth, height: innerHeight },
		})),
	}
	await page.evaluate(() => {
		const state = {
			running: true,
			frames: [],
			inputs: [],
			tasks: [],
			longTaskSupported: PerformanceObserver.supportedEntryTypes.includes("longtask"),
		}
		window.__interactionPerf = state
		let previous
		const frame = (t) => {
			if (!state.running) return
			if (previous !== undefined) state.frames.push({ t, dt: t - previous })
			previous = t
			requestAnimationFrame(frame)
		}
		requestAnimationFrame(frame)
		const input = (event) => {
			if (event.isTrusted)
				state.inputs.push({ t: performance.now(), type: event.type })
		}
		const types = ["pointerdown", "pointerup", "pointermove", "wheel", "keydown"]
		for (const type of types) document.addEventListener(type, input, { capture: true, passive: true })
		const appendTasks = (entries) => state.tasks.push(
			...entries.map((entry) => ({ start: entry.startTime, duration: entry.duration }))
		)
		const observer = state.longTaskSupported
			? new PerformanceObserver((list) => appendTasks(list.getEntries()))
			: null
		observer?.observe({ type: "longtask" })
		state.flushTasks = () => appendTasks(observer?.takeRecords() || [])
		state.stop = () => {
			state.running = false
			state.flushTasks()
			observer?.disconnect()
			for (const type of types) document.removeEventListener(type, input, true)
		}
	})
	const idleStartMs = await page.evaluate(() => performance.now())
	await page.waitForTimeout(1000)
	const idleEndMs = await page.evaluate(() => performance.now())
	const idle = await readWindow(idleStartMs, idleEndMs)
	report.idleCalibration = {
		startMs: idleStartMs,
		endMs: idleEndMs,
		...summarize(idle.frames),
		longTasks: idle.longTasks,
	}

	if (scenario === "vintage") {
		const track = page.getByRole("group", { name: "Filter by vintage" })
		const tokens = page.getByRole("button", { name: /Remove filter vintage:/ })
		assert.equal(await tokens.count(), 0, "Start the vintage scenario without a vintage filter")
		const snapshot = async () => ({
			years: new URL(page.url()).searchParams.get("years"),
			tokens: await tokens.allTextContents(),
		})
		for (const fraction of [0.4, 0.75, 0.05]) {
			await measureAction(
				"select vintage at " + fraction,
				async () => {
					const box = await track.boundingBox()
					assert.ok(box && box.width > 0, "Vintage ruler has no measurable geometry")
					await track.click({ position: { x: box.width * fraction, y: box.height / 2 } })
				},
				snapshot,
				(before, after) => {
					assert.ok(after.tokens.length > 0, "Vintage input created no filter token")
					assert.ok(after.years && after.years !== before.years, "Vintage input did not change years")
				}
			)
			await measureAction(
				"clear vintage",
				() => tokens.click(),
				snapshot,
				(before, after) => {
					assert.ok(before.tokens.length > 0, "No vintage filter was available to clear")
					assert.equal(after.tokens.length, 0, "Clear did not remove the vintage filter")
					assert.equal(after.years, null, "Clear did not remove years from the URL")
				}
			)
		}
	} else if (scenario === "map-pan-zoom") {
		const map = page.locator("[data-origins-map=index]")
		const snapshot = () => cameraSnapshot(map)
		await measureAction(
			"pan map with eight pointer steps",
			async () => {
				const start = await clearMapPoint(map)
				await page.mouse.move(start.x, start.y)
				await page.mouse.down()
				try {
					for (let i = 1; i <= 8; i++) {
						await page.mouse.move(start.x + i * 7, start.y + i * 8)
						await page.evaluate(() => new Promise(requestAnimationFrame))
					}
				} finally {
					await page.mouse.up()
				}
			},
			snapshot,
			(before, after) => assert.ok(
				Math.hypot(
					after.worldCenter.x - before.worldCenter.x,
					after.worldCenter.y - before.worldCenter.y
				) > before.worldWidth * 0.01,
				"Pan input did not move the camera"
			)
		)
		for (const [label, direction] of [["Zoom out (−)", 1], ["Zoom in (+)", -1], ["Back to Yunnan", 1]]) {
			await measureAction(
				label,
				() => map.getByRole("button", { name: label, exact: true }).click(),
				snapshot,
				(before, after) => assert.ok(
					direction > 0
						? after.worldWidth > before.worldWidth * 1.2
						: after.worldWidth < before.worldWidth / 1.2,
					label + " did not change the camera scale"
				)
			)
		}
	} else {
		const point = await documentGutterPoint()
		const snapshot = () => page.evaluate(() => {
			const scroll = document.scrollingElement
			if (!scroll) throw new Error("Document has no scrolling element")
			return { top: scroll.scrollTop, max: scroll.scrollHeight - scroll.clientHeight }
		})
		for (const delta of [560, -560, 760, -760]) {
			await measureAction(
				delta > 0 ? "scroll origin page down " + delta : "scroll origin page up " + -delta,
				async () => {
					await page.mouse.move(point.x, point.y)
					await page.mouse.wheel(0, delta)
				},
				snapshot,
				(before, after) => {
					assert.ok(before.max > 0, "Origin page has no document scroll range")
					assert.ok(
						delta > 0 ? after.top > before.top + 1 : after.top < before.top - 1,
						"Wheel input did not scroll the document in the requested direction"
					)
				}
			)
		}
	}
	assert.equal(report.actions.length, scenario === "vintage" ? 6 : 4, "Scenario did not complete")
	assert.equal(report.errors.length, 0, "Page errors occurred during collection")
} catch (error) {
	report.failure = error instanceof Error ? error.message : String(error)
} finally {
	if (page) {
		report.finalURL = page.url()
		try {
			report.raw = await page.evaluate(() => {
				const state = window.__interactionPerf
				if (!state) return null
				state.stop()
				return {
					frames: state.frames,
					inputEvents: state.inputs,
					longTasks: state.tasks,
					longTaskSupported: state.longTaskSupported,
				}
			})
			if (!report.raw && !report.failure) report.failure = "Collector returned no raw observations"
			report.lists = await page.locator("#explorer-view-panel [data-virtual-list]").evaluateAll(
				(lists) => lists.map((list) => ({
					logicalRows: Number(list.getAttribute("data-virtual-total")),
					renderedRows: list.children.length,
				}))
			)
		} catch (error) {
			report.collectionError = String(error)
			report.failure ||= "Unable to read the collector observations"
		}
	}
	report.status = report.failure ? "failed" : "complete"
	try {
		await mkdir(path.dirname(output), { recursive: true })
		await writeFile(output, JSON.stringify(report, null, 2) + "\n")
		console.log(JSON.stringify({
			output,
			status: report.status,
			scenario,
			environment: report.environment,
			idleCalibration: report.idleCalibration,
			actions: report.actions,
			failure: report.failure,
		}, null, 2))
	} finally {
		await browser.close()
	}
}
if (report.failure) throw new Error(report.failure + " (observations: " + output + ")")
