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

test('pasted text translates on its own after 2 seconds', async () => {
  const ext = await launchWithExtension();
  try {
    await seedSettings(ext);
    const popup = await ext.context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/popup.html`);

    await popup.getByRole('button', { name: 'Text translation' }).click();
    const input = popup.getByRole('textbox', { name: 'Text translation' });

    // A paste event arms the auto-translate; fill() then lands the text.
    await input.dispatchEvent('paste');
    await input.fill('Tea is one of the most widely consumed beverages.');

    // Nothing happens straight away: the panel waits for a manual translate first.
    const output = popup.locator('.popup__output');
    await popup.waitForTimeout(1000);
    await expect(output).toHaveCount(0);

    await expect(output).toContainText('[[MT]] Tea is one of the most widely consumed', {
      timeout: 5000,
    });
  } finally {
    await ext.context.close();
  }
});

test('typing without pasting never auto-translates', async () => {
  const ext = await launchWithExtension();
  try {
    await seedSettings(ext);
    const popup = await ext.context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/popup.html`);

    await popup.getByRole('button', { name: 'Text translation' }).click();
    await popup
      .getByRole('textbox', { name: 'Text translation' })
      .fill('Tea is one of the most widely consumed beverages.');

    await popup.waitForTimeout(3000);
    await expect(popup.locator('.popup__output')).toHaveCount(0);
  } finally {
    await ext.context.close();
  }
});
