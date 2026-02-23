import browser from 'webextension-polyfill';
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  onSnapshot,
  deleteDoc,
  query,
} from 'firebase/firestore';
import { initFirebase } from '../lib/firebase';
import { debounce } from '../lib/utils';
import { loadFirebaseConfig } from '../lib/storage';
import type { BookmarkNode } from '../lib/types';

let isInitialized = false;
let db: any = null;
let commandsUnsubscribe: (() => void) | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

async function initialize() {
  if (isInitialized) return;

  try {
    const firebaseConfig = await loadFirebaseConfig();

    if (!firebaseConfig) {
      console.log('[TabSync] No Firebase config found. Waiting for user to provide config.');
      return;
    }

    const { db: firestoreDb } = initFirebase(firebaseConfig);
    db = firestoreDb;
    isInitialized = true;

    console.log('[TabSync] Firebase initialized successfully');

    startTabWatcher();
    startBookmarkWatcher();
    startCommandListener();
  } catch (error) {
    console.error('[TabSync] Failed to initialize:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab sync
// ─────────────────────────────────────────────────────────────────────────────

async function syncTabs() {
  if (!isInitialized || !db) return;

  try {
    const { deviceId, deviceName } = await browser.storage.local.get(['deviceId', 'deviceName']);
    if (!deviceId) return;

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

    const deviceRef = doc(db, 'devices', deviceId);
    await setDoc(
      deviceRef,
      {
        deviceName: deviceName || 'Unknown Device',
        lastUpdated: serverTimestamp(),
        tabs: tabsData,
        tabCount: tabsData.length,
      },
      { merge: true }, // keep bookmarks field untouched
    );

    console.log(`[TabSync] Synced ${tabsData.length} tabs`);
  } catch (error) {
    console.error('[TabSync] Failed to sync tabs:', error);
  }
}

const debouncedSyncTabs = debounce(syncTabs, 2000);

function startTabWatcher() {
  console.log('[TabSync] Starting tab watcher');

  browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.url) debouncedSyncTabs();
  });
  browser.tabs.onCreated.addListener(() => debouncedSyncTabs());
  browser.tabs.onRemoved.addListener(() => debouncedSyncTabs());
  browser.tabs.onMoved.addListener(() => debouncedSyncTabs());

  syncTabs(); // initial
}

// ─────────────────────────────────────────────────────────────────────────────
// Bookmark sync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively convert browser BookmarkTreeNodes → our lighter BookmarkNode type.
 */
function convertBookmarkTree(
  nodes: browser.Bookmarks.BookmarkTreeNode[],
): BookmarkNode[] {
  return nodes
    .map((node): BookmarkNode => {
      const converted: BookmarkNode = {
        id: node.id,
        title: node.title || '(untitled)',
        dateAdded: node.dateAdded,
      };
      if (node.url) converted.url = node.url;
      if (node.children && node.children.length > 0) {
        const kids = convertBookmarkTree(node.children);
        if (kids.length > 0) converted.children = kids;
      }
      return converted;
    })
    .filter(n => n.url || (n.children && n.children.length > 0));
}

/** Count all leaf URLs in the tree. */
function countBookmarks(nodes: BookmarkNode[]): number {
  return nodes.reduce((acc, n) => {
    if (n.url) return acc + 1;
    if (n.children) return acc + countBookmarks(n.children);
    return acc;
  }, 0);
}

async function syncBookmarks() {
  if (!isInitialized || !db) return;

  try {
    const { deviceId } = await browser.storage.local.get('deviceId');
    if (!deviceId) return;

    const tree = await browser.bookmarks.getTree();
    const rootChildren = tree[0]?.children ?? [];
    const bookmarks = convertBookmarkTree(rootChildren);
    const bookmarkCount = countBookmarks(bookmarks);

    const deviceRef = doc(db, 'devices', deviceId);
    await updateDoc(deviceRef, {
      bookmarks,
      bookmarkCount,
      bookmarksUpdated: serverTimestamp(),
    });

    console.log(`[TabSync] Synced ${bookmarkCount} bookmarks`);
  } catch (error) {
    console.error('[TabSync] Failed to sync bookmarks:', error);
  }
}

const debouncedSyncBookmarks = debounce(syncBookmarks, 3000);

function startBookmarkWatcher() {
  if (!browser.bookmarks) {
    console.warn('[TabSync] bookmarks API not available');
    return;
  }

  console.log('[TabSync] Starting bookmark watcher');

  browser.bookmarks.onCreated.addListener(() => debouncedSyncBookmarks());
  browser.bookmarks.onRemoved.addListener(() => debouncedSyncBookmarks());
  browser.bookmarks.onChanged.addListener(() => debouncedSyncBookmarks());
  browser.bookmarks.onMoved.addListener(() => debouncedSyncBookmarks());

  // Firefox-only: batch import guard
  if ((browser.bookmarks as any).onImportEnded) {
    (browser.bookmarks as any).onImportEnded.addListener(() => debouncedSyncBookmarks());
  }

  syncBookmarks(); // initial
}

// ─────────────────────────────────────────────────────────────────────────────
// Command listener
// ─────────────────────────────────────────────────────────────────────────────

async function startCommandListener() {
  if (commandsUnsubscribe) commandsUnsubscribe();

  try {
    const { deviceId } = await browser.storage.local.get('deviceId');
    if (!deviceId) return;

    const commandsQuery = query(collection(db, 'devices', deviceId, 'commands'));

    console.log('[TabSync] Starting command listener');

    commandsUnsubscribe = onSnapshot(
      commandsQuery,
      (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            await executeCommand(change.doc.data(), change.doc.id);
          }
        });
      },
      (error) => {
        console.error('[TabSync] Command listener error:', error);
      },
    );
  } catch (error) {
    console.error('[TabSync] Failed to start command listener:', error);
  }
}

async function executeCommand(command: any, commandId: string) {
  try {
    const { deviceId } = await browser.storage.local.get('deviceId');
    if (!deviceId) return;

    switch (command.action) {
      case 'closeTab':
        if (command.tabId) {
          try {
            await browser.tabs.remove(command.tabId);
            console.log(`[TabSync] Closed tab ${command.tabId}`);
          } catch (err) {
            console.error('[TabSync] Failed to close tab:', err);
          }
        }
        break;

      case 'openTab':
        if (command.url) {
          try {
            await browser.tabs.create({ url: command.url, active: command.active ?? false });
            console.log(`[TabSync] Opened tab ${command.url}`);
          } catch (err) {
            console.error('[TabSync] Failed to open tab:', err);
          }
        }
        break;

      case 'createBookmark':
        if (command.url && browser.bookmarks) {
          try {
            await browser.bookmarks.create({
              title: command.title || command.url,
              url: command.url,
              ...(command.parentId ? { parentId: command.parentId } : {}),
            });
            console.log(`[TabSync] Created bookmark "${command.title}"`);
          } catch (err) {
            console.error('[TabSync] Failed to create bookmark:', err);
          }
        }
        break;

      default:
        console.warn('[TabSync] Unknown command action:', command.action);
    }

    await deleteDoc(doc(db, 'devices', deviceId, 'commands', commandId));
    console.log(`[TabSync] Command ${commandId} done`);
  } catch (error) {
    console.error('[TabSync] Failed to execute command:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage change watcher
// ─────────────────────────────────────────────────────────────────────────────

browser.storage.onChanged.addListener((changes: any, areaName: string) => {
  if (areaName === 'local') {
    if (changes.firebaseConfig) {
      console.log('[TabSync] Firebase config changed, reinitializing...');
      if (commandsUnsubscribe) { commandsUnsubscribe(); commandsUnsubscribe = null; }
      isInitialized = false;
      db = null;
      initialize();
    }

    if (changes.deviceId) {
      console.log('[TabSync] Device changed, restarting watchers...');
      if (isInitialized) {
        startCommandListener();
        syncTabs();
        syncBookmarks();
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
initialize();
console.log('[TabSync] Background script loaded');
