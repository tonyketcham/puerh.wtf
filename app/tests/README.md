# Testing Documentation

## Test Structure

### Test Pages

Test pages are created in `src/app/tests/` and are protected from production deployment using the `TestPageWrapper` component.

### Recording Key Pattern

Components that need to be tested should accept a `recordingKey` prop that gets applied as a `data-recording-key` attribute to the main element. This allows tests to precisely target specific component instances even when multiple instances exist on the same page.

#### Example Component Usage:

```tsx
<RadarChart data={chartData} recordingKey="radar-chart-max" />
```

#### Example Test Usage:

```typescript
const radarChart = new RadarChartElement(page, "radar-chart-max")
await radarChart.expectToBeVisible()
```

### Test Page Wrapper

The `TestPageWrapper` component ensures test pages are only rendered in appropriate environments:

```tsx
import TestPageWrapper from "@/lib/components/TestPageWrapper"

export default function MyTestPage() {
	return <TestPageWrapper>{/* Test content here */}</TestPageWrapper>
}
```

**Environment Behavior:**

- ✅ **Development**: Test pages render normally (`NODE_ENV=development`)
- ✅ **Test export**: Test pages render when built with `PUERH_TEST_FIXTURES=1`.
- ❌ **Production**: Test pages show an unavailable-page message without that explicit flag.

`CI=true` and `NODE_ENV=test` do not enable production fixtures. Set the flag only for test
builds; changing the environment after a static export was built does not change its pages.

### Page Object Model

Test utilities are organized using the Page Object Model pattern:

- `tests/utils/radar-chart-element.ts` - Encapsulates RadarChart testing logic
- Each component should have its own element class for reusable test methods

#### Example Usage:

```typescript
const radarChart = new RadarChartElement(page, "my-recording-key")
await radarChart.waitForLoad()
await radarChart.expectToBeVisible()
await radarChart.expectDataPointsCount(10)
await radarChart.takeScreenshot("screenshot-name.png")
```

### Benefits

1. **Durable**: Tests target specific components using unique recording keys
2. **Reusable**: Element classes encapsulate common test operations
3. **Maintainable**: Clear separation between test logic and test data
4. **Production-safe**: Fixture content requires an explicit opt-in in production builds
5. **Multi-instance support**: Multiple instances of the same component can be tested on one page

### Running Tests

Run these commands from `app/`. Install Chromium once with `pnpm exec playwright install chromium`.
`PW_CHANNEL=msedge` or `PW_CHANNEL=chrome` can use an installed browser instead in either lane.

#### Development lane

```bash
# Run all tests against this checkout's Next dev server
pnpm test:dev

# Run specific test file
pnpm test:dev tests/radar-chart.test.ts

# Run tests with UI
pnpm test:dev --ui

# Run tests in headed mode (with browser visible)
pnpm test:dev --headed
```

**Notes:**

- `pnpm test` remains an alias for the development lane.
- Playwright starts its own Next/Flatbread processes on ports 3000/5057 and fails if a server
  already occupies the app port. Set `PW_PORT=3200` for Next and port 5200 for Flatbread;
  `PW_FLATBREAD_PORT` overrides the latter. In PowerShell use `$env:PW_PORT=3200`.
- Reuse requires an explicit `PW_REUSE_SERVER=1`. Verify which checkout owns the server first.
- Next allows one dev server per checkout; stop this checkout's existing dev server first.
- Results and HTML reports go to `test-results/dev/` and `playwright-report/dev/`.

#### Static export lane

Build the actual static pages with the fixtures enabled, then run the same browser scenarios:

```bash
PUERH_TEST_FIXTURES=1 pnpm build
pnpm test:export
```

In PowerShell:

```powershell
$env:PUERH_TEST_FIXTURES="1"
pnpm build
Remove-Item Env:PUERH_TEST_FIXTURES
pnpm test:export
```

The export lane serves only files in `out/` on port 3300 (`PW_PORT` overrides it). It starts
no Next or Flatbread server and never reuses an existing listener. Run it after the build,
without another process rebuilding `out/`. Build again without the fixture flag before using
that output for deployment. Results and reports go to `test-results/export/` and
`playwright-report/export/`.

`pnpm test:server` checks static routing, Flight/worker MIME types, HEAD requests, missing
assets, and path confinement using Node's test runner. The browser suite also checks that
client navigation preserves the document and live filters, rather than falling back to reloads.

#### CI Testing

Tests run automatically on:

- Pull requests to main branch
- Pushes to main branch

The CI workflow:

1. Installs dependencies
2. Installs Playwright browsers
3. Checks the static server and runs the development suite
4. Builds with `PUERH_TEST_FIXTURES=1` and runs the static export suite
5. Uploads test results and reports as artifacts

Test results and HTML reports are available as downloadable artifacts in the GitHub Actions workflow runs.
