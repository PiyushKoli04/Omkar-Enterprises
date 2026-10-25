/**
 * Printable Address Label Generator Module
 * Omkar Enterprises – Courier Consignment Label Standard
 * Featuring AI Photo Scanning (OCR), Direct Text Parsing, City/State Highlights & Multi-Format Printing
 */

import { db, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc, serverTimestamp } from './db.js';
import { getCurrentUser } from './auth.js';
import { showToast, escapeHtml } from './ui.js';
import { PINCODE_DATABASE } from './pincode-db.js';

let tesseractLoadingPromise = null;

// Official Indian States & UTs
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'New Delhi', 'Chandigarh', 'Jammu and Kashmir', 'Jammu & Kashmir',
  'Ladakh', 'Puducherry', 'Andaman and Nicobar Islands',
  'Dadra and Nagar Haveli and Daman and Diu', 'Lakshadweep'
];

export const STATE_ALIASES = {
  'MH': 'Maharashtra',
  'MAHARASHTRA': 'Maharashtra',
  'DL': 'Delhi',
  'DELHI': 'Delhi',
  'NEW DELHI': 'Delhi',
  'KA': 'Karnataka',
  'KARNATAKA': 'Karnataka',
  'TN': 'Tamil Nadu',
  'TAMIL NADU': 'Tamil Nadu',
  'TAMILNADU': 'Tamil Nadu',
  'GJ': 'Gujarat',
  'GUJARAT': 'Gujarat',
  'UP': 'Uttar Pradesh',
  'UTTAR PRADESH': 'Uttar Pradesh',
  'RJ': 'Rajasthan',
  'RAJASTHAN': 'Rajasthan',
  'WB': 'West Bengal',
  'WEST BENGAL': 'West Bengal',
  'BENGAL': 'West Bengal',
  'MP': 'Madhya Pradesh',
  'MADHYA PRADESH': 'Madhya Pradesh',
  'KL': 'Kerala',
  'KERALA': 'Kerala',
  'TS': 'Telangana',
  'TELANGANA': 'Telangana',
  'AP': 'Andhra Pradesh',
  'ANDHRA PRADESH': 'Andhra Pradesh',
  'PB': 'Punjab',
  'PUNJAB': 'Punjab',
  'HR': 'Haryana',
  'HARYANA': 'Haryana',
  'BR': 'Bihar',
  'BIHAR': 'Bihar',
  'ODISHA': 'Odisha',
  'ORISSA': 'Odisha',
  'JH': 'Jharkhand',
  'JHARKHAND': 'Jharkhand',
  'CHHATTISGARH': 'Chhattisgarh',
  'CG': 'Chhattisgarh',
  'UK': 'Uttarakhand',
  'UTTARAKHAND': 'Uttarakhand',
  'HP': 'Himachal Pradesh',
  'HIMACHAL': 'Himachal Pradesh',
  'GOA': 'Goa',
  'GA': 'Goa',
  'ASSAM': 'Assam',
  'AS': 'Assam'
};

export const COMMON_CITIES = [
  'Mumbai', 'Navi Mumbai', 'Thane', 'Kalyan', 'Dombivli', 'Mira Bhayandar', 'Vasai', 'Virar', 'Ulhasnagar', 'Bhiwandi',
  'Pune', 'Pimpri Chinchwad', 'Nagpur', 'Nashik', 'Aurangabad', 'Solapur', 'Kolhapur', 'Amravati', 'Nanded', 'Jalgaon',
  'Delhi', 'New Delhi', 'Noida', 'Greater Noida', 'Gurgaon', 'Gurugram', 'Faridabad', 'Ghaziabad',
  'Bengaluru', 'Bangalore', 'Mysore', 'Mangalore', 'Hubli', 'Dharwad', 'Belgaum',
  'Hyderabad', 'Secunderabad', 'Warangal', 'Nizamabad',
  'Chennai', 'Madurai', 'Coimbatore', 'Salem', 'Tiruchirappalli', 'Trichy', 'Tirunelveli',
  'Kolkata', 'Howrah', 'Siliguri', 'Durgapur', 'Asansol',
  'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar',
  'Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Alwar',
  'Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Prayagraj', 'Allahabad', 'Meerut', 'Bareilly', 'Aligarh', 'Moradabad',
  'Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain', 'Sagar',
  'Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Purnia',
  'Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro',
  'Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri',
  'Raipur', 'Bhilai', 'Bilaspur',
  'Chandigarh', 'Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala',
  'Dehradun', 'Haridwar', 'Roorkee', 'Rishikesh', 'Haldwani',
  'Kochi', 'Cochin', 'Thiruvananthapuram', 'Trivandrum', 'Kozhikode', 'Calicut', 'Kollam', 'Thrissur',
  'Panaji', 'Margao', 'Vasco', 'Mapusa',
  'Guwahati', 'Dispur', 'Silchar', 'Dibrugarh'
];

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
 * Robust parser to intelligently separate Name, Address, City, State, Pincode & Phone
 * Works on both raw pasted customer text (WhatsApp/SMS) and OCR output!
 */
export function parseAddressText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      toName: '',
      toAddress: '',
      toCity: '',
      toState: '',
      toPincode: '',
      toPhone: '',
      missingFields: ['name', 'address', 'city', 'state', 'pincode', 'phone'],
      rawText: ''
    };
  }

  const rawClean = rawText.replace(/\r\n/g, '\n').trim();
  const rawLines = rawClean
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let toName = '';
  let toPincode = '';
  let toPhone = '';
  let toState = '';
  let toCity = '';
  const addressLines = [];

  // 1. Extract 6-digit Indian Pincode
  const pinKeywordMatch = rawClean.match(/(?:pin\s*(?:code)?|postal|pin)[\s.:\-]*([1-9][0-9]{5})\b/i);
  if (pinKeywordMatch) {
    toPincode = pinKeywordMatch[1];
  } else {
    const spacedMatch = rawClean.match(/\b([1-9][0-9]{2})[\s\-]+([0-9]{3})\b/);
    if (spacedMatch) {
      toPincode = spacedMatch[1] + spacedMatch[2];
    } else {
      const pinMatches = rawClean.match(/\b[1-9][0-9]{5}\b/g);
      if (pinMatches && pinMatches.length > 0) {
        toPincode = pinMatches[pinMatches.length - 1];
      }
    }
  }

  // 2. Extract Phone Number
  const phoneKeywordMatch = rawClean.match(/(?:mob(?:ile)?|phone|ph|tel|contact|call|cell|wa|whatsapp)[\s.:\-]*((?:\+?91[\-\s]?)?[6-9]\d{9}|[6-9]\d{4}[\-\s]?\d{5})/i);
  if (phoneKeywordMatch) {
    toPhone = phoneKeywordMatch[1].replace(/[^0-9+]/g, '');
  } else {
    const phoneMatches = rawClean.match(/(?:(?:\+|0{0,2})91[\-\s]?)?([6-9]\d{9})\b/g);
    if (phoneMatches && phoneMatches.length > 0) {
      toPhone = phoneMatches[0].replace(/[^0-9+]/g, '');
    }
  }

  // 3. Extract Indian State from text
  for (const [alias, canonicalState] of Object.entries(STATE_ALIASES)) {
    const stateRegex = new RegExp(`\\b${alias.replace('&', '[&\\s]')}\\b`, 'i');
    if (stateRegex.test(rawClean)) {
      toState = canonicalState;
      break;
    }
  }

  // 4. Extract Indian City from text
  for (const city of COMMON_CITIES) {
    const cityRegex = new RegExp(`\\b${city}\\b`, 'i');
    if (cityRegex.test(rawClean)) {
      toCity = city;
      break;
    }
  }

  // 5. Lookup fallback City & State from local Pincode Database
  if (toPincode && (!toCity || !toState) && PINCODE_DATABASE && PINCODE_DATABASE[toPincode]) {
    const dbEntry = PINCODE_DATABASE[toPincode];
    // dbEntry: [serviceable, area, branch, state, fastTrack]
    if (!toState && dbEntry[3]) {
      toState = dbEntry[3].trim();
    }
    if (!toCity) {
      // Clean branch name e.g. "ANDHERI WEST-R.O" -> "Andheri" or use area
      const branchName = dbEntry[2] || dbEntry[1] || '';
      const cleanBranch = branchName.replace(/-R\.O|-H\.O|HUB|S\.O|\(HUB\)/gi, '').trim();
      toCity = cleanBranch.split(/\s+/)[0] || cleanBranch;
    }
  }

  // Helper: check if a line is exclusively phone or pincode or state
  const isExcludedLine = (line) => {
    const digitsOnly = line.replace(/[^0-9]/g, '');
    if (toPhone && digitsOnly.includes(toPhone.replace(/[^0-9]/g, '')) && line.length < 30) return true;
    if (toPincode && line.includes(toPincode) && line.length < 18) return true;
    if (toState && line.toLowerCase() === toState.toLowerCase()) return true;
    return false;
  };

  // 6. Extract Consignee Name & Street Address Lines
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];

    if (isExcludedLine(line)) {
      continue;
    }

    // Check for explicit "To:" or "Name:" prefix
    const namePrefixMatch = line.match(/^(?:to\s*[:\-]?|consignee\s*[:\-]?|recipient\s*[:\-]?|name\s*[:\-]?|deliver\s+to\s*[:\-]?|attn\s*[:\-]?)\s*(.*)/i);
    if (namePrefixMatch && !toName) {
      const candidate = namePrefixMatch[1].trim();
      if (candidate.length > 1) {
        toName = candidate;
        continue;
      }
      if (candidate.length === 0 && i + 1 < rawLines.length) {
        toName = rawLines[i + 1].trim();
        i++;
        continue;
      }
    }

    // Check for personal titles
    if (!toName && /^(?:mr\.|mrs\.|ms\.|dr\.|shri|smt\.)\s+[a-z\s]+$/i.test(line)) {
      toName = line;
      continue;
    }

    // First line name heuristic
    if (!toName && i === 0) {
      const isAddressKeyword = /\b(?:flat|room|shop|plot|gala|bldg|building|floor|house|road|rd|street|st|lane|nagar|colony|sector|opp|near|behind|beside)\b/i.test(line);
      if (!isAddressKeyword && line.length <= 40 && !/\d{3,}/.test(line)) {
        toName = line;
        continue;
      }
    }

    // Clean address line of embedded phone/pincode
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

  const toAddress = addressLines.join(',\n');

  // Check missing required fields
  const missingFields = [];
  if (!toName.trim()) missingFields.push('name');
  if (!toAddress.trim()) missingFields.push('address');
  if (!toCity.trim()) missingFields.push('city');
  if (!toState.trim()) missingFields.push('state');
  if (!toPincode.trim()) missingFields.push('pincode');
  if (!toPhone.trim()) missingFields.push('phone');

  return {
    toName: toName.trim(),
    toAddress: toAddress.trim(),
    toCity: toCity.trim(),
    toState: toState.trim(),
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

    onProgress({ status: 'parsing', progress: 0.95, message: 'Extracting and separating fields...' });
    const parsed = parseAddressText(rawText);
    onProgress({ status: 'done', progress: 1.0, message: 'Address separated successfully!' });

    return parsed;
  } catch (err) {
    try { await worker.terminate(); } catch (_) {}
    throw err;
  }
}

/**
 * Generate formatted single label HTML snippet with prominent City/State highlight
 */
function renderSingleLabelHtml(data) {
  const {
    toName = '',
    toAddress = '',
    toCity = '',
    toState = '',
    toPhone = '',
    toPincode = '',
    fromName = 'Omkar Enterprises',
    fromArea = 'Shop No. 4, Courier Hub, Andheri East, Mumbai',
    showBorder = true,
    showLogo = true
  } = data;

  const borderClass = showBorder ? 'label-bordered' : '';
  const displayCity = (toCity || 'DESTINATION').toUpperCase();
  const displayState = (toState || 'DOMESTIC').toUpperCase();

  return `
    <div class="address-label-sheet-item ${borderClass}">
      ${showLogo ? `
        <div class="label-header">
          <img src="../assets/logo.png" alt="Omkar Enterprises" class="label-logo" onerror="this.src='assets/logo.png'">
          <div class="label-badge">EXPRESS LOGISTICS</div>
        </div>
      ` : ''}

      <!-- PROMINENT DESTINATION CITY & STATE HIGHLIGHT BANNER -->
      <div class="label-dest-highlight">
        <span class="dest-tag">DESTINATION</span>
        <span class="dest-val">${escapeHtml(displayCity)}, ${escapeHtml(displayState)}</span>
      </div>

      <div class="label-section label-to-section">
        <div class="label-tag">DELIVER TO (CONSIGNEE)</div>
        <div class="label-consignee-name">${escapeHtml(toName || 'Consignee Name')}</div>
        <div class="label-address-body">${escapeHtml(toAddress || 'Destination Address').replace(/\n/g, '<br>')}</div>
        
        <!-- City & State Detail Row -->
        <div class="label-city-state-box">
          <div class="city-pill">
            <span class="pill-lbl">CITY:</span>
            <strong class="pill-txt">${escapeHtml(displayCity)}</strong>
          </div>
          <div class="state-pill">
            <span class="pill-lbl">STATE:</span>
            <strong class="pill-txt">${escapeHtml(displayState)}</strong>
          </div>
        </div>

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
        <div class="barcode-subtext">OMKAR EXPRESS • ${escapeHtml(displayCity)} • PIN: ${escapeHtml(toPincode || '400001')}</div>
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
    toCity: data.toCity ? data.toCity.trim() : '',
    toState: data.toState ? data.toState.trim() : '',
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

/**
 * Download label rendered as high-resolution PDF using html2pdf.js
 */
export async function downloadLabelAsPdf(data, customFilename = '') {
  if (typeof window.html2pdf === 'undefined') {
    throw new Error('PDF library is loading. Please try again in a moment.');
  }

  // Check if live preview element is already present in DOM
  const existingEl = document.getElementById('printable-label');
  let targetEl;
  let tempContainer = null;

  if (existingEl && existingEl.offsetHeight > 0) {
    targetEl = existingEl;
  } else {
    // Create temporary off-screen render mount at coordinate (0,0) behind the page
    tempContainer = document.createElement('div');
    tempContainer.id = 'pdf-render-temp-mount';
    tempContainer.style.position = 'fixed';
    tempContainer.style.top = '0px';
    tempContainer.style.left = '0px';
    tempContainer.style.zIndex = '-99999';
    tempContainer.style.opacity = '1';
    tempContainer.style.pointerEvents = 'none';
    tempContainer.style.background = '#ffffff';
    
    const widthPx = data.paperSize === '3x2' ? '320px' : (data.paperSize === 'a5' ? '540px' : (data.paperSize?.startsWith('a4') ? '794px' : '400px'));
    tempContainer.style.width = widthPx;
    tempContainer.innerHTML = formatAddressLabel(data);
    document.body.appendChild(tempContainer);

    // Wait for logo/barcode images to fully load
    const imgs = Array.from(tempContainer.querySelectorAll('img'));
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => { img.onload = res; img.onerror = res; });
    }));

    targetEl = tempContainer.querySelector('.address-label-sheet') || tempContainer.firstElementChild || tempContainer;
  }

  const cleanName = (data.toName || 'Consignee').replace(/[^a-zA-Z0-9_-]/g, '_');
  const city = (data.toCity || 'Dest').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = customFilename || `Shipping_Label_${cleanName}_${city}.pdf`;

  let jsPdfFormat = 'a4';
  if (data.paperSize === '4x6') jsPdfFormat = [102, 152];
  else if (data.paperSize === '3x2') jsPdfFormat = [76, 51];
  else if (data.paperSize === 'a5') jsPdfFormat = 'a5';

  const opt = {
    margin: [2, 2, 2, 2],
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0,
      backgroundColor: '#ffffff',
      logging: false
    },
    jsPDF: { unit: 'mm', format: jsPdfFormat, orientation: 'portrait' }
  };

  try {
    await window.html2pdf().set(opt).from(targetEl).save();
    return filename;
  } finally {
    if (tempContainer && tempContainer.parentNode) {
      document.body.removeChild(tempContainer);
    }
  }
}

/**
 * Generate PDF Blob from label for file sharing / email attachments
 */
export async function generateLabelPdfBlob(data) {
  if (typeof window.html2pdf === 'undefined') {
    throw new Error('PDF library is loading. Please try again.');
  }

  const existingEl = document.getElementById('printable-label');
  let targetEl;
  let tempContainer = null;

  if (existingEl && existingEl.offsetHeight > 0) {
    targetEl = existingEl;
  } else {
    tempContainer = document.createElement('div');
    tempContainer.id = 'pdf-blob-temp-mount';
    tempContainer.style.position = 'fixed';
    tempContainer.style.top = '0px';
    tempContainer.style.left = '0px';
    tempContainer.style.zIndex = '-99999';
    tempContainer.style.opacity = '1';
    tempContainer.style.pointerEvents = 'none';
    tempContainer.style.background = '#ffffff';

    const widthPx = data.paperSize === '3x2' ? '320px' : (data.paperSize === 'a5' ? '540px' : (data.paperSize?.startsWith('a4') ? '794px' : '400px'));
    tempContainer.style.width = widthPx;
    tempContainer.innerHTML = formatAddressLabel(data);
    document.body.appendChild(tempContainer);

    const imgs = Array.from(tempContainer.querySelectorAll('img'));
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => { img.onload = res; img.onerror = res; });
    }));

    targetEl = tempContainer.querySelector('.address-label-sheet') || tempContainer.firstElementChild || tempContainer;
  }

  let jsPdfFormat = 'a4';
  if (data.paperSize === '4x6') jsPdfFormat = [102, 152];
  else if (data.paperSize === '3x2') jsPdfFormat = [76, 51];
  else if (data.paperSize === 'a5') jsPdfFormat = 'a5';

  const opt = {
    margin: [2, 2, 2, 2],
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0,
      backgroundColor: '#ffffff',
      logging: false
    },
    jsPDF: { unit: 'mm', format: jsPdfFormat, orientation: 'portrait' }
  };

  try {
    const worker = window.html2pdf().set(opt).from(targetEl);
    const pdfBlob = await worker.outputPdf('blob');
    return pdfBlob;
  } finally {
    if (tempContainer && tempContainer.parentNode) {
      document.body.removeChild(tempContainer);
    }
  }
}

