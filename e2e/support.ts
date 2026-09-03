import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, chromium } from '@playwright/test';

const DIR = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = resolve(DIR, '../.output/chrome-mv3');

export const MOCK_PORT = Number(process.env.MOCK_PORT ?? 8787);
export const BASE_URL = `http://localhost:${MOCK_PORT}`;

export interface LoadedExtension {
  context: BrowserContext;
  extensionId: string;
}

/**
 * Launch Chromium with the built MV3 extension loaded and resolve its id from
 * the background service worker. Uses the `chromium` channel so extensions work
 * in the new headless mode (CI-friendly, no virtual display needed).
 */
export async function launchWithExtension(): Promise<LoadedExtension> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  let [background] = context.serviceWorkers();
  if (!background) background = await context.waitForEvent('serviceworker');
  const extensionId = new URL(background.url()).host;
  return { context, extensionId };
}

/**
 * Overwrite the extension's local settings. Seed BEFORE opening a content page
 * so the content script reads the seeded provider/rules on load.
 */
export async function seedSettings(
  { context, extensionId }: LoadedExtension,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const settings = {
    version: 2,
    providers: [
      {
        id: 'mock-provider',
        name: 'Mock',
        protocol: 'openai',
        baseUrl: `${BASE_URL}/v1`,
        apiKey: 'test-key',
      },
    ],
    // Keeps the id 'mock', so every spec pointing defaults at it still works.
    models: [{ id: 'mock', name: 'Mock', providerId: 'mock-provider', model: 'mock-model' }],
    defaults: { global: 'mock' },
    general: {
      targetLang: 'zh-CN',
      selectionTrigger: 'instant',
      pageMode: 'bilingual',
      uiLang: 'en',
    },
    siteRules: { autoTranslate: [], disableSelection: [] },
    prompts: {},
    ...overrides,
  };
  await writeSettings({ context, extensionId }, settings);
}

/**
 * Seed the flat v1 shape a build up to v0.3.0 would have written, so the upgrade
 * path is covered end to end and not only in unit tests (ADR-0007).
 */
export async function seedV1Settings(ext: LoadedExtension): Promise<void> {
  await writeSettings(ext, {
    version: 1,
    providers: [
      {
        id: 'mock',
        name: 'Mock',
        protocol: 'openai',
        baseUrl: `${BASE_URL}/v1`,
        apiKey: 'test-key',
        model: 'mock-model',
      },
    ],
    defaults: { global: 'mock' },
    general: {
      targetLang: 'zh-CN',
      selectionTrigger: 'instant',
      pageMode: 'bilingual',
      uiLang: 'en',
    },
    siteRules: { autoTranslate: [], disableSelection: [] },
    prompts: {},
  });
}

async function writeSettings(
  { context, extensionId }: LoadedExtension,
  settings: unknown,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate((value) => chrome.storage.local.set({ settings: value }), settings);
  await page.close();
}
