import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  collection,
  getDocs,
  serverTimestamp,
  Firestore,
  query,
  limit,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'hmixer1204.2.2@gmail.com';

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

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth: Auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let firestoreBootChecked = false;
let firestoreReachable = false;

export async function testFirestoreConnection(): Promise<{
  connected: boolean;
  projectId: string;
  databaseId: string;
  error?: string;
}> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    firestoreBootChecked = true;
    firestoreReachable = true;
    return {
      connected: true,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    firestoreBootChecked = true;
    // Permission denied still proves live reachability to the configured Firestore DB
    if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
      firestoreReachable = true;
      return {
        connected: true,
        projectId: firebaseConfig.projectId,
        databaseId: firebaseConfig.firestoreDatabaseId,
      };
    }
    if (msg.includes('the client is offline')) {
      firestoreReachable = false;
      console.error('Please check your Firebase configuration.');
    }
    return {
      connected: false,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      error: msg,
    };
  }
}

// Run boot connection test as required by Firebase integration guidelines
if (typeof window !== 'undefined') {
  testFirestoreConnection().catch(() => {});
}

export function isFirestoreReachable(): boolean {
  return firestoreBootChecked ? firestoreReachable : true;
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  // Ensure user profile exists in /users/{uid} respecting strict PII & role rules
  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const isAdminEmail =
      user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() && user.emailVerified;

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: (user.displayName || user.email?.split('@')[0] || 'Learner').slice(0, 120),
        email: (user.email || '').slice(0, 200),
        role: isAdminEmail ? 'admin' : 'learner',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        userRef,
        {
          displayName: (user.displayName || snap.data().displayName || 'Learner').slice(0, 120),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (isAdminEmail) {
      const adminRef = doc(db, 'admins', user.uid);
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, {
          uid: user.uid,
          role: 'admin',
          createdAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    // Non-fatal if rules reject optional profile sync; log context cleanly
    console.warn('User profile sync note:', err instanceof Error ? err.message : String(err));
  }

  return user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export function onAuthChange(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function getCurrentIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

export async function checkIsAdminUser(user: User | null): Promise<boolean> {
  if (!user) return false;
  if (user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() && user.emailVerified) {
    return true;
  }
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.data?.isAdmin) return true;
    }
  } catch {
    // fallback to Firestore check below
  }

  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    return adminSnap.exists() && adminSnap.data()?.role === 'admin';
  } catch {
    return false;
  }
}

export async function verifyFirestoreAudioIndexReadable(): Promise<{
  ok: boolean;
  sampleCount: number;
  error?: string;
}> {
  const path = 'ttsAudioCache';
  try {
    if (!auth.currentUser) {
      const conn = await testFirestoreConnection();
      return { ok: conn.connected, sampleCount: 0, error: conn.error };
    }
    const q = query(collection(db, path), limit(5));
    const snap = await getDocs(q);
    return { ok: true, sampleCount: snap.size };
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, path);
    } catch (wrapped) {
      return {
        ok: false,
        sampleCount: 0,
        error: wrapped instanceof Error ? wrapped.message : String(wrapped),
      };
    }
  }
}

export { firebaseConfig };
