import { expect, test } from '@playwright/test';
import { BASE_URL, launchWithExtension, seedV1Settings } from './support';

/**
 * The only end-to-end evidence that an existing install survives the schema
 * change: seed the flat v1 payload a v0.3.0 build wrote, then check the settings
 * page shows the split records and that translation still runs (ADR-0007).
 */
test('a stored v1 payload upgrades without losing settings', async () => {
  const ext = await launchWithExtension();
  try {
    await seedV1Settings(ext);

    const options = await ext.context.newPage();
    await options.goto(`chrome-extension://${ext.extensionId}/options.html#models`);

    // One provider carried the connection over, one model carried the model name.
    await expect(options.locator('.card')).toHaveCount(1);
    await expect(options.locator('.card input[value="mock-model"]')).toBeVisible();

    await options.goto(`chrome-extension://${ext.extensionId}/options.html#providers`);
    await expect(options.locator(`.card input[value="${BASE_URL}/v1"]`)).toBeVisible();

    // Routing kept pointing at the same record, so the feature still resolves.
    await options.goto(`chrome-extension://${ext.extensionId}/options.html#routing`);
    await expect(options.locator('.defaults select').first()).toHaveValue('mock');
    await options.close();

    const page = await ext.context.newPage();
    await page.goto(`${BASE_URL}/fixtures/article.html`);
    const panelText = page.locator('.llmt-panel .llmt-text');

    await expect(async () => {
      await page.evaluate(() => {
        const el = document.querySelector('#p1');
        if (!el) throw new Error('fixture paragraph missing');
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
      await expect(panelText).toContainText('[[MT]]', { timeout: 3000 });
    }).toPass({ timeout: 25_000 });
  } finally {
    await ext.context.close();
  }
});
