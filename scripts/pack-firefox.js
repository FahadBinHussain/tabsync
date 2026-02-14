import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const outputDir = path.join(rootDir, 'build');

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Read package.json for version
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
);
const version = packageJson.version;

// Create a ZIP file (Firefox expects XPI which is just a ZIP)
const xpiFile = path.join(outputDir, `tabsync-firefox-v${version}.xpi`);

console.log('📦 Packaging Firefox extension...');
console.log(`   Source: ${distDir}`);
console.log(`   Output: ${xpiFile}`);

try {
  // Use PowerShell to create a ZIP file (rename to .xpi)
  const tempZip = xpiFile.replace('.xpi', '.zip');
  const psCommand = `Compress-Archive -Path "${distDir}\\*" -DestinationPath "${tempZip}" -Force`;
  execSync(`powershell -Command "${psCommand}"`, { stdio: 'inherit' });
  
  // Rename to .xpi
  if (fs.existsSync(xpiFile)) {
    fs.unlinkSync(xpiFile);
  }
  fs.renameSync(tempZip, xpiFile);
  
  console.log('✅ Firefox extension packaged successfully!');
  console.log(`   File: ${xpiFile}`);
  console.log('');
  console.log('📝 To install in Firefox:');
  console.log('   1. Go to about:debugging#/runtime/this-firefox');
  console.log('   2. Click "Load Temporary Add-on"');
  console.log('   3. Select the .xpi file');
  console.log('');
  console.log('   For permanent installation, you need to sign it at:');
  console.log('   https://addons.mozilla.org/developers/');
} catch (error) {
  console.error('❌ Failed to package extension:', error.message);
  process.exit(1);
}
