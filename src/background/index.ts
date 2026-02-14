import browser from 'webextension-polyfill';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initFirebase } from '../lib/firebase';
import { getDeviceId, getDeviceName, debounce } from '../lib/utils';

let isInitialized = false;
let db: any = null;

/**
 * Initialize Firebase when config is available
 */
async function initialize() {
  if (isInitialized) return;

  try {
    const { firebaseConfig } = await browser.storage.local.get('firebaseConfig');
    
    if (!firebaseConfig) {
      console.log('[TabSync] No Firebase config found. Waiting for user to provide config.');
      return;
    }

    // Initialize Firebase
    const { db: firestoreDb } = initFirebase(firebaseConfig);
    db = firestoreDb;
    isInitialized = true;

    console.log('[TabSync] Firebase initialized successfully');

    // Start watching tabs
    startTabWatcher();
  } catch (error) {
    console.error('[TabSync] Failed to initialize:', error);
  }
}

/**
 * Sync tabs to Firestore
 */
async function syncTabs() {
  if (!isInitialized || !db) {
    console.log('[TabSync] Firebase not initialized, skipping sync');
    return;
  }

  try {
    const tabs = await browser.tabs.query({});
    const deviceId = await getDeviceId();
    const deviceName = await getDeviceName();

    const tabsData = tabs.map(tab => ({
      id: tab.id,
      url: tab.url || '',
      title: tab.title || 'Untitled',
      favIconUrl: tab.favIconUrl || '',
      windowId: tab.windowId,
      index: tab.index,
      active: tab.active,
      pinned: tab.pinned,
    }));

    // Write to Firestore: devices/{deviceId}
    const deviceRef = doc(db, 'devices', deviceId);
    await setDoc(deviceRef, {
      deviceName,
      lastUpdated: serverTimestamp(),
      tabs: tabsData,
      tabCount: tabsData.length,
    });

    console.log(`[TabSync] Synced ${tabsData.length} tabs to Firestore`);
  } catch (error) {
    console.error('[TabSync] Failed to sync tabs:', error);
  }
}

// Debounced sync (2 seconds)
const debouncedSync = debounce(syncTabs, 2000);

/**
 * Start watching for tab changes
 */
function startTabWatcher() {
  console.log('[TabSync] Starting tab watcher');

  // Listen for tab updates
  browser.tabs.onUpdated.addListener((_tabId, changeInfo, _tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      debouncedSync();
    }
  });

  // Listen for tab creation
  browser.tabs.onCreated.addListener(() => {
    debouncedSync();
  });

  // Listen for tab removal
  browser.tabs.onRemoved.addListener(() => {
    debouncedSync();
  });

  // Listen for tab movement
  browser.tabs.onMoved.addListener(() => {
    debouncedSync();
  });

  // Initial sync
  syncTabs();
}

/**
 * Listen for storage changes (in case config is added)
 */
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.firebaseConfig) {
    console.log('[TabSync] Firebase config changed, reinitializing...');
    isInitialized = false;
    db = null;
    initialize();
  }
});

// Initialize on startup
initialize();

console.log('[TabSync] Background script loaded');
