/**
 * ===== تهيئة Firebase لسطح AetherSwarm — إعداد من البيئة لا من ملف مودَع في Git =====
 *
 * السبب (قرار §6.1 في `docs/SWARM_PROPOSAL_EVALUATION.md` + `docs/AETHER_SWARM_HARDENING.md` §5):
 * كان الإعداد (وفيه مفتاح Web API) مودَعاً في `firebase-applet-config.json` داخل المستودع.
 * حذف الملف من Git لا يُلغي المفتاح من التاريخ ولا يمنع استخدامه: **يجب تدوير المفتاح**
 * من Google Cloud → APIs & Services → Credentials (أو Firebase Console → Project settings).
 *
 * لذلك:
 *   - الإعداد يُقرأ من متغيرات بيئة `VITE_FIREBASE_*` (مثالها في `.env.example`
 *     وفي `firebase-applet-config.example.json`).
 *   - عند غياب الإعداد لا يُستورد أي ملف ولا تُنشأ تهيئة: `firebaseConfigured = false`،
 *     وكل الدوال تعيد قيمة فارغة صريحة بدل أن تسقط الواجهة أو تتظاهر بالاتصال.
 *   - الهوية المعتمدة في النظام هي JWT/ERP (سجل التدقيق المتسلسل). Firebase هنا
 *     اختياري لحفظ جلسات/ملفات سطح السرب فقط، ولا يُستخدم كهوية للنظام.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';

interface SwarmFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  firestoreDatabaseId?: string;
}

/** قراءة الإعداد من متغيرات بيئة Vite (لا استيراد ملف JSON — لا سر في Git) */
function readConfigFromEnv(): SwarmFirebaseConfig | null {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<
    string,
    string | undefined
  >;
  const apiKey = (env.VITE_FIREBASE_API_KEY || '').trim();
  const projectId = (env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const appId = (env.VITE_FIREBASE_APP_ID || '').trim();
  const authDomain = (env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    appId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
    firestoreDatabaseId: env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
  };
}

const config = readConfigFromEnv();

/** هل Firebase مضبوط في هذه البيئة؟ (تستخدمه الواجهة لتعرض الحالة بلا ادعاء) */
export const firebaseConfigured = config !== null;

export const firebaseConfigNote = firebaseConfigured
  ? 'Firebase مضبوط من متغيرات البيئة.'
  : 'Firebase غير مضبوط: لا توجد متغيرات VITE_FIREBASE_*. سطح السرب يعمل ببيانات ERP وهوية JWT، وحفظ الجلسات السحابي معطّل.';

const SWARM_APP = 'aetherswarm';

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (config) {
  app = getApps().some((item) => item.name === SWARM_APP) ? getApp(SWARM_APP) : initializeApp(config, SWARM_APP);
  authInstance = getAuth(app);
  const databaseId = config.firestoreDatabaseId;
  dbInstance = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);
} else if (typeof console !== 'undefined') {
  console.info('[Firebase] ' + firebaseConfigNote);
}

export const auth = authInstance;
export const db = dbInstance;
export const googleProvider = config ? new GoogleAuthProvider() : null;

/** بديل آمن لـonAuthStateChanged: بلا تهيئة ⇒ لا مستخدم، ولا استثناء */
export function onAuthStateChangedSafe(callback: (user: User | null) => void): () => void {
  if (!authInstance) {
    callback(null);
    return () => undefined;
  }
  return fbOnAuthStateChanged(authInstance, callback);
}

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
      userId: authInstance?.currentUser?.uid,
      email: authInstance?.currentUser?.email,
      emailVerified: authInstance?.currentUser?.emailVerified,
      isAnonymous: authInstance?.currentUser?.isAnonymous,
      tenantId: authInstance?.currentUser?.tenantId,
      providerInfo:
        authInstance?.currentUser?.providerData?.map((provider) => ({
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

/** اختبار اتصال حقيقي: بلا تهيئة ⇒ false (لا "متصل" بالتخمين) */
export async function testFirestoreConnection(): Promise<boolean> {
  if (!dbInstance) return false;
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
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

/** تسجيل الدخول بجوجل — بلا تهيئة ⇒ null (لا نافذة ولا خطأ مربك) */
export async function signInWithGoogle(): Promise<User | null> {
  if (!authInstance || !googleProvider) return null;
  try {
    const result = await signInWithPopup(authInstance, googleProvider);
    const user = result.user;
    if (user && dbInstance) {
      try {
        await setDoc(
          doc(dbInstance, 'users', user.uid),
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
        if (err?.code === 'permission-denied') handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        console.warn('[Firebase] Could not sync user profile immediately:', err);
      }
    }
    return user;
  } catch (error: any) {
    console.error('Firebase Auth sign-in error:', error);
    throw error;
  }
}

export async function logOut(): Promise<void> {
  if (!authInstance) return;
  await fbSignOut(authInstance);
}

export async function saveSwarmSessionToFirestore(userId: string, sessionData: any): Promise<string | null> {
  if (!dbInstance) return null;
  const collectionPath = `users/${userId}/sessions`;
  try {
    const sessionRef = doc(collection(dbInstance, 'users', userId, 'sessions'));
    await setDoc(sessionRef, {
      id: sessionRef.id,
      userId,
      ...sessionData,
      createdAt: new Date().toISOString(),
    });
    return sessionRef.id;
  } catch (err: any) {
    if (err?.code === 'permission-denied') handleFirestoreError(err, OperationType.CREATE, collectionPath);
    console.error('Failed to save session to Firestore:', err);
    return null;
  }
}

export async function loadUserSwarmSessions(userId: string): Promise<any[]> {
  if (!dbInstance) return [];
  const collectionPath = `users/${userId}/sessions`;
  try {
    const q = query(collection(dbInstance, 'users', userId, 'sessions'), orderBy('createdAt', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  } catch (err: any) {
    if (err?.code === 'permission-denied') handleFirestoreError(err, OperationType.LIST, collectionPath);
    console.error('Failed to load sessions from Firestore:', err);
    return [];
  }
}

export async function saveFileToFirestore(userId: string, file: any): Promise<void> {
  if (!dbInstance) return;
  const filePath = `users/${userId}/files/${file.id || 'new'}`;
  try {
    const fileRef = doc(dbInstance, 'users', userId, 'files', file.id || String(Date.now()));
    await setDoc(fileRef, { ...file, userId, updatedAt: new Date().toISOString() });
  } catch (err: any) {
    if (err?.code === 'permission-denied') handleFirestoreError(err, OperationType.WRITE, filePath);
    console.error('Failed to save file to Firestore:', err);
  }
}

export async function saveAuditLogToFirestore(userId: string, log: any): Promise<void> {
  if (!dbInstance) return;
  const logPath = `users/${userId}/auditLogs`;
  try {
    const logRef = doc(collection(dbInstance, 'users', userId, 'auditLogs'));
    await setDoc(logRef, { ...log, userId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    if (err?.code === 'permission-denied') handleFirestoreError(err, OperationType.CREATE, logPath);
    console.error('Failed to save audit log to Firestore:', err);
  }
}
