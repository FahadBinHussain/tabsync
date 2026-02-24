/**
 * scripts/build-tor.js
 *
 * Builds the tor-android popup with Vite, then packages it
 * into build/tabsync-tor-android.xpi (unsigned ZIP).
 *
 * Structure inside the XPI:
 *   manifest.json
 *   icons/icon-128.png
 *   src/popup/index.html
 *   assets/...  (JS/CSS emitted by Vite)
 */

import fs   from 'fs';
import path from 'path';
import archiver from 'archiver';
import { execSync }    from 'child_process';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const root       = path.resolve(__dirname, '..');
const torDir     = path.join(root, 'tor-android');
const distDir    = path.join(torDir, 'dist');
const buildDir   = path.join(root, 'build');
// Read extension ID from manifest to name the XPI accordingly
const manifest   = JSON.parse(fs.readFileSync(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'tor-android', 'manifest.json'), 'utf8'));
const extId      = manifest?.browser_specific_settings?.gecko?.id ?? 'tabsync-tor-android';
const outXpi     = path.join(buildDir, `${extId}.xpi`);
const outZip     = path.join(buildDir, `${extId}.zip`);

// ── 1. Install tor-android node_modules if missing ──────────────────────────
const nmDir = path.join(torDir, 'node_modules');
if (!fs.existsSync(nmDir)) {
  console.log('📦  Installing tor-android dependencies…');
  execSync('pnpm install', { cwd: torDir, stdio: 'inherit' });
}

// ── 2. Run Vite build inside tor-android/ ───────────────────────────────────
console.log('🔨  Building tor-android popup…');
execSync('pnpm vite build', { cwd: torDir, stdio: 'inherit' });

// ── 3. Ensure icons exist in dist ───────────────────────────────────────────
const distIconsDir  = path.join(distDir, 'icons');
const srcIconsDir   = path.join(root, 'public', 'icons');
fs.mkdirSync(distIconsDir, { recursive: true });

const iconFile = 'icon-128.png';
const srcIcon  = path.join(srcIconsDir, iconFile);
const dstIcon  = path.join(distIconsDir, iconFile);
if (fs.existsSync(srcIcon)) {
  fs.copyFileSync(srcIcon, dstIcon);
  console.log(`🖼️   Copied ${iconFile}`);
} else {
  console.warn(`⚠️   ${srcIcon} not found — extension will have no icon`);
}

// ── 4. Copy manifest.json into dist ─────────────────────────────────────────
const manifestSrc = path.join(torDir, 'manifest.json');
const manifestDst = path.join(distDir, 'manifest.json');
fs.copyFileSync(manifestSrc, manifestDst);
console.log('📄  Copied manifest.json');

// ── 5. Verify popup HTML exists in dist ──────────────────────────────────────
const popupHtmlDist = path.join(distDir, 'index.html');
if (!fs.existsSync(popupHtmlDist)) {
  console.warn('⚠️   dist/index.html not found — Vite build may have failed');
} else {
  console.log('✅  dist/index.html present');
}

// ── 6. ZIP dist/ contents using archiver (forward-slash paths, Firefox-safe) ─
fs.mkdirSync(buildDir, { recursive: true });
if (fs.existsSync(outXpi)) fs.unlinkSync(outXpi);

await new Promise((resolve, reject) => {
  const out     = fs.createWriteStream(outXpi);
  const archive = archiver('zip', { zlib: { level: 9 } });
  out.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(out);
  // Add all files from dist/ — archiver uses forward slashes automatically
  archive.directory(distDir, false);
  archive.finalize();
});

console.log(`\n✅  build/${extId}.xpi  (unsigned)\n`);
