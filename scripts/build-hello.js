import { mkdirSync, copyFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Load .env for AMO credentials (same pattern as pack.js)
import fs from 'fs';
import path from 'path';

const root = resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helloDir = join(root, 'hello-world');
const buildDir = join(root, 'build');
const outName  = 'hello-world-test@tabsync';

// Read AMO creds from .env
let amoIssuer = process.env.AMO_JWT_ISSUER || '';
let amoSecret = process.env.AMO_JWT_SECRET || '';
const envFile = join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const [k, ...rest] = line.split('=');
    const v = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
    if (k.trim() === 'AMO_JWT_ISSUER') amoIssuer = v;
    if (k.trim() === 'AMO_JWT_SECRET') amoSecret = v;
  }
}

mkdirSync(buildDir, { recursive: true });

const zipPath = join(buildDir, `${outName}.zip`);
const xpiPath = join(buildDir, `${outName}.xpi`);

// Step 1: ZIP
execSync(
  `powershell -Command "Compress-Archive -Path '${join(helloDir, 'manifest.json')}','${join(helloDir, 'popup.html')}','${join(helloDir, 'popup.js')}','${join(helloDir, 'background.js')}' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' }
);

// Step 2: Copy zip as XPI (unsigned — no signing for hello-world test)
copyFileSync(zipPath, xpiPath);
console.log(`✅  build/${outName}.xpi  (unsigned)`);
