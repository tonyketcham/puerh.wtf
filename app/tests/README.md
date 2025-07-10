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
- ✅ **CI Testing**: Test pages render normally (`CI=true`)
- ✅ **Local Testing**: Test pages render normally (`NODE_ENV=test`)
- ❌ **Production**: Test pages show 404 message (prevents accidental deployment)

This ensures test pages are accessible during development and testing but are safely hidden in production deployments.

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
4. **Production-safe**: Test pages are automatically excluded from production builds
5. **Multi-instance support**: Multiple instances of the same component can be tested on one page

### Running Tests

#### Local Testing

```bash
# Run all tests
pnpm test

# Run specific test file
npx playwright test tests/radar-chart.test.ts

# Run tests with UI
npx playwright test --ui

# Run tests in headed mode (with browser visible)
npx playwright test --headed
```

**Notes:**

- For local testing, ensure no dev server is already running on ports 3000 or 5057, as Playwright will start its own server.
- Test pages will render correctly in CI because GitHub Actions automatically sets `CI=true`.
- For local testing with production builds, you can set `NODE_ENV=test` to ensure test pages render.

#### CI Testing

Tests run automatically on:

- Pull requests to main branch
- Pushes to main branch

The CI workflow:

1. Installs dependencies
2. Installs Playwright browsers
3. Builds the app
4. Runs all tests
5. Uploads test results and reports as artifacts

Test results and HTML reports are available as downloadable artifacts in the GitHub Actions workflow runs.
