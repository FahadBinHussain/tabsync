import { useState, useEffect } from 'react';
import { validateFirebaseConfig, isTorBrowser } from '../lib/utils';
import { saveFirebaseConfig, saveProxyUrl, loadProxyUrl } from '../lib/storage';

interface ConfigFormProps {
  onConfigSaved: () => void;
}

function extractFirebaseConfig(text: string): any {
  const config: any = {};
  const fields = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','measurementId','databaseURL'];
  fields.forEach(field => {
    const patterns = [
      new RegExp(`["']?${field}["']?\\s*:\\s*["']([^"']+)["']`, 'i'),
      new RegExp(`${field}\\s*:\\s*["']([^"']+)["']`, 'i'),
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) { config[field] = m[1]; break; }
    }
  });
  return config;
}

function convertToJSON(text: string): string {
  try { return JSON.stringify(JSON.parse(text)); } catch { /* */ }
  try {
    // eslint-disable-next-line no-new-func
    return JSON.stringify(new Function(`return ${text}`)());
  } catch { /* */ }
  return JSON.stringify(extractFirebaseConfig(text));
}

export function ConfigForm({ onConfigSaved }: ConfigFormProps) {
  const [configText, setConfigText] = useState('');
  const [proxyUrl, setProxyUrl]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [torStatus, setTorStatus]   = useState<'checking' | 'tor' | 'normal'>('checking');

  useEffect(() => {
    loadProxyUrl().then(u => { if (u) setProxyUrl(u); }).catch(() => {});
    isTorBrowser().then(t => setTorStatus(t ? 'tor' : 'normal')).catch(() => setTorStatus('normal'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const trimmed = configText.trim();
      if (!trimmed) throw new Error('Configuration cannot be empty');
      const jsonStr = convertToJSON(trimmed);
      let config;
      try { config = JSON.parse(jsonStr); } catch (je: any) { throw new Error(`Could not parse: ${je.message}`); }
      if (!validateFirebaseConfig(config)) {
        const required = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
        const missing = required.filter(f => !config[f]);
        throw new Error(`Missing: ${missing.join(', ')}`);
      }
      await saveFirebaseConfig(config);
      await saveProxyUrl(proxyUrl.trim());
      onConfigSaved();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try { setConfigText(await navigator.clipboard.readText()); }
    catch { setError('Failed to read clipboard'); }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">TabSync Configuration</h1>
          <p className="text-sm sm:text-base text-gray-400">Paste your Firebase configuration JSON to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Firebase Config JSON</label>
            <textarea
              value={configText}
              onChange={e => setConfigText(e.target.value)}
              placeholder={`{\n  "apiKey": "AIza...",\n  "projectId": "your-project-id",\n  ...\n}`}
              className="w-full h-44 sm:h-64 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs sm:text-sm resize-y"
              required
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-sm font-medium">
                Proxy URL <span className="text-gray-400 font-normal">(required for Tor Browser)</span>
              </label>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                torStatus === 'checking' ? 'bg-gray-700 text-gray-400'
                : torStatus === 'tor'    ? 'bg-purple-800/70 text-purple-200'
                :                          'bg-green-800/70 text-green-200'
              }`}>
                {torStatus === 'checking' && '⏳ Detecting…'}
                {torStatus === 'tor'      && '🧅 Tor detected'}
                {torStatus === 'normal'   && '🌐 Normal browser'}
              </span>
            </div>
            <input
              type="url"
              value={proxyUrl}
              onChange={e => setProxyUrl(e.target.value)}
              placeholder="https://tabsync-proxy.yourname.workers.dev"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs sm:text-sm"
            />
            {torStatus === 'tor' && !proxyUrl.trim() && (
              <p className="mt-1 text-xs text-yellow-400">⚠ Tor detected — a proxy URL is required</p>
            )}
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-3 py-2 rounded-lg text-sm">{error}</div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={handlePaste}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">
              Paste
            </button>
            <button type="submit" disabled={loading || !configText}
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium text-sm transition-colors">
              {loading ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
