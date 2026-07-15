import { focusOrOpenOnboarding, hasHostAccess } from '@/permissions';
import { stashPendingCapture } from './session';

/**
 * Shared Screenshot Translation launcher (popup & background): capture the visible
 * area first (the overlay must never contaminate it), try the in-place path,
 * fall back to the workbench when the tab has no content script (ADR-0006).
 */
export async function launchImageCapture(tabId: number | undefined): Promise<void> {
  let dataUrl: string | null = null;
  try {
    dataUrl = await browser.tabs.captureVisibleTab({ format: 'png' });
  } catch {
    // Restricted URL (chrome:// / about:) or missing host access on Firefox.
    if (!(await hasHostAccess())) {
      await focusOrOpenOnboarding();
      return;
    }
  }

  if (dataUrl != null && tabId != null) {
    try {
      await browser.tabs.sendMessage(tabId, {
        type: 'open-image-capture',
        imageDataUrl: dataUrl,
      });
      return; // In-place path took over.
    } catch {
      // No content script here — use the workbench.
    }
  }

  // Workbench fallback; with no capture it opens on the paste/upload empty state.
  if (dataUrl != null) {
    try {
      await stashPendingCapture(dataUrl);
    } catch {
      // Oversized capture (session-storage quota) — open the workbench empty; the user can paste instead.
    }
  }
  await browser.tabs.create({ url: browser.runtime.getURL('/image-translate.html'), active: true });
}
