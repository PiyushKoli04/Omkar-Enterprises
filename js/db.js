/**
 * Database Helpers Module
 * Common Firestore operations used across the app
 */

import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, getDocs,
  serverTimestamp, writeBatch, Timestamp
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

// ==========================================
// BUSINESS SETTINGS (cached)
// ==========================================
let businessSettingsCache = null;

/**
 * Fetch business settings from Firestore (settings/business)
 * Cached in memory for the session
 */
export async function getBusinessSettings() {
  if (businessSettingsCache) return businessSettingsCache;

  try {
    const snap = await getDoc(doc(db, 'settings', 'business'));
    const DEFAULT_BIZ = {
      phone: '+919619628045',
      whatsapp: '919619628045',
      email: 'vanitaharesh2005@gmail.com',
      labelEmail: 'vanitaharesh2005@gmail.com',
      address: 'Omkar Enterprises Hub, Nerul, Navi Mumbai, Maharashtra 400706',
      workingHours: 'Mon-Sat: 9:00 AM - 8:00 PM (Sunday Closed)',
      companyName: 'Omkar Enterprises',
      tagline: 'Domestic & International Courier Service',
      announcement: '',
      socialLinks: {}
    };

    if (snap.exists()) {
      const d = snap.data();
      businessSettingsCache = {
        ...DEFAULT_BIZ,
        ...d,
        phone: d.phone || DEFAULT_BIZ.phone,
        whatsapp: d.whatsapp || DEFAULT_BIZ.whatsapp,
        email: d.email || DEFAULT_BIZ.email,
        labelEmail: d.labelEmail || DEFAULT_BIZ.labelEmail,
        address: d.address || DEFAULT_BIZ.address,
      };
    } else {
      businessSettingsCache = DEFAULT_BIZ;
    }
    return businessSettingsCache;
  } catch (err) {
    console.error('Error fetching business settings:', err);
    return {
      phone: '+919619628045',
      whatsapp: '919619628045',
      email: 'vanitaharesh2005@gmail.com',
      labelEmail: 'vanitaharesh2005@gmail.com',
      address: 'Omkar Enterprises Hub, Nerul, Navi Mumbai, Maharashtra 400706',
      workingHours: 'Mon-Sat: 9:00 AM - 8:00 PM',
      companyName: 'Omkar Enterprises',
      tagline: 'Domestic & International Courier Service'
    };
  }
}

/**
 * Save business settings (admin only)
 */
export async function saveBusinessSettings(data) {
  await setDoc(doc(db, 'settings', 'business'), {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });
  businessSettingsCache = { ...businessSettingsCache, ...data };
}

// ==========================================
// ENQUIRIES
// ==========================================

/**
 * Submit a public enquiry with spam protection
 */
export async function submitEnquiry(data) {
  // Rate limit check (1 per 30 seconds from same browser)
  const lastSubmit = sessionStorage.getItem('oe-last-enquiry');
  if (lastSubmit && Date.now() - parseInt(lastSubmit) < 30000) {
    throw new Error('Please wait before submitting another enquiry.');
  }

  // Honeypot check (field should be empty)
  if (data._hp) {
    throw new Error('Spam detected.');
  }
  delete data._hp;

  // Validate required fields
  if (!data.name?.trim() || !data.message?.trim()) {
    throw new Error('Name and message are required.');
  }

  // Limit field sizes
  if (data.name.length > 100 || data.message.length > 2000 || (data.email && data.email.length > 200)) {
    throw new Error('Input too long.');
  }

  const enquiryData = {
    name: data.name.trim(),
    email: data.email?.trim() || '',
    phone: data.phone?.trim() || '',
    subject: data.subject?.trim() || 'General Enquiry',
    message: data.message.trim(),
    source: data.source || 'contact',
    status: 'new',
    userId: data.userId || null,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'enquiries'), enquiryData);
  sessionStorage.setItem('oe-last-enquiry', Date.now().toString());
  return docRef.id;
}

/**
 * Get user's enquiries
 */
export async function getUserEnquiries(userId) {
  const q = query(
    collection(db, 'enquiries'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ==========================================
// PICKUP REQUESTS
// ==========================================

export async function submitPickupRequest(data) {
  const pickupData = {
    userId: data.userId,
    name: data.name.trim(),
    phone: data.phone.trim(),
    pickupAddress: data.pickupAddress.trim(),
    pincode: data.pincode.trim(),
    parcelType: data.parcelType || 'document',
    parcelDescription: data.parcelDescription?.trim() || '',
    preferredDate: data.preferredDate || '',
    preferredTime: data.preferredTime || '',
    status: 'pending',
    notes: '',
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'pickupRequests'), pickupData);
  return docRef.id;
}

export async function getUserPickupRequests(userId) {
  const q = query(
    collection(db, 'pickupRequests'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ==========================================
// SAVED ADDRESSES (subcollection under users)
// ==========================================

export async function getSavedAddresses(userId) {
  const q = query(collection(db, 'users', userId, 'savedAddresses'), orderBy('name'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addSavedAddress(userId, data) {
  return addDoc(collection(db, 'users', userId, 'savedAddresses'), {
    name: data.name.trim(),
    phone: data.phone?.trim() || '',
    address: data.address.trim(),
    pincode: data.pincode?.trim() || '',
    city: data.city?.trim() || '',
    state: data.state?.trim() || '',
    isDefault: data.isDefault || false,
    createdAt: serverTimestamp()
  });
}

export async function updateSavedAddress(userId, addressId, data) {
  return updateDoc(doc(db, 'users', userId, 'savedAddresses', addressId), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteSavedAddress(userId, addressId) {
  return deleteDoc(doc(db, 'users', userId, 'savedAddresses', addressId));
}

// ==========================================
// SEARCH HISTORY (subcollection under users)
// ==========================================

export async function addSearchHistory(userId, pincode, result) {
  return addDoc(collection(db, 'users', userId, 'searchHistory'), {
    pincode,
    result: result ? {
      area: result.area || '',
      district: result.district || '',
      state: result.state || '',
      serviceable: result.serviceable || false
    } : null,
    searchedAt: serverTimestamp()
  });
}

export async function getSearchHistory(userId) {
  const q = query(
    collection(db, 'users', userId, 'searchHistory'),
    orderBy('searchedAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function toggleFavouritePincode(userId, pincode, isFav) {
  const favRef = doc(db, 'users', userId, 'favouritePincodes', pincode);
  if (isFav) {
    await setDoc(favRef, { pincode, addedAt: serverTimestamp() });
  } else {
    await deleteDoc(favRef);
  }
}

export async function getFavouritePincodes(userId) {
  const snap = await getDocs(collection(db, 'users', userId, 'favouritePincodes'));
  return snap.docs.map(d => d.id);
}

// ==========================================
// USER PROFILE
// ==========================================

export async function updateUserProfile(userId, data) {
  // Never allow role change from client
  const safeData = { ...data };
  delete safeData.role;
  delete safeData.createdAt;

  await updateDoc(doc(db, 'users', userId), {
    ...safeData,
    updatedAt: serverTimestamp()
  });
}

export async function getUserProfile(userId) {
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? snap.data() : null;
}

// ==========================================
// BATCH WRITER (for admin pincode upload)
// ==========================================

/**
 * Write documents in batches of 500
 * @param {string} collectionName 
 * @param {Array} items - [{id, ...data}]
 * @param {Function} onProgress - (completed, total)
 */
export async function batchWrite(collectionName, items, onProgress) {
  const BATCH_SIZE = 500;
  let completed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + BATCH_SIZE);

    chunk.forEach(item => {
      const docId = item.id || item.pincode || null;
      const data = { ...item };
      delete data.id;

      if (docId) {
        batch.set(doc(db, collectionName, String(docId)), data, { merge: true });
      } else {
        // Auto-generated ID
        const newRef = doc(collection(db, collectionName));
        batch.set(newRef, data);
      }
    });

    await batch.commit();
    completed += chunk.length;
    if (onProgress) onProgress(completed, items.length);
  }
}

/**
 * Delete all documents in a collection (for "replace all" mode)
 * Warning: This reads ALL docs first
 */
export async function deleteCollection(collectionName, batchSize = 500) {
  const collRef = collection(db, collectionName);
  const q = query(collRef, limit(batchSize));

  let deleted = 0;
  let snap = await getDocs(q);

  while (snap.size > 0) {
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;

    if (snap.size < batchSize) break;
    snap = await getDocs(q);
  }

  return deleted;
}

// ==========================================
// UTILITY EXPORTS
// ==========================================
export {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, getDocs,
  serverTimestamp, writeBatch, Timestamp, db
};
