import { expect, test } from '@playwright/test';
import { BASE_URL, launchWithExtension, seedSettings } from './support';

test('the selection popup can be dragged by its header', async () => {
  const ext = await launchWithExtension();
  try {
    await seedSettings(ext); // defaults: 'instant' trigger
    const page = await ext.context.newPage();
    await page.goto(`${BASE_URL}/fixtures/article.html`);

    const panel = page.locator('.llmt-panel');
    await expect(async () => {
      await page.evaluate(() => {
        const el = document.querySelector('#p2');
        if (!el) throw new Error('fixture paragraph missing');
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
      await expect(panel).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 25_000 });

    const before = await panel.boundingBox();
    const grip = await page.locator('.llmt-panel__grip').boundingBox();
    if (!before || !grip) throw new Error('could not measure the panel');

    // Drag the grip down-right; the panel should follow (and stay open).
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 160, grip.y + 200, { steps: 6 });
    await page.mouse.up();

    const after = await panel.boundingBox();
    if (!after) throw new Error('panel closed during drag');
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(80);
    expect(Math.abs(after.y - before.y)).toBeGreaterThan(80);
  } finally {
    await ext.context.close();
  }
});
