import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';
import { validateFirebaseConfig, isTorBrowser } from '../lib/utils';
import { saveFirebaseConfig, saveProxyUrl, loadProxyUrl } from '../lib/storage';

interface ConfigFormProps {
  onConfigSaved: () => void;
}

/**
 * Extract Firebase config from any text format
 * Extracts fields directly using regex
 */
function extractFirebaseConfig(text: string): any {
  const config: any = {};
  
  // Define fields to extract
  const fields = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
    'measurementId',
    'databaseURL'
  ];
  
  // Extract each field using regex
  fields.forEach(field => {
    // Match: fieldName: "value" or fieldName: 'value' or "fieldName": "value"
    const patterns = [
      new RegExp(`["']?${field}["']?\\s*:\\s*["']([^"']+)["']`, 'i'),
      new RegExp(`${field}\\s*:\\s*["']([^"']+)["']`, 'i'),
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        config[field] = match[1];
        break;
      }
    }
  });
  
  return config;
}

/**
 * Convert JavaScript object notation to proper JSON
 * Falls back to field extraction if parsing fails
 */
function convertToJSON(text: string): string {
  try {
    // First try to parse as-is
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed);
  } catch {
    try {
      // Try to evaluate as JavaScript object
      // eslint-disable-next-line no-new-func
      const obj = new Function(`return ${text}`)();
      return JSON.stringify(obj);
    } catch {
      // Last resort: extract fields manually
      const config = extractFirebaseConfig(text);
      return JSON.stringify(config);
    }
  }
}

export function ConfigForm({ onConfigSaved }: ConfigFormProps) {
  const [configText, setConfigText] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [torStatus, setTorStatus] = useState<'checking' | 'tor' | 'normal'>('checking');

  // Load existing proxy URL so user can edit it
  useEffect(() => {
    loadProxyUrl().then(url => { if (url) setProxyUrl(url); }).catch(() => {});
    isTorBrowser().then(isTor => setTorStatus(isTor ? 'tor' : 'normal')).catch(() => setTorStatus('normal'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Trim whitespace
      let trimmedConfig = configText.trim();
      
      if (!trimmedConfig) {
        throw new Error('Configuration cannot be empty');
      }

      // Try to convert to proper JSON format
      const jsonString = convertToJSON(trimmedConfig);

      // Parse JSON
      let config;
      try {
        config = JSON.parse(jsonString);
      } catch (jsonError: any) {
        throw new Error(`Could not parse configuration: ${jsonError.message}`);
      }

      // Validate config
      if (!validateFirebaseConfig(config)) {
        const missing: string[] = [];
        const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
        required.forEach(field => {
          if (!config[field]) missing.push(field);
        });
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
      }

      // Save Firebase config and proxy URL
      await saveFirebaseConfig(config);
      await saveProxyUrl(proxyUrl.trim());

      // Notify parent
      onConfigSaved();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setConfigText(text);
    } catch (err) {
      setError('Failed to read from clipboard');
    }
  };

  const openInTab = () => {
    const url = browser.runtime.getURL('src/popup/index.html');
    browser.tabs.create({ url });
    window.close();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 sm:mb-8 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">TabSync Configuration</h1>
            <p className="text-sm sm:text-base text-gray-400">
              Paste your Firebase configuration JSON to get started
            </p>
          </div>
          <button
            type="button"
            onClick={openInTab}
            title="Open in a full browser tab (easier to paste)"
            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs sm:text-sm transition-colors mt-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <span className="hidden sm:inline">Open in tab</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Firebase Config JSON
            </label>
            <textarea
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              placeholder={`{\n  "apiKey": "AIza...",\n  "authDomain": "your-project.firebaseapp.com",\n  "projectId": "your-project-id",\n  "storageBucket": "your-project.appspot.com",\n  "messagingSenderId": "123456789",\n  "appId": "1:123456789:web:abc123"\n}`}
              className="w-full h-44 sm:h-64 px-3 py-2 sm:px-4 sm:py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-xs sm:text-sm resize-y"
              required
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-sm font-medium">
                Proxy URL <span className="text-gray-400 font-normal">(optional — required for Tor Browser)</span>
              </label>
              {/* Network / Tor detection status badge */}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                torStatus === 'checking'
                  ? 'bg-gray-700 text-gray-400'
                  : torStatus === 'tor'
                  ? 'bg-purple-800/70 text-purple-200'
                  : 'bg-green-800/70 text-green-200'
              }`}>
                {torStatus === 'checking' && '⏳ Detecting…'}
                {torStatus === 'tor' && '🧅 Tor detected'}
                {torStatus === 'normal' && '🌐 Normal browser'}
              </span>
            </div>
            <input
              type="url"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="https://tabsync-proxy.yourname.workers.dev"
              className="w-full px-3 py-2 sm:px-4 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-xs sm:text-sm"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className={`px-1.5 py-0.5 rounded ${proxyUrl.trim() ? 'bg-blue-800/60 text-blue-200' : 'bg-gray-700 text-gray-400'}`}>
                {proxyUrl.trim() ? '✓ Proxy active' : '○ Direct (no proxy)'}
              </span>
              {torStatus === 'tor' && !proxyUrl.trim() && (
                <span className="text-yellow-400">⚠ Tor detected but no proxy URL set — requests may fail</span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Deploy <code className="bg-gray-800 px-1 rounded">scripts/cf-worker.js</code> to Cloudflare Workers, then paste the worker URL here. Tor Browser users <strong className="text-gray-300">must</strong> set this.
            </p>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-3 py-2 sm:px-4 sm:py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePaste}
              className="px-3 py-2 sm:px-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
            >
              Paste
            </button>
            <button
              type="submit"
              disabled={loading || !configText}
              className="flex-1 px-3 py-2 sm:px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium text-sm"
            >
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>

        <div className="mt-6 sm:mt-8 p-3 sm:p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
          <h3 className="font-semibold mb-2 text-sm sm:text-base">How to get your Firebase config:</h3>
          <ol className="list-decimal list-inside space-y-1 text-xs sm:text-sm text-gray-300">
            <li>Go to Firebase Console</li>
            <li>Select your project (or create a new one)</li>
            <li>Go to Project Settings → General</li>
            <li>Scroll to "Your apps" section</li>
            <li>Copy the firebaseConfig object</li>
            <li>Paste it here</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
