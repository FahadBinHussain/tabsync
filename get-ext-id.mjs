import { readFileSync } from 'fs';
import { createHash, createPublicKey } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pem = readFileSync(join(__dirname, 'key.pem'), 'utf8');
const pub = createPublicKey(pem);
const der = pub.export({ type: 'spki', format: 'der' });
const hash = createHash('sha256').update(der).digest('hex');
const id = hash.slice(0, 32).split('').map(c => {
  const n = parseInt(c, 16);
  return String.fromCharCode(n < 10 ? 97 + n : 87 + n);
}).join('');
const keyBase64 = der.toString('base64');
console.log('Extension ID:', id);
console.log('Key (base64):', keyBase64);
