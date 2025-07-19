import { expect, type Page } from "@playwright/test"
import { AnimatedElementBase } from "./animated-element-base"

export class RadarChartElement extends AnimatedElementBase {
	constructor(page: Page, recordingKey: string) {
		super(page, recordingKey, "svg")
	}

	async expectToBeVisible() {
		await expect(this.element).toBeVisible()
	}

	async expectAxesToBeVisible(axes: string[]) {
		for (const axis of axes) {
			await expect(this.element.locator(`text=${axis}`)).toBeVisible()
		}
	}

	async expectRadarShapeToBeVisible() {
		const radarPath = this.element.locator("path")
		await expect(radarPath).toBeVisible()
	}

	async expectDataPointsCount(count: number) {
		const dataPoints = this.element.locator('circle[r="4"]')
		await expect(dataPoints).toHaveCount(count)
	}

	async expectBackgroundCirclesCount(count: number) {
		const backgroundCircles = this.element.locator('circle[fill="none"]')
		await expect(backgroundCircles).toHaveCount(count)
	}

	async expectAxisLinesCount(count: number) {
		const axisLines = this.element.locator("line")
		await expect(axisLines).toHaveCount(count)
	}
}
