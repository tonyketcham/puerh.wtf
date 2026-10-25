import assert from "node:assert/strict"
import { notFound } from "next/navigation"
import {
	getCategories,
	getExplorerSessions,
	getSession,
	getSessionRoutes,
	getVendors,
} from "@/lib/api"
import type { ExplorerSession } from "@/lib/types/session"

/** Run real readers through Next so their server-only boundary stays enforced. */
export default async function ContentReadersTestPage() {
	const enabled = process.env.NODE_ENV === "development" || process.env.PUERH_TEST_FIXTURES === "1"
	if (!enabled) notFound()

	const [routes, sessions, vendors, categories] = await Promise.all([
		getSessionRoutes(),
		getExplorerSessions(),
		getVendors(),
		getCategories(),
	])
	const nullableText = (value: unknown) => value === null || typeof value === "string"
	const routeSlugs = new Set(routes.map((route) => route._slug))
	assert.equal(routes.length, sessions.length)
	assert.deepEqual(routeSlugs, new Set(sessions.map((session) => session._slug)))
	for (const route of routes) {
		assert.deepEqual(Object.keys(route).sort(), ["_slug", "date"])
		assert.ok(typeof route._slug === "string" && route._slug)
		assert.ok(typeof route.date === "string" && Number.isFinite(Date.parse(route.date)))
	}
	for (const session of sessions) {
		assert.ok(session.id && session._slug && session.title)
		assert.ok(session.style === null || Array.isArray(session.style))
		assert.ok(session.vendor === null || Array.isArray(session.vendor))
		assert.ok(session.images === null || Array.isArray(session.images))
		for (const style of session.style ?? []) {
			assert.deepEqual(Object.keys(style).sort(), ["_slug", "category", "color", "id", "title"])
			assert.ok(style.id && style._slug && style.title)
			assert.ok(nullableText(style.color))
			if (style.category) {
				assert.deepEqual(Object.keys(style.category).sort(), ["_slug", "color", "title"])
				assert.ok(style.category._slug && style.category.title)
				assert.ok(nullableText(style.category.color))
			}
		}
		for (const vendor of session.vendor ?? []) {
			assert.ok(vendor._slug && vendor.title)
			assert.ok(nullableText(vendor.image))
		}
	}
	for (const category of categories) {
		assert.deepEqual(Object.keys(category).sort(), ["_collection", "_slug", "color", "id", "title"])
		assert.ok(category.id && category._slug && category.title)
		assert.ok(nullableText(category.color))
	}
	for (const vendor of vendors) {
		assert.ok(vendor.id && vendor._slug && vendor.title)
		assert.ok(nullableText(vendor.image))
	}

	// Exercise photo and sparse-image records when present; no record must stay sparse forever.
	const samples = new Map<string, ExplorerSession>()
	for (const sample of [
		sessions[0],
		sessions.find((session) => !!session.images?.length),
		sessions.find((session) => !session.images?.length),
	]) {
		if (sample) samples.set(sample._slug, sample)
	}
	let missingSlug = "content-reader-missing"
	while (routeSlugs.has(missingSlug)) missingSlug += "-missing"
	await Promise.all([
		getSession(missingSlug).then((missing) => assert.equal(missing, null)),
		...Array.from(samples.values(), async (sample) => {
			const detail = await getSession(sample._slug)
			assert.ok(detail)
			assert.equal(detail._slug, sample._slug)
			assert.equal(detail.date, sample.date)
			assert.ok(detail.images === null || Array.isArray(detail.images))
			assert.deepEqual(detail.images, sample.images)
			assert.equal(typeof detail._content?.html, "string")
		}),
	])

	return (
		<output
			data-recording-key="content-reader-contracts"
			data-route-count={routes.length}
			data-session-count={sessions.length}
			data-sample-count={samples.size}
		>
			Content reader contracts passed
		</output>
	)
}
