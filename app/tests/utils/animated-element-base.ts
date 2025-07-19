import { expect, type Page, type Locator } from "@playwright/test"

export abstract class AnimatedElementBase {
	protected page: Page
	protected recordingKey: string
	protected element: Locator

	constructor(page: Page, recordingKey: string, selector: string) {
		this.page = page
		this.recordingKey = recordingKey
		this.element = page.locator(`${selector}[data-recording-key="${recordingKey}"]`)
	}

	async waitForLoad() {
		await this.page.waitForSelector(`[data-recording-key="${this.recordingKey}"]`)
	}

	async waitForAnimationsComplete() {
		// Generic method that waits for any component to signal animation completion
		// This pattern can be reused for any animated component that sets data-animations-complete="true"
		await this.page.waitForFunction(
			(recordingKey) => {
				const element = document.querySelector(`[data-recording-key="${recordingKey}"]`)
				return element?.getAttribute("data-animations-complete") === "true"
			},
			this.recordingKey,
			{ timeout: 10000 } // Generous timeout for CI environments
		)
	}

	async takeScreenshot(filename: string) {
		await expect(this.element).toHaveScreenshot(filename)
	}

	getElement() {
		return this.element
	}
}
