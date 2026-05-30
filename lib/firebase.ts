// ─────────────────────────────────────────────
//  SPENDNOT — Firebase initialisation
//  lib/firebase.ts
// ─────────────────────────────────────────────
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBAGNIynFQzZ0MS9_WghU1pw8sqsN2Cvgg',
  authDomain: 'spendnot-app.firebaseapp.com',
  projectId: 'spendnot-app',
  storageBucket: 'spendnot-app.firebasestorage.app',
  messagingSenderId: '1091772148884',
  appId: '1:1091772148884:web:e0d07458985255a350d881',
};

// Prevent duplicate initialisation during hot-reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Auth — use browserLocalPersistence as cross-platform default
// (React Native will use its own internal persistence via expo-modules)
export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: browserLocalPersistence,
    });
  } catch {
    // Already initialized
    return getAuth(app);
  }
})();

export const db = getFirestore(app);

export default app;
