// Firebase configuration and initialization
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, collection, addDoc, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { CustomerHistoryLog } from "@shared/types";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebasestorage.app`,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// ignoreUndefinedProperties: 스냅샷/업데이트 객체에 undefined 값이 섞여도 Firestore가 invalid-argument로
// 거부하지 않고 해당 필드만 누락(omit)하여 저장. buildProcessingOrgSnapshot처럼 선택적 필드가 많은
// 객체를 안전하게 쓰기 위한 전역 설정. 반드시 getFirestore 호출 이전에 initializeFirestore로 설정.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Add customer history log
export async function addCustomerHistoryLog(log: Omit<CustomerHistoryLog, 'id' | 'changed_at'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'customer_history_logs'), {
    ...log,
    changed_at: Timestamp.now(),
  });
  return docRef.id;
}

// Get customer history logs
export async function getCustomerHistoryLogs(customerId: string): Promise<CustomerHistoryLog[]> {
  const q = query(
    collection(db, 'customer_history_logs'),
    where('customer_id', '==', customerId),
    orderBy('changed_at', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      changed_at: data.changed_at?.toDate() || new Date(),
    } as CustomerHistoryLog;
  });
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('로그인이 필요합니다.');
  }
  const token = await currentUser.getIdToken();
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

export default app;
