import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  initializeFirestore,
} from 'firebase/firestore';

let firebaseApp: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;

/**
 * Initialize Firebase with dynamic config.
 * Uses singleton pattern to ensure only one instance.
 *
 * experimentalForceLongPolling: true — forces Firestore to use HTTP long-poll
 * instead of WebSockets. Required for Tor Browser which blocks WebChannel
 * connections to googleapis.com over the Tor network.
 */
export function initFirebase(config: any): { app: FirebaseApp; db: Firestore } {
  if (firebaseApp && firestoreInstance) {
    return { app: firebaseApp, db: firestoreInstance };
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0];
  } else {
    firebaseApp = initializeApp(config);
  }

  // Use long-polling transport — more compatible with Tor and restrictive proxies.
  // Falls back gracefully on normal networks too.
  try {
    firestoreInstance = initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
    });
  } catch {
    // initializeFirestore throws if called twice for the same app; fall back to getFirestore
    firestoreInstance = getFirestore(firebaseApp);
  }

  return { app: firebaseApp, db: firestoreInstance };
}

export function getFirebaseInstance(): { app: FirebaseApp; db: Firestore } | null {
  if (!firebaseApp || !firestoreInstance) return null;
  return { app: firebaseApp, db: firestoreInstance };
}

export function resetFirebase(): void {
  firebaseApp = null;
  firestoreInstance = null;
}
