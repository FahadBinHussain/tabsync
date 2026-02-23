import { useState } from 'react';
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore';
import type { BookmarkNode } from '../lib/types';

interface BookmarkTreeProps {
  nodes: BookmarkNode[];
  db: any;
  currentDeviceId: string;
  targetDeviceId: string;          // device whose bookmarks we're viewing
  otherDevices: { id: string; deviceName: string }[];
  isCurrentDevice: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single recursive node
// ─────────────────────────────────────────────────────────────────────────────

interface NodeRowProps {
  node: BookmarkNode;
  depth: number;
  db: any;
  currentDeviceId: string;
  targetDeviceId: string;
  otherDevices: { id: string; deviceName: string }[];
  isCurrentDevice: boolean;
}

function NodeRow({
  node,
  depth,
  db,
  currentDeviceId,
  targetDeviceId,
  otherDevices,
  isCurrentDevice,
}: NodeRowProps) {
  const isFolder = !node.url;
  const [open, setOpen] = useState(depth < 1); // auto-expand first level
  const [sendPopover, setSendPopover] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  /** Queue a createBookmark command on a target device. */
  const sendBookmarkToDevice = async (targetId: string) => {
    if (!db || !node.url) return;
    setSendPopover(false);
    try {
      const cmdRef = doc(collection(db, 'devices', targetId, 'commands'));
      await setDoc(cmdRef, {
        action: 'createBookmark',
        url: node.url,
        title: node.title,
        createdAt: serverTimestamp(),
        fromDevice: currentDeviceId,
      });
      setSentTo(targetId);
      setTimeout(() => setSentTo(null), 2000);
    } catch (err) {
      console.error('[TabSync] Failed to send bookmark:', err);
    }
  };

  /** Import entire folder recursively to THIS device via commands. */
  const importFolder = async (nodes: BookmarkNode[]) => {
    if (!db) return;
    setImporting(true);
    try {
      const flat = flattenBookmarks(nodes);
      await Promise.all(
        flat.map(bm => {
          const cmdRef = doc(collection(db, 'devices', currentDeviceId, 'commands'));
          return setDoc(cmdRef, {
            action: 'createBookmark',
            url: bm.url,
            title: bm.title,
            createdAt: serverTimestamp(),
            fromDevice: currentDeviceId,
          });
        }),
      );
      console.log(`[TabSync] Queued ${flat.length} bookmark(s) for import`);
    } catch (err) {
      console.error('[TabSync] Failed to import folder:', err);
    } finally {
      setImporting(false);
    }
  };

  const indentPx = depth * 16;

  if (isFolder) {
    return (
      <div>
        {/* Folder row */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-700 rounded cursor-pointer group transition-colors"
          style={{ paddingLeft: `${8 + indentPx}px` }}
          onClick={() => setOpen(o => !o)}
        >
          {/* Chevron */}
          <svg
            className={`w-3 h-3 text-gray-500 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {/* Folder icon */}
          <svg
            className="w-4 h-4 text-yellow-400 flex-shrink-0"
            fill="currentColor" viewBox="0 0 24 24"
          >
            <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
          </svg>

          <span className="text-sm flex-1 truncate text-gray-200">{node.title}</span>

          {/* Child count badge */}
          {node.children && (
            <span className="text-xs text-gray-500 flex-shrink-0 mr-1">
              {countLeaves(node.children)}
            </span>
          )}

          {/* Import folder button — only for remote devices */}
          {!isCurrentDevice && node.children && node.children.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); importFolder(node.children!); }}
              disabled={importing}
              className="opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs flex-shrink-0 transition-all"
              title="Import all bookmarks in this folder to this device"
            >
              {importing ? '…' : 'Import'}
            </button>
          )}
        </div>

        {/* Children */}
        {open && node.children && (
          <div>
            {node.children.map(child => (
              <NodeRow
                key={child.id}
                node={child}
                depth={depth + 1}
                db={db}
                currentDeviceId={currentDeviceId}
                targetDeviceId={targetDeviceId}
                otherDevices={otherDevices}
                isCurrentDevice={isCurrentDevice}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Leaf bookmark ──────────────────────────────────────────────────────────
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-700 rounded group transition-colors relative"
      style={{ paddingLeft: `${8 + indentPx}px` }}
    >
      {/* Favicon */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(node.url ?? '')}&sz=16`}
        alt=""
        className="w-4 h-4 flex-shrink-0 rounded"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />

      {/* Title + URL */}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate text-gray-200 leading-tight">{node.title}</p>
        <p className="text-xs text-gray-500 truncate leading-tight">{node.url}</p>
      </div>

      {/* Action buttons (shown on hover) */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all">
        {/* Open locally */}
        <button
          onClick={() => window.open(node.url, '_blank')}
          className="p-1 hover:bg-gray-600 rounded"
          title="Open in new tab"
        >
          <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>

        {/* Send to device (only when viewing another device's bookmarks, or for current device send to others) */}
        {otherDevices.length > 0 && (
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setSendPopover(p => !p); }}
              className="p-1 hover:bg-blue-600 rounded"
              title="Send bookmark to another device"
            >
              <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>

            {sendPopover && (
              <div className="absolute right-0 top-7 z-50 w-48 bg-gray-900 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
                <div className="px-3 py-2 bg-gray-800 border-b border-gray-700">
                  <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Send to…</p>
                </div>
                {otherDevices.map(d => (
                  <button
                    key={d.id}
                    onClick={() => sendBookmarkToDevice(d.id)}
                    disabled={sentTo === d.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 flex items-center justify-between gap-2 transition-colors disabled:opacity-60"
                  >
                    <span className="truncate">{d.deviceName}</span>
                    {sentTo === d.id && (
                      <span className="text-green-400 text-xs flex-shrink-0">✓ Sent</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: flatten tree to leaf URLs
// ─────────────────────────────────────────────────────────────────────────────

function flattenBookmarks(nodes: BookmarkNode[]): BookmarkNode[] {
  return nodes.flatMap(n => {
    if (n.url) return [n];
    if (n.children) return flattenBookmarks(n.children);
    return [];
  });
}

function countLeaves(nodes: BookmarkNode[]): number {
  return nodes.reduce((acc, n) => {
    if (n.url) return acc + 1;
    if (n.children) return acc + countLeaves(n.children);
    return acc;
  }, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────────────────────

export function BookmarkTree({
  nodes,
  db,
  currentDeviceId,
  targetDeviceId,
  otherDevices,
  isCurrentDevice,
}: BookmarkTreeProps) {
  const [importingAll, setImportingAll] = useState(false);
  const [importedAll, setImportedAll] = useState(false);

  const allLeaves = flattenBookmarks(nodes);

  const importAll = async () => {
    if (!db || isCurrentDevice) return;
    setImportingAll(true);
    try {
      await Promise.all(
        allLeaves.map(bm => {
          const cmdRef = doc(collection(db, 'devices', currentDeviceId, 'commands'));
          return setDoc(cmdRef, {
            action: 'createBookmark',
            url: bm.url,
            title: bm.title,
            createdAt: serverTimestamp(),
            fromDevice: currentDeviceId,
          });
        }),
      );
      setImportedAll(true);
      setTimeout(() => setImportedAll(false), 3000);
    } catch (err) {
      console.error('[TabSync] Failed to import all:', err);
    } finally {
      setImportingAll(false);
    }
  };

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500">
        <svg className="w-10 h-10 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        <p className="text-sm">No bookmarks synced yet</p>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar — import all (only for remote devices) */}
      {!isCurrentDevice && allLeaves.length > 0 && (
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-xs text-gray-500">{allLeaves.length} bookmark(s)</p>
          <button
            onClick={importAll}
            disabled={importingAll || importedAll}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            {importedAll ? (
              <>
                <svg className="w-3 h-3 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Imported!
              </>
            ) : importingAll ? (
              'Importing…'
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Import All
              </>
            )}
          </button>
        </div>
      )}

      {/* Tree */}
      <div className="space-y-0.5">
        {nodes.map(node => (
          <NodeRow
            key={node.id}
            node={node}
            depth={0}
            db={db}
            currentDeviceId={currentDeviceId}
            targetDeviceId={targetDeviceId}
            otherDevices={otherDevices}
            isCurrentDevice={isCurrentDevice}
          />
        ))}
      </div>
    </div>
  );
}
