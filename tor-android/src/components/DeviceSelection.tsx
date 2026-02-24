import { useState, useEffect, useCallback } from 'react';
import { loadFirebaseConfig, loadProxyUrl, saveDeviceId, saveDeviceName } from '../lib/storage';
import { restListDocs, restSetDoc, extractRestConfig } from '../lib/firestoreRest';
import { isTorBrowser } from '../lib/utils';

interface Device {
  id: string;
  deviceName: string;
  lastUpdated: any;
  tabCount: number;
}

interface DeviceSelectionProps {
  onDeviceSelected: () => void;
}

type LoadStatus =
  | { stage: 'idle' }
  | { stage: 'reading-config' }
  | { stage: 'connecting' }
  | { stage: 'querying' }
  | { stage: 'done' }
  | { stage: 'error'; message: string };

const LOAD_TIMEOUT_MS = 12_000;

export function DeviceSelection({ onDeviceSelected }: DeviceSelectionProps) {
  const [devices, setDevices]             = useState<Device[]>([]);
  const [status, setStatus]               = useState<LoadStatus>({ stage: 'idle' });
  const [showNewDevice, setShowNewDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState('');

  const loadExistingDevices = useCallback(async () => {
    const timer = setTimeout(() => {
      setStatus({ stage: 'error', message: 'Timed out after 12s. Check internet connection and Firebase config, then retry.' });
    }, LOAD_TIMEOUT_MS);

    try {
      setStatus({ stage: 'reading-config' });
      const firebaseConfig = await loadFirebaseConfig();
      if (!firebaseConfig) {
        clearTimeout(timer);
        setStatus({ stage: 'error', message: 'No Firebase config found. Go back and enter your config.' });
        return;
      }

      setStatus({ stage: 'connecting' });
      const tor = await isTorBrowser();
      console.log('[TabSync] isTorBrowser:', tor);
      const proxyUrl = (await loadProxyUrl()) ?? undefined;
      const restCfg  = extractRestConfig(firebaseConfig, proxyUrl);

      setStatus({ stage: 'querying' });
      const docs = await restListDocs(restCfg, 'devices');
      clearTimeout(timer);

      const list: Device[] = docs.map(d => ({
        id:          d.id,
        deviceName:  d.deviceName ?? '',
        lastUpdated: d.lastUpdated ?? null,
        tabCount:    d.tabCount ?? (Array.isArray(d.tabs) ? d.tabs.length : 0),
      }));

      list.sort((a, b) => {
        const ta = a.lastUpdated instanceof Date ? a.lastUpdated.getTime() : (a.lastUpdated ?? 0);
        const tb = b.lastUpdated instanceof Date ? b.lastUpdated.getTime() : (b.lastUpdated ?? 0);
        return tb - ta;
      });

      setDevices(list);
      setStatus({ stage: 'done' });
    } catch (err: any) {
      clearTimeout(timer);
      setStatus({ stage: 'error', message: `Firestore error: ${err.message ?? String(err)}` });
    }
  }, []);

  useEffect(() => { loadExistingDevices(); }, [loadExistingDevices]);

  async function handleSelectExistingDevice(device: Device) {
    try {
      setSaving(true);
      setSaveError('');
      await saveDeviceId(device.id);
      await saveDeviceName(device.deviceName);
      onDeviceSelected();
    } catch (err: any) {
      setSaveError('Failed to select device: ' + err.message);
      setSaving(false);
    }
  }

  async function handleCreateNewDevice() {
    if (!newDeviceName.trim()) { setSaveError('Device name cannot be empty'); return; }
    try {
      setSaving(true);
      setSaveError('');
      const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await saveDeviceId(deviceId);
      await saveDeviceName(newDeviceName.trim());

      const firebaseConfig = await loadFirebaseConfig();
      if (firebaseConfig) {
        const proxyUrl = (await loadProxyUrl()) ?? undefined;
        const restCfg  = extractRestConfig(firebaseConfig, proxyUrl);
        await restSetDoc(restCfg, `devices/${deviceId}`, {
          deviceName:  newDeviceName.trim(),
          lastUpdated: new Date().toISOString(),
          tabs:        [],
          tabCount:    0,
        });
      }
      onDeviceSelected();
    } catch (err: any) {
      setSaveError('Failed to create device: ' + err.message);
      setSaving(false);
    }
  }

  const formatTimestamp = (ts: any): string => {
    if (!ts) return 'Unknown';
    try {
      const date = ts instanceof Date ? ts : (ts.toDate ? ts.toDate() : new Date(ts));
      const m = Math.floor((Date.now() - date.getTime()) / 60_000);
      if (m < 1)  return 'Just now';
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    } catch { return 'Unknown'; }
  };

  const stageLabel: Record<string, string> = {
    idle: 'Starting…', 'reading-config': 'Reading Firebase config…',
    connecting: 'Connecting to Firestore…', querying: 'Fetching devices…',
  };
  const isLoading = ['idle','reading-config','connecting','querying'].includes(status.stage);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center space-y-4 px-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto" />
          <p className="text-white font-medium text-sm">{stageLabel[status.stage] ?? 'Loading…'}</p>
          <p className="text-xs text-gray-500">Timeout in 12s</p>
        </div>
      </div>
    );
  }

  if (status.stage === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-4">
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3">
            <p className="font-semibold text-red-300 mb-1 text-sm">⚠️ Could not load devices</p>
            <p className="text-xs text-red-200">{status.message}</p>
          </div>
          <button onClick={() => { setStatus({ stage: 'idle' }); loadExistingDevices(); }}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-sm transition-colors">
            🔄 Retry
          </button>
          <button onClick={() => setShowNewDevice(true)}
            className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-sm transition-colors">
            + Create new device anyway
          </button>
        </div>
      </div>
    );
  }

  if (showNewDevice) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-xl mx-auto">
          <button onClick={() => setShowNewDevice(false)}
            className="mb-5 text-gray-400 hover:text-white flex items-center gap-2 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold mb-6">Create New Device</h1>
          {saveError && (
            <div className="mb-4 bg-red-900/50 border border-red-700 text-red-200 px-3 py-2 rounded-lg text-sm">{saveError}</div>
          )}
          <div className="space-y-4">
            <input type="text" value={newDeviceName} onChange={e => setNewDeviceName(e.target.value)}
              placeholder="e.g., My Phone, Work Laptop"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              autoFocus onKeyDown={e => e.key === 'Enter' && handleCreateNewDevice()} />
            <button onClick={handleCreateNewDevice} disabled={saving || !newDeviceName.trim()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium text-sm transition-colors">
              {saving ? 'Creating…' : 'Create Device'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-5 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold mb-1">Select Device</h1>
            <p className="text-xs text-gray-400">
              {devices.length > 0 ? `${devices.length} device(s) found` : 'No existing devices found.'}
            </p>
          </div>
          <button onClick={() => { setStatus({ stage: 'idle' }); loadExistingDevices(); }}
            title="Refresh" className="p-1.5 text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {saveError && (
          <div className="mb-4 bg-red-900/50 border border-red-700 text-red-200 px-3 py-2 rounded-lg text-sm">{saveError}</div>
        )}

        {devices.length > 0 && (
          <div className="mb-5 space-y-2">
            {devices.map(device => (
              <button key={device.id} onClick={() => handleSelectExistingDevice(device)} disabled={saving}
                className="w-full text-left p-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-blue-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                <div className="flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{device.deviceName}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{device.tabCount || 0} tab(s) • {formatTimestamp(device.lastUpdated)}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className={devices.length > 0 ? 'border-t border-gray-700 pt-4' : ''}>
          <button onClick={() => setShowNewDevice(true)} disabled={saving}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Device
          </button>
        </div>
      </div>
    </div>
  );
}
