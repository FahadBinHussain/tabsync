import browser from 'webextension-polyfill';

/**
 * Generate a unique device ID
 */
export function generateDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get or create device ID
 */
export async function getDeviceId(): Promise<string> {
  const result = await browser.storage.local.get('deviceId');
  if (result.deviceId) {
    return result.deviceId;
  }
  
  const deviceId = generateDeviceId();
  await browser.storage.local.set({ deviceId });
  return deviceId;
}

/**
 * Get device name (defaults to browser + timestamp)
 */
export async function getDeviceName(): Promise<string> {
  const result = await browser.storage.local.get('deviceName');
  if (result.deviceName) {
    return result.deviceName;
  }
  
  const browserInfo = await getBrowserInfo();
  const deviceName = `${browserInfo} - ${new Date().toLocaleDateString()}`;
  await browser.storage.local.set({ deviceName });
  return deviceName;
}

/**
 * Get browser name
 */
function getBrowserInfo(): string {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Chrome')) return 'Chrome';
  return 'Browser';
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Validate Firebase config JSON
 */
export function validateFirebaseConfig(config: any): boolean {
  if (!config || typeof config !== 'object') return false;
  
  const requiredFields = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
  ];
  
  return requiredFields.every(field => field in config && config[field]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tor Browser detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect whether the extension is running inside Tor Browser.
 *
 * Strategy (layered, most-reliable first):
 * 1. Check browser.proxy.settings — Tor Browser always routes through SOCKS5
 *    on 127.0.0.1:9150 (or 9050 for Tor daemon).
 * 2. Fall back to user-agent heuristics (Tor Browser is always Firefox).
 *
 * Returns true if we're almost certainly inside Tor Browser.
 */
export async function isTorBrowser(): Promise<boolean> {
  // Method 1: proxy settings (most reliable, extension-level)
  try {
    const proxySettings = await (browser as any).proxy?.settings?.get({ incognito: false });
    if (proxySettings?.value) {
      const { proxyType, socksProxy, socks } = proxySettings.value;
      const proxyStr: string = socksProxy ?? socks ?? '';
      if (
        proxyType === 'manual' &&
        (proxyStr.includes('127.0.0.1:9150') || proxyStr.includes('127.0.0.1:9050') || proxyStr.includes('localhost:9150'))
      ) {
        return true;
      }
    }
  } catch {
    // browser.proxy.settings not available (Chrome, or no proxy permission)
  }

  // Method 2: user-agent fingerprint
  // Tor Browser always identifies as a specific Firefox ESR version
  // and never includes platform-specific tokens like "Windows NT" after
  // a certain version. However this is less reliable — use only as hint.
  const ua = navigator.userAgent;
  if (!ua.includes('Firefox')) return false; // Tor is always Firefox-based

  // Tor Browser suppresses detailed platform info — "Gecko/" with no extra tokens
  // Standard Firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/..."
  // Tor Browser:      "Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/..."  (no "Win64; x64")
  const hasPlatformDetails = /\(Windows NT [0-9.]+;[^)]*Win64/.test(ua) ||
                              /\(Macintosh;[^)]*Mac OS X/.test(ua) ||
                              /\(X11;[^)]*Linux/.test(ua);
  if (!hasPlatformDetails) return true; // Tor Browser strips platform details

  return false;
}

