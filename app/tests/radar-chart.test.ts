import { expect, test } from "@playwright/test"
import { RadarChartElement } from "./utils/radar-chart-element"

test.describe("RadarChart Component", () => {
	test("renders correctly with all axes at maximum value (10)", async ({ page }) => {
		// Navigate to the test page with radar chart
		await page.goto("/tests/radar-chart-max")

		// Create radar chart element instance
		const radarChart = new RadarChartElement(page, "radar-chart-max")

		// Wait for the radar chart to load
		await radarChart.waitForLoad()

		// Wait for all animations to complete before testing
		await radarChart.waitForAnimationsComplete()

		// Check that the radar chart SVG container exists
		await radarChart.expectToBeVisible()

		// Check that all expected axes are present
		const expectedAxes = [
			"vegetal",
			"floral",
			"fruits",
			"spices",
			"wood",
			"earth",
			"nuts_roast",
			"cream",
			"stone",
			"umami",
		]
		await radarChart.expectAxesToBeVisible(expectedAxes)

		// Check that the radar shape is present (path element)
		await radarChart.expectRadarShapeToBeVisible()

		// Check that data points are present (circles for each axis)
		await radarChart.expectDataPointsCount(10)

		// Check that background circles are present
		await radarChart.expectBackgroundCirclesCount(5)

		// Check that axis lines are present
		await radarChart.expectAxisLinesCount(10)

		// Visual regression test - take screenshot after animations complete
		await radarChart.takeScreenshot("radar-chart-max-values.png")
	})

	test("renders correctly with all axes at minimum value (0)", async ({ page }) => {
		// Navigate to the test page with radar chart at minimum
		await page.goto("/tests/radar-chart-min")

		// Create radar chart element instance
		const radarChart = new RadarChartElement(page, "radar-chart-min")

		// Wait for the radar chart to load
		await radarChart.waitForLoad()

		// Wait for all animations to complete before testing
		await radarChart.waitForAnimationsComplete()

		// Check that the radar chart SVG container exists
		await radarChart.expectToBeVisible()

		// Check that data points are at center (all values 0)
		await radarChart.expectDataPointsCount(10)

		// Visual regression test - take screenshot after animations complete
		await radarChart.takeScreenshot("radar-chart-min-values.png")
	})

	test("handles multiple radar charts on same page", async ({ page }) => {
		// Navigate to the comprehensive test page with multiple radar charts
		await page.goto("/tests/radar-chart-comprehensive")

		// Create radar chart element instances for each chart
		const maxRadarChart = new RadarChartElement(page, "radar-chart-max-comprehensive")
		const minRadarChart = new RadarChartElement(page, "radar-chart-min-comprehensive")
		const mixedRadarChart = new RadarChartElement(page, "radar-chart-mixed-comprehensive")
		const singleRadarChart = new RadarChartElement(page, "radar-chart-single-comprehensive")

		// Wait for all radar charts to load
		await maxRadarChart.waitForLoad()
		await minRadarChart.waitForLoad()
		await mixedRadarChart.waitForLoad()
		await singleRadarChart.waitForLoad()

		// Wait for all animations to complete on all charts
		await maxRadarChart.waitForAnimationsComplete()
		await minRadarChart.waitForAnimationsComplete()
		await mixedRadarChart.waitForAnimationsComplete()
		await singleRadarChart.waitForAnimationsComplete()

		// Test that all charts are visible
		await maxRadarChart.expectToBeVisible()
		await minRadarChart.expectToBeVisible()
		await mixedRadarChart.expectToBeVisible()
		await singleRadarChart.expectToBeVisible()

		// Test that each chart has the correct number of data points
		await maxRadarChart.expectDataPointsCount(10)
		await minRadarChart.expectDataPointsCount(10)
		await mixedRadarChart.expectDataPointsCount(10)
		await singleRadarChart.expectDataPointsCount(10)

		// Test that each chart has the correct number of background circles
		await maxRadarChart.expectBackgroundCirclesCount(5)
		await minRadarChart.expectBackgroundCirclesCount(5)
		await mixedRadarChart.expectBackgroundCirclesCount(5)
		await singleRadarChart.expectBackgroundCirclesCount(5)

		// Take screenshots of specific charts after animations complete
		await maxRadarChart.takeScreenshot("radar-chart-max-comprehensive.png")
		await singleRadarChart.takeScreenshot("radar-chart-single-comprehensive.png")
	})
})
