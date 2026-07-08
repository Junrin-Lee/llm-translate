# Installing LLM Translate

**English** · [简体中文](./INSTALL.zh-CN.md)

This guide installs LLM Translate in **Chrome or Edge** without the Web Store, and
sets it up for first use. It takes about two minutes.

> LLM Translate isn't on the Chrome Web Store yet. Chrome and Edge don't allow
> one-click installs of off-store extensions, so you install it by loading a
> prebuilt folder — the steps below.

## What you'll need

- **Google Chrome or Microsoft Edge** (any recent version).
- **An API key** from an OpenAI-compatible or Anthropic-compatible provider — this
  is what actually does the translating (you bring your own key). Get one from,
  e.g., the OpenAI platform or the Anthropic console, or use any compatible
  gateway. Keep it handy for step 3.

## 1. Download the extension

1. Open the [Releases page](https://github.com/Junrin-Lee/llm-translate/releases).
2. Under the latest release, download the zip for your browser:
   - Chrome → `llm-translate-<version>-chrome.zip`
   - Edge → `llm-translate-<version>-edge.zip`
3. **Unzip it to a folder you'll keep** — e.g. `Documents/llm-translate`. Don't
   delete or move this folder afterward: the browser loads the extension straight
   from that location.

> **No release available yet?** Either build it from source (see the end of this
> guide) or ask the maintainer to publish one.

## 2. Load it into your browser

### Chrome

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (toggle, top-right).
3. Click **Load unpacked**.
4. Select the **unzipped folder** from step 1 (the one containing `manifest.json`).

### Edge

1. Go to `edge://extensions`.
2. Turn on **Developer mode** (toggle, bottom-left).
3. Click **Load unpacked**.
4. Select the **unzipped folder** from step 1.

The LLM Translate icon now appears in the toolbar. Click the puzzle-piece icon and
pin it so it's always visible.

> Chrome may show a **"Disable developer mode extensions"** popup on startup. This
> is normal for any extension installed this way — dismiss it; the extension keeps
> working.

<a id="open-a-normal-page"></a>

## ⚠️ Read this before step 3: switch to a normal web page

> [!IMPORTANT]
> **The extension does not run on the browser's internal pages
> (`chrome://extensions`, `edge://extensions`).** If you stay on that page after
> installing, you'll see no translation features and no way into settings — this
> does **not** mean the install failed.

Open **any website in a new tab** (or refresh a page you already had open), then:

1. Click the **LLM Translate icon** in the toolbar (don't see it? click the
   **puzzle-piece icon** at the top-right and pin it).
2. Choose **Open settings** to reach the configuration in step 3 below.

> Tabs that were already open need a **refresh** first — the content script only
> injects into pages opened or refreshed after install.

## 3. Add your API key

1. Click the LLM Translate icon → **Open settings** (or right-click the icon →
   Options).
2. Go to **Providers** → **Add provider**.
3. Fill in:
   - **Protocol** — OpenAI-compatible or Anthropic-compatible.
   - **Base URL** — e.g. `https://api.openai.com/v1` or `https://api.anthropic.com`
     (or your own gateway).
   - **API key** — paste your key. It is stored only on this device and never
     synced or sent anywhere except the endpoint you set here.
   - **Model** — type it, or click **Fetch models** to pick from the list.
4. Click **Test connection** — you should see **Connected**.

## 4. Translate

- **Selection** — select text on any page, then click the icon that appears (or
  press `Ctrl/⌘ + Shift + S`).
- **Whole page** — click the toolbar icon → **Translate this page** (or press
  `Ctrl/⌘ + Shift + P`, or right-click → Translate this page).

![Selection translation popup](../store-assets/screenshots/01-selection.png)

![Full-page bilingual translation](../store-assets/screenshots/02-page-bilingual.png)

For the full feature list (dictionary cards, bilingual / translation-only modes,
auto-translate sites, custom prompts, and more), see the [README](../README.md).

## Updating

Unpacked extensions **don't auto-update**. To update:

1. Download the new zip from the Releases page.
2. Unzip it, replacing your existing folder (keep the same location).
3. Open `chrome://extensions` (or `edge://extensions`) and click the **reload** (↻)
   button on the LLM Translate card.

## Troubleshooting

- **A "developer mode" warning appears on every launch** — normal for
  load-unpacked extensions; safe to dismiss.
- **The extension suddenly stopped working** — you likely moved or deleted the
  unzipped folder. Put it back, or load it again (step 2).
- **No icon appears when I select text** — refresh the page (the content script
  only runs on pages opened after install), confirm the site isn't in your disable
  list, and make sure a provider is configured.
- **"No provider configured" or the connection fails** — re-check the Base URL and
  API key in settings, then click Test connection.
- **Remove it** — `chrome://extensions` → **Remove** on the card.

## Alternative: build from source (for developers)

Requires **Node.js 20** and **pnpm 9**.

```sh
git clone https://github.com/Junrin-Lee/llm-translate
cd llm-translate
corepack prepare pnpm@9.15.9 --activate   # if pnpm is missing
pnpm install
pnpm build            # -> .output/chrome-mv3/   (Edge: pnpm build:edge -> .output/edge-mv3/)
```

Then load `.output/chrome-mv3/` via **Load unpacked** (step 2). See the
[README](../README.md) for the full development workflow.
