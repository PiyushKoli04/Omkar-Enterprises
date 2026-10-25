/**
 * Printable Address Label Generator Module
 * Omkar Enterprises – Courier Consignment Label Standard
 */

import { db, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc, serverTimestamp } from './db.js';
import { getCurrentUser } from './auth.js';
import { showToast, escapeHtml } from './ui.js';

/**
 * Generate formatted HTML for print preview & output
 */
export function formatAddressLabel(data, options = {}) {
  const {
    toName = '',
    toAddress = '',
    toPhone = '',
    toPincode = '',
    fromName = 'Omkar Enterprises',
    fromArea = 'Courier Hub, Andheri East, Mumbai',
    paperSize = '4x6', // '4x6', 'a4', 'a5'
    showBorder = true,
    showLogo = true
  } = data;

  const borderClass = showBorder ? 'label-bordered' : '';
  const sizeClass = `label-size-${paperSize}`;

  return `
    <div class="address-label-sheet ${sizeClass} ${borderClass}" id="printable-label">
      ${showLogo ? `
        <div class="label-header">
          <img src="../assets/logo.png" alt="Omkar Enterprises" class="label-logo" onerror="this.src='assets/logo.png'">
          <div class="label-badge">EXPRESS LOGISTICS</div>
        </div>
      ` : ''}

      <div class="label-section label-to-section">
        <div class="label-tag">To,</div>
        <div class="label-consignee-name">${escapeHtml(toName)}</div>
        <div class="label-address-body">${escapeHtml(toAddress).replace(/\n/g, '<br>')}</div>
        <div class="label-contact-line">
          <strong>Contact:</strong> ${escapeHtml(toPhone)}
        </div>
        ${toPincode ? `
          <div class="label-pincode-highlight">
            PINCODE: <span>${escapeHtml(toPincode)}</span>
          </div>
        ` : ''}
      </div>

      <div class="label-divider"></div>

      <div class="label-section label-from-section">
        <div class="label-tag">From,</div>
        <div class="label-consigner-name">${escapeHtml(fromName)}</div>
        <div class="label-consigner-address">${escapeHtml(fromArea).replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  `;
}

/**
 * Trigger browser print
 */
export function printLabel() {
  window.print();
}

/**
 * Save label into Firestore "labels" collection for auditing and reprinting
 */
export async function saveLabelToFirestore(data) {
  const user = getCurrentUser();
  const labelRecord = {
    toName: data.toName.trim(),
    toAddress: data.toAddress.trim(),
    toPhone: data.toPhone.trim(),
    toPincode: data.toPincode?.trim() || '',
    fromName: data.fromName.trim(),
    fromArea: data.fromArea.trim(),
    paperSize: data.paperSize || '4x6',
    createdBy: user ? user.uid : 'admin',
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'labels'), labelRecord);
  return docRef.id;
}

/**
 * Get recent labels from Firestore
 */
export async function getRecentLabels(max = 25) {
  try {
    const q = query(collection(db, 'labels'), orderBy('createdAt', 'desc'), limit(max));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Error fetching label history:', err);
    return [];
  }
}

/**
 * Delete a saved label
 */
export async function deleteSavedLabel(labelId) {
  await deleteDoc(doc(db, 'labels', labelId));
}
