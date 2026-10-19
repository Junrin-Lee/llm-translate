import { expect, test } from '@playwright/test';
import { launchWithExtension, seedSettings } from './support';

test('text translation in the popup streams a translation of the typed text', async () => {
  const ext = await launchWithExtension();
  try {
    await seedSettings(ext);
    const popup = await ext.context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/popup.html`);

    await popup.getByRole('button', { name: 'Text translation' }).click();

    const input = popup.getByRole('textbox', { name: 'Text translation' });
    await expect(input).toBeFocused();

    // The language picker starts on the global Target language from settings.
    const lang = popup.getByRole('combobox', { name: 'Target language' });
    await expect(lang).toHaveValue('zh-CN');

    await input.fill('Tea is one of the most widely consumed beverages.');
    await popup.getByRole('button', { name: 'Translate' }).click();

    const output = popup.locator('.popup__output');
    await expect(output).toContainText('[[MT]] Tea is one of the most widely consumed');

    // Switching the language re-translates in place.
    await lang.selectOption('ja');
    await expect(output).toContainText('[[MT]] Tea is one of the most widely consumed');

    // Back returns to the menu with the three translate buttons.
    await popup.getByRole('button', { name: 'Back' }).click();
    await expect(popup.getByRole('button', { name: 'Translate this page' })).toBeVisible();
  } finally {
    await ext.context.close();
  }
});

async function openTextPanel() {
  const ext = await launchWithExtension();
  await seedSettings(ext);
  const popup = await ext.context.newPage();
  await popup.goto(`chrome-extension://${ext.extensionId}/popup.html`);
  await popup.getByRole('button', { name: 'Text translation' }).click();
  const input = popup.getByRole('textbox', { name: 'Text translation' });
  return { ext, popup, input, output: popup.locator('.popup__output') };
}

test('pasted text translates right away', async () => {
  const { ext, popup, input, output } = await openTextPanel();
  try {
    await popup.evaluate(() =>
      navigator.clipboard.writeText('Tea is one of the most widely consumed beverages.'),
    );
    await input.focus();
    await popup.keyboard.press('ControlOrMeta+V');

    // Well inside the 2s typing delay, so this can only be the paste path.
    await expect(output).toContainText('[[MT]] Tea is one of the most widely consumed', {
      timeout: 1000,
    });

    // The keystroke after a paste is ordinary typing: it waits out the delay.
    await input.press('End');
    await input.pressSequentially(' Yes.');
    await popup.waitForTimeout(1000);
    await expect(output).toContainText('[[MT]] Tea is one of the most widely consumed beverages.');
    await expect(output).not.toContainText('Yes.');
    await expect(output).toContainText('Yes.', { timeout: 5000 });
  } finally {
    await ext.context.close();
  }
});

test('typed text translates 2 seconds after the last keystroke', async () => {
  const { ext, popup, input, output } = await openTextPanel();
  try {
    await input.pressSequentially('Tea is');
    await popup.waitForTimeout(1500);
    // A further keystroke restarts the wait, so 1.5s after it nothing has fired yet.
    await input.pressSequentially(' green.');
    await popup.waitForTimeout(1500);
    await expect(output).toHaveCount(0);

    await expect(output).toContainText('[[MT]] Tea is green.', { timeout: 5000 });
  } finally {
    await ext.context.close();
  }
});

test('an open IME composition holds the auto-translate until it ends', async () => {
  const { ext, popup, input, output } = await openTextPanel();
  try {
    await input.dispatchEvent('compositionstart');
    await input.fill('cha');
    await popup.waitForTimeout(3000);
    await expect(output).toHaveCount(0);

    await input.dispatchEvent('compositionend');
    await expect(output).toContainText('[[MT]] cha', { timeout: 5000 });
  } finally {
    await ext.context.close();
  }
});
