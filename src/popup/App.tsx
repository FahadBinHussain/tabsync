import { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { ConfigForm } from '../components/ConfigForm';
import { DeviceList } from '../components/DeviceList';

export function App() {
  const [hasConfig, setHasConfig] = useState<boolean | null>(null);

  useEffect(() => {
    checkConfig();
  }, []);

  async function checkConfig() {
    const { firebaseConfig } = await browser.storage.local.get('firebaseConfig');
    setHasConfig(!!firebaseConfig);
  }

  if (hasConfig === null) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!hasConfig) {
    return <ConfigForm onConfigSaved={() => setHasConfig(true)} />;
  }

  return <DeviceList onResetConfig={() => setHasConfig(false)} />;
}
