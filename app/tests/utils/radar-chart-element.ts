import { expect, type Page, type Locator } from "@playwright/test"

export class RadarChartElement {
	private page: Page
	private recordingKey: string
	private element: Locator

	constructor(page: Page, recordingKey: string) {
		this.page = page
		this.recordingKey = recordingKey
		this.element = page.locator(`svg[data-recording-key="${recordingKey}"]`)
	}

	async waitForLoad() {
		await this.page.waitForSelector(`svg[data-recording-key="${this.recordingKey}"]`)
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

	async takeScreenshot(filename: string) {
		await expect(this.element).toHaveScreenshot(filename)
	}

	getElement() {
		return this.element
	}
}
