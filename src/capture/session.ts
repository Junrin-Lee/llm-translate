/**
 * Hand-off slot for the workbench fallback: the capture happens in the popup /
 * background (while the target tab is still visible), the workbench page picks
 * it up after it opens. storage.session: in-memory, never hits disk (ADR-0002).
 */
const PENDING_KEY = 'capture:pending';

export async function stashPendingCapture(dataUrl: string): Promise<void> {
  await browser.storage.session.set({ [PENDING_KEY]: dataUrl });
}

export async function takePendingCapture(): Promise<string | null> {
  const got = await browser.storage.session.get(PENDING_KEY);
  const dataUrl = got[PENDING_KEY];
  await browser.storage.session.remove(PENDING_KEY);
  return typeof dataUrl === 'string' && dataUrl.length > 0 ? dataUrl : null;
}
