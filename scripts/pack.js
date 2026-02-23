/**
 * scripts/pack.js — unified build + package script for TabSync
 *
 * Produces all distributable artifacts in one command:
 *
 *   Chrome / Edge
 *   ├── build/tabsync-chrome-v{ver}.zip   (load-unpacked / Web Store)
 *   └── build/tabsync-chrome-v{ver}.crx   (sideload, requires key.pem)
 *
 *   Firefox
 *   ├── build/tabsync-firefox-v{ver}.zip  (source ZIP for AMO)
 *   └── build/tabsync-firefox-v{ver}.xpi  (signed XPI if AMO creds set, else unsigned)
 *
 * Usage:
 *   pnpm pack:all          — build + package both browsers
 *   pnpm pack:all chrome   — only Chrome artifacts
 *   pnpm pack:all firefox  — only Firefox artifacts
 *
 * AMO auto-signing (permanent fix for Tor Browser / Firefox warnings):
 *   Set these env vars before running:
 *     AMO_JWT_ISSUER   — from https://addons.mozilla.org/developers/addon/api/key/
 *     AMO_JWT_SECRET   — same page
 *   When set, calls `web-ext sign` to produce a Mozilla-signed XPI.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const rootDir  = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const keyPath  = path.join(rootDir, 'key.pem');

// ── Load .env from project root (if present) ────────────────────────────────
// Node does not auto-load .env — we parse it ourselves to avoid adding dotenv.
const envFile = path.join(rootDir, '.env');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

// Read version from package.json
const pkg     = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version;

// Which browsers to build (defaults to both)
const target = (process.argv[2] || 'all').toLowerCase();
const doBuildChrome  = target === 'all' || target === 'chrome';
const doBuildFirefox = target === 'all' || target === 'firefox';

// AMO signing credentials (optional)
const amoIssuer = process.env.AMO_JWT_ISSUER || '';
const amoSecret = process.env.AMO_JWT_SECRET || '';
const canSign   = Boolean(amoIssuer && amoSecret);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function step(msg) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${msg}`);
  console.log('─'.repeat(60));
}

function ok(msg)   { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }

/**
 * Create a ZIP archive of a directory.
 * @param {string} srcDir   - directory whose CONTENTS to zip (not the dir itself)
 * @param {string} destZip  - output .zip path
 */
function createZip(srcDir, destZip) {
  return new Promise((resolve, reject) => {
    const out     = fs.createWriteStream(destZip);
    const archive = archiver('zip', { zlib: { level: 9 } });

    out.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(out);
    archive.directory(srcDir, false); // false = don't add a root folder
    archive.finalize();
  });
}

/**
 * Run a shell command, inheriting stdio so output is visible.
 */
function run(cmd, env = {}) {
  execSync(cmd, {
    stdio: 'inherit',
    cwd: rootDir,
    env: { ...process.env, ...env },
  });
}

/**
 * Like run(), but catches errors instead of throwing.
 * Returns { ok: true } on success or { ok: false, message } on failure.
 */
function tryRun(cmd, env = {}) {
  try {
    execSync(cmd, {
      stdio: 'inherit',
      cwd: rootDir,
      env: { ...process.env, ...env },
    });
    return { ok: true, message: '' };
  } catch (e) {
    // execSync puts combined output in e.message for 'inherit' stdio
    const msg = String(e?.message ?? e?.stderr ?? e);
    return { ok: false, message: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chrome build + packaging
// ─────────────────────────────────────────────────────────────────────────────

async function buildChrome() {
  step('Chrome / Edge  —  build');

  const distDir = path.join(rootDir, 'dist');
  const zipOut  = path.join(buildDir, `tabsync-chrome-v${version}.zip`);
  const crxOut  = path.join(buildDir, `tabsync-chrome-v${version}.crx`);

  // 1. Compile TypeScript + Vite build (Chrome is the default target)
  info('Running: tsc && vite build');
  run('pnpm exec tsc');
  run('pnpm exec vite build');

  ensureDir(buildDir);

  // 2. ZIP (works for Web Store upload + "Load unpacked" after extraction)
  info(`Creating ZIP → ${path.basename(zipOut)}`);
  await createZip(distDir, zipOut);
  ok(`ZIP created:  build/${path.basename(zipOut)}`);

  // 3. CRX (sideload) — requires key.pem
  if (fs.existsSync(keyPath)) {
    info(`Creating CRX → ${path.basename(crxOut)}`);
    run(`pnpm exec crx pack "${distDir}" -p "${keyPath}" -o "${crxOut}"`);
    ok(`CRX created:  build/${path.basename(crxOut)}`);
  } else {
    warn('key.pem not found — skipping CRX generation');
    info('To generate: Go to chrome://extensions → Pack Extension → select dist folder');
    info('Save the output .pem as key.pem in the project root, then re-run.');
  }

  console.log('');
  ok('Chrome packaging complete!');
  info('Load unpacked: chrome://extensions → Load unpacked → select dist/');
  info('CRX sideload:  drag .crx into chrome://extensions/');
}

// ─────────────────────────────────────────────────────────────────────────────
// Firefox MV2 manifest (written into dist-firefox by pack script)
// ─────────────────────────────────────────────────────────────────────────────

function buildFirefoxManifest() {
  return {
    manifest_version: 2,
    name: 'TabSync',
    version,
    description: 'Sync your open tabs across devices',
    browser_specific_settings: {
      gecko: {
        id: 'tabsync@yourdomain.com',
        strict_min_version: '91.0',
      },
    },
    permissions: ['tabs', 'storage', 'bookmarks', '<all_urls>'],
    background: { scripts: ['background.js'] },
    browser_action: {
      default_popup: 'src/popup/index.html',
      default_icon: { '128': 'icons/icon-128.png' },
    },
    icons: { '128': 'icons/icon-128.png' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Firefox build + packaging
// ─────────────────────────────────────────────────────────────────────────────

async function buildFirefox() {
  step('Firefox  —  build');

  const distDir = path.join(rootDir, 'dist-firefox');
  const zipOut  = path.join(buildDir, `tabsync-firefox-v${version}.zip`);
  const xpiOut  = path.join(buildDir, `tabsync-firefox-v${version}.xpi`);

  // 1a. Build popup (no CRXJS — it only supports MV3)
  info('Running: vite build --config vite.config.firefox.ts  (popup)');
  run('pnpm exec tsc --noEmit');
  run('pnpm exec vite build --config vite.config.firefox.ts');

  // 1b. Build background as IIFE — MV2 background.scripts = classic script, no import allowed
  info('Running: vite build --config vite.config.firefox.bg.ts  (background IIFE)');
  run('pnpm exec vite build --config vite.config.firefox.bg.ts');

  // 2. Write MV2 manifest.json
  info('Writing MV2 manifest.json');
  fs.writeFileSync(
    path.join(distDir, 'manifest.json'),
    JSON.stringify(buildFirefoxManifest(), null, 2),
  );
  ok('manifest.json written (MV2)');

  // 3. Copy icons
  const srcIconsDir  = path.join(rootDir, 'public', 'icons');
  const destIconsDir = path.join(distDir, 'icons');
  if (fs.existsSync(srcIconsDir)) {
    ensureDir(destIconsDir);
    for (const file of fs.readdirSync(srcIconsDir)) {
      fs.copyFileSync(path.join(srcIconsDir, file), path.join(destIconsDir, file));
    }
    ok('Icons copied to dist-firefox/icons/');
  }

  ensureDir(buildDir);

  // 4. Source ZIP
  info(`Creating ZIP → ${path.basename(zipOut)}`);
  await createZip(distDir, zipOut);
  ok(`ZIP created:  build/${path.basename(zipOut)}`);

  // 5. XPI — signed via web-ext if AMO creds available, otherwise plain rename
  if (canSign) {
    info('AMO credentials found — signing XPI via web-ext...');
    info('(Contacting addons.mozilla.org — may take 30–60 seconds)');

    const artifactsDir = path.join(buildDir, 'amo-artifacts');
    ensureDir(artifactsDir);

    const signResult = tryRun(
      `pnpm exec web-ext sign` +
      ` --source-dir "${distDir}"` +
      ` --artifacts-dir "${artifactsDir}"` +
      ` --api-key "${amoIssuer}"` +
      ` --api-secret "${amoSecret}"` +
      ` --channel unlisted`,
    );
    const signed = signResult.ok;

    if (!signed) {
      const errMsg = signResult.message;
      if (errMsg.includes('already exists') || errMsg.includes('Conflict') || errMsg.includes('Version 1')) {
        warn('AMO: version already signed — reusing previously downloaded XPI.');
        warn('To get a new signature, bump the version in package.json and re-run.');
      } else {
        warn(`web-ext sign failed: ${errMsg}`);
        warn('Falling back to unsigned XPI. Check AMO credentials or try again.');
      }
    }

    // Find the signed XPI in artifacts dir (could be from this run or a prior run)
    const signedFile = fs.readdirSync(artifactsDir).find(f => f.endsWith('.xpi'));
    if (signedFile) {
      fs.copyFileSync(path.join(artifactsDir, signedFile), xpiOut);
      ok(`Signed XPI: build/${path.basename(xpiOut)}${signed ? '' : '  (reused from prior sign)'}`);
      ok('Mozilla-signed — installs in Tor Browser with no warning!');
    } else {
      warn('No signed XPI found in amo-artifacts/ — falling back to unsigned.');
      fs.copyFileSync(zipOut, xpiOut);
      warn('Load temporarily via about:debugging, or bump version + re-run to get fresh signed XPI.');
    }
  } else {
    info(`Creating XPI (unsigned) → ${path.basename(xpiOut)}`);
    fs.copyFileSync(zipOut, xpiOut);
    ok(`XPI created:  build/${path.basename(xpiOut)}`);
    warn('XPI is unsigned — will show a warning in Tor Browser / strict Firefox.');
    warn('To auto-sign: set AMO_JWT_ISSUER + AMO_JWT_SECRET env vars and re-run.');
    info('Get your API keys: https://addons.mozilla.org/developers/addon/api/key/');
  }

  console.log('');
  ok('Firefox packaging complete!');
  info('Load temporarily:  about:debugging → Load Temporary Add-on → select .xpi');
  if (canSign) {
    info('Permanent install: drag the signed .xpi into Firefox / Tor Browser');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀  TabSync — unified build & package  (v${version})`);
  console.log(`    Targets: ${target}`);
  if (doBuildFirefox) {
    console.log(`    Signing: ${canSign ? '✅ AMO credentials present' : '⚠️  No AMO creds — XPI will be unsigned'}`);
  }

  ensureDir(buildDir);

  if (doBuildChrome)  await buildChrome();
  if (doBuildFirefox) await buildFirefox();

  step('All done!');
  console.log('');
  console.log('  Artifacts in ./build/');
  if (doBuildChrome) {
    console.log(`    tabsync-chrome-v${version}.zip`);
    if (fs.existsSync(keyPath))
      console.log(`    tabsync-chrome-v${version}.crx`);
  }
  if (doBuildFirefox) {
    console.log(`    tabsync-firefox-v${version}.zip`);
    console.log(`    tabsync-firefox-v${version}.xpi  ${canSign ? '(Mozilla-signed ✅)' : '(unsigned ⚠️)'}`);
  }
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Pack failed:', err.message ?? err);
  process.exit(1);
});
