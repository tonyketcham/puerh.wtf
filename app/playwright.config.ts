import type { PlaywrightTestConfig } from "@playwright/test"

const config: PlaywrightTestConfig = {
	webServer: {
		command: "pnpm dev",
		port: 3000,
		reuseExistingServer: !process.env.CI,
	},
}

export default config
