import { useEffect, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import { collection, onSnapshot, query, orderBy, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { initFirebase, resetFirebase } from '../lib/firebase';
import { getDeviceId } from '../lib/utils';
import { clearFirebaseConfig, loadFirebaseConfig } from '../lib/storage';

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
  onReselectDevice: () => void;
}

export function DeviceList({ onResetConfig, onReselectDevice }: DeviceListProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());
  const [db, setDb] = useState<any>(null);

  // key: `${sourceDeviceId}::${tabIndex}`, value: true when popover open
  const [sendPopover, setSendPopover] = useState<string | null>(null);
  // key: `${targetDeviceId}::${tabIndex}` — shows a brief "✓ Sent" flash
  const [sentFlash, setSentFlash] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Rename state: which device is being renamed + draft value
  const [renamingDeviceId, setRenamingDeviceId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function setupFirestore() {
      try {
        // Initialize Firebase — use loadFirebaseConfig (local → sync fallback)
        const firebaseConfig = await loadFirebaseConfig();
        
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

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSendPopover(null);
      }
    }
    if (sendPopover !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sendPopover]);

  /**
   * Queue an openTab command on a target device's Firestore commands subcollection.
   * popoverKey is used only to close the popover and flash feedback.
   */
  const sendTabToDevice = async (
    targetDeviceId: string,
    tab: Tab,
    popoverKey: string,
  ) => {
    if (!db) return;

    setSendPopover(null);

    try {
      const commandRef = doc(collection(db, 'devices', targetDeviceId, 'commands'));
      await setDoc(commandRef, {
        action: 'openTab',
        url: tab.url,
        title: tab.title,
        active: false,
        createdAt: serverTimestamp(),
        fromDevice: currentDeviceId,
      });

      // Show "✓ Sent" flash for 2 s
      const flashKey = `${targetDeviceId}::${popoverKey}`;
      setSentFlash(flashKey);
      setTimeout(() => setSentFlash(f => (f === flashKey ? null : f)), 2000);

      console.log(`[TabSync] Queued openTab "${tab.title}" on device ${targetDeviceId}`);
    } catch (err) {
      console.error('[TabSync] Failed to send tab:', err);
    }
  };

  const handleResetConfig = async () => {
    if (confirm('Are you sure you want to reset the Firebase configuration? This will require you to re-enter your config and select a device.')) {
      // Remove device info from local storage
      await browser.storage.local.remove(['deviceId', 'deviceName']);
      // Remove firebase config from BOTH local and sync storage
      await clearFirebaseConfig();
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

  /**
   * Save a new device name to Firestore and (if it's this device) to local storage.
   */
  const saveRename = async (deviceId: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed || !db) return;

    setRenameSaving(true);
    try {
      await updateDoc(doc(db, 'devices', deviceId), { deviceName: trimmed });

      // Keep local storage in sync for the current device
      if (deviceId === currentDeviceId) {
        await browser.storage.local.set({ deviceName: trimmed });
      }

      setRenamingDeviceId(null);
      setRenameDraft('');
    } catch (err) {
      console.error('[TabSync] Failed to rename device:', err);
    } finally {
      setRenameSaving(false);
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
          <div className="flex items-center gap-2">
            <button
              onClick={onReselectDevice}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
              title="Switch to a different device"
            >
              Switch Device
            </button>
            <button
              onClick={handleResetConfig}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
              title="Reset Firebase configuration"
            >
              Reset Config
            </button>
          </div>
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
                  className={`bg-gray-800 border rounded-lg overflow-hidden transition-colors group ${
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
                          {/* ── Inline rename ── */}
                          {renamingDeviceId === device.id ? (
                            <div
                              className="flex items-center gap-2 flex-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                autoFocus
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveRename(device.id);
                                  if (e.key === 'Escape') {
                                    setRenamingDeviceId(null);
                                    setRenameDraft('');
                                  }
                                }}
                                className="flex-1 px-2 py-1 bg-gray-700 border border-blue-500 rounded text-sm focus:outline-none"
                              />
                              <button
                                onClick={() => saveRename(device.id)}
                                disabled={renameSaving || !renameDraft.trim()}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs"
                              >
                                {renameSaving ? '…' : 'Save'}
                              </button>
                              <button
                                onClick={() => { setRenamingDeviceId(null); setRenameDraft(''); }}
                                className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <h3 className="font-semibold">{device.deviceName}</h3>
                              {isCurrent && (
                                <span className="px-2 py-0.5 bg-blue-600 text-xs rounded">
                                  This Device
                                </span>
                              )}
                              {/* Pencil rename button — visible on device card hover */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingDeviceId(device.id);
                                  setRenameDraft(device.deviceName);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-all"
                                title="Rename this device"
                              >
                                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
                                </svg>
                              </button>
                            </>
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
                          {device.tabs.map((tab, index) => {
                            const popoverKey = `${device.id}::${index}`;
                            const isPopoverOpen = sendPopover === popoverKey;
                            // Other devices the user can send this tab TO
                            const otherDevices = devices.filter(d => d.id !== device.id);

                            return (
                              <div
                                key={index}
                                className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded transition-colors group relative"
                              >
                                {/* Favicon */}
                                {tab.favIconUrl ? (
                                  <img
                                    src={tab.favIconUrl}
                                    alt=""
                                    className="w-4 h-4 flex-shrink-0"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="w-4 h-4 bg-gray-600 rounded flex-shrink-0" />
                                )}

                                {/* Title + URL — clicking opens tab locally (only for remote tabs) */}
                                <div
                                  className={`flex-1 min-w-0 ${!isCurrent ? 'cursor-pointer' : ''}`}
                                  onClick={() => !isCurrent && openTab(tab.url)}
                                >
                                  <p className="text-sm truncate">{tab.title}</p>
                                  <p className="text-xs text-gray-500 truncate">{tab.url}</p>
                                </div>

                                {/* Action buttons */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {tab.pinned && (
                                    <span className="text-xs text-gray-500 mr-1">📌</span>
                                  )}

                                  {/* ── Send-to-Device button (visible on hover) ── */}
                                  {otherDevices.length > 0 && (
                                    <div className="relative">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSendPopover(isPopoverOpen ? null : popoverKey);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-600 rounded transition-all"
                                        title="Send tab to another device"
                                      >
                                        {/* Send / share icon */}
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                        </svg>
                                      </button>

                                      {/* Device picker popover */}
                                      {isPopoverOpen && (
                                        <div
                                          ref={popoverRef}
                                          className="absolute right-0 top-7 z-50 w-52 bg-gray-900 border border-gray-600 rounded-lg shadow-xl overflow-hidden"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <div className="px-3 py-2 bg-gray-800 border-b border-gray-700">
                                            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                                              Send tab to…
                                            </p>
                                          </div>
                                          {otherDevices.map(target => {
                                            const flashKey = `${target.id}::${popoverKey}`;
                                            const isSent = sentFlash === flashKey;
                                            return (
                                              <button
                                                key={target.id}
                                                onClick={() => sendTabToDevice(target.id, tab, popoverKey)}
                                                disabled={isSent}
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 flex items-center justify-between gap-2 transition-colors disabled:opacity-60"
                                              >
                                                <span className="truncate">{target.deviceName}</span>
                                                {isSent ? (
                                                  <span className="text-green-400 text-xs flex-shrink-0">✓ Sent</span>
                                                ) : (
                                                  <span className="text-gray-500 text-xs flex-shrink-0">
                                                    {target.id === currentDeviceId ? '(this device)' : ''}
                                                  </span>
                                                )}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* ── Close remote tab button (only for tabs on OTHER devices) ── */}
                                  {!isCurrent && tab.id && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        closeRemoteTab(device.id, tab.id!);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-600 rounded transition-all"
                                      title="Close this tab on the remote device"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
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
