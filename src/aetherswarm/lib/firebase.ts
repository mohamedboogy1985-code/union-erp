import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const SWARM_APP = 'aetherswarm';
const app = getApps().some((item) => item.name === SWARM_APP)
  ? getApp(SWARM_APP)
  : initializeApp(firebaseConfig, SWARM_APP);
export const auth = getAuth(app);

// Use the specific firestore database ID provisioned for this project
const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId;
export const db = firestoreDbId && firestoreDbId !== '(default)'
  ? getFirestore(app, firestoreDbId)
  : getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
export { onAuthStateChanged };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection constraint
export async function testFirestoreConnection(): Promise<boolean> {
  const testPath = 'test/connection';
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firebase] Connection verified successfully from server.');
    return true;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Offline or unavailable.');
    } else {
      console.log('[Firebase] Connection check completed:', error?.message);
    }
    return false;
  }
}

// Google Sign-In
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    // Sync profile to firestore
    if (user) {
      const userDocPath = `users/${user.uid}`;
      try {
        await setDoc(
          doc(db, 'users', user.uid),
          {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'User',
            photoURL: user.photoURL || '',
            role: 'operator',
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err: any) {
        if (err?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.WRITE, userDocPath);
        }
        console.warn('[Firebase] Could not sync user profile immediately:', err);
      }
    }
    return user;
  } catch (error: any) {
    console.error('Firebase Auth sign-in error:', error);
    throw error;
  }
}

// Sign out
export async function logOut(): Promise<void> {
  await fbSignOut(auth);
}

// Save Swarm Session to Firestore
export async function saveSwarmSessionToFirestore(userId: string, sessionData: any) {
  const collectionPath = `users/${userId}/sessions`;
  try {
    const sessionRef = doc(collection(db, 'users', userId, 'sessions'));
    await setDoc(sessionRef, {
      id: sessionRef.id,
      userId,
      ...sessionData,
      createdAt: new Date().toISOString(),
    });
    return sessionRef.id;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.CREATE, collectionPath);
    }
    console.error('Failed to save session to Firestore:', err);
    return null;
  }
}

// Load Swarm Sessions
export async function loadUserSwarmSessions(userId: string) {
  const collectionPath = `users/${userId}/sessions`;
  try {
    const q = query(
      collection(db, 'users', userId, 'sessions'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.LIST, collectionPath);
    }
    console.error('Failed to load sessions from Firestore:', err);
    return [];
  }
}

// Save Virtual Desktop File to Firestore
export async function saveFileToFirestore(userId: string, file: any) {
  const filePath = `users/${userId}/files/${file.id || 'new'}`;
  try {
    const fileRef = doc(db, 'users', userId, 'files', file.id || String(Date.now()));
    await setDoc(fileRef, {
      ...file,
      userId,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, filePath);
    }
    console.error('Failed to save file to Firestore:', err);
  }
}

// Save Audit Log
export async function saveAuditLogToFirestore(userId: string, log: any) {
  const logPath = `users/${userId}/auditLogs`;
  try {
    const logRef = doc(collection(db, 'users', userId, 'auditLogs'));
    await setDoc(logRef, {
      ...log,
      userId,
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.CREATE, logPath);
    }
    console.error('Failed to save audit log to Firestore:', err);
  }
}
