/**
 * Pincode Serviceability Engine
 * Omkar Enterprises – Domestic Courier Services
 */

import { db, doc, getDoc, addDoc, collection, serverTimestamp } from './db.js';
import { getCurrentUser } from './auth.js';
import { addSearchHistory, toggleFavouritePincode, getFavouritePincodes } from './db.js';
import { isValidPincode, formatPhone, getWhatsAppUrl } from './utils.js';
import { showToast, ICONS, escapeHtml } from './ui.js';
import { getBusinessSettings } from './db.js';

// In-memory cache for fast lookups (saves Firestore reads)
const pincodeCache = new Map();

// Initialize cache from sessionStorage if available
try {
  const stored = sessionStorage.getItem('oe_pincode_cache');
  if (stored) {
    const parsed = JSON.parse(stored);
    Object.entries(parsed).forEach(([k, v]) => pincodeCache.set(k, v));
  }
} catch (e) {
  console.warn('SessionStorage cache unavailable');
}

function persistCache() {
  try {
    const obj = Object.fromEntries(pincodeCache.entries());
    sessionStorage.setItem('oe_pincode_cache', JSON.stringify(obj));
  } catch (e) {}
}

/**
 * Check serviceability for a 6-digit Indian Pincode
 * @param {string} pincode 
 * @returns {Promise<Object>} Result object
 */
export async function checkPincodeServiceability(pincode) {
  const pin = String(pincode).trim();

  if (!isValidPincode(pin)) {
    throw new Error('Please enter a valid 6-digit Indian pincode (cannot start with 0).');
  }

  // 1. Check in-memory / session cache
  if (pincodeCache.has(pin)) {
    const cached = pincodeCache.get(pin);
    recordUserHistory(pin, cached);
    return cached;
  }

  // 2. Fetch single document from Firestore (O(1) read)
  try {
    const docRef = doc(db, 'pincodes', pin);
    const snap = await getDoc(docRef);

    let result = null;

    if (snap.exists()) {
      const data = snap.data();
      result = {
        pincode: pin,
        found: true,
        serviceable: data.delivery === true || data.serviceable === true,
        area: data.area || data.areaName || data['Area.Name'] || '',
        branch: data.branch || '',
        district: data.district || '',
        state: data.state || data['STATE NAME'] || '',
        fastTrack: data.fastTrack === true || data['Fast.Trk'] === true,
        cod: data.cod !== false,
        prepaid: true,
        tat: data.tat || '2-4 Business Days',
        remarks: data.remarks || ''
      };
    } else {
      // Pincode not in database
      result = {
        pincode: pin,
        found: false,
        serviceable: false,
        area: 'Unknown Area',
        district: '',
        state: '',
        tat: '',
        remarks: 'Pincode not currently listed in our standard database.'
      };
    }

    // Save to cache
    pincodeCache.set(pin, result);
    persistCache();

    // Log to user history if logged in
    recordUserHistory(pin, result);

    return result;
  } catch (err) {
    console.error('Pincode lookup error:', err);
    throw new Error('Unable to connect to serviceability network. Please check your connection.');
  }
}

/**
 * Background helper to record history for logged-in users
 */
async function recordUserHistory(pin, result) {
  try {
    const user = getCurrentUser();
    if (user && user.uid) {
      await addSearchHistory(user.uid, pin, result);
    }
  } catch (err) {
    // Non-fatal background error
  }
}

/**
 * Render serviceability card into a DOM container
 * @param {HTMLElement} container 
 * @param {Object} result 
 * @param {Object} options 
 */
export async function renderPincodeResult(container, result, options = {}) {
  if (!container) return;

  const business = await getBusinessSettings();
  const phone = business.phone || '+919876543210';
  const whatsapp = business.whatsapp || '919876543210';
  const user = getCurrentUser();

  const isServiceable = result.serviceable;
  const statusClass = isServiceable ? 'result-serviceable' : 'result-unserviceable';
  const statusIcon = isServiceable ? ICONS.check : ICONS.x;
  const statusTitle = isServiceable ? 'Serviceable Pincode' : 'Service Not Available';
  const statusBadge = isServiceable ? 'badge-success' : 'badge-danger';

  // Check favourite status if logged in
  let isFavourite = false;
  if (user) {
    try {
      const favs = await getFavouritePincodes(user.uid);
      isFavourite = favs.includes(result.pincode);
    } catch (e) {}
  }

  const waMessage = isServiceable
    ? `Hello Omkar Enterprises, I would like to book a courier to pincode ${result.pincode} (${result.area || 'India'}). Please guide me with rates.`
    : `Hello Omkar Enterprises, pincode ${result.pincode} shows non-serviceable online. Can you check if special express or surface delivery is possible?`;

  const waLink = getWhatsAppUrl(whatsapp, waMessage);

  container.innerHTML = `
    <div class="card result-card ${statusClass} aos visible" role="region" aria-label="Serviceability Result">
      <div class="result-header">
        <div class="result-icon-badge ${statusBadge}">
          ${statusIcon}
        </div>
        <div class="result-title-group">
          <div class="flex items-center gap-2">
            <h3 class="result-title">${statusTitle}</h3>
            ${result.fastTrack ? `<span class="badge badge-warning">⚡ FastTrack Available</span>` : ''}
          </div>
          <p class="result-pincode-label">Pincode: <strong>${escapeHtml(result.pincode)}</strong></p>
        </div>

        ${user ? `
          <button class="btn-fav-toggle" id="btn-fav-${result.pincode}" aria-label="Save to favourites" data-pincode="${result.pincode}">
            ${isFavourite ? ICONS.bookmarkFilled : ICONS.bookmark}
          </button>
        ` : ''}
      </div>

      <div class="result-body">
        <div class="result-grid">
          <div class="result-item">
            <span class="result-label">Area / Location</span>
            <span class="result-value">${escapeHtml(result.area || 'Standard Regional Area')}</span>
          </div>

          ${result.district ? `
            <div class="result-item">
              <span class="result-label">District</span>
              <span class="result-value">${escapeHtml(result.district)}</span>
            </div>
          ` : ''}

          ${result.state ? `
            <div class="result-item">
              <span class="result-label">State</span>
              <span class="result-value">${escapeHtml(result.state)}</span>
            </div>
          ` : ''}

          <div class="result-item">
            <span class="result-label">Payment Modes</span>
            <span class="result-value">${isServiceable ? 'Prepaid & Online UPI' : 'N/A'}</span>
          </div>

          <div class="result-item">
            <span class="result-label">Est. Delivery TAT</span>
            <span class="result-value">${isServiceable ? escapeHtml(result.tat || '2-4 Business Days') : 'N/A'}</span>
          </div>
        </div>

        ${result.remarks ? `
          <div class="result-alert mt-4">
            ${ICONS.info} <span>${escapeHtml(result.remarks)}</span>
          </div>
        ` : ''}
      </div>

      <div class="result-footer">
        ${isServiceable ? `
          <a href="account.html#pickup" class="btn btn-primary btn-block">
            ${ICONS.package} <span>Schedule Parcel Pickup</span>
          </a>
          <a href="${waLink}" target="_blank" rel="noopener" class="btn btn-whatsapp btn-block">
            ${ICONS.whatsapp} <span>Book via WhatsApp</span>
          </a>
        ` : `
          <div class="unserviceable-cta">
            <p class="text-sm text-secondary mb-3">
              Don't worry! For remote locations, we often arrange customized surface transport or speed post. Connect with our dispatch desk:
            </p>
            <div class="flex gap-2 flex-wrap">
              <a href="${waLink}" target="_blank" rel="noopener" class="btn btn-whatsapp flex-1">
                ${ICONS.whatsapp} <span>WhatsApp Enquiry</span>
              </a>
              <a href="tel:${phone}" class="btn btn-secondary flex-1">
                ${ICONS.phone} <span>Call Hub</span>
              </a>
            </div>
          </div>
        `}
      </div>
    </div>
  `;

  // Attach favorite click event
  if (user) {
    const favBtn = container.querySelector('.btn-fav-toggle');
    if (favBtn) {
      favBtn.addEventListener('click', async () => {
        try {
          isFavourite = !isFavourite;
          await toggleFavouritePincode(user.uid, result.pincode, isFavourite);
          favBtn.innerHTML = isFavourite ? ICONS.bookmarkFilled : ICONS.bookmark;
          showToast(isFavourite ? 'Saved to favourite pincodes' : 'Removed from favourites', 'success');
        } catch (e) {
          showToast('Failed to update favourite status', 'error');
        }
      });
    }
  }
}
