// One-click Firefox self-distribution (unlisted) signing.
//
// Assumes `.output/firefox-mv3/` already exists (the `sign:firefox` pnpm
// script runs `build:firefox` first). Loads the AMO JWT credentials from
// `.env`, then invokes the PINNED `web-ext@7.11.0` — newer web-ext rejects our
// minified production bundle and forces manual review (see ADR / project memo).
// The signed `.xpi` lands in `web-ext-artifacts/` (git-ignored).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sourceDir = new URL('.output/firefox-mv3/', root);
const envFile = new URL('.env', root);

const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

if (!existsSync(sourceDir)) fail('Missing .output/firefox-mv3/ — run `pnpm build:firefox` first.');

// Parse `.env` (simple KEY=value lines) without adding a dependency.
if (!existsSync(envFile))
  fail('Missing .env — copy .env.example to .env and fill in the AMO credentials.');

const env = { ...process.env };
for (const raw of readFileSync(envFile, 'utf8').split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq === -1) continue;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    value = value.slice(1, -1);
  env[key] = value;
}

if (!env.WEB_EXT_API_KEY || !env.WEB_EXT_API_SECRET)
  fail(
    'WEB_EXT_API_KEY / WEB_EXT_API_SECRET are empty in .env.\n' +
      '  Generate them at https://addons.mozilla.org/developers/addon/api/key/',
  );

const version = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version;
console.log(`Signing Firefox add-on v${version} (unlisted) with web-ext@7.11.0 …`);

// web-ext auto-reads WEB_EXT_API_KEY / WEB_EXT_API_SECRET from the environment.
const result = spawnSync(
  'pnpm',
  [
    'dlx',
    'web-ext@7.11.0',
    'sign',
    '--channel=unlisted',
    '--source-dir=.output/firefox-mv3',
    '--artifacts-dir=web-ext-artifacts',
  ],
  { cwd: root, env, stdio: 'inherit' },
);

if (result.status !== 0) {
  console.error(
    '\n✖ Signing failed. Common cause: AMO rejects a re-upload of an existing\n' +
      `  version. AMO accepts each version number ONCE per add-on — if v${version}\n` +
      '  is already signed, bump "version" in package.json and retry.\n',
  );
  process.exit(result.status ?? 1);
}

console.log('\n✔ Signed .xpi written to web-ext-artifacts/');
