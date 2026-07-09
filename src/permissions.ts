/**
 * Host-access (<all_urls>) helpers behind Permission Onboarding (ADR-0005).
 * On Chrome host_permissions are granted at install, so hasHostAccess() is
 * always true and every UI hanging off it stays hidden — no browser sniffing.
 */
const HOST_ACCESS = { origins: ['<all_urls>'] };

const ONBOARDING_PATH = '/onboarding.html';

export function hasHostAccess(): Promise<boolean> {
  return browser.permissions.contains(HOST_ACCESS);
}

/** Must be called from a user gesture (button click) — browsers reject otherwise. */
export function requestHostAccess(): Promise<boolean> {
  return browser.permissions.request(HOST_ACCESS);
}

/** Re-checks and reports on every grant/revoke. Returns an unsubscribe. */
export function watchHostAccess(onChange: (granted: boolean) => void): () => void {
  const notify = () => void hasHostAccess().then(onChange);
  browser.permissions.onAdded.addListener(notify);
  browser.permissions.onRemoved.addListener(notify);
  return () => {
    browser.permissions.onAdded.removeListener(notify);
    browser.permissions.onRemoved.removeListener(notify);
  };
}

/** Open the onboarding page, or focus it if a tab is already showing it. */
export async function focusOrOpenOnboarding(): Promise<void> {
  // WXT's generated PublicPath union doesn't include onboarding.html yet (its
  // entrypoint lands in Task 4, which regenerates the union and turns this
  // directive into an unused-directive error — forcing cleanup). getURL is a
  // pure string op at runtime.
  // @ts-expect-error -- /onboarding.html joins PublicPath in Task 4
  const url = browser.runtime.getURL(ONBOARDING_PATH);
  const tabs = await browser.tabs.query({});
  const existing = tabs.find((t) => t.url === url);
  if (existing?.id != null) await browser.tabs.update(existing.id, { active: true });
  else await browser.tabs.create({ url, active: true });
}

/** Mirror the grant state onto the toolbar icon: "!" badge while access is missing. */
export async function syncActionBadge(): Promise<void> {
  const granted = await hasHostAccess();
  await browser.action.setBadgeText({ text: granted ? '' : '!' });
  if (!granted) await browser.action.setBadgeBackgroundColor({ color: '#b3261e' });
}
