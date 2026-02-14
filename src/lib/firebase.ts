import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

let firebaseApp: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;

/**
 * Initialize Firebase with dynamic config
 * Uses singleton pattern to ensure only one instance
 */
export function initFirebase(config: any): { app: FirebaseApp; db: Firestore } {
  // Check if already initialized
  if (firebaseApp && firestoreInstance) {
    return { app: firebaseApp, db: firestoreInstance };
  }

  // Check if Firebase is already initialized globally
  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0];
  } else {
    firebaseApp = initializeApp(config);
  }

  firestoreInstance = getFirestore(firebaseApp);

  return { app: firebaseApp, db: firestoreInstance };
}

/**
 * Get the current Firestore instance
 * Returns null if not initialized
 */
export function getFirebaseInstance(): { app: FirebaseApp; db: Firestore } | null {
  if (!firebaseApp || !firestoreInstance) {
    return null;
  }
  return { app: firebaseApp, db: firestoreInstance };
}

/**
 * Reset Firebase instance (useful for config changes)
 */
export function resetFirebase(): void {
  firebaseApp = null;
  firestoreInstance = null;
}
