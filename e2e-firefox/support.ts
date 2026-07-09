import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Builder, type WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(DIR, '../.output');

export const GECKO_ID = 'llm-translate@junrin-lee.github.io';
/** Pinned via the extensions.webextensions.uuids pref so moz-extension:// URLs are stable. */
export const EXT_UUID = 'f1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b';
export const MOCK_PORT = Number(process.env.MOCK_PORT ?? 8787);
export const BASE_URL = `http://localhost:${MOCK_PORT}`;

export const extUrl = (path: string) => `moz-extension://${EXT_UUID}/${path}`;

function findFirefoxZip(): string {
  const file = readdirSync(OUTPUT).find((f) => f.endsWith('-firefox.zip'));
  if (!file) throw new Error('No firefox zip in .output/ — run `pnpm zip:firefox` first.');
  return join(OUTPUT, file);
}

/** Launch Firefox (headless unless HEADED=1) with the built zip temp-installed. */
export async function launchFirefoxWithExtension(): Promise<WebDriver> {
  const options = new firefox.Options();
  if (!process.env.HEADED) options.addArguments('-headless');
  options.setPreference('extensions.webextensions.uuids', JSON.stringify({ [GECKO_ID]: EXT_UUID }));
  const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
  // Temporary install: unsigned zips are allowed, mirroring about:debugging.
  await (driver as unknown as firefox.Driver).installAddon(findFirefoxZip(), true);
  return driver;
}

/** True when <all_urls> is granted inside the extension's own page context. */
export async function queryHostAccess(driver: WebDriver): Promise<boolean> {
  await driver.get(extUrl('options.html'));
  return driver.executeAsyncScript(
    `const done = arguments[0];
     browser.permissions.contains({ origins: ['<all_urls>'] }).then(done);`,
  );
}

/**
 * Seed settings pointing at the mock LLM. Mirrors `seedSettings` in
 * e2e/support.ts: same `settings` shape (version/providers/defaults/general/
 * siteRules/prompts) written under the same `settings` storage key — just
 * swapping Chromium's `chrome.storage.local` for Firefox's `browser.storage.local`.
 */
export async function seedSettings(driver: WebDriver): Promise<void> {
  await driver.get(extUrl('options.html'));
  await driver.executeAsyncScript(
    `const done = arguments[0];
     const settings = {
       version: 1,
       providers: [
         {
           id: 'mock',
           name: 'Mock',
           protocol: 'openai',
           baseUrl: '${BASE_URL}/v1',
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
     };
     browser.storage.local.set({ settings }).then(done);`,
  );
}
