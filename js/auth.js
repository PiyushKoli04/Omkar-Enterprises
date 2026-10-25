/**
 * Authentication Module
 * Handles: Register, Login, Google Sign-In, Password Reset, Auth State, Admin Check
 */

import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';

import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

import { showToast } from './ui.js';

const googleProvider = new GoogleAuthProvider();

// Current user state
let currentUser = null;
let currentUserData = null;
let isAdmin = false;
let authReadyResolve;
const authReady = new Promise(resolve => { authReadyResolve = resolve; });

// Auth state listeners
const authListeners = [];

/**
 * Register callback for auth state changes
 */
export function onAuthChange(callback) {
  authListeners.push(callback);
  // If auth is already resolved, call immediately
  if (currentUser !== undefined) {
    callback(currentUser, currentUserData, isAdmin);
  }
}

/**
 * Wait until auth state is determined
 */
export function waitForAuth() {
  return authReady;
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return currentUser;
}

export function getCurrentUserData() {
  return currentUserData;
}

export function getIsAdmin() {
  return isAdmin;
}

export const ADMIN_EMAILS = [
  'vanitaharesh2005@gmail.com',
  'admin@omkarenterprises.com',
  'omkarenterprises.admin@gmail.com'
];

/**
 * Create or update user document in Firestore
 */
async function ensureUserDoc(user) {
  const userRef = doc(db, 'users', user.uid);
  const email = (user.email || '').toLowerCase();
  const isTargetAdmin = ADMIN_EMAILS.includes(email);
  const defaultRole = isTargetAdmin ? 'admin' : 'user';

  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    // New user — create document
    const newDoc = {
      email: user.email || '',
      displayName: user.displayName || (isTargetAdmin ? 'Admin' : ''),
      phone: user.phoneNumber || '',
      photoURL: user.photoURL || '',
      role: defaultRole,
      defaultAddress: '',
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp()
    };
    await setDoc(userRef, newDoc);
    return newDoc;
  } else {
    // Existing user — if admin email, ensure role is admin
    const updates = { lastLogin: serverTimestamp() };
    if (isTargetAdmin && userSnap.data().role !== 'admin') {
      updates.role = 'admin';
    }
    await setDoc(userRef, updates, { merge: true });
    return { ...userSnap.data(), ...updates };
  }
}

/**
 * Listen to auth state changes
 */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      const userData = await ensureUserDoc(user);
      currentUserData = userData;
      isAdmin = userData.role === 'admin' || (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
    } catch (err) {
      console.error('Error fetching user data:', err);
      currentUserData = {};
      isAdmin = (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
    }

    // Update body classes
    document.body.classList.add('logged-in');
    document.body.classList.toggle('is-admin', isAdmin);

    // Update header user name
    const nameEl = document.querySelector('.header-user-name');
    if (nameEl) {
      nameEl.textContent = user.displayName || 'Account';
    }
  } else {
    currentUser = null;
    currentUserData = null;
    isAdmin = false;
    document.body.classList.remove('logged-in', 'is-admin');
  }

  // Notify listeners
  authListeners.forEach(cb => {
    try { cb(currentUser, currentUserData, isAdmin); } catch(e) { console.error(e); }
  });

  authReadyResolve({ user: currentUser, userData: currentUserData, isAdmin });
});

/**
 * Register with email + password
 */
export async function registerEmail(email, password, displayName) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    
    // Set display name
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }

    // Send email verification
    try {
      await sendEmailVerification(cred.user);
    } catch (e) {
      console.warn('Email verification failed:', e.message);
    }

    showToast('Account created successfully! Please verify your email.', 'success');
    return cred.user;
  } catch (err) {
    const msg = getAuthErrorMessage(err.code);
    showToast(msg, 'error');
    throw err;
  }
}

/**
 * Login with email + password
 */
export async function loginEmail(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    showToast('Welcome back!', 'success');
    return cred.user;
  } catch (err) {
    const msg = getAuthErrorMessage(err.code);
    showToast(msg, 'error');
    throw err;
  }
}

/**
 * Sign in with Google
 */
export async function loginGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    showToast(`Welcome, ${result.user.displayName || 'User'}!`, 'success');
    return result.user;
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') return null;
    const msg = getAuthErrorMessage(err.code);
    showToast(msg, 'error');
    throw err;
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Password reset email sent. Check your inbox.', 'success');
  } catch (err) {
    const msg = getAuthErrorMessage(err.code);
    showToast(msg, 'error');
    throw err;
  }
}

/**
 * Sign out
 */
export async function logout() {
  try {
    await signOut(auth);
    showToast('Signed out successfully.', 'info');
  } catch (err) {
    showToast('Error signing out. Please try again.', 'error');
  }
}

/**
 * Initialize / ensure auth listener is active
 */
export function initAuth() {
  return auth;
}

/**
 * Get role for given UID from user doc or in-memory state
 */
export async function getUserRole(uid) {
  const user = getCurrentUser();
  if (user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return 'admin';
  }
  if (!uid && user) uid = user.uid;
  if (!uid) return 'guest';
  if (currentUser && currentUser.uid === uid && currentUserData?.role) {
    return currentUserData.role;
  }
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      if (d.email && ADMIN_EMAILS.includes(d.email.toLowerCase())) return 'admin';
      return d.role || 'user';
    }
  } catch (e) {
    console.error('Error fetching role:', e);
  }
  if (user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return 'admin';
  }
  return 'user';
}

// Aliases for alternate naming conventions
export const loginWithEmail = loginEmail;
export const registerWithEmail = registerEmail;
export const loginWithGoogle = loginGoogle;
export const logoutUser = logout;

/**
 * Require auth — redirect to login if not authenticated
 */
export async function requireAuth() {
  const { user } = await authReady;
  if (!user) {
    showToast('Please log in to access this page.', 'warning');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

/**
 * Require admin — redirect if not admin
 */
export async function requireAdmin() {
  const result = await authReady;
  if (!result.user) {
    showToast('Please log in as admin.', 'warning');
    window.location.href = 'login.html';
    return false;
  }
  if (!result.isAdmin) {
    showToast('You do not have admin access.', 'error');
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

/**
 * Map Firebase auth error codes to friendly messages
 */
function getAuthErrorMessage(code) {
  const messages = {
    'auth/email-already-in-use': 'This email is already registered. Try logging in.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/popup-blocked': 'Popup was blocked. Please allow popups and try again.',
    'auth/network-request-failed': 'Network error. Please check your internet connection.',
    'auth/invalid-credential': 'Invalid credentials. Please check your email and password.',
    'auth/user-disabled': 'This account has been disabled. Contact support.',
  };
  return messages[code] || 'An error occurred. Please try again.';
}
