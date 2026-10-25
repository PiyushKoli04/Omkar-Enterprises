/**
 * Admin Panel Logic Module
 * Omkar Enterprises – Secure Administration & Batch Ingestion
 */

import { 
  db, collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, 
  query, orderBy, limit, where, batchWrite, deleteCollection,
  getBusinessSettings, saveBusinessSettings 
} from './db.js';
import { getCurrentUser, getUserRole } from './auth.js';
import { showToast, escapeHtml } from './ui.js';
import { formatAddressLabel, printLabel, saveLabelToFirestore, getRecentLabels, deleteSavedLabel } from './labels.js';

/**
 * Enforce Admin Authorization
 */
export async function requireAdminGuard(redirectPath = '../login.html') {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = redirectPath;
    return false;
  }

  const role = await getUserRole(user.uid);
  if (role !== 'admin') {
    showToast('Unauthorized access. Admin privileges required.', 'error');
    window.location.href = '../index.html';
    return false;
  }

  return true;
}

/**
 * Fetch counts for the Dashboard Overview
 */
export async function getDashboardStats() {
  try {
    const enqSnap = await getDocs(query(collection(db, 'enquiries'), limit(100)));
    const pickSnap = await getDocs(query(collection(db, 'pickupRequests'), limit(100)));
    const labelSnap = await getDocs(query(collection(db, 'labels'), limit(100)));

    return {
      enquiriesCount: enqSnap.size,
      pickupCount: pickSnap.size,
      labelsCount: labelSnap.size
    };
  } catch (err) {
    console.error('Error getting dashboard stats:', err);
    return { enquiriesCount: 0, pickupCount: 0, labelsCount: 0 };
  }
}

/**
 * Parse uploaded Excel or CSV file in the browser using SheetJS
 * @param {File} file 
 * @returns {Promise<{valid: Array, errors: Array}>}
 */
export async function parsePincodeFile(file) {
  const fileName = (file.name || '').toLowerCase();
  const validRows = [];
  const errorRows = [];
  const seenPincodes = new Set();

  // Mode 1: Fast direct text parse if CSV
  if (fileName.endsWith('.csv')) {
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    let currentState = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim() === '') continue;

      if (line.includes('STATE NAME')) {
        const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
        const statePart = parts.find(p => p !== 'STATE NAME');
        if (statePart) currentState = statePart;
        continue;
      }

      if (line.startsWith(',,,,,,') || line.includes('PinCode,Area.Name')) continue;

      const cols = line.split(',');
      if (cols.length < 5) continue;

      let foundPin = '';
      let colIdx = -1;

      for (let c = 0; c < cols.length; c++) {
        const cleaned = cols[c].trim().replace(/^"|"$/g, '');
        if (/^[1-9][0-9]{5}$/.test(cleaned)) {
          foundPin = cleaned;
          colIdx = c;
          break;
        }
      }

      if (!foundPin) continue;

      const branch = (cols[1] || '').trim().replace(/^"|"$/g, '');
      const areaName = (cols[colIdx + 1] || '').trim().replace(/^"|"$/g, '');
      const delRaw = (cols[colIdx + 2] || '').trim().toUpperCase().replace(/^"|"$/g, '');
      const ftRaw = (cols[colIdx + 3] || '').trim().toUpperCase().replace(/^"|"$/g, '');

      const isServiceable = delRaw === 'YES' || delRaw === 'Y' || delRaw === 'TRUE' || delRaw === '1';
      const isFastTrack = ftRaw === 'YES' || ftRaw === 'Y' || ftRaw === 'TRUE' || ftRaw === '1';

      if (!seenPincodes.has(foundPin) || isServiceable) {
        seenPincodes.add(foundPin);
        validRows.push({
          pincode: foundPin,
          area: areaName || branch || 'Local Area',
          branch: branch,
          state: currentState || 'India',
          district: branch || currentState || '',
          delivery: isServiceable,
          serviceable: isServiceable,
          fastTrack: isFastTrack,
          remarks: isServiceable ? 'Standard door delivery available' : 'Special booking required'
        });
      }
    }

    if (validRows.length > 0) {
      return { valid: validRows, errors: errorRows };
    }
  }

  // Mode 2: SheetJS for Excel (.xlsx, .xls) and fallback
  if (!window.XLSX) {
    throw new Error('SheetJS library is loading. Please try again in a few moments.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Read as 2D array of cells for maximum flexibility
  const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  let currentState = '';

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rowStr = row.join(' ');
    if (rowStr.includes('STATE NAME')) {
      const parts = row.map(s => String(s).trim()).filter(Boolean);
      const statePart = parts.find(p => p !== 'STATE NAME');
      if (statePart) currentState = statePart;
      continue;
    }

    let foundPin = '';
    let pinCol = -1;

    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c]).trim().replace(/^"|"$/g, '');
      if (/^[1-9][0-9]{5}$/.test(cellVal)) {
        foundPin = cellVal;
        pinCol = c;
        break;
      }
    }

    if (!foundPin) continue;

    const branch = String(row[1] || '').trim();
    const areaName = String(row[pinCol + 1] || '').trim();
    const delRaw = String(row[pinCol + 2] || '').trim().toUpperCase();
    const ftRaw = String(row[pinCol + 3] || '').trim().toUpperCase();

    const isServiceable = delRaw === 'YES' || delRaw === 'Y' || delRaw === 'TRUE' || delRaw === '1';
    const isFastTrack = ftRaw === 'YES' || ftRaw === 'Y' || ftRaw === 'TRUE' || ftRaw === '1';

    if (!seenPincodes.has(foundPin) || isServiceable) {
      seenPincodes.add(foundPin);
      validRows.push({
        pincode: foundPin,
        area: areaName || branch || 'Local Area',
        branch: branch,
        state: currentState || 'India',
        district: branch || currentState || '',
        delivery: isServiceable,
        serviceable: isServiceable,
        fastTrack: isFastTrack,
        remarks: isServiceable ? 'Standard door delivery available' : 'Special booking required'
      });
    }
  }

  return { valid: validRows, errors: errorRows };
}

/**
 * Execute Batch Upload to Firestore
 */
export async function executePincodeUpload(validRows, mode = 'merge', onProgress) {
  if (mode === 'replace') {
    if (onProgress) onProgress(0, validRows.length, 'Clearing existing database...');
    await deleteCollection('pincodes', 500);
  }

  if (onProgress) onProgress(0, validRows.length, 'Writing batched documents...');
  
  await batchWrite('pincodes', validRows, (done, total) => {
    if (onProgress) onProgress(done, total, `Uploaded ${done} of ${total} pincodes...`);
  });
}
