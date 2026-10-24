/**
 * Utility Functions Module
 * Common helpers used across the app
 */

/**
 * Validate Indian pincode (6 digits, never starts with 0)
 */
export function isValidPincode(pin) {
  return /^[1-9][0-9]{5}$/.test(pin);
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate Indian phone number (10 digits)
 */
export function isValidPhone(phone) {
  const cleaned = phone.replace(/[\s\-\+]/g, '');
  return /^(\+91|91)?[6-9]\d{9}$/.test(cleaned) || /^[6-9]\d{9}$/.test(cleaned);
}

/**
 * Format phone for display
 */
export function formatPhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
}

/**
 * Generate WhatsApp link
 */
export function whatsappLink(number, message = '') {
  const clean = number.replace(/\D/g, '');
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${clean}${message ? '?text=' + encoded : ''}`;
}

/**
 * Debounce function
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function
 */
export function throttle(fn, delay = 300) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}

/**
 * Format date from Firestore timestamp
 */
export function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

/**
 * Format date+time
 */
export function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Title case a string
 */
export function titleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Truncate text
 */
export function truncate(str, maxLen = 50) {
  if (!str || str.length <= maxLen) return str || '';
  return str.substring(0, maxLen) + '…';
}

/**
 * Sleep utility
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simple unique ID generator
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Plural helper
 */
export function plural(count, singular, pluralForm) {
  return count === 1 ? singular : (pluralForm || singular + 's');
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  }
}

/**
 * Download text as file
 */
export function downloadFile(content, filename, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Get country flag emoji from country code
 */
export function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  return String.fromCodePoint(
    ...countryCode.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}

/**
 * Check if device is mobile
 */
export function isMobile() {
  return window.innerWidth < 769;
}

/**
 * Set loading state on a button
 */
export function setButtonLoading(btn, loading = true, originalText = '') {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Please wait...';
    btn.disabled = true;
  } else {
    btn.innerHTML = originalText || btn.dataset.originalText || 'Submit';
    btn.disabled = false;
  }
}
