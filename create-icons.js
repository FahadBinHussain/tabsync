import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create simple SVG icons and save as PNG placeholders
const sizes = [16, 32, 48, 128];
const assetsDir = path.join(__dirname, 'src', 'assets');

// Simple SVG template for TabSync icon
const createSVG = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#3B82F6"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.5}" fill="white" text-anchor="middle" dominant-baseline="middle" font-weight="bold">T</text>
</svg>`;

sizes.forEach(size => {
  const svgContent = createSVG(size);
  const filename = `icon-${size}.png`;
  const filepath = path.join(assetsDir, filename);
  
  fs.writeFileSync(filepath, svgContent);
  console.log(`Created ${filename}`);
});

console.log('\\nPlaceholder icon files created! For production, please replace with proper PNG icons.');
