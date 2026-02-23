import browser from 'webextension-polyfill';

/**
 * Save Firebase config to BOTH storage.local and storage.sync.
 * - storage.local  → fast, survives normal sessions, wiped on reinstall
 * - storage.sync   → survives reinstalls, roams with the browser profile
 */
export async function saveFirebaseConfig(config: object): Promise<void> {
  await browser.storage.local.set({ firebaseConfig: config });

  try {
    await browser.storage.sync.set({ firebaseConfig: config });
  } catch (err) {
    // storage.sync is not available in all environments (e.g. Firefox private mode)
    console.warn('[TabSync] Could not write to storage.sync:', err);
  }
}

/**
 * Read Firebase config from local storage, falling back to sync storage.
 * If found in sync but not local, promote it to local for faster future reads.
 */
export async function loadFirebaseConfig(): Promise<object | null> {
  // Try local first (fast path)
  const local = await browser.storage.local.get('firebaseConfig');
  if (local.firebaseConfig) {
    return local.firebaseConfig;
  }

  // Fall back to sync (survives reinstall)
  try {
    const synced = await browser.storage.sync.get('firebaseConfig');
    if (synced.firebaseConfig) {
      // Promote to local so future reads are instant
      await browser.storage.local.set({ firebaseConfig: synced.firebaseConfig });
      console.log('[TabSync] Restored firebaseConfig from storage.sync');
      return synced.firebaseConfig;
    }
  } catch (err) {
    console.warn('[TabSync] Could not read from storage.sync:', err);
  }

  return null;
}

/**
 * Clear Firebase config from both storage areas.
 */
export async function clearFirebaseConfig(): Promise<void> {
  await browser.storage.local.remove('firebaseConfig');

  try {
    await browser.storage.sync.remove('firebaseConfig');
  } catch (err) {
    console.warn('[TabSync] Could not clear from storage.sync:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Proxy URL storage (optional — needed for Tor Browser)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save optional proxy URL (Cloudflare Worker) to both storage areas.
 * Pass an empty string or null to clear it.
 */
export async function saveProxyUrl(proxyUrl: string): Promise<void> {
  const val = proxyUrl.trim() || null;
  await browser.storage.local.set({ proxyUrl: val });
  try {
    await browser.storage.sync.set({ proxyUrl: val });
  } catch (err) {
    console.warn('[TabSync] Could not write proxyUrl to storage.sync:', err);
  }
}

/**
 * Load the proxy URL. Returns null if not set.
 */
export async function loadProxyUrl(): Promise<string | null> {
  const local = await browser.storage.local.get('proxyUrl');
  if (local.proxyUrl) return local.proxyUrl as string;

  try {
    const synced = await browser.storage.sync.get('proxyUrl');
    if (synced.proxyUrl) {
      await browser.storage.local.set({ proxyUrl: synced.proxyUrl });
      return synced.proxyUrl as string;
    }
  } catch (err) {
    console.warn('[TabSync] Could not read proxyUrl from storage.sync:', err);
  }

  return null;
}

