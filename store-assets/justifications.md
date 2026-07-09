# Permission & data justifications (Chrome Web Store / Edge Add-ons)

Reviewer-facing rationale for each permission the extension requests. Copy the
relevant fields into the store submission forms.

## Single purpose

LLM Translate does one thing: **translate text for the user** — either a
selection or the whole page — using a translation API endpoint the user
configures with their own key (BYOK). It has no other feature.

## Permissions

### `storage`
Persist the user's own configuration locally: provider profiles (endpoint,
model, API key), language/display preferences, per-site rules, custom prompts,
and a translation cache. Nothing is stored remotely.

### `contextMenus`
Add two right-click entries — "Translate this page" and "Translate selection" —
as an alternative to the toolbar button and keyboard shortcuts.

### `commands`
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
page using `textContent` only (never parsed as HTML or executed).

## Data usage disclosures

- **Personally identifiable information:** not collected.
- **Health, financial, authentication, personal communications, location, web
  history, user activity:** not collected.
- **Website content:** the text the user chooses to translate is sent **only** to
  the API endpoint the user configured, solely to perform the translation the
  user requested. It is not sent to the developer and not to any other party.
- **Selling data:** we do not sell or transfer user data.
- **Use limitation:** data is used only to perform the user-requested
  translation; there is no analytics, tracking, or advertising.

The developer operates no server and receives no user data.
