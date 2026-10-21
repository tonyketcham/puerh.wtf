import { expect, test } from "@playwright/test"
import type { WorkerIn, WorkerOut } from "../src/lib/components/map/terrainWorker"

class StubWorker extends EventTarget {
	static instances: StubWorker[] = []
	held = new Set<string>()
	terminated = false
	constructor() {
		super()
		StubWorker.instances.push(this)
	}
	postMessage(message: WorkerIn) {
		if (message.type === "load" && this.held.has(message.url))
			queueMicrotask(() => this.emit({ type: "loaded", url: message.url }))
	}
	terminate() {
		this.terminated = true
	}
	emit(message: WorkerOut) {
		if (message.type === "loaded") this.held.add(message.url)
		this.dispatchEvent(new MessageEvent("message", { data: message }))
	}
}

let terrain: typeof import("../src/lib/components/map/terrainWorker")
const originals = new Map<string, PropertyDescriptor | undefined>()

test.beforeEach(async ({}, info) => {
	StubWorker.instances = []
	for (const [key, value] of Object.entries({
		window: {},
		navigator: { hardwareConcurrency: 4 },
		Worker: StubWorker,
		OffscreenCanvas: class {},
		createImageBitmap: () => {},
	})) {
		originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
		Object.defineProperty(globalThis, key, { value, configurable: true })
	}
	// A new module instance gives each test its own page-wide worker pool.
	terrain = await import(
		new URL(
			`../src/lib/components/map/terrainWorker.ts?test=${info.testId}-${info.retry}`,
			import.meta.url
		).href
	)
})

test.afterEach(() => {
	for (const [key, descriptor] of originals) {
		if (descriptor) Object.defineProperty(globalThis, key, descriptor)
		else Reflect.deleteProperty(globalThis, key)
	}
	originals.clear()
})

test("a retried sheet waits for the worker that failed, despite a cached sibling reply", async () => {
	const pool = terrain.terrainWorker()!
	const [first, second] = StubWorker.instances
	expect(StubWorker.instances).toHaveLength(2)
	let failures = 0
	let completions = 0
	pool.load(
		"/sheet.json",
		() => completions++,
		() => failures++
	)
	first.emit({ type: "failed", url: "/sheet.json" })
	second.emit({ type: "loaded", url: "/sheet.json" })
	expect(failures).toBe(1)
	pool.load("/sheet.json", () => completions++)
	await Promise.resolve() // a cached worker replies before the failed worker finishes fetching
	expect(pool.ready("/sheet.json")).toBe(false)
	expect(completions).toBe(0)
	first.emit({ type: "loaded", url: "/sheet.json" })
	expect(pool.ready("/sheet.json")).toBe(true)
	expect(completions).toBe(1)
})

test("an error after a sibling has answered retires the whole pool and enables fallback once", () => {
	const pool = terrain.terrainWorker()!
	const [first, second] = StubWorker.instances
	let fallbacks = 0
	const off = terrain.onTerrainWorkerFail(() => fallbacks++)
	try {
		pool.load("/sheet.json", () => {})
		first.emit({ type: "loaded", url: "/sheet.json" })
		second.dispatchEvent(new Event("error"))
		first.dispatchEvent(new Event("error"))
		expect(fallbacks).toBe(1)
		expect(StubWorker.instances.every((worker) => worker.terminated)).toBe(true)
		expect(terrain.terrainWorker()).toBeNull()
	} finally {
		off()
	}
})
