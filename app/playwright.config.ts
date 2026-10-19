import type { PlaywrightTestConfig } from "@playwright/test"

/**
 * Tests run against `pnpm dev` on :3000, reusing a server that is already up (outside CI).
 *
 * Another checkout's dev server on :3000 would silently be the one under test, so set
 * PW_PORT to run on a port of your own: Playwright then starts this checkout's dev server
 * there, with Flatbread on PW_FLATBREAD_PORT (default PW_PORT + 2000), and never reuses one.
 *
 *   PW_PORT=3200 pnpm test        (PowerShell: $env:PW_PORT=3200; pnpm test)
 *
 * (Next allows one dev server per checkout: stop this checkout's own `pnpm dev` first.)
 *
 * The browser comes from Playwright: run `npx playwright install chromium` once.
 */
const customPort = process.env.PW_PORT ? Number(process.env.PW_PORT) : null
const port = customPort ?? 3000
const flatbreadPort = Number(process.env.PW_FLATBREAD_PORT || port + 2000)

const config: PlaywrightTestConfig = {
	webServer: customPort
		? {
				command: `pnpm exec flatbread start -p ${flatbreadPort} -- next dev --turbopack -p ${port}`,
				port,
				reuseExistingServer: false,
				env: { FLATBREAD_URL: `http://localhost:${flatbreadPort}/graphql` },
		  }
		: {
				command: "pnpm dev",
				port,
				reuseExistingServer: !process.env.CI,
		  },
	use: {
		baseURL: `http://localhost:${port}`,
	},
}

export default config
