/**
 * Minimal Firestore REST API helpers.
 *
 * Uses plain fetch() to the Firestore REST v1 endpoint.
 * Zero persistent connections — no WebChannel, no long-poll, no Listen stream.
 * Works over Tor Browser and any restrictive proxy.
 *
 * Proxy support:
 *   Set proxyUrl to your Cloudflare Worker URL (e.g. https://tabsync-proxy.yourname.workers.dev).
 *   The worker re-routes /v1/... to firestore.googleapis.com and injects the API key server-side.
 *   When proxyUrl is set, the ?key= param is NOT appended (worker handles auth).
 */

export interface FirestoreConfig {
  projectId: string;
  apiKey: string;
  /** Optional proxy base URL (e.g. Cloudflare Worker). When set, routes all REST calls through it. */
  proxyUrl?: string;
}

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

// ─────────────────────────────────────────────────────────────────────────────
// Decode Firestore typed values to plain JS
// ─────────────────────────────────────────────────────────────────────────────

export function decodeValue(val: FirestoreValue): any {
  if ('stringValue'    in val) return val.stringValue;
  if ('integerValue'   in val) return Number(val.integerValue);
  if ('doubleValue'    in val) return val.doubleValue;
  if ('booleanValue'   in val) return val.booleanValue;
  if ('nullValue'      in val) return null;
  if ('timestampValue' in val) return new Date(val.timestampValue);
  if ('mapValue'       in val) return decodeFields(val.mapValue.fields ?? {});
  if ('arrayValue'     in val) return (val.arrayValue.values ?? []).map(decodeValue);
  return undefined;
}

export function decodeFields(fields: Record<string, FirestoreValue>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeValue(v);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Encode plain JS to Firestore typed value
// ─────────────────────────────────────────────────────────────────────────────

export function encodeValue(val: any): FirestoreValue {
  if (val === null || val === undefined)   return { nullValue: null };
  if (typeof val === 'boolean')            return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val)
      ? { integerValue: String(val) }
      : { doubleValue: val };
  }
  if (typeof val === 'string')             return { stringValue: val };
  if (val instanceof Date)                 return { timestampValue: val.toISOString() };
  if (Array.isArray(val))                  return { arrayValue: { values: val.map(encodeValue) } };
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val)) fields[k] = encodeValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function encodeFields(obj: Record<string, any>): Record<string, FirestoreValue> {
  const out: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = encodeValue(v);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// REST helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build the base documents URL, routing through proxy if configured. */
function baseUrl(cfg: FirestoreConfig): string {
  const base = cfg.proxyUrl
    ? cfg.proxyUrl.replace(/\/$/, '')          // use proxy, strip trailing slash
    : 'https://firestore.googleapis.com';
  return `${base}/v1/projects/${cfg.projectId}/databases/(default)/documents`;
}

/** Append ?key= only when NOT using a proxy (proxy injects it server-side). */
function withKey(url: string, cfg: FirestoreConfig): string {
  if (cfg.proxyUrl) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}key=${cfg.apiKey}`;
}

/** List all documents in a collection. Returns array of { id, ...fields }. */
export async function restListDocs(
  cfg: FirestoreConfig,
  collectionPath: string,
): Promise<Array<Record<string, any> & { id: string }>> {
  const url = withKey(`${baseUrl(cfg)}/${collectionPath}`, cfg);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Firestore REST list failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents.map((d: any) => {
    const id = d.name.split('/').pop()!;
    return { id, ...decodeFields(d.fields ?? {}) };
  });
}

/** Get a single document. Returns { id, ...fields } or null if not found. */
export async function restGetDoc(
  cfg: FirestoreConfig,
  docPath: string,
): Promise<(Record<string, any> & { id: string }) | null> {
  const url = withKey(`${baseUrl(cfg)}/${docPath}`, cfg);
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Firestore REST get failed: ${res.status} ${body}`);
  }
  const d = await res.json();
  const id = d.name.split('/').pop()!;
  return { id, ...decodeFields(d.fields ?? {}) };
}

/** Create or overwrite a document at docPath. */
export async function restSetDoc(
  cfg: FirestoreConfig,
  docPath: string,
  data: Record<string, any>,
): Promise<void> {
  // PATCH with updateMask to do a full overwrite
  const fields = encodeFields(data);
  const fieldPaths = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const rawUrl = `${baseUrl(cfg)}/${docPath}?${fieldPaths}`;
  const url = withKey(rawUrl, cfg);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Firestore REST set failed: ${res.status} ${body}`);
  }
}

/** Merge-update specific fields of a document. */
export async function restUpdateDoc(
  cfg: FirestoreConfig,
  docPath: string,
  data: Record<string, any>,
): Promise<void> {
  await restSetDoc(cfg, docPath, data);
}

/** Delete a document. */
export async function restDeleteDoc(
  cfg: FirestoreConfig,
  docPath: string,
): Promise<void> {
  const url = withKey(`${baseUrl(cfg)}/${docPath}`, cfg);
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`Firestore REST delete failed: ${res.status} ${body}`);
  }
}

/** Extract projectId and apiKey from a Firebase config object. */
export function extractRestConfig(firebaseConfig: any, proxyUrl?: string): FirestoreConfig {
  const projectId = firebaseConfig.projectId;
  const apiKey    = firebaseConfig.apiKey;
  if (!projectId || !apiKey) throw new Error('Firebase config missing projectId or apiKey');
  return { projectId, apiKey, ...(proxyUrl ? { proxyUrl } : {}) };
}
