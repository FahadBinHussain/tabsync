/**
 * scripts/bump.js — auto-increment version + rebuild + sign
 *
 * Usage:
 *   pnpm bump           — increment patch  (1.0.0 → 1.0.1)
 *   pnpm bump:minor     — increment minor  (1.0.1 → 1.1.0)
 *   pnpm bump:major     — increment major  (1.1.0 → 2.0.0)
 *
 * After bumping the version, automatically runs pnpm pack:all so you get
 * fresh Chrome + Firefox artifacts with the new version number.
 * If AMO_JWT_ISSUER + AMO_JWT_SECRET are set in .env, the Firefox XPI
 * will be Mozilla-signed automatically.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const rootDir    = path.resolve(__dirname, '..');

// Which semver segment to bump (default: patch)
const segment = (process.argv[2] || 'patch').toLowerCase();
if (!['patch', 'minor', 'major'].includes(segment)) {
  console.error(`❌ Unknown segment "${segment}". Use: patch | minor | major`);
  process.exit(1);
}

const pkgPath = path.join(rootDir, 'package.json');
const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const old     = pkg.version;

// Bump version
const [major, minor, patch] = old.split('.').map(Number);
let next;
if (segment === 'major') next = `${major + 1}.0.0`;
else if (segment === 'minor') next = `${major}.${minor + 1}.0`;
else next = `${major}.${minor}.${patch + 1}`;

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`\n🔖  Version bumped: ${old} → ${next}`);
console.log('📦  Running full build + package...\n');

try {
  execSync('pnpm pack:all', {
    stdio: 'inherit',
    cwd: rootDir,
  });
} catch {
  // pack:all already prints its own error; just exit with failure
  process.exit(1);
}
