import { useState, useEffect, useCallback } from 'react';
import browser from 'webextension-polyfill';
import { loadFirebaseConfig, loadProxyUrl } from '../lib/storage';
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
      console.error('[TabSync] DeviceSelection: timed out waiting for Firestore');
      setStatus({
        stage: 'error',
        message: 'Timed out after 12s. Check internet connection and Firebase config, then retry.',
      });
    }, LOAD_TIMEOUT_MS);

    try {
      setStatus({ stage: 'reading-config' });
      console.log('[TabSync] Reading Firebase config from storage...');
      const firebaseConfig = await loadFirebaseConfig();

      if (!firebaseConfig) {
        clearTimeout(timer);
        console.error('[TabSync] No Firebase config in storage');
        setStatus({ stage: 'error', message: 'No Firebase config found. Go back and enter your config.' });
        return;
      }
      console.log('[TabSync] Firebase config loaded, project:', (firebaseConfig as any).projectId);

      setStatus({ stage: 'connecting' });
      console.log('[TabSync] Extracting REST config...');
      const tor = await isTorBrowser();
      console.log('[TabSync] isTorBrowser:', tor);
      // Use proxy if explicitly stored (user set it), otherwise only on Tor if available
      const storedProxy = await loadProxyUrl();
      const proxyUrl = storedProxy ?? undefined;
      const restCfg = extractRestConfig(firebaseConfig, proxyUrl);
      console.log('[TabSync] REST config ready' + (proxyUrl ? ` (proxy: ${proxyUrl})` : ' (direct)') + ', querying devices collection...');

      setStatus({ stage: 'querying' });

      const docs = await restListDocs(restCfg, 'devices');
      clearTimeout(timer);

      console.log(`[TabSync] Query complete — ${docs.length} document(s) returned`);

      const list: Device[] = docs.map((d) => {
        console.log('[TabSync]  device doc:', d.id, d);
        return {
          id: d.id,
          deviceName: d.deviceName ?? '',
          lastUpdated: d.lastUpdated ?? null,
          tabCount: d.tabCount ?? (Array.isArray(d.tabs) ? d.tabs.length : 0),
        };
      });

      // Sort newest-first client-side
      list.sort((a, b) => {
        const ta = a.lastUpdated instanceof Date ? a.lastUpdated.getTime() : (a.lastUpdated ?? 0);
        const tb = b.lastUpdated instanceof Date ? b.lastUpdated.getTime() : (b.lastUpdated ?? 0);
        return tb - ta;
      });

      setDevices(list);
      setStatus({ stage: 'done' });
    } catch (err: any) {
      clearTimeout(timer);
      console.error('[TabSync] DeviceSelection query failed:', err);
      setStatus({
        stage: 'error',
        message: `Firestore error: ${err.message ?? String(err)}`,
      });
    }
  }, []);

  useEffect(() => { loadExistingDevices(); }, [loadExistingDevices]);

  async function handleSelectExistingDevice(device: Device) {
    try {
      setSaving(true);
      setSaveError('');
      await browser.storage.local.set({ deviceId: device.id, deviceName: device.deviceName });
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
      await browser.storage.local.set({ deviceId, deviceName: newDeviceName.trim() });

      const firebaseConfig = await loadFirebaseConfig();
      if (firebaseConfig) {
        const proxyUrl = (await loadProxyUrl()) ?? undefined;
        const restCfg = extractRestConfig(firebaseConfig, proxyUrl);
        await restSetDoc(restCfg, `devices/${deviceId}`, {
          deviceName: newDeviceName.trim(),
          lastUpdated: new Date().toISOString(),
          tabs: [],
          tabCount: 0,
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
      // REST returns plain Date objects; SDK returns Firestore Timestamps
      const date = ts instanceof Date ? ts : (ts.toDate ? ts.toDate() : new Date(ts));
      const diffMs = Date.now() - date.getTime();
      const m = Math.floor(diffMs / 60_000);
      if (m < 1)  return 'Just now';
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      if (d < 7)  return `${d}d ago`;
      return date.toLocaleDateString();
    } catch { return 'Unknown'; }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  const stageLabel: Record<string, string> = {
    idle:           'Starting…',
    'reading-config': 'Reading Firebase config…',
    connecting:     'Connecting to Firestore…',
    querying:       'Fetching devices…',
  };

  const isLoading = ['idle', 'reading-config', 'connecting', 'querying'].includes(status.stage);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
          <p className="text-white font-medium">
            {stageLabel[status.stage] ?? 'Loading…'}
          </p>
          <p className="text-xs text-gray-500">Timeout in 12s — will show error if stuck</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (status.stage === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4">
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
            <p className="font-semibold text-red-300 mb-1">⚠️ Could not load devices</p>
            <p className="text-sm text-red-200">{status.message}</p>
          </div>
          <button
            onClick={() => { setStatus({ stage: 'idle' }); loadExistingDevices(); }}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            🔄 Retry
          </button>
          <button
            onClick={() => setShowNewDevice(true)}
            className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            + Create new device anyway
          </button>
        </div>
      </div>
    );
  }

  // ── Create new device form ─────────────────────────────────────────────────
  if (showNewDevice) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-xl mx-auto">
          <button
            onClick={() => setShowNewDevice(false)}
            className="mb-6 text-gray-400 hover:text-white flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to device list
          </button>

          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Create New Device</h1>
            <p className="text-gray-400">Give this device a name to identify it</p>
          </div>

          {saveError && (
            <div className="mb-4 bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
              {saveError}
            </div>
          )}

          <div className="space-y-4">
            <input
              type="text"
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="e.g., Work Laptop, Home Desktop"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateNewDevice()}
            />
            <button
              onClick={handleCreateNewDevice}
              disabled={saving || !newDeviceName.trim()}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
            >
              {saving ? 'Creating…' : 'Create Device'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Device list ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">Select Device</h1>
            <p className="text-gray-400">
              {devices.length > 0
                ? `${devices.length} device(s) found — choose one or create new`
                : 'No existing devices found. Create your first device.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => browser.tabs.create({ url: browser.runtime.getURL('src/popup/index.html') }).then(() => window.close())}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Open in a full browser tab"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
            <button
              onClick={() => { setStatus({ stage: 'idle' }); loadExistingDevices(); }}
              title="Refresh device list"
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {saveError && (
          <div className="mb-4 bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            {saveError}
          </div>
        )}

        {devices.length > 0 && (
          <div className="mb-6 space-y-3">
            {devices.map((device) => (
              <button
                key={device.id}
                onClick={() => handleSelectExistingDevice(device)}
                disabled={saving}
                className="w-full text-left p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-blue-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-lg">{device.deviceName}</h3>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {device.tabCount || 0} tab(s) • Last active {formatTimestamp(device.lastUpdated)}
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className={devices.length > 0 ? 'border-t border-gray-700 pt-5' : ''}>
          <button
            onClick={() => setShowNewDevice(true)}
            disabled={saving}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Device
          </button>
        </div>
      </div>
    </div>
  );
}
