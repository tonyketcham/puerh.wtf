import { expect, test } from '@playwright/test';

test('basic index page sanity', async ({ page }) => {
	await page.goto('/');
	expect(await page.textContent('h1')).toBe('puerh  .wtf');
});
