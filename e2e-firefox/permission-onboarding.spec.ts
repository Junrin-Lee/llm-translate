import type { WebDriver } from 'selenium-webdriver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  extUrl,
  getBadgeText,
  launchFirefoxWithExtension,
  queryHostAccess,
  revokeHostAccess,
} from './support';

// Covers the state smoke.spec.ts structurally cannot reach: Firefox
// temp-installs grant <all_urls> by default (verified there and re-verified
// here), so the permission-onboarding UI (badge, warning banner, onboarding
// grant screen) never renders in that suite. This file drives its OWN
// Firefox profile via its own beforeAll/afterAll below and revokes
// <all_urls> with browser.permissions.remove() — confirmed via a throwaway
// probe (see task-10-report.md) to work with NO user gesture, unlike
// `.request()`. `fileParallelism:false` in vitest.e2e-firefox.config.ts
// guarantees this file runs sequentially with smoke.spec.ts, each against
// its own isolated browser instance, so the revoke here can never poison
// that suite's granted-state assumptions.
//
// Tests below are order-dependent by design (matching smoke.spec.ts's own
// pattern of sharing one driver down a describe block): the revoke in test 2
// is a precondition for every test after it.
//
// NOT automated here, and not automatable via executeScript: clicking the
// Grant button through to a completed grant. `browser.permissions.request()`
// requires a real user gesture, which Selenium's `executeScript` cannot
// provide — that path (and the resulting browser permission prompt) stays in
// docs/firefox-smoke.md's manual checklist ("grant button works" / "Grant
// from the popup banner").
let driver: WebDriver;

beforeAll(async () => {
  driver = await launchFirefoxWithExtension();
});

afterAll(async () => {
  await driver?.quit();
});

describe('firefox permission onboarding (unauthorized state)', () => {
  it('precondition: temp-install grants <all_urls> by default', async () => {
    expect(await queryHostAccess(driver)).toBe(true);
  });

  it('permissions.remove revokes <all_urls> without a user gesture', async () => {
    const removed = await revokeHostAccess(driver);
    expect(removed).toBe(true);
    expect(await queryHostAccess(driver)).toBe(false);
  });

  it('toolbar badge flips to "!" once background reacts to the revoke', async () => {
    // Any extension page exposes browser.action; options.html is already warm.
    await driver.get(extUrl('options.html'));
    await driver.wait(async () => (await getBadgeText(driver)) === '!', 10_000);
  });

  it('PermissionBanner renders in options.html when unauthorized', async () => {
    await driver.get(extUrl('options.html'));
    await driver.wait(
      async () =>
        driver.executeScript<boolean>(`return document.querySelector('.perm-banner') != null`),
      10_000,
    );
    const bannerText = await driver.executeScript<string>(
      `return document.querySelector('.perm-banner')?.textContent ?? ''`,
    );
    const hasButton = await driver.executeScript<boolean>(
      `return document.querySelector('.perm-banner__btn') != null`,
    );
    expect(bannerText).toMatch(/site access|站点访问/i);
    expect(hasButton).toBe(true);
  });

  it('PermissionBanner renders in popup.html when unauthorized', async () => {
    await driver.get(extUrl('popup.html'));
    await driver.wait(
      async () =>
        driver.executeScript<boolean>(`return document.querySelector('.perm-banner') != null`),
      10_000,
    );
    const bannerText = await driver.executeScript<string>(
      `return document.querySelector('.perm-banner')?.textContent ?? ''`,
    );
    const hasButton = await driver.executeScript<boolean>(
      `return document.querySelector('.perm-banner__btn') != null`,
    );
    expect(bannerText).toMatch(/site access|站点访问/i);
    expect(hasButton).toBe(true);
  });

  it('onboarding page shows the grant screen, not the success state', async () => {
    await driver.get(extUrl('onboarding.html'));
    const body = await driver.wait(async () => {
      const text = await driver.executeScript<string>('return document.body.innerText');
      return text.trim().length > 0 ? text : null;
    }, 10_000);
    // Not-granted branch renders onboardingGrant copy and no ✓; the granted
    // branch (see smoke.spec.ts) renders the opposite — this is the same
    // either/or discriminator smoke.spec.ts uses, just pinned to the
    // not-granted side since we revoked above.
    expect(String(body)).toMatch(/grant site access|授予站点访问权限/i);
    expect(String(body)).not.toMatch(/✓/);

    // The button in this branch carries the grant copy (the success branch's
    // button says "Open Settings" instead — same class, different label —
    // so asserting the label, not just the class, is what actually pins the
    // unauthorized state).
    const grantBtnText = await driver.executeScript<string>(
      `return document.querySelector('.onboarding__btn')?.textContent ?? ''`,
    );
    expect(grantBtnText).toMatch(/grant site access|授予站点访问权限/i);
  });
});
