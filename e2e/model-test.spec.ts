import { expect, test } from '@playwright/test';
import { BASE_URL, launchWithExtension, seedSettings } from './support';

/**
 * "Test model" probes reachability, auth and the model id; the 1-token reply's
 * content is not a signal. A reasoning model answering 200 with no text must read
 * as connected, while a 200 carrying an error payload must still fail (issue 0004).
 */
test('model test judges the connection, not the 1-token reply', async () => {
  const ext = await launchWithExtension();
  try {
    await seedSettings(ext, {
      providers: [
        {
          id: 'openai-mock',
          name: 'OpenAI mock',
          protocol: 'openai',
          baseUrl: `${BASE_URL}/v1`,
          apiKey: 'test-key',
        },
        {
          id: 'anthropic-mock',
          name: 'Anthropic mock',
          protocol: 'anthropic',
          baseUrl: BASE_URL,
          apiKey: 'test-key',
        },
      ],
      models: [
        { id: 'mock', name: 'Plain', providerId: 'openai-mock', model: 'mock-model' },
        {
          id: 'oa-reasoning',
          name: 'OpenAI reasoning',
          providerId: 'openai-mock',
          model: 'mock-reasoning',
        },
        {
          id: 'an-reasoning',
          name: 'Anthropic reasoning',
          providerId: 'anthropic-mock',
          model: 'mock-reasoning',
        },
        {
          id: 'oa-error',
          name: 'OpenAI error in 200',
          providerId: 'openai-mock',
          model: 'mock-error-200',
        },
      ],
      defaults: { global: 'mock' },
    });

    const options = await ext.context.newPage();
    await options.goto(`chrome-extension://${ext.extensionId}/options.html#models`);
    const cards = options.locator('.card');
    await expect(cards).toHaveCount(4);

    const runTest = async (index: number) => {
      const card = cards.nth(index);
      await card.getByRole('button', { name: 'Test model' }).click();
      return card.locator('.card__foot .status:not(.status--muted)');
    };

    for (const index of [0, 1, 2]) {
      const status = await runTest(index);
      await expect(status).toHaveClass(/status--ok/);
    }

    const failed = await runTest(3);
    await expect(failed).toHaveClass(/status--error/);
    await expect(failed).toContainText('mock: no such model');
  } finally {
    await ext.context.close();
  }
});
