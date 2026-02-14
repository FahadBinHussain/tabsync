import { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { collection, onSnapshot, query, orderBy, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initFirebase, resetFirebase } from '../lib/firebase';
import { getDeviceId } from '../lib/utils';

interface Tab {
  id?: number;
  url: string;
  title: string;
  favIconUrl?: string;
  windowId?: number;
  index?: number;
  active?: boolean;
  pinned?: boolean;
}

interface Device {
  id: string;
  deviceName: string;
  lastUpdated: any;
  tabs: Tab[];
  tabCount: number;
}

interface DeviceListProps {
  onResetConfig: () => void;
}

export function DeviceList({ onResetConfig }: DeviceListProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());
  const [db, setDb] = useState<any>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function setupFirestore() {
      try {
        const { firebaseConfig } = await browser.storage.local.get('firebaseConfig');
        
        if (!firebaseConfig) {
          setError('No Firebase config found');
          setLoading(false);
          return;
        }

        // Initialize Firebase
        const { db: firestoreDb } = initFirebase(firebaseConfig);
        setDb(firestoreDb);

        // Get current device ID
        const deviceId = await getDeviceId();
        setCurrentDeviceId(deviceId);

        // Listen to devices collection
        const devicesQuery = query(
          collection(firestoreDb, 'devices'),
          orderBy('lastUpdated', 'desc')
        );

        unsubscribe = onSnapshot(
          devicesQuery,
          (snapshot) => {
            const devicesList: Device[] = [];
            snapshot.forEach((doc) => {
              devicesList.push({
                id: doc.id,
                ...doc.data(),
              } as Device);
            });
            setDevices(devicesList);
            setLoading(false);
          },
          (err) => {
            console.error('[TabSync] Firestore error:', err);
            setError('Failed to load devices: ' + err.message);
            setLoading(false);
          }
        );
      } catch (err: any) {
        console.error('[TabSync] Setup error:', err);
        setError('Failed to initialize: ' + err.message);
        setLoading(false);
      }
    }

    setupFirestore();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const handleResetConfig = async () => {
    if (confirm('Are you sure you want to reset the Firebase configuration? This will require you to re-enter your config and select a device.')) {
      await browser.storage.local.remove(['firebaseConfig', 'deviceId', 'deviceName']);
      resetFirebase();
      onResetConfig();
    }
  };

  const toggleDevice = (deviceId: string) => {
    const newExpanded = new Set(expandedDevices);
    if (newExpanded.has(deviceId)) {
      newExpanded.delete(deviceId);
    } else {
      newExpanded.add(deviceId);
    }
    setExpandedDevices(newExpanded);
  };

  const openTab = (url: string) => {
    browser.tabs.create({ url });
  };

  const openAllTabs = (tabs: Tab[]) => {
    tabs.forEach(tab => {
      if (tab.url) {
        browser.tabs.create({ url: tab.url });
      }
    });
  };

  const closeRemoteTab = async (deviceId: string, tabId: number) => {
    if (!db) return;
    
    try {
      // Create a command document in the target device's commands subcollection
      const commandRef = doc(collection(db, 'devices', deviceId, 'commands'));
      await setDoc(commandRef, {
        action: 'closeTab',
        tabId: tabId,
        createdAt: serverTimestamp(),
        fromDevice: currentDeviceId,
      });
      
      console.log(`[TabSync] Sent close command for tab ${tabId} to device ${deviceId}`);
    } catch (error) {
      console.error('[TabSync] Failed to send close command:', error);
    }
  };

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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
          <button
            onClick={handleResetConfig}
            className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            Reset Configuration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-1">TabSync</h1>
            <p className="text-gray-400">{devices.length} device(s) synced</p>
          </div>
          <button
            onClick={handleResetConfig}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
          >
            Reset Config
          </button>
        </div>

        {devices.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-2">No devices found</p>
            <p className="text-sm text-gray-500">Open some tabs to start syncing</p>
          </div>
        ) : (
          <div className="space-y-4">
            {devices.map((device) => {
              const isExpanded = expandedDevices.has(device.id);
              const isCurrent = device.id === currentDeviceId;

              return (
                <div
                  key={device.id}
                  className={`bg-gray-800 border rounded-lg overflow-hidden transition-colors ${
                    isCurrent ? 'border-blue-500' : 'border-gray-700'
                  }`}
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-750"
                    onClick={() => toggleDevice(device.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{device.deviceName}</h3>
                          {isCurrent && (
                            <span className="px-2 py-0.5 bg-blue-600 text-xs rounded">
                              This Device
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                          {device.tabCount} tab(s) • Updated {formatTimestamp(device.lastUpdated)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isCurrent && device.tabs.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openAllTabs(device.tabs);
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                          >
                            Open All
                          </button>
                        )}
                        <svg
                          className={`w-5 h-5 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-700 p-4 bg-gray-850">
                      {device.tabs.length === 0 ? (
                        <p className="text-gray-500 text-sm">No tabs</p>
                      ) : (
                        <div className="space-y-2">
                          {device.tabs.map((tab, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded transition-colors group"
                            >
                              {tab.favIconUrl ? (
                                <img
                                  src={tab.favIconUrl}
                                  alt=""
                                  className="w-4 h-4 flex-shrink-0"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-4 h-4 bg-gray-600 rounded flex-shrink-0" />
                              )}
                              <div 
                                className="flex-1 min-w-0 cursor-pointer"
                                onClick={() => !isCurrent && openTab(tab.url)}
                              >
                                <p className="text-sm truncate">{tab.title}</p>
                                <p className="text-xs text-gray-500 truncate">{tab.url}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {tab.pinned && (
                                  <span className="text-xs text-gray-500">📌</span>
                                )}
                                {!isCurrent && tab.id && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      closeRemoteTab(device.id, tab.id!);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-600 rounded transition-all"
                                    title="Close this tab"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                      />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
