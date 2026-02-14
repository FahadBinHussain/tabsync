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
