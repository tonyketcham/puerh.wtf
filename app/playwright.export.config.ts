import type { PlaywrightTestConfig } from "@playwright/test"
import base from "./playwright.config"

const port = Number(process.env.PW_PORT || 3300)
const baseURL = `http://127.0.0.1:${port}`

/** Tests the existing static export. Build with PUERH_TEST_FIXTURES=1 first. */
const config: PlaywrightTestConfig = {
	...base,
	outputDir: "test-results/export",
	reporter: [["list"], ["html", { outputFolder: "playwright-report/export", open: "never" }]],
	webServer: {
		command: `node scripts/serve-export.mjs ${port}`,
		url: baseURL,
		reuseExistingServer: false,
	},
	use: { ...base.use, baseURL },
}

export default config
