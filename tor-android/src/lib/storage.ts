/**
 * storage.ts — Tor Android edition
 * Uses localStorage instead of browser.storage (not available on Tor Browser Android unsigned)
 */

const KEYS = {
  firebaseConfig: 'tabsync_firebaseConfig',
  proxyUrl:       'tabsync_proxyUrl',
  deviceId:       'tabsync_deviceId',
  deviceName:     'tabsync_deviceName',
};

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string | null): void {
  try {
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  } catch { /* ignore */ }
}

export async function saveFirebaseConfig(config: object): Promise<void> {
  lsSet(KEYS.firebaseConfig, JSON.stringify(config));
}

export async function loadFirebaseConfig(): Promise<object | null> {
  const raw = lsGet(KEYS.firebaseConfig);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function clearFirebaseConfig(): Promise<void> {
  lsSet(KEYS.firebaseConfig, null);
}

export async function saveProxyUrl(proxyUrl: string): Promise<void> {
  lsSet(KEYS.proxyUrl, proxyUrl.trim() || null);
}

export async function loadProxyUrl(): Promise<string | null> {
  return lsGet(KEYS.proxyUrl) || null;
}

export async function clearProxyUrl(): Promise<void> {
  lsSet(KEYS.proxyUrl, null);
}

export async function saveDeviceId(id: string): Promise<void> {
  lsSet(KEYS.deviceId, id);
}

export async function loadDeviceId(): Promise<string | null> {
  return lsGet(KEYS.deviceId) || null;
}

export async function saveDeviceName(name: string): Promise<void> {
  lsSet(KEYS.deviceName, name);
}

export async function loadDeviceName(): Promise<string | null> {
  return lsGet(KEYS.deviceName) || null;
}
