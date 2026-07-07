import { expect, test } from '@playwright/test';
import { BASE_URL, launchWithExtension, seedSettings } from './support';

test('full-page translation injects bilingual translations on an auto-translate site', async () => {
  const ext = await launchWithExtension();
  try {
    // localhost is on the auto-translate list, so the page translates on load.
    await seedSettings(ext, { siteRules: { autoTranslate: ['localhost'], disableSelection: [] } });
    const page = await ext.context.newPage();
    await page.goto(`${BASE_URL}/fixtures/article.html`);

    // Each translated block is injected as a [data-llmt] node (light DOM),
    // carrying the mock sentinel; the original text stays on the page.
    const translations = page.locator('[data-llmt]');
    await expect(translations.first()).toContainText('[[MT]]');
    expect(await translations.count()).toBeGreaterThan(1);
    await expect(page.locator('#p1')).toBeVisible();
  } finally {
    await ext.context.close();
  }
});
