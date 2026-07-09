import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  focusOrOpenOnboarding,
  hasHostAccess,
  requestHostAccess,
  syncActionBadge,
  watchHostAccess,
} from '@/permissions';

type Listener = () => void;

/** Minimal permissions stub: fakeBrowser doesn't implement this namespace. */
function stubPermissions(initialGranted: boolean) {
  let granted = initialGranted;
  const added = new Set<Listener>();
  const removed = new Set<Listener>();
  // biome-ignore lint/suspicious/noExplicitAny: augmenting the fake
  (fakeBrowser as any).permissions = {
    contains: async () => granted,
    request: async () => {
      granted = true;
      for (const l of added) l();
      return true;
    },
    onAdded: {
      addListener: (l: Listener) => added.add(l),
      removeListener: (l: Listener) => added.delete(l),
    },
    onRemoved: {
      addListener: (l: Listener) => removed.add(l),
      removeListener: (l: Listener) => removed.delete(l),
    },
  };
  return {
    revoke() {
      granted = false;
      for (const l of removed) l();
    },
    listenerCount: () => added.size + removed.size,
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('hasHostAccess', () => {
  it('reflects permissions.contains', async () => {
    stubPermissions(false);
    await expect(hasHostAccess()).resolves.toBe(false);
    stubPermissions(true);
    await expect(hasHostAccess()).resolves.toBe(true);
  });
});

describe('requestHostAccess', () => {
  it('resolves true and is reflected by hasHostAccess afterwards', async () => {
    stubPermissions(false);
    await expect(hasHostAccess()).resolves.toBe(false);
    await expect(requestHostAccess()).resolves.toBe(true);
    await expect(hasHostAccess()).resolves.toBe(true);
  });
});

describe('watchHostAccess', () => {
  it('notifies on grant and revoke, and unsubscribes cleanly', async () => {
    const stub = stubPermissions(false);
    const seen: boolean[] = [];
    const unwatch = watchHostAccess((g) => seen.push(g));
    await fakeBrowser.permissions.request({ origins: ['<all_urls>'] });
    await vi.waitFor(() => expect(seen).toEqual([true]));
    stub.revoke();
    await vi.waitFor(() => expect(seen).toEqual([true, false]));
    unwatch();
    expect(stub.listenerCount()).toBe(0);
  });
});

describe('focusOrOpenOnboarding', () => {
  it('opens the onboarding tab once, then focuses the existing one', async () => {
    await focusOrOpenOnboarding();
    await focusOrOpenOnboarding();
    const tabs = await fakeBrowser.tabs.query({});
    const url = fakeBrowser.runtime.getURL('/onboarding.html');
    // Not asserting the tab is `active` here: fakeBrowser@1.5.2 never applies
    // `active` from tabs.create/update (only tabs.duplicate sets activeTabId),
    // so the focus branch can't be observed through query results.
    expect(tabs.filter((t) => t.url === url)).toHaveLength(1);
  });
});

describe('syncActionBadge', () => {
  it('shows "!" when access is missing and clears it when granted', async () => {
    const setBadgeText = vi.fn();
    const setBadgeBackgroundColor = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: augmenting the fake
    (fakeBrowser as any).action = { setBadgeText, setBadgeBackgroundColor };
    stubPermissions(false);
    await syncActionBadge();
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: '!' });
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#b3261e' });
    stubPermissions(true);
    await syncActionBadge();
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: '' });
  });
});
