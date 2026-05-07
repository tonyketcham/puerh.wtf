import type { PlaywrightTestConfig } from "@playwright/test"

const config: PlaywrightTestConfig = {
	webServer: {
		command: "pnpm dev",
		port: 3000,
		reuseExistingServer: !process.env.CI,
	},
	use: {
		baseURL: "http://localhost:3000",
	},
}

export default config
