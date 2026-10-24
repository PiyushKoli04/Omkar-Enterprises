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
 * Initialize Tesseract Worker optimized for digits only
 */
async function getOCRWorker() {
  if (tesseractWorker) return tesseractWorker;

  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker('eng');
  
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
  });

  tesseractWorker = worker;
  return worker;
}

/**
 * Open Camera & Viewfinder
 * @param {Object} options
 * @param {Function} options.onPincodeDetected - Callback when 6-digit pin is found
 * @param {HTMLElement} options.resultContainer - DOM element to render result
 */
export async function openCameraScanner(options = {}) {
  const modal = document.getElementById('scanner-modal');
  const video = document.getElementById('scanner-video');
  const statusText = document.getElementById('scanner-status');
  const guide = document.getElementById('scanner-guide');

  if (!modal || !video) {
    console.error('Scanner elements missing in DOM');
    return;
  }

  // Show modal
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (statusText) statusText.textContent = 'Requesting camera access...';

  try {
    // 1. Request camera stream (prefer rear environment camera)
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false
    };

    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = videoStream;
    await video.play();

    if (statusText) statusText.textContent = 'Align pincode inside the guide box';
    isScanning = true;

  } catch (err) {
    console.warn('Camera access failed:', err);
    let errMsg = 'Camera access was denied or is not supported.';
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      errMsg = 'Camera requires HTTPS. Please test on a secure connection.';
    }
    if (statusText) statusText.textContent = errMsg;
    showToast(errMsg, 'error');
  }
}

/**
 * Capture frame from video, crop to guide box, and preprocess
 * @returns {HTMLCanvasElement} Preprocessed canvas
 */
function captureAndPreprocessFrame() {
  const video = document.getElementById('scanner-video');
  const guide = document.getElementById('scanner-guide');
  if (!video || !guide || !video.videoWidth) return null;

  const videoRect = video.getBoundingClientRect();
  const guideRect = guide.getBoundingClientRect();

  // Calculate ratio between displayed video and actual video stream
  const scaleX = video.videoWidth / videoRect.width;
  const scaleY = video.videoHeight / videoRect.height;

  const cropX = Math.max(0, (guideRect.left - videoRect.left) * scaleX);
  const cropY = Math.max(0, (guideRect.top - videoRect.top) * scaleY);
  const cropW = Math.min(video.videoWidth - cropX, guideRect.width * scaleX);
  const cropH = Math.min(video.videoHeight - cropY, guideRect.height * scaleY);

  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');

  // Draw cropped frame
  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Preprocess: Grayscale + Threshold (Binarize) for clear text
  try {
    const imgData = ctx.getImageData(0, 0, cropW, cropH);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Luminance formula
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Adaptive-like high contrast threshold
      const val = gray > 120 ? 255 : 0;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    // If CORS or getImageData fails, proceed with raw cropped canvas
  }

  return canvas;
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

  // Extract all 6-digit Indian pincodes (first digit 1-9)
  const matches = text.match(/\b[1-9][0-9]{5}\b/g);
  if (!matches) return [];

  // Remove duplicates while keeping order
  return [...new Set(matches)];
}

/**
 * Handle Single Capture & Scan Trigger
 */
export async function triggerScannerCapture(onPincodeSelected) {
  const statusText = document.getElementById('scanner-status');
  const captureBtn = document.getElementById('scanner-capture-btn');

  if (captureBtn) captureBtn.disabled = true;
  if (statusText) statusText.textContent = 'Reading image with OCR...';

  try {
    const canvas = captureAndPreprocessFrame();
    if (!canvas) throw new Error('Could not capture frame from camera.');

    const detected = await runOCR(canvas);

    if (detected.length === 0) {
      if (statusText) statusText.textContent = 'No 6-digit pincode found. Try holding closer or steady.';
      showToast('No pincode detected. Please try again.', 'warning');
      return;
    }

    if (detected.length === 1) {
      // Exactly one found!
      closeCameraScanner();
      if (onPincodeSelected) onPincodeSelected(detected[0]);
    } else {
      // Multiple candidates detected (e.g. phone number parts & pincode)
      showCandidateSelection(detected, onPincodeSelected);
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
