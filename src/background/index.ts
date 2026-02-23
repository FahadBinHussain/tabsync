import browser from 'webextension-polyfill';
import { debounce, isTorBrowser } from '../lib/utils';
import { loadFirebaseConfig, loadProxyUrl } from '../lib/storage';
import {
  restSetDoc,
  restUpdateDoc,
  restListDocs,
  restDeleteDoc,
  extractRestConfig,
  type FirestoreConfig,
} from '../lib/firestoreRest';
import type { BookmarkNode } from '../lib/types';

let isInitialized = false;
let restCfg: FirestoreConfig | null = null;
let commandPollInterval: ReturnType<typeof setInterval> | null = null;

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

    const tor = await isTorBrowser();
    console.log('[TabSync] isTorBrowser:', tor);
    const proxyUrl = (await loadProxyUrl()) ?? undefined;
    restCfg = extractRestConfig(firebaseConfig, proxyUrl);
    isInitialized = true;

    console.log('[TabSync] REST config ready');

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
  if (!isInitialized || !restCfg) return;

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

    await restSetDoc(restCfg, `devices/${deviceId}`, {
      deviceName: deviceName || 'Unknown Device',
      lastUpdated: new Date().toISOString(),
      tabs: tabsData,
      tabCount: tabsData.length,
    });

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

function countBookmarks(nodes: BookmarkNode[]): number {
  return nodes.reduce((acc, n) => {
    if (n.url) return acc + 1;
    if (n.children) return acc + countBookmarks(n.children);
    return acc;
  }, 0);
}

async function syncBookmarks() {
  if (!isInitialized || !restCfg) return;

  try {
    const { deviceId } = await browser.storage.local.get('deviceId');
    if (!deviceId) return;

    const tree = await browser.bookmarks.getTree();
    const rootChildren = tree[0]?.children ?? [];
    const bookmarks = convertBookmarkTree(rootChildren);
    const bookmarkCount = countBookmarks(bookmarks);

    await restUpdateDoc(restCfg, `devices/${deviceId}`, {
      bookmarks,
      bookmarkCount,
      bookmarksUpdated: new Date().toISOString(),
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

  if ((browser.bookmarks as any).onImportEnded) {
    (browser.bookmarks as any).onImportEnded.addListener(() => debouncedSyncBookmarks());
  }

  syncBookmarks(); // initial
}

// ─────────────────────────────────────────────────────────────────────────────
// Command listener (poll-based REST — zero persistent connections)
// ─────────────────────────────────────────────────────────────────────────────

const COMMAND_POLL_MS = 3000;
let pollInProgress = false;

/**
 * Claim a command ID atomically via browser.storage.local so that
 * even if multiple background instances race (e.g. after extension reload),
 * each command is only executed once.
 * Returns true if this call successfully claimed the ID (first to claim it).
 */
async function claimCommand(cmdId: string): Promise<boolean> {
  const key = `claimed_cmd_${cmdId}`;
  const existing = await browser.storage.local.get(key);
  if (existing[key]) return false; // already claimed by another instance
  await browser.storage.local.set({ [key]: Date.now() });
  // Double-check: read back to detect a race between two simultaneous claims
  const verify = await browser.storage.local.get(key);
  return !!verify[key];
}

/**
 * Prune claimed command IDs older than 5 minutes from storage to avoid buildup.
 */
async function pruneClaimedCommands(): Promise<void> {
  try {
    const all = await browser.storage.local.get(null);
    const now = Date.now();
    const toRemove: string[] = [];
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('claimed_cmd_') && typeof v === 'number' && now - v > 5 * 60 * 1000) {
        toRemove.push(k);
      }
    }
    if (toRemove.length > 0) await browser.storage.local.remove(toRemove);
  } catch { /* non-critical */ }
}

async function pollCommands() {
  if (!isInitialized || !restCfg) return;
  if (pollInProgress) return;
  pollInProgress = true;

  try {
    const { deviceId } = await browser.storage.local.get('deviceId');
    if (!deviceId) return;

    const commands = await restListDocs(restCfg, `devices/${deviceId}/commands`);
    for (const cmd of commands) {
      const claimed = await claimCommand(cmd.id);
      if (!claimed) {
        console.log(`[TabSync] Command ${cmd.id} already claimed, skipping`);
        continue;
      }
      await executeCommand(cmd, cmd.id);
    }

    // Occasionally prune old claimed command keys
    if (Math.random() < 0.1) pruneClaimedCommands();
  } catch (error) {
    console.error('[TabSync] Command poll error:', error);
  } finally {
    pollInProgress = false;
  }
}

async function startCommandListener() {
  if (commandPollInterval !== null) {
    clearInterval(commandPollInterval);
    commandPollInterval = null;
  }

  const { deviceId } = await browser.storage.local.get('deviceId').catch(() => ({ deviceId: null }));
  if (!deviceId) return;

  console.log('[TabSync] Starting command poll listener');
  await pollCommands();
  commandPollInterval = setInterval(pollCommands, COMMAND_POLL_MS);
}

async function executeCommand(command: any, commandId: string) {
  try {
    const { deviceId } = await browser.storage.local.get('deviceId');
    if (!deviceId || !restCfg) return;

    // Delete the command FIRST (before executing) to prevent double-execution
    // if the poll fires again before we finish processing this command.
    await restDeleteDoc(restCfg, `devices/${deviceId}/commands/${commandId}`);
    console.log(`[TabSync] Claimed command ${commandId}`);

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
      if (commandPollInterval !== null) { clearInterval(commandPollInterval); commandPollInterval = null; }
      isInitialized = false;
      restCfg = null;
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

