// ─── Bookmark types ────────────────────────────────────────────────────────

/**
 * Stored representation of a single bookmark node.
 * Folders have children: BookmarkNode[] (nested tree).
 * Leaf bookmarks have url set and no children.
 */
export interface BookmarkNode {
  id: string;
  title: string;
  url?: string;              // undefined → folder
  dateAdded?: number;        // epoch ms
  children?: BookmarkNode[]; // only on folders
}

// ─── Tab types ─────────────────────────────────────────────────────────────

export interface SyncedTab {
  id?: number;
  url: string;
  title: string;
  favIconUrl?: string;
  windowId?: number;
  index?: number;
  active?: boolean;
  pinned?: boolean;
}

// ─── Device document (Firestore: devices/{deviceId}) ───────────────────────

export interface DeviceDocument {
  id: string;
  deviceName: string;
  lastUpdated: any; // Firestore Timestamp
  tabs: SyncedTab[];
  tabCount: number;
  bookmarks?: BookmarkNode[];    // full bookmark tree root children
  bookmarkCount?: number;
  bookmarksUpdated?: any;        // Firestore Timestamp
}
