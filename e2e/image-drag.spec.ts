import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { launchWithExtension, seedSettings } from './support';

const DIR = dirname(fileURLToPath(import.meta.url));

test('the screenshot translation panel can be dragged by its header', async () => {
  const ext = await launchWithExtension();
  try {
    await seedSettings(ext);
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.extensionId}/image-translate.html`);

    // Feed the workbench an image through the hidden upload input.
    await page.locator('input[type="file"]').setInputFiles(resolve(DIR, '../public/icon/128.png'));

    // Drag a crop region over the preview; pointer-up confirms and translates.
    const crop = page.locator('.llmt-crop');
    await expect(crop).toBeVisible();
    const box = await crop.boundingBox();
    if (!box) throw new Error('could not measure the crop overlay');
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 240, box.y + 160, { steps: 4 });
    await page.mouse.up();

    const panel = page.locator('.llmt-panel');
    await expect(panel).toBeVisible();

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
