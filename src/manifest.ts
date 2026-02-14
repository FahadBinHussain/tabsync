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
      '16': 'src/assets/icon-16.png',
      '32': 'src/assets/icon-32.png',
      '48': 'src/assets/icon-48.png',
      '128': 'src/assets/icon-128.png',
    },
  },

  icons: {
    '16': 'src/assets/icon-16.png',
    '32': 'src/assets/icon-32.png',
    '48': 'src/assets/icon-48.png',
    '128': 'src/assets/icon-128.png',
  },
});
