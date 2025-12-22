// Firebase configuration and initialization
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, collection, addDoc, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
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
export const db = getFirestore(app);
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

export default app;
