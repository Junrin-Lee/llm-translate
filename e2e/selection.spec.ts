import { expect, test } from '@playwright/test';
import { BASE_URL, launchWithExtension, seedSettings } from './support';

test('selection translation streams a translated popup', async () => {
  const ext = await launchWithExtension();
  try {
    // Defaults seed the mock provider and 'instant' trigger (panel opens on select).
    await seedSettings(ext);
    const page = await ext.context.newPage();
    await page.goto(`${BASE_URL}/fixtures/article.html`);

    const panelText = page.locator('.llmt-panel .llmt-text');

    // Retry the whole trigger: the content script loads settings asynchronously,
    // so an early mouseup can land before the 'instant' listener is wired up.
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

    // The translation is of the selected sentence, not some other text.
    await expect(panelText).toContainText('Tea is one of the most widely consumed');
  } finally {
    await ext.context.close();
  }
});
