import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Capture the store listing screenshots (1280x800) against the built extension
// and a local demo server that returns realistic Chinese translations, so the
// shots look genuine without needing a real API key. Regenerate with:
//   pnpm screenshots

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIR, '..');
const EXTENSION_PATH = resolve(ROOT, '.output/chrome-mv3');
const OUT_DIR = resolve(ROOT, 'store-assets/screenshots');
const PORT = 8899;
const BASE = `http://localhost:${PORT}`;

const ZH = {
  'The History of Tea': '茶的历史',
  'Tea is one of the most widely consumed beverages in the world.':
    '茶是世界上消费最广泛的饮料之一。',
  'According to legend, it was discovered by accident thousands of years ago.':
    '相传,它在数千年前被偶然发现。',
  'Today it is grown in many countries and enjoyed in countless varieties.':
    '如今它在许多国家种植,并衍生出数不清的品种。',
};
const tr = (s) => ZH[s.trim()] ?? s.trim();

const ARTICLE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>The History of Tea</title>
<style>body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:760px;margin:56px auto;
padding:0 28px;line-height:1.75;color:#1f2328}h1{font-size:30px;margin-bottom:20px}p{font-size:17px}</style>
</head><body><h1>The History of Tea</h1>
<p>Tea is one of the most widely consumed beverages in the world.</p>
<p>According to legend, it was discovered by accident thousands of years ago.</p>
<p>Today it is grown in many countries and enjoyed in countless varieties.</p>
</body></html>`;

function translateBatch(text) {
  const marker = /@@(\d+)@@/g;
  const matches = [...text.matchAll(marker)];
  if (matches.length === 0) return null;
  return matches
    .map((m, i) => {
      const start = m.index + m[0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      return `@@${m[1]}@@\n${tr(text.slice(start, end))}`;
    })
    .join('\n\n');
}

function responseText(user) {
  return translateBatch(user) ?? tr(user);
}

function readBody(req) {
  return new Promise((done) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
    });
    req.on('end', () => done(data));
  });
}

function startServer() {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', BASE);
    if (pathname === '/demo/article.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(ARTICLE);
      return;
    }
    if (req.method === 'GET' && (pathname === '/v1/models' || pathname === '/models')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'demo-model' }] }));
      return;
    }
    const body = JSON.parse((await readBody(req)) || '{}');
    if (pathname.endsWith('/chat/completions')) {
      const user = (body.messages ?? [])
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join('\n');
      const text = responseText(user);
      if (body.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
      }
      return;
    }
    if (pathname.endsWith('/messages')) {
      const user = (body.messages ?? [])
        .filter((m) => m.role === 'user')
        .map((m) => (typeof m.content === 'string' ? m.content : ''))
        .join('\n');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: responseText(user) }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((done) => server.listen(PORT, () => done(server)));
}

function settings(overrides) {
  return {
    version: 1,
    providers: [
      {
        id: 'openai',
        name: 'OpenAI (personal)',
        protocol: 'openai',
        baseUrl: `${BASE}/v1`,
        apiKey: 'demo-key',
        model: 'gpt-4o-mini',
      },
      {
        id: 'anthropic',
        name: 'Anthropic (work)',
        protocol: 'anthropic',
        baseUrl: BASE,
        apiKey: 'demo-key',
        model: 'claude-3-5-sonnet-latest',
      },
    ],
    defaults: { global: 'openai', page: 'anthropic' },
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
}

async function seed(context, extensionId, value) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate((v) => chrome.storage.local.set({ settings: v }), value);
  await page.close();
}

async function run() {
  const server = await startServer();
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = new URL(sw.url()).host;

    // Options screenshots — populated with two providers.
    await seed(context, extensionId, settings());
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html#providers`);
    await options.locator('.card').first().waitFor();
    await options.screenshot({ path: `${OUT_DIR}/03-providers.png` });
    await options.goto(`chrome-extension://${extensionId}/options.html#routing`);
    await options.waitForTimeout(400);
    await options.screenshot({ path: `${OUT_DIR}/04-routing.png` });
    await options.close();

    // Selection popup.
    const sel = await context.newPage();
    await sel.goto(`${BASE}/demo/article.html`);
    const panel = sel.locator('.llmt-panel .llmt-text');
    await expect_(async () => {
      await sel.evaluate(() => {
        const el = document.querySelector('p');
        const range = document.createRange();
        range.selectNodeContents(el);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
      await panel.waitFor({ timeout: 2000 });
      if (!(await panel.textContent())?.includes('茶')) throw new Error('not translated yet');
    });
    await sel.screenshot({ path: `${OUT_DIR}/01-selection.png` });
    await sel.close();

    // Full-page bilingual (auto-translate).
    await seed(
      context,
      extensionId,
      settings({ siteRules: { autoTranslate: ['localhost'], disableSelection: [] } }),
    );
    const pageShot = await context.newPage();
    await pageShot.goto(`${BASE}/demo/article.html`);
    await pageShot.locator('[data-llmt]').first().waitFor();
    await pageShot.locator('[data-llmt]', { hasText: '茶' }).first().waitFor();
    await pageShot.screenshot({ path: `${OUT_DIR}/02-page-bilingual.png` });
    await pageShot.close();

    console.log(`Saved 4 screenshots to ${OUT_DIR}`);
  } finally {
    await context.close();
    server.close();
  }
}

// Minimal retry helper (avoids pulling in the test runner's expect).
async function expect_(fn, tries = 15) {
  for (let i = 0; i < tries; i += 1) {
    try {
      await fn();
      return;
    } catch (error) {
      if (i === tries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
