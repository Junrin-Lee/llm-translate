import type { WebDriver } from 'selenium-webdriver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BASE_URL,
  extUrl,
  launchFirefoxWithExtension,
  queryHostAccess,
  seedSettings,
} from './support';

// VERIFIED (see task-7-report.md for the full run log): this machine has no
// system-wide Firefox install, but selenium-webdriver's bundled Selenium
// Manager transparently downloaded a real Firefox + geckodriver on first use
// and ran this suite for real. Two findings from that verified run, kept here
// so nobody re-litigates them:
//  - Temporary installAddon DID grant <all_urls> host access by default
//    (`granted` came back true) — no need for the
//    `extensions.originControls.grantByDefault` pref some Firefox versions
//    reportedly require; the skip path below is a defensive fallback for
//    versions/channels where that differs, not the expected common case.
//  - A COLD Selenium Manager cache (first run ever, nothing under
//    ~/.cache/selenium yet) needs to download Firefox + geckodriver, which can
//    take longer than a typical hookTimeout — see the bumped hookTimeout in
//    vitest.e2e-firefox.config.ts. Warm-cache runs complete in well under 60s.

let driver: WebDriver;
let granted = false;

beforeAll(async () => {
  driver = await launchFirefoxWithExtension();
  granted = await queryHostAccess(driver);
  // Record the fact — Task 4 Step 4 observed whether temp-install grants access.
  console.log(`[smoke] temporary install host access granted: ${granted}`);
});

afterAll(async () => {
  await driver?.quit();
});

describe('firefox smoke', () => {
  it('options page renders', async () => {
    await driver.get(extUrl('options.html'));
    // src/entrypoints/options/App.tsx sets document.title to
    // `${BRAND.name} — Settings` once React mounts; the static
    // <title>Options</title> in index.html is only the pre-mount placeholder,
    // so waiting for the real title also proves the app actually booted.
    await driver.wait(async () => (await driver.getTitle()) === 'LLM Translate — Settings', 10_000);
  });

  it('onboarding page reflects the grant state', async () => {
    await driver.get(extUrl('onboarding.html'));
    const body = await driver.wait(async () => {
      const text = await driver.executeScript<string>('return document.body.innerText');
      return text.trim().length > 0 ? text : null;
    }, 10_000);
    // Granted → success state; not granted → the grant button. Either proves the page works.
    expect(String(body)).toMatch(granted ? /✓/ : /site access|站点访问/i);
  });

  it('selection translation streams over the mock LLM', async (ctx) => {
    if (!granted) return ctx.skip(); // covered by the manual checklist when temp-install doesn't grant
    await seedSettings(driver);
    await driver.get(`${BASE_URL}/fixtures/article.html`);
    // Same trigger as e2e/selection.spec.ts: select #p1, dispatch mouseup.
    await driver.wait(async () => {
      await driver.executeScript(`
        const el = document.querySelector('#p1');
        if (!el) throw new Error('fixture paragraph missing');
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      `);
      // content.tsx mounts the panel via WXT's createShadowRootUi (default
      // mode: 'open') onto a <llm-translate-ui> host, so a flat
      // document.querySelector can never see inside it — unlike Playwright's
      // locator engine (e2e/selection.spec.ts), which pierces open shadow
      // roots transparently. Verified: piercing via .shadowRoot finds it on
      // the very first dispatch, no retries needed.
      const text = await driver.executeScript<string>(
        `return document.querySelector('llm-translate-ui')?.shadowRoot
           ?.querySelector('.llmt-panel .llmt-text')?.textContent ?? ''`,
      );
      return text.includes('[[MT]]');
    }, 30_000);
  });
});
