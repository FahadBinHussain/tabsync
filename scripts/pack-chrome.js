// This file is superseded by scripts/pack.js (unified Chrome + Firefox packer).
// Run: pnpm pack:all
import { execSync } from 'child_process';
execSync('node scripts/pack.js', { stdio: 'inherit' });


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const outputDir = path.join(rootDir, 'build');
const keyPath = path.join(rootDir, 'key.pem');

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Read package.json for version
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
);
const version = packageJson.version;

const zipFile = path.join(outputDir, `tabsync-chrome-v${version}.zip`);
const crxFile = path.join(outputDir, `tabsync-chrome-v${version}.crx`);

console.log('📦 Packaging Chrome extension...');
console.log(`   Source: ${distDir}`);

async function createZip() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFile);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      console.log('✅ ZIP file created');
      console.log(`   ${zipFile}`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    
    // Add all files from dist directory with proper paths
    archive.directory(distDir, false);
    
    archive.finalize();
  });
}

async function buildExtension() {
  try {
    // Create ZIP file
    await createZip();
    
    // Check if key.pem exists for CRX generation
    if (fs.existsSync(keyPath)) {
      console.log('');
      console.log('🔑 Generating CRX with key.pem...');
      
      // Use crx CLI to generate the CRX
      const crxCommand = `pnpm exec crx pack "${distDir}" -p "${keyPath}" -o "${crxFile}"`;
      execSync(crxCommand, { stdio: 'inherit' });
      
      console.log('✅ CRX file created');
      console.log(`   ${crxFile}`);
      console.log('');
      console.log('✅ Chrome extension packaged successfully!');
      console.log('');
      console.log('📝 To install:');
      console.log('   • Drag the .crx file into chrome://extensions/');
      console.log('   • Or use "Load unpacked" with the dist folder');
      console.log('   • Or extract the ZIP and load from extracted folder');
    } else {
      console.log('');
      console.log('⚠️  key.pem not found - Skipping CRX generation');
      console.log('');
      console.log('💡 To generate key.pem and create CRX:');
      console.log('   1. Go to chrome://extensions/');
      console.log('   2. Enable "Developer mode"');
      console.log('   3. Click "Pack extension"');
      console.log('   4. Select the dist folder');
      console.log('   5. Chrome will generate .crx and .pem files');
      console.log('   6. Save the .pem as key.pem in project root');
      console.log('   7. Run "pnpm build:chrome" again');
      console.log('');
      console.log('✅ Chrome extension packaged successfully!');
      console.log(`   File: ${zipFile}`);
    }
  } catch (error) {
    console.error('❌ Failed to package extension:', error.message);
    process.exit(1);
  }
}

buildExtension();

