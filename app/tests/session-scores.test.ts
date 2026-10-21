import { expect, test } from "@playwright/test"
import { isRated, hasFinishProfile, flavorMidpoint } from "../src/lib/sessionScores"
import { seriesFor, valuesAtPhase } from "../src/lib/components/dataviz/radar/geometry"
import { sortSessions } from "../src/lib/sessionSort"
import { FLAVOR_AXES, type ExplorerSession, type SessionFlavorAxes } from "../src/lib/types/session"

const profile = (finish: number | null): SessionFlavorAxes =>
	Object.fromEntries(FLAVOR_AXES.map((axis) => [axis, { start: 6, finish }])) as SessionFlavorAxes
const session = (slug: string, rating: number | null, finish: number | null): ExplorerSession => ({
	id: slug,
	_slug: slug,
	_collection: "Session",
	title: slug,
	date: "2021-01-01",
	production_year: 2020,
	excerpt: "",
	style: [],
	vendor: [],
	images: null,
	rating,
	notes: null,
	flavor_axes: profile(finish),
	brewing: null,
})

test("null and omitted finishes keep a single profile; a recorded zero remains a phase", () => {
	for (const finish of [null, undefined]) {
		const data = Object.fromEntries(FLAVOR_AXES.map((axis) => [axis, { start: 6, finish }]))
		expect(hasFinishProfile(data)).toBe(false)
		const series = seriesFor([...FLAVOR_AXES], data)
		expect(valuesAtPhase(series, 0)).toEqual(valuesAtPhase(series, 1))
	}
	expect(hasFinishProfile(profile(0))).toBe(true)
	expect(valuesAtPhase(seriesFor([...FLAVOR_AXES], profile(0)), 1)).toEqual(
		FLAVOR_AXES.map(() => 0)
	)
	expect(flavorMidpoint(profile(null), "cream")).toBe(6)
})

test("unrated cards and aggregates exclude sentinel ratings and unscored finishes", async ({
	page,
}) => {
	await page.goto("/tests/session-score-states/")
	const checks = JSON.parse(await page.locator("[data-score-checks]").innerText())
	expect(checks).toEqual({
		mean: 40,
		unratedRank: null,
		ratedRank: { rank: 1, of: 2 },
		missingFinish: null,
		mixedFinish: 8,
	})
	await expect(page.locator("[data-score-state=unrated]")).not.toContainText("/100")
	await expect(page.locator("[data-score-state=rated]")).toContainText("80/100")
	await expect(page.locator("[data-score-state=zero]")).toContainText("0/100")
	await expect(page.locator("[data-mini-single] polygon")).toHaveCount(3)
	await expect(page.locator("[data-mini-double] polygon")).toHaveCount(4)
	const sessions = [
		session("unrated", -1, null),
		session("rated", 80, 8),
		session("zero", 0, 0),
		session("absent", null, null),
	]
	expect(
		sortSessions(sessions, "rating")
			.slice(0, 2)
			.map((s) => s._slug)
	).toEqual(["rated", "zero"])
	expect(isRated(-1)).toBe(false)
	expect(isRated(0)).toBe(true)
	expect(isRated(NaN)).toBe(false)
})

test("single-profile session has no phase control or ghost outline", async ({ page }) => {
	await page.goto("/sessions/2020/12/2019-dripd-obitters/")
	await expect(page.locator("[data-flavor-profile]")).toBeVisible()
	await expect(page.getByRole("slider", { name: "Flavor phase, start to finish" })).toHaveCount(0)
	await expect(page.locator("[data-radar-ghost]")).toHaveCount(0)
	await expect(page.locator("[data-radar-shape=current]")).toBeVisible()
})

test("scored finishes retain their phase control", async ({ page }) => {
	await page.goto("/sessions/2021/01/2015-zsl-wa-long/")
	await expect(page.getByRole("slider", { name: "Flavor phase, start to finish" })).toBeVisible()
})
