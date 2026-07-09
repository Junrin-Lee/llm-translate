// Asserts the Firefox build artifact matches ADR-0005. Run after `wxt build -b firefox --mv3`.
import { readFileSync } from 'node:fs';

const OUT = new URL('../.output/firefox-mv3/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', OUT), 'utf8'));

const failures = [];
const expect = (cond, msg) => {
  if (!cond) failures.push(msg);
};

expect(manifest.manifest_version === 3, 'manifest_version must be 3');
expect(
  manifest.browser_specific_settings?.gecko?.id === 'llm-translate@junrin-lee.github.io',
  'gecko.id must be llm-translate@junrin-lee.github.io (immutable once listed on AMO)',
);
expect(
  manifest.browser_specific_settings?.gecko?.strict_min_version === '128.0',
  'gecko.strict_min_version must be 128.0',
);
expect(
  Array.isArray(manifest.background?.scripts) && !manifest.background?.service_worker,
  'Firefox MV3 background must be an event page (background.scripts), not a service worker',
);
for (const p of ['storage', 'contextMenus'])
  expect(manifest.permissions?.includes(p), `permissions must include ${p}`);
expect(
  manifest.host_permissions?.includes('<all_urls>'),
  'host_permissions must include <all_urls>',
);
for (const c of ['translate-selection', 'translate-page'])
  expect(c in (manifest.commands ?? {}), `commands must include ${c}`);
expect(manifest.action?.default_popup === 'popup.html', 'action.default_popup must be popup.html');
expect(manifest.options_ui?.open_in_tab === true, 'options_ui.open_in_tab must be true');

if (failures.length) {
  console.error('✗ firefox manifest verification failed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ firefox manifest OK');
