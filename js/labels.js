/**
 * Printable Address Label Generator Module
 * Omkar Enterprises – Courier Consignment Label Standard
 * Featuring AI Address Photo Scanning (Tesseract.js OCR) & Multi-Format Printing
 */

import { db, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc, serverTimestamp } from './db.js';
import { getCurrentUser } from './auth.js';
import { showToast, escapeHtml } from './ui.js';

let tesseractLoadingPromise = null;

/**
 * Lazy-load Tesseract.js from CDN
 */
export async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (tesseractLoadingPromise) return tesseractLoadingPromise;

  tesseractLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => {
      tesseractLoadingPromise = null;
      reject(new Error('Failed to load OCR library. Please check your internet connection.'));
    };
    document.head.appendChild(script);
  });

  return tesseractLoadingPromise;
}

/**
 * Robust parser to extract Indian address details from raw OCR text
 */
export function parseAddressText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      toName: '',
      toAddress: '',
      toPincode: '',
      toPhone: '',
      missingFields: ['name', 'address', 'pincode', 'phone'],
      rawText: ''
    };
  }

  const rawClean = rawText.replace(/\r\n/g, '\n');
  const lines = rawClean
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let toName = '';
  let toPincode = '';
  let toPhone = '';
  const addressLines = [];

  // 1. Extract Pincode (6-digit Indian PIN)
  // Check for explicit "pin/pincode" tag first
  const pinKeywordMatch = rawClean.match(/(?:pin\s*(?:code)?|postal|pin)[\s.:\-]*([1-9][0-9]{5})\b/i);
  if (pinKeywordMatch) {
    toPincode = pinKeywordMatch[1];
  } else {
    // Look for spaced 3+3 (e.g., 400 001)
    const spacedMatch = rawClean.match(/\b([1-9][0-9]{2})[\s\-]+([0-9]{3})\b/);
    if (spacedMatch) {
      toPincode = spacedMatch[1] + spacedMatch[2];
    } else {
      // General 6-digit number starting 1-9
      const pinMatches = rawClean.match(/\b[1-9][0-9]{5}\b/g);
      if (pinMatches && pinMatches.length > 0) {
        // Prefer the last pincode found (usually at bottom of address)
        toPincode = pinMatches[pinMatches.length - 1];
      }
    }
  }

  // 2. Extract Phone Number
  // Look for "mob/mobile/ph/phone/contact" keyword first
  const phoneKeywordMatch = rawClean.match(/(?:mob(?:ile)?|phone|ph|tel|contact|call|cell)[\s.:\-]*((?:\+?91[\-\s]?)?[6-9]\d{9}|[6-9]\d{4}[\-\s]?\d{5})/i);
  if (phoneKeywordMatch) {
    toPhone = phoneKeywordMatch[1].replace(/[^0-9+]/g, '');
  } else {
    // 10 digits starting with 6,7,8,9 optionally preceded by +91, 91, or 0
    const phoneMatches = rawClean.match(/(?:(?:\+|0{0,2})91[\-\s]?)?([6-9]\d{9})\b/g);
    if (phoneMatches && phoneMatches.length > 0) {
      toPhone = phoneMatches[0].replace(/[^0-9+]/g, '');
    }
  }

  // Helper to test if a line contains only phone / pincode artifacts
  const isPurePhoneOrPin = (line) => {
    const digitsOnly = line.replace(/[^0-9]/g, '');
    if (toPhone && digitsOnly.includes(toPhone.replace(/[^0-9]/g, '')) && line.length < 30) return true;
    if (toPincode && line.includes(toPincode) && line.length < 18) return true;
    return false;
  };

  // 3. Extract Name & Address Lines
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (isPurePhoneOrPin(line)) {
      continue;
    }

    // Check for explicit "To:" or "Name:" prefix
    const namePrefixMatch = line.match(/^(?:to\s*[:\-]?|consignee\s*[:\-]?|recipient\s*[:\-]?|name\s*[:\-]?|deliver\s+to\s*[:\-]?)\s*(.*)/i);
    if (namePrefixMatch && !toName) {
      const candidate = namePrefixMatch[1].trim();
      if (candidate.length > 1) {
        toName = candidate;
        continue;
      }
      // "To:" on its own line: next line is likely the name
      if (candidate.length === 0 && i + 1 < lines.length) {
        toName = lines[i + 1].trim();
        i++;
        continue;
      }
    }

    // Check for honorifics (Mr., Mrs., Ms., Dr., Shri, Smt.)
    if (!toName && /^(?:mr\.|mrs\.|ms\.|dr\.|shri|smt\.)\s+[a-z\s]+$/i.test(line)) {
      toName = line;
      continue;
    }

    // If still no name, check if line 0 looks like a person's name
    if (!toName && i === 0) {
      const isAddressKeyword = /\b(?:flat|room|shop|plot|gala|bldg|building|floor|house|road|rd|street|st|lane|nagar|colony|sector|opp|near|behind|beside)\b/i.test(line);
      if (!isAddressKeyword && line.length <= 40 && !/\d{3,}/.test(line)) {
        toName = line;
        continue;
      }
    }

    // Clean address line of trailing phone / pincode noise
    let cleaned = line;
    if (toPhone) {
      cleaned = cleaned.replace(new RegExp('(?:mob(?:ile)?|phone|ph|contact)?\\s*[:\\-]?\\s*' + toPhone.replace('+', '\\+'), 'ig'), '').trim();
    }
    if (toPincode) {
      cleaned = cleaned.replace(new RegExp('(?:pin(?:code)?)?\\s*[:\\-]?\\s*' + toPincode, 'ig'), '').trim();
    }
    cleaned = cleaned.replace(/^[,.\-\s]+|[,.\-\s]+$/g, '');

    if (cleaned.length > 0) {
      addressLines.push(cleaned);
    }
  }

  // Format clean address text
  const toAddress = addressLines.join(',\n');

  // Determine missing fields
  const missingFields = [];
  if (!toName.trim()) missingFields.push('name');
  if (!toAddress.trim()) missingFields.push('address');
  if (!toPincode.trim()) missingFields.push('pincode');
  if (!toPhone.trim()) missingFields.push('phone');

  return {
    toName: toName.trim(),
    toAddress: toAddress.trim(),
    toPincode: toPincode.trim(),
    toPhone: toPhone.trim(),
    missingFields,
    rawText
  };
}

/**
 * Process an image file or blob through Tesseract OCR with progress updates
 */
export async function scanAddressFromPhoto(imageSource, onProgress = () => {}) {
  const Tesseract = await loadTesseract();

  onProgress({ status: 'init', progress: 0.1, message: 'Initializing OCR Engine...' });

  const worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        const pct = Math.round((m.progress || 0) * 100);
        onProgress({ status: 'recognizing', progress: m.progress, message: `Recognizing text (${pct}%)...` });
      } else if (m.status === 'loading tesseract core') {
        onProgress({ status: 'loading', progress: 0.25, message: 'Loading neural OCR models...' });
      } else if (m.status === 'initializing api') {
        onProgress({ status: 'api', progress: 0.4, message: 'Preparing image parser...' });
      }
    }
  });

  try {
    const res = await worker.recognize(imageSource);
    const rawText = res.data.text || '';
    await worker.terminate();

    onProgress({ status: 'parsing', progress: 0.95, message: 'Extracting address fields...' });
    const parsed = parseAddressText(rawText);
    onProgress({ status: 'done', progress: 1.0, message: 'Address parsed successfully!' });

    return parsed;
  } catch (err) {
    try { await worker.terminate(); } catch (_) {}
    throw err;
  }
}

/**
 * Generate formatted single label HTML snippet with compact logo
 */
function renderSingleLabelHtml(data) {
  const {
    toName = '',
    toAddress = '',
    toPhone = '',
    toPincode = '',
    fromName = 'Omkar Enterprises',
    fromArea = 'Shop No. 4, Courier Hub, Andheri East, Mumbai',
    showBorder = true,
    showLogo = true
  } = data;

  const borderClass = showBorder ? 'label-bordered' : '';

  return `
    <div class="address-label-sheet-item ${borderClass}">
      ${showLogo ? `
        <div class="label-header">
          <img src="../assets/logo.png" alt="Omkar Enterprises" class="label-logo" onerror="this.src='assets/logo.png'">
          <div class="label-badge">EXPRESS LOGISTICS</div>
        </div>
      ` : ''}

      <div class="label-section label-to-section">
        <div class="label-tag">DELIVER TO (CONSIGNEE)</div>
        <div class="label-consignee-name">${escapeHtml(toName || 'Consignee Name')}</div>
        <div class="label-address-body">${escapeHtml(toAddress || 'Destination Address').replace(/\n/g, '<br>')}</div>
        <div class="label-contact-line">
          <strong>Contact:</strong> ${escapeHtml(toPhone || 'N/A')}
        </div>
        ${toPincode ? `
          <div class="label-pincode-highlight">
            PINCODE: <span>${escapeHtml(toPincode)}</span>
          </div>
        ` : ''}
      </div>

      <div class="label-barcode-strip">
        <div class="barcode-lines"></div>
        <div class="barcode-subtext">OMKAR EXPRESS • PIN: ${escapeHtml(toPincode || '400001')}</div>
      </div>

      <div class="label-divider"></div>

      <div class="label-section label-from-section">
        <div class="label-tag">FROM (CONSIGNER)</div>
        <div class="label-consigner-name">${escapeHtml(fromName)}</div>
        <div class="label-consigner-address">${escapeHtml(fromArea).replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  `;
}

/**
 * Generate formatted HTML for print preview & output across multiple print sizes
 */
export function formatAddressLabel(data, options = {}) {
  const paperSize = data.paperSize || '4x6';
  const sizeClass = `label-size-${paperSize}`;

  // 2 Labels per Page (A4 Half Split)
  if (paperSize === 'a4-2') {
    const single = renderSingleLabelHtml(data);
    return `
      <div class="address-label-sheet ${sizeClass}" id="printable-label">
        <div class="label-grid-2up">
          ${single}
          <div class="cut-guide-line">✂ Cut Here Along Dotted Line</div>
          ${single}
        </div>
      </div>
    `;
  }

  // 4 Labels per Page (A4 2x2 Grid)
  if (paperSize === 'a4-4') {
    const single = renderSingleLabelHtml(data);
    return `
      <div class="address-label-sheet ${sizeClass}" id="printable-label">
        <div class="label-grid-4up">
          ${single}
          ${single}
          ${single}
          ${single}
        </div>
      </div>
    `;
  }

  // Single label formats (4x6, a4-single, a5, 3x2)
  return `
    <div class="address-label-sheet ${sizeClass}" id="printable-label">
      ${renderSingleLabelHtml(data)}
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
