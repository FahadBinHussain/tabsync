/**
 * utils.ts — Tor Android edition
 * Uses localStorage instead of browser.storage
 */

import { loadDeviceId, saveDeviceId, loadDeviceName, saveDeviceName } from './storage';

export function generateDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function getDeviceId(): Promise<string> {
  const existing = await loadDeviceId();
  if (existing) return existing;
  const id = generateDeviceId();
  await saveDeviceId(id);
  return id;
}

export async function getDeviceName(): Promise<string> {
  const existing = await loadDeviceName();
  if (existing) return existing;
  const name = `${getBrowserInfo()} - ${new Date().toLocaleDateString()}`;
  await saveDeviceName(name);
  return name;
}

function getBrowserInfo(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  return 'Browser';
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function (...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => { timeout = null; func(...args); }, wait);
  };
}

export function validateFirebaseConfig(config: any): boolean {
  if (!config || typeof config !== 'object') return false;
  const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  return required.every(f => f in config && config[f]);
}

/**
 * Tor Browser detection — works without browser.proxy (no extension API needed)
 * On Tor Browser Android, user-agent lacks platform details.
 */
export async function isTorBrowser(): Promise<boolean> {
  const ua = navigator.userAgent;
  if (!ua.includes('Firefox')) return false;
  // Tor Browser strips platform details (Win64, Linux x86_64, etc.)
  const hasPlatformDetails =
    /\(Windows NT [0-9.]+;[^)]*Win64/.test(ua) ||
    /\(Macintosh;[^)]*Mac OS X/.test(ua) ||
    /\(X11;[^)]*Linux/.test(ua);
  if (!hasPlatformDetails) return true;
  return false;
}
