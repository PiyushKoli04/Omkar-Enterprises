/**
 * Camera Scanner & OCR Module
 * Omkar Enterprises – Browser-based Pincode Extraction via Tesseract.js
 */

import { ICONS, showToast, escapeHtml } from './ui.js';
import { checkPincodeServiceability, renderPincodeResult } from './pincode.js';

let videoStream = null;
let tesseractWorker = null;
let isScanning = false;
let ocrLoaded = false;

/**
 * Lazy-load Tesseract.js from CDN
 */
async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => {
      ocrLoaded = true;
      resolve(window.Tesseract);
    };
    script.onerror = () => reject(new Error('Failed to load OCR engine. Please check internet connection.'));
    document.head.appendChild(script);
  });
}

/**
 * Initialize Tesseract Worker optimized for digits and numbers
 */
async function getOCRWorker() {
  if (tesseractWorker) return tesseractWorker;

  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker('eng');
  
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789 -.',
  });

  tesseractWorker = worker;
  return worker;
}

/**
 * Robust pincode extractor from OCR text
 */
function extractPincodes(text) {
  if (!text) return [];
  const found = [];

  // 1. Direct 6-digit sequence starting with 1-9
  const m1 = text.match(/[1-9][0-9]{5}/g);
  if (m1) found.push(...m1);

  // 2. 3+3 digits with space, hyphen, or dot: e.g. "400 614", "400-614"
  const m2 = text.match(/([1-9][0-9]{2})[\s\.\-]+([0-9]{3})/g);
  if (m2) {
    m2.forEach(m => {
      const c = m.replace(/[\s\.\-]/g, '');
      if (/^[1-9][0-9]{5}$/.test(c)) found.push(c);
    });
  }

  // 3. Fallback: sanitize non-digits
  const digitsOnly = text.replace(/[^0-9]/g, ' ');
  const m3 = digitsOnly.match(/\b[1-9][0-9]{5}\b/g);
  if (m3) found.push(...m3);

  return [...new Set(found)];
}

let activePincodeCallback = null;

/**
 * Open camera scanner modal and initiate video stream
 */
export async function openCameraScanner(options = {}) {
  const modal = document.getElementById('scanner-modal');
  const video = document.getElementById('scanner-video');
  const statusText = document.getElementById('scanner-status');

  if (options.onPincodeDetected) {
    activePincodeCallback = options.onPincodeDetected;
  }

  if (modal) modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (statusText) statusText.textContent = 'Initializing camera...';

  // Pre-load OCR worker in the background
  getOCRWorker().catch(err => console.warn('Background OCR preheat warning:', err));

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera access is not supported by your browser.');
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
    } catch (e1) {
      // Fallback without constraints
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }

    videoStream = stream;
    if (video) {
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
    }

    isScanning = true;
    if (statusText) statusText.textContent = 'Point camera at pincode / address label and tap Capture & Scan.';
  } catch (err) {
    console.error('Camera access error:', err);
    if (statusText) statusText.textContent = 'Camera permission denied or camera not found.';
    showToast(err.message || 'Unable to access camera.', 'error');
  }
}

/**
 * Capture both cropped guide region and full frame
 */
function captureFrames() {
  const video = document.getElementById('scanner-video');
  const guide = document.getElementById('scanner-guide');
  if (!video || !video.videoWidth) return null;

  const vW = video.videoWidth;
  const vH = video.videoHeight;

  // Full frame canvas
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = vW;
  fullCanvas.height = vH;
  const fullCtx = fullCanvas.getContext('2d');
  fullCtx.drawImage(video, 0, 0, vW, vH);

  // Guide crop canvas (with 25% safety margin)
  let cropCanvas = null;
  if (guide) {
    const videoRect = video.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();

    if (videoRect.width > 0 && videoRect.height > 0) {
      const scaleX = vW / videoRect.width;
      const scaleY = vH / videoRect.height;

      const padX = guideRect.width * 0.25;
      const padY = guideRect.height * 0.35;

      const gLeft = Math.max(0, guideRect.left - videoRect.left - padX);
      const gTop = Math.max(0, guideRect.top - videoRect.top - padY);
      const gWidth = guideRect.width + (padX * 2);
      const gHeight = guideRect.height + (padY * 2);

      const cropX = Math.max(0, gLeft * scaleX);
      const cropY = Math.max(0, gTop * scaleY);
      const cropW = Math.min(vW - cropX, gWidth * scaleX);
      const cropH = Math.min(vH - cropY, gHeight * scaleY);

      if (cropW > 20 && cropH > 20) {
        cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      }
    }
  }

  return { cropCanvas, fullCanvas };
}

/**
 * Perform OCR on a canvas or image element
 * @param {HTMLCanvasElement|HTMLImageElement} source 
 * @returns {Promise<Array<string>>} List of detected 6-digit pincodes
 */
export async function runOCR(source) {
  const worker = await getOCRWorker();
  const ret = await worker.recognize(source);
  const text = ret.data.text || '';
  return extractPincodes(text);
}

/**
 * Handle Single Capture & Scan Trigger
 */
export async function triggerScannerCapture(onPincodeSelected) {
  const statusText = document.getElementById('scanner-status');
  const captureBtn = document.getElementById('scanner-capture-btn');

  if (captureBtn) captureBtn.disabled = true;
  if (statusText) statusText.textContent = 'Scanning for 6-digit pincode...';

  try {
    const frames = captureFrames();
    if (!frames || !frames.fullCanvas) throw new Error('Could not capture frame from camera.');

    let detected = [];

    // Stage 1: Check cropped guide region first
    if (frames.cropCanvas) {
      detected = await runOCR(frames.cropCanvas);
    }

    // Stage 2: Fallback to full camera frame if not in crop
    if (detected.length === 0) {
      if (statusText) statusText.textContent = 'Analyzing full camera feed...';
      detected = await runOCR(frames.fullCanvas);
    }

    if (detected.length === 0) {
      if (statusText) statusText.textContent = 'No 6-digit pincode found. Hold steady and ensure good lighting.';
      showToast('No pincode detected. Please try again.', 'warning');
      return;
    }

    const cb = onPincodeSelected || activePincodeCallback;
    if (detected.length === 1) {
      closeCameraScanner();
      if (cb) cb(detected[0]);
    } else {
      showCandidateSelection(detected, cb);
    }

  } catch (err) {
    console.error('Scan error:', err);
    if (statusText) statusText.textContent = 'Scan error. Please try again or type manually.';
    showToast('Failed to recognize pincode. Please try again.', 'error');
  } finally {
    if (captureBtn) captureBtn.disabled = false;
  }
}

/**
 * Show a modal sheet to choose among multiple detected 6-digit numbers
 */
function showCandidateSelection(candidates, onSelect) {
  const modal = document.getElementById('candidate-modal');
  const list = document.getElementById('candidate-list');
  if (!modal || !list) {
    if (onSelect) onSelect(candidates[0]);
    return;
  }

  list.innerHTML = candidates.map(pin => `
    <button class="btn btn-outline btn-block mb-2 candidate-btn" data-pin="${pin}">
      <strong>${pin}</strong>
    </button>
  `).join('');

  modal.classList.add('open');

  list.querySelectorAll('.candidate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pin = btn.dataset.pin;
      modal.classList.remove('open');
      closeCameraScanner();
      if (onSelect) onSelect(pin);
    });
  });
}

/**
 * Fallback: Process user-uploaded image file
 */
export async function processImageUpload(file, onPincodeSelected) {
  if (!file) return;

  showToast('Analyzing image...', 'info');

  try {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const detected = await runOCR(img);
    URL.revokeObjectURL(objectUrl);

    if (detected.length === 0) {
      showToast('Could not find a 6-digit pincode in the uploaded image.', 'warning');
      return;
    }

    if (detected.length === 1) {
      if (onPincodeSelected) onPincodeSelected(detected[0]);
    } else {
      showCandidateSelection(detected, onPincodeSelected);
    }
  } catch (err) {
    console.error('Image upload OCR error:', err);
    showToast('Failed to read image. Please enter pincode manually.', 'error');
  }
}

/**
 * Close and Stop Camera
 */
export function closeCameraScanner() {
  const modal = document.getElementById('scanner-modal');
  const video = document.getElementById('scanner-video');

  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }

  if (video) video.srcObject = null;
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
  isScanning = false;
}
