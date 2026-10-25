import type { PlaywrightTestConfig } from "@playwright/test"

/**
 * Development tests start this checkout's Next and Flatbread servers on :3000/:5057.
 *
 * Occupied ports fail instead of silently testing another checkout. Set PW_PORT to use
 * another port, with Flatbread on PW_FLATBREAD_PORT (default PW_PORT + 2000).
 * Set PW_REUSE_SERVER=1 only to test a server whose checkout you have verified.
 *
 *   PW_PORT=3200 pnpm test        (PowerShell: $env:PW_PORT=3200; pnpm test)
 *
 * (Next allows one dev server per checkout: stop this checkout's own `pnpm dev` first.)
 *
 * The browser comes from Playwright: run `npx playwright install chromium` once.
 */
const customPort = process.env.PW_PORT ? Number(process.env.PW_PORT) : null
const port = customPort ?? 3000
const flatbreadPort = Number(process.env.PW_FLATBREAD_PORT || (customPort ? port + 2000 : 5057))

const config: PlaywrightTestConfig = {
	testDir: "./tests",
	outputDir: "test-results/dev",
	reporter: [["list"], ["html", { outputFolder: "playwright-report/dev", open: "never" }]],
	webServer: {
		command: `pnpm authoring:assets && pnpm exec flatbread start -p ${flatbreadPort} -X npx "next dev --turbopack -p ${port}"`,
		port,
		reuseExistingServer: process.env.PW_REUSE_SERVER === "1",
		env: { FLATBREAD_URL: `http://localhost:${flatbreadPort}/graphql` },
	},
	use: {
		baseURL: `http://localhost:${port}`,
		channel: process.env.PW_CHANNEL,
	},
}

export default config
