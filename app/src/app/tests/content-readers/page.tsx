import assert from "node:assert/strict"
import { notFound } from "next/navigation"
import {
	getCategories,
	getExplorerSessions,
	getSession,
	getSessionRoutes,
	getVendors,
} from "@/lib/api"

/** Run real readers through Next so their server-only boundary stays enforced. */
export default async function ContentReadersTestPage() {
	const enabled = process.env.NODE_ENV === "development" || process.env.PUERH_TEST_FIXTURES === "1"
	if (!enabled) notFound()

	const [routes, sessions, vendors, categories, withPhotos, withoutPhotos, missing] =
		await Promise.all([
			getSessionRoutes(),
			getExplorerSessions(),
			getVendors(),
			getCategories(),
			getSession("2018-purple-lemon-sheng"),
			getSession("1998-river-song"),
			getSession("__content-reader-missing__"),
		])

	assert.ok(routes.length > 0)
	assert.equal(routes.length, sessions.length)
	for (const route of routes) {
		assert.deepEqual(Object.keys(route).sort(), ["_slug", "date"])
		assert.ok(route._slug)
		assert.ok(Number.isFinite(new Date(route.date).getTime()))
	}
	for (const session of sessions) {
		assert.ok(session.id && session._slug && session.title)
		for (const style of session.style ?? []) {
			assert.deepEqual(Object.keys(style).sort(), ["_slug", "category", "color", "id", "title"])
			assert.ok(style.id && style._slug && style.title)
			assert.ok(style.color === null || typeof style.color === "string")
			if (style.category) {
				assert.deepEqual(Object.keys(style.category).sort(), ["_slug", "color", "title"])
				assert.ok(style.category._slug && style.category.title)
			}
		}
		for (const vendor of session.vendor ?? []) {
			assert.ok(vendor._slug && vendor.title)
			assert.ok(vendor.image === null || typeof vendor.image === "string")
		}
	}
	assert.ok(categories.length > 0)
	for (const category of categories) {
		assert.deepEqual(Object.keys(category).sort(), ["_collection", "_slug", "color", "id", "title"])
		assert.ok(category.id && category._slug && category.title)
	}
	const sparseVendor = vendors.find((vendor) => vendor._slug === "verdant-tea")
	assert.ok(sparseVendor)
	assert.equal(sparseVendor.image, null)
	assert.ok(withPhotos)
	assert.ok(withPhotos.images?.length)
	assert.ok(withPhotos._content.html)
	assert.ok(withoutPhotos)
	assert.ok(!withoutPhotos.images?.length)
	assert.ok(withoutPhotos._content.html)
	assert.equal(missing, null)

	return (
		<output
			data-recording-key="content-reader-contracts"
			data-route-count={routes.length}
			data-session-count={sessions.length}
		>
			Content reader contracts passed
		</output>
	)
}
