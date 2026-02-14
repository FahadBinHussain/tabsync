import { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { ConfigForm } from '../components/ConfigForm';
import { DeviceSelection } from '../components/DeviceSelection';
import { DeviceList } from '../components/DeviceList';

type AppState = 'loading' | 'needsConfig' | 'needsDevice' | 'ready';

export function App() {
  const [appState, setAppState] = useState<AppState>('loading');

  useEffect(() => {
    checkSetupState();
  }, []);

  async function checkSetupState() {
    const { firebaseConfig, deviceId } = await browser.storage.local.get(['firebaseConfig', 'deviceId']);
    
    if (!firebaseConfig) {
      setAppState('needsConfig');
    } else if (!deviceId) {
      setAppState('needsDevice');
    } else {
      setAppState('ready');
    }
  }

  function handleConfigSaved() {
    setAppState('needsDevice');
  }

  function handleDeviceSelected() {
    setAppState('ready');
  }

  function handleResetConfig() {
    setAppState('needsConfig');
  }

  if (appState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (appState === 'needsConfig') {
    return <ConfigForm onConfigSaved={handleConfigSaved} />;
  }

  if (appState === 'needsDevice') {
    return <DeviceSelection onDeviceSelected={handleDeviceSelected} />;
  }

  return <DeviceList onResetConfig={handleResetConfig} />;
}
