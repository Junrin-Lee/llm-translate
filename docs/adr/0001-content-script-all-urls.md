# Content script always resident on `<all_urls>`, not activeTab / optional permissions

**English** · [简体中文](./0001-content-script-all-urls.zh-CN.md)

Selection Translation requires that "selecting text on any page immediately shows a trigger icon", and Page Translation's Auto-translate Site requires being able to step in as soon as the page loads; both need the content script to be resident on all http/https pages, so the manifest declares `<all_urls>` directly (including `host_permissions`, since the background also needs to send requests to any user-configured API Base URL). The cost is the install-time "read and change all your data on all websites" disclosure and stricter store review — this is the industry norm for translation extensions (Immersive Translate, Trancy), addressed through permission-purpose justifications and a privacy policy.

## Considered Options

- **activeTab**: Friendliest for review, but the script does not exist before the extension icon is clicked; "select text and the icon appears" and the Auto-translate Site are both impossible to implement, conflicting with settled features. Rejected.
- **optional_host_permissions + onboarding authorization**: Zero disclosure at install time, but the "unauthorized state" seeps into every feature path, significantly increasing complexity; the only benefit is moving the same disclosure from install time to first use. Rejected.
