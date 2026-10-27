# Permission & data justifications (Chrome Web Store / Edge Add-ons)

Reviewer-facing rationale for each permission the extension requests. Copy the
relevant fields into the store submission forms.

## Single purpose

LLM Translate does one thing: **help the user understand text in a language they
read** — translating a selection, the whole page, typed or pasted text, or the
text inside a screenshot region, and (optionally, off by default) asking the same
model to explain a selected word or phrase with Selection Search. It uses an API
endpoint the user configures with their own key (BYOK).

## Permissions

### `storage`
Persist the user's own configuration locally: provider profiles (endpoint,
model, API key), language/display preferences, per-site rules, custom prompts,
and a translation cache. Nothing is stored remotely.

### `contextMenus`
Add three right-click entries — "Translate this page", "Translate selection", and
"Screenshot Translation" — as an alternative to the toolbar button and keyboard
shortcuts.

### `activeTab`
Screenshot Translation freezes a snapshot of the current tab with
`chrome.tabs.captureVisibleTab` so the user can drag-select a region to translate.
`activeTab` grants that capture only for the tab the user acts on, and is what
keeps the feature working on Firefox after the optional `<all_urls>` host access
is revoked. No capture happens unless the user explicitly starts a screenshot
translation.

### `commands` (manifest key, not a permission)
Keyboard shortcuts for "translate selection" and "translate page". The user can
rebind or disable them at `chrome://extensions/shortcuts`.

## Host permissions

### `host_permissions: <all_urls>`
Two independent reasons, both intrinsic to the product:

1. **Translate any page the user is on.** The content script must read and
   annotate the DOM of whatever page the user chooses to translate; that page
   can be any site, so the match pattern must be `<all_urls>`.
2. **Reach the user-chosen API endpoint.** All LLM requests are made from the
   background service worker to the Base URL the user configures. That Base URL
   is arbitrary (an official API or any compatible gateway/self-hosted proxy),
   so the background needs host access to it. Since it is user-defined and not
   known in advance, it cannot be narrowed to a fixed host list.

On Firefox (MV3) this is user-revocable; the extension degrades to an explicit
Permission Onboarding flow instead of breaking silently.

The content script and page context **never** make network requests and never
receive the API key — all egress is from the background service worker only.

## Remote code

**None.** The extension executes no remotely-hosted code. All scripts are bundled
in the package. LLM responses are treated as untrusted data and written to the
page as text nodes only (never parsed as HTML or executed). Selection Search
answers are parsed as a small Markdown subset into React elements; links are
limited to http/https.

## Data usage disclosures

- **Personally identifiable information:** not collected.
- **Health, financial, authentication, personal communications, location, web
  history, user activity:** not collected.
- **Website content:** the text the user chooses to translate or search — or, for
  Screenshot Translation, the captured image region the user drag-selects — is
  sent **only** to the API endpoint the user configured, solely to perform the
  request. It is not sent to the developer and not to any other party. (A
  web-enabled model may search the web on the provider's side; that is governed
  by the provider's policy.)
- **Selling data:** we do not sell or transfer user data.
- **Use limitation:** data is used only to perform the user-requested
  translation; there is no analytics, tracking, or advertising.

The developer operates no server and receives no user data.
