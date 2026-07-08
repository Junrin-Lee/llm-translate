import { expect, test } from '@playwright/test';
import { BASE_URL, launchWithExtension, seedSettings } from './support';

test('a failed page translation can be retried per-block and in bulk', async () => {
  const ext = await launchWithExtension();
  try {
    // Start with a dead endpoint so every block fails on load.
    await seedSettings(ext, {
      providers: [
        {
          id: 'mock',
          name: 'Mock',
          protocol: 'openai',
          baseUrl: 'http://127.0.0.1:1/v1',
          apiKey: 'test-key',
          model: 'mock-model',
        },
      ],
      siteRules: { autoTranslate: ['localhost'], disableSelection: [] },
    });
    const page = await ext.context.newPage();
    await page.goto(`${BASE_URL}/fixtures/article.html`);

    // The toolbar's retry button only shows once translation finishes with errors,
    // so waiting for it means every block has settled into the error state.
    const retryButton = page.getByRole('button', { name: /Retry \d+ failed/ });
    await retryButton.waitFor();
    const errored = page.locator('[data-llmt].llmt-error');
    const initial = await errored.count();
    expect(initial).toBeGreaterThan(1);

    // Fix the provider (point back at the working mock) — retries read it fresh.
    await seedSettings(ext, {
      siteRules: { autoTranslate: ['localhost'], disableSelection: [] },
    });

    // Per-block: clicking one error marker retries just that block.
    await errored.first().click();
    await expect(page.locator('[data-llmt]', { hasText: '[[MT]]' })).toHaveCount(1);

    // Bulk: the toolbar button clears the remaining failures.
    await retryButton.click();
    await expect(page.locator('[data-llmt]', { hasText: '[[MT]]' })).toHaveCount(initial);
    await expect(errored).toHaveCount(0);
  } finally {
    await ext.context.close();
  }
});
