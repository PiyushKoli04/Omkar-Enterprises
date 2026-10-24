/**
 * Firebase Configuration Module
 * Omkar Enterprises – Courier Services
 * 
 * Firebase web config keys are PUBLIC by design.
 * Security comes from Firestore Security Rules (see firestore.rules).
 * 
 * RECOMMENDED:
 * 1. Enable Firebase App Check in the Firebase Console
 * 2. Restrict the API key to your GitHub Pages domain 
 *    (Google Cloud Console → APIs & Services → Credentials)
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-analytics.js';

const firebaseConfig = {
  apiKey: "AIzaSyBEe3TWU_bxMCLEfS9kzKCnJGSTg7X2cUg",
  authDomain: "omkar-enterpises.firebaseapp.com",
  projectId: "omkar-enterpises",
  storageBucket: "omkar-enterpises.firebasestorage.app",
  messagingSenderId: "373726246219",
  appId: "1:373726246219:web:54b056b393e047194024ce",
  measurementId: "G-8TMF1M237Q"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Analytics (only in production)
let analytics = null;
try {
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    analytics = getAnalytics(app);
  }
} catch (e) {
  console.warn('Analytics not available:', e.message);
}

// Uncomment for local emulator development:
// connectAuthEmulator(auth, 'http://localhost:9099');
// connectFirestoreEmulator(db, 'localhost', 8080);

export { app, auth, db, analytics };
