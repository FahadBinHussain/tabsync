import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { initFirebase } from '../lib/firebase';

interface Device {
  id: string;
  deviceName: string;
  lastUpdated: any;
  tabCount: number;
}

interface DeviceSelectionProps {
  onDeviceSelected: () => void;
}

export function DeviceSelection({ onDeviceSelected }: DeviceSelectionProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewDevice, setShowNewDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExistingDevices();
  }, []);

  async function loadExistingDevices() {
    try {
      const { firebaseConfig } = await browser.storage.local.get('firebaseConfig');
      
      if (!firebaseConfig) {
        setError('No Firebase config found');
        setLoading(false);
        return;
      }

      // Initialize Firebase
      const { db } = initFirebase(firebaseConfig);

      // Get all devices
      const devicesQuery = query(
        collection(db, 'devices'),
        orderBy('lastUpdated', 'desc')
      );

      const snapshot = await getDocs(devicesQuery);
      const devicesList: Device[] = [];
      
      snapshot.forEach((doc) => {
        devicesList.push({
          id: doc.id,
          ...doc.data(),
        } as Device);
      });

      setDevices(devicesList);
      setLoading(false);
    } catch (err: any) {
      console.error('[TabSync] Failed to load devices:', err);
      setError('Failed to load existing devices: ' + err.message);
      setLoading(false);
    }
  }

  async function handleSelectExistingDevice(deviceId: string) {
    try {
      setSaving(true);
      await browser.storage.local.set({ deviceId });
      onDeviceSelected();
    } catch (err: any) {
      setError('Failed to select device: ' + err.message);
      setSaving(false);
    }
  }

  async function handleCreateNewDevice() {
    if (!newDeviceName.trim()) {
      setError('Device name cannot be empty');
      return;
    }

    try {
      setSaving(true);
      
      // Generate new device ID
      const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Save device ID and name
      await browser.storage.local.set({ 
        deviceId,
        deviceName: newDeviceName.trim()
      });

      // Create initial Firestore document for this device
      const { firebaseConfig } = await browser.storage.local.get('firebaseConfig');
      if (firebaseConfig) {
        const { db } = initFirebase(firebaseConfig);
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
        
        const deviceRef = doc(db, 'devices', deviceId);
        await setDoc(deviceRef, {
          deviceName: newDeviceName.trim(),
          lastUpdated: serverTimestamp(),
          tabs: [],
          tabCount: 0,
        });
      }

      onDeviceSelected();
    } catch (err: any) {
      setError('Failed to create device: ' + err.message);
      setSaving(false);
    }
  }

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return 'Unknown';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading devices...</p>
        </div>
      </div>
    );
  }

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
            <p className="text-gray-400">
              Give this device a name to identify it across your synced devices
            </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Device Name
              </label>
              <input
                type="text"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                placeholder="e.g., Work Laptop, Home Desktop"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && handleCreateNewDevice()}
              />
            </div>

            <button
              onClick={handleCreateNewDevice}
              disabled={saving || !newDeviceName.trim()}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
            >
              {saving ? 'Creating...' : 'Create Device'}
            </button>
          </div>

          <div className="mt-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
            <p className="text-sm text-gray-300">
              💡 <strong>Tip:</strong> Use descriptive names like "Work Laptop" or "Home Desktop" 
              to easily identify devices when syncing tabs.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Select Device</h1>
          <p className="text-gray-400">
            {devices.length > 0 
              ? 'Choose an existing device or create a new one'
              : 'No existing devices found. Create your first device.'
            }
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {devices.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Existing Devices</h2>
            <div className="space-y-3">
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => handleSelectExistingDevice(device.id)}
                  disabled={saving}
                  className="w-full text-left p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-blue-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg">{device.deviceName}</h3>
                      <p className="text-sm text-gray-400 mt-1">
                        {device.tabCount || 0} tab(s) • Last active {formatTimestamp(device.lastUpdated)}
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={devices.length > 0 ? 'border-t border-gray-700 pt-6' : ''}>
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

        {devices.length > 0 && (
          <div className="mt-6 p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
            <p className="text-sm text-yellow-200">
              ⚠️ <strong>Note:</strong> Selecting an existing device will sync with its current tabs. 
              Any tabs you have open now will be merged with the selected device's tabs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
