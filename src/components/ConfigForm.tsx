import { useState } from 'react';
import browser from 'webextension-polyfill';
import { validateFirebaseConfig } from '../lib/utils';

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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

      // Save to storage
      await browser.storage.local.set({ firebaseConfig: config });

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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">TabSync Configuration</h1>
          <p className="text-gray-400">
            Paste your Firebase configuration JSON to get started
          </p>
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
              className="w-full h-64 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              required
            />
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePaste}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Paste from Clipboard
            </button>
            <button
              type="submit"
              disabled={loading || !configText}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
            >
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>

        <div className="mt-8 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
          <h3 className="font-semibold mb-2">How to get your Firebase config:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-300">
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
