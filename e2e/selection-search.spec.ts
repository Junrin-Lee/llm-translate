import { expect, type Page, test } from '@playwright/test';
import { BASE_URL, launchWithExtension, seedSettings } from './support';

const general = (selectionSearch?: boolean) => ({
  targetLang: 'zh-CN',
  selectionTrigger: 'icon',
  pageMode: 'bilingual',
  uiLang: 'en',
  ...(selectionSearch === undefined ? {} : { selectionSearch }),
});

async function selectParagraph(page: Page, id: string): Promise<void> {
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error('fixture paragraph missing');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, `#${id}`);
}

test('selection search shows a search icon that opens the panel on the Search tab', async () => {
  const ext = await launchWithExtension();
  try {
    await seedSettings(ext, { general: general(true) });
    const page = await ext.context.newPage();
    await page.goto(`${BASE_URL}/fixtures/article.html`);

    const translateIcon = page.locator('.llmt-icon:not(.llmt-icon--search)');
    const searchIcon = page.locator('.llmt-icon--search');
    // Settings load asynchronously; retry the selection until the icons appear.
    await expect(async () => {
      await selectParagraph(page, 'p1');
      await expect(searchIcon).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 25_000 });
    await expect(translateIcon).toBeVisible();

    // The search icon sits to the right of the translate icon.
    const t = await translateIcon.boundingBox();
    const s = await searchIcon.boundingBox();
    if (!t || !s) throw new Error('could not measure the icons');
    expect(s.x).toBeGreaterThan(t.x);

    await searchIcon.click();
    const panel = page.locator('.llmt-panel');
    await expect(panel.locator('.llmt-seg__opt.is-active')).toHaveText('Search');
    // Both icons go away once the panel is open.
    await expect(searchIcon).toHaveCount(0);
    await expect(translateIcon).toHaveCount(0);

    // Markdown renders as elements, and the source link opens in a new tab.
    await expect(panel.locator('.llmt-md strong')).toContainText('[[MT]] Tea is one of');
    const link = panel.locator('.llmt-md a');
    await expect(link).toHaveAttribute('href', 'https://example.com/source');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  } finally {
    await ext.context.close();
  }
});

async function searchCount(text: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/stats/search?text=${encodeURIComponent(text)}`);
  return ((await res.json()) as { count: number }).count;
}

test('switching to Translation and back keeps the search result without searching again', async () => {
  const ext = await launchWithExtension();
  try {
    await seedSettings(ext, { general: general(true) });
    const page = await ext.context.newPage();
    await page.goto(`${BASE_URL}/fixtures/article.html`);
    const selected = (await page.locator('#p2').textContent())?.trim() ?? '';
    const before = await searchCount(selected);

    const searchIcon = page.locator('.llmt-icon--search');
    await expect(async () => {
      await selectParagraph(page, 'p2');
      await expect(searchIcon).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 25_000 });
    await searchIcon.click();

    const panel = page.locator('.llmt-panel');
    await expect(panel.locator('.llmt-md strong')).toContainText('[[MT]]');
    await panel.getByRole('button', { name: 'Translation' }).click();
    await expect(panel.locator('.llmt-text')).toContainText('[[MT]]');
    await panel.getByRole('button', { name: 'Search' }).click();
    await expect(panel.locator('.llmt-md strong')).toContainText('[[MT]]');

    expect((await searchCount(selected)) - before).toBe(1);
  } finally {
    await ext.context.close();
  }
});

test('the translate icon still opens a panel without a Search tab', async () => {
  const ext = await launchWithExtension();
  try {
    await seedSettings(ext, { general: general(true) });
    const page = await ext.context.newPage();
    await page.goto(`${BASE_URL}/fixtures/article.html`);

    const translateIcon = page.locator('.llmt-icon:not(.llmt-icon--search)');
    await expect(async () => {
      await selectParagraph(page, 'p1');
      await expect(translateIcon).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 25_000 });
    await translateIcon.click();

    const tabs = page.locator('.llmt-panel .llmt-seg__opt');
    await expect(tabs).toHaveCount(2);
    await expect(page.locator('.llmt-panel .llmt-text')).toContainText('[[MT]]');
  } finally {
    await ext.context.close();
  }
});

test('with selection search off, only the translate icon appears', async () => {
  const ext = await launchWithExtension();
  try {
    await seedSettings(ext, { general: general() });
    const page = await ext.context.newPage();
    await page.goto(`${BASE_URL}/fixtures/article.html`);

    await expect(async () => {
      await selectParagraph(page, 'p1');
      await expect(page.locator('.llmt-icon')).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 25_000 });
    await expect(page.locator('.llmt-icon--search')).toHaveCount(0);
  } finally {
    await ext.context.close();
  }
});
