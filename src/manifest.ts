import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json';

const { version } = packageJson;

// Environment detection
const isFirefox = process.env.TARGET === 'firefox';

export default defineManifest({
  manifest_version: 3,
  name: 'TabSync',
  version,
  description: 'Sync your open tabs across devices',

  // This key locks the extension ID to dcffddacaaibiiddfabcadadhdgbjhdi
  // so storage.sync survives reinstalls (Chrome ties sync storage to the ID).
  // Generated from key.pem — do NOT change this.
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv4IbB3qvaPn4oZMj5/9K8YJppWB/9kPILhwGWXO29bcWfuFKsitWzcqvGThgeEgibqPf38kb8kg4bYFkBDi5LmO8wPK3cdDeNFmFLQUc+MwflDP6rqXKDJRt1xO5A7V7okVJhtLu1cZuzGgrDA8VQNkhzWt+Z5Aqem0yjAGSsFJRyCLQjNKZMJI8Qp8/QK4O7XV1r1QUYbG2qZVHBoEm5vJnhOa4qW9rJykQmH7/glA38S2dfd43cBfCNb4z0FLYVvbveoWXW4lug0MJCxTRyyHKcKj7Eiq2S1lt8bjzRkADS4El1Z9iblENPUZlcEKEx9AFo7Ql2lRrNdiHeyWn8QIDAQAB',
  
  ...(isFirefox ? {
    browser_specific_settings: {
      gecko: {
        id: 'tabsync@yourdomain.com',
      },
    },
  } : {}),

  permissions: [
    'tabs',
    'storage',
  ],

  background: isFirefox ? {
    scripts: ['src/background/index.ts'],
    type: 'module',
  } : {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '128': 'icons/icon-128.png',
    },
  },

  icons: {
    '128': 'icons/icon-128.png',
  },
});
