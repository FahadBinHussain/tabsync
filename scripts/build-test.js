/**
 * scripts/build-test.js
 *
 * Quick local test build — both Chrome and Firefox, no signing, no version bump.
 *
 * Produces (4 files):
 *   build/tabsync-chrome-test.zip    — Chrome: load via chrome://extensions → Load unpacked
 *   build/tabsync-chrome-test.crx    — Chrome: sideload (requires key.pem)
 *   build/tabsync-firefox-test.zip   — Firefox source ZIP
 *   build/tabsync-firefox-test.xpi   — Firefox: load via about:debugging → Load Temporary Add-on
 *
 * Usage:
 *   pnpm build:test
 */

import fs              from 'fs';
import path            from 'path';
import { fileURLToPath } from 'url';
import { execSync }    from 'child_process';
import archiver        from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const rootDir  = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const keyPath  = path.join(rootDir, 'key.pem');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version;

function run(cmd) {
  console.log(`  → ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: rootDir });
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function createZip(srcDir, outPath) {
  return new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

console.log(`\n🔧  TabSync — local test build  (v${version}, unsigned)\n`);
ensureDir(buildDir);

// ─── TypeScript check ────────────────────────────────────────────────────────
console.log('🔍  Type-checking…');
run('pnpm exec tsc --noEmit');

// ─────────────────────────────────────────────────────────────────────────────
// CHROME
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n�  [Chrome] Building…');
run('pnpm exec vite build');

const chromeDistDir = path.join(rootDir, 'dist-chrome');
const chromeZip     = path.join(buildDir, 'tabsync-chrome-test.zip');
const chromeCrx     = path.join(buildDir, 'tabsync-chrome-test.crx');

console.log('📦  [Chrome] Packaging ZIP…');
await createZip(chromeDistDir, chromeZip);

if (fs.existsSync(keyPath)) {
  console.log('📦  [Chrome] Packaging CRX…');
  try {
    execSync(`pnpm exec crx pack "${chromeDistDir}" -p "${keyPath}" -o "${chromeCrx}"`, { stdio: 'inherit', cwd: rootDir });
  } catch {
    console.warn('  ⚠  CRX packaging failed — skipping');
  }
} else {
  console.log('  ℹ  key.pem not found — skipping CRX');
}

// ─────────────────────────────────────────────────────────────────────────────
// FIREFOX
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📦  [Firefox] Building popup…');
run('pnpm exec vite build --config vite.config.firefox.ts');

console.log('📦  [Firefox] Building background…');
run('pnpm exec vite build --config vite.config.firefox.bg.ts');

const firefoxDistDir = path.join(rootDir, 'dist-firefox');

console.log('📝  [Firefox] Writing manifest.json…');
const manifest = {
  manifest_version: 2,
  name: 'TabSync',
  version,
  description: 'Sync your open tabs across devices',
  browser_specific_settings: { gecko: { id: 'tabsyncc@tabsync', strict_min_version: '91.0' } },
  permissions: ['tabs', 'storage', 'bookmarks', '<all_urls>', 'proxy'],
  background: { scripts: ['background.js'], persistent: true },
  browser_action: {
    default_popup: 'src/popup/index.html',
    default_icon: { '128': 'icons/icon-128.png' },
  },
  icons: { '128': 'icons/icon-128.png' },
};
fs.writeFileSync(path.join(firefoxDistDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

// Copy icons
const srcIcons = path.join(rootDir, 'public', 'icons');
const dstIcons = path.join(firefoxDistDir, 'icons');
ensureDir(dstIcons);
for (const f of fs.readdirSync(srcIcons)) {
  fs.copyFileSync(path.join(srcIcons, f), path.join(dstIcons, f));
}

const firefoxZip = path.join(buildDir, 'tabsync-firefox-test.zip');
const firefoxXpi = path.join(buildDir, 'tabsync-firefox-test.xpi');

console.log('📦  [Firefox] Packaging ZIP…');
await createZip(firefoxDistDir, firefoxZip);

console.log('📦  [Firefox] Packaging XPI…');
await createZip(firefoxDistDir, firefoxXpi);

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`
✅  Done!  (v${version})

   Chrome:
     build/tabsync-chrome-test.zip   → chrome://extensions → Load unpacked (extract first)
     ${fs.existsSync(chromeCrx) ? 'build/tabsync-chrome-test.crx   → drag into chrome://extensions' : '(no CRX — key.pem not found)'}

   Firefox:
     build/tabsync-firefox-test.xpi  → about:debugging → Load Temporary Add-on
     build/tabsync-firefox-test.zip  → source ZIP
`);
