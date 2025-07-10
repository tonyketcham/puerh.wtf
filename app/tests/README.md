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

The `TestPageWrapper` component ensures test pages are only rendered in development mode:

```tsx
import TestPageWrapper from "@/lib/components/TestPageWrapper"

export default function MyTestPage() {
	return <TestPageWrapper>{/* Test content here */}</TestPageWrapper>
}
```

In production, test pages will show a 404 message instead of the test content.

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

```bash
# Run all tests
npm run test

# Run specific test file
npx playwright test tests/radar-chart.test.ts

# Run tests with UI
npx playwright test --ui
```
