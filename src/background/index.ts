import browser from 'webextension-polyfill';
import { doc, setDoc, serverTimestamp, collection, onSnapshot, deleteDoc, query } from 'firebase/firestore';
import { initFirebase } from '../lib/firebase';
import { debounce } from '../lib/utils';
import { loadFirebaseConfig } from '../lib/storage';

let isInitialized = false;
let db: any = null;
let commandsUnsubscribe: (() => void) | null = null;

/**
 * Initialize Firebase when config is available
 */
async function initialize() {
  if (isInitialized) return;

  try {
    // loadFirebaseConfig checks storage.local first, falls back to storage.sync
    const firebaseConfig = await loadFirebaseConfig();
    
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
    
    // Start watching for commands
    startCommandListener();
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
    // Check if device is configured
    const { deviceId, deviceName } = await browser.storage.local.get(['deviceId', 'deviceName']);
    
    if (!deviceId) {
      console.log('[TabSync] No device selected yet, skipping sync');
      return;
    }

    const tabs = await browser.tabs.query({});

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
      deviceName: deviceName || 'Unknown Device',
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
 * Start watching for commands directed at this device
 */
async function startCommandListener() {
  if (commandsUnsubscribe) {
    commandsUnsubscribe();
  }

  try {
    const { deviceId } = await browser.storage.local.get('deviceId');
    
    if (!deviceId) {
      console.log('[TabSync] No device selected, skipping command listener');
      return;
    }

    const commandsRef = collection(db, 'devices', deviceId, 'commands');
    const commandsQuery = query(commandsRef);

    console.log('[TabSync] Starting command listener');

    commandsUnsubscribe = onSnapshot(
      commandsQuery,
      (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const commandDoc = change.doc;
            const command = commandDoc.data();
            
            console.log('[TabSync] Received command:', command);
            
            // Execute command
            await executeCommand(command, commandDoc.id);
          }
        });
      },
      (error) => {
        console.error('[TabSync] Command listener error:', error);
      }
    );
  } catch (error) {
    console.error('[TabSync] Failed to start command listener:', error);
  }
}

/**
 * Execute a command and mark it as done
 */
async function executeCommand(command: any, commandId: string) {
  try {
    const { deviceId } = await browser.storage.local.get('deviceId');
    
    if (!deviceId) {
      console.log('[TabSync] No device selected, cannot execute command');
      return;
    }

    switch (command.action) {
      case 'closeTab':
        if (command.tabId) {
          try {
            await browser.tabs.remove(command.tabId);
            console.log(`[TabSync] Closed tab ${command.tabId}`);
          } catch (err) {
            console.error(`[TabSync] Failed to close tab ${command.tabId}:`, err);
          }
        }
        break;

      case 'openTab':
        if (command.url) {
          try {
            await browser.tabs.create({ url: command.url, active: command.active || false });
            console.log(`[TabSync] Opened tab ${command.url}`);
          } catch (err) {
            console.error(`[TabSync] Failed to open tab ${command.url}:`, err);
          }
        }
        break;

      default:
        console.warn('[TabSync] Unknown command action:', command.action);
    }

    // Delete the command to mark as done
    const commandRef = doc(db, 'devices', deviceId, 'commands', commandId);
    await deleteDoc(commandRef);
    console.log(`[TabSync] Command ${commandId} executed and deleted`);
  } catch (error) {
    console.error('[TabSync] Failed to execute command:', error);
  }
}

/**
 * Listen for storage changes (in case config is added)
 */
browser.storage.onChanged.addListener((changes: any, areaName: string) => {
  if (areaName === 'local') {
    if (changes.firebaseConfig) {
      console.log('[TabSync] Firebase config changed, reinitializing...');
      
      // Cleanup old listeners
      if (commandsUnsubscribe) {
        commandsUnsubscribe();
        commandsUnsubscribe = null;
      }
      
      isInitialized = false;
      db = null;
      initialize();
    }
    
    if (changes.deviceId) {
      console.log('[TabSync] Device changed, triggering sync...');
      // Restart command listener with new device
      if (isInitialized) {
        startCommandListener();
        syncTabs();
      }
    }
  }
});

// Initialize on startup
initialize();

console.log('[TabSync] Background script loaded');
