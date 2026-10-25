# 📦 Omkar Enterprises – Modern Logistics & Courier Web Application
> **Domestic (Pan-India 19,000+ Pincodes) & International (220+ Territories) Courier Services**  
> Built with Pure Vanilla HTML5, CSS3, ES Modules, and Firebase Modular SDK v10+ (Static Web App for GitHub Pages on Free Firebase Spark Plan).

---

## 📑 Table of Contents
1. [Project Overview & Architectural Principles](#1-project-overview--architectural-principles)
2. [Firebase Spark Plan Configuration Guide](#2-firebase-spark-plan-configuration-guide)
3. [Firestore Database Schema & Security Rules](#3-firestore-database-schema--security-rules)
4. [Step-by-Step: Creating the First Admin](#4-step-by-step-creating-the-first-admin)
5. [Domestic Pincode Serviceability & CSV Engine](#5-domestic-pincode-serviceability--csv-engine)
6. [Camera OCR Scanner Architecture (Tesseract.js)](#6-camera-ocr-scanner-architecture-tesseractjs)
7. [Admin Printable Address Label Generator](#7-admin-printable-address-label-generator)
8. [International Shipping Architecture](#8-international-shipping-architecture)
9. [Mobile-First "Super Easy Mode" UI/UX System](#9-mobile-first-super-easy-mode-uiux-system)
10. [Deployment to GitHub Pages](#10-deployment-to-github-pages)
11. [Troubleshooting & Maintenance Checklist](#11-troubleshooting--maintenance-checklist)

---

## 1. Project Overview & Architectural Principles

Omkar Enterprises is an enterprise-grade, static web application crafted for a high-volume courier company. It runs entirely in the browser without backends, Node.js runtimes, bundlers, or Cloud Functions, making it **100% cost-free on the Firebase Spark Plan** and effortlessly hostable on **GitHub Pages**.

### Key System Highlights
- **Zero Framework Footprint**: Pure HTML5, Modern CSS (custom properties, glassmorphism, responsive grid), and Vanilla JavaScript (ES Modules).
- **Firebase Modular SDK v10+**: Direct CDN imports (`https://www.gstatic.com/firebasejs/13.1.0/...`), tree-shaken and fast.
- **Two Distinct Sections**:
  - **Domestic India**: Real-time 6-digit Pincode Serviceability search with in-memory caching and browser-based OCR camera scanner across 19,000+ Indian pincodes.
  - **International**: Coverage across 220+ territories with region filtering, allowed vs. prohibited item categorizations, and one-tap WhatsApp / direct call integration.
- **Role-Based Access**:
  - **Guests**: Complete public access to serviceability checkers, international directory, service catalogs, company info, and contact/enquiry forms.
  - **Registered Users**: Optional sign-in via Email/Password or Google Sign-In, saved address book, pincode search history & favorites, pickup request booking, and enquiry status tracking.
  - **Admins**: Password/Google-authenticated admin control panel with bulk CSV/Excel pincode ingestion (SheetJS 500-doc batching), live address label printer, enquiry manager, pickup request manager, and dynamic business settings editor.
- **Mobile-First Accessibility ("Super Easy Mode")**:
  - Floating bottom navigation pill dock with prominent center action button.
  - High-contrast visual cues (Green = Serviceable, Red = Non-serviceable, Yellow = Pending).
  - Minimum touch targets of 48px × 48px, optimized typography, and dual light/dark theme support.

---

## 2. Firebase Spark Plan Configuration Guide

The application connects to Firebase project `omkar-enterpises` with credentials configured in `js/firebase-config.js`:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBEe3TWU_bxMCLEfS9kzKCnJGSTg7X2cUg",
  authDomain: "omkar-enterpises.firebaseapp.com",
  projectId: "omkar-enterpises",
  storageBucket: "omkar-enterpises.firebasestorage.app",
  messagingSenderId: "373726246219",
  appId: "1:373726246219:web:54b056b393e047194024ce",
  measurementId: "G-8TMF1M237Q"
};
```

### Setup Steps in Firebase Console
1. **Enable Authentication Providers**:
   - Go to [Firebase Console](https://console.firebase.google.com/) → Select `omkar-enterpises`.
   - Navigate to **Build** → **Authentication** → **Sign-in method**.
   - Enable **Email/Password** (keep Email link passwordless sign-in disabled).
   - Enable **Google** (set your public project support email and save).
2. **Authorize Domains**:
   - In Authentication → **Settings** → **Authorized domains**, ensure the following are listed:
     - `localhost`
     - `127.0.0.1`
     - `omkar-enterpises.firebaseapp.com`
     - `<your-github-username>.github.io`
3. **Provision Cloud Firestore**:
   - Navigate to **Build** → **Firestore Database** → Click **Create Database**.
   - Choose a nearby region (e.g., `asia-south1` for Mumbai, India).
   - Start in **Production mode** (rules will be applied from `firestore.rules`).
4. **Deploy Security Rules**:
   - Copy the contents of `firestore.rules` and paste them into the Firestore **Rules** tab, then click **Publish**.
5. **API Key Domain Restriction (Recommended for Production)**:
   - Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
   - Locate the Browser Key for `omkar-enterpises`.
   - Under **Application restrictions**, select **Websites** and add your GitHub Pages domain (`https://<username>.github.io/*`) and `localhost`.

---

## 3. Firestore Database Schema & Security Rules

All document schemas are designed to minimize read/write operations within the Spark Plan free tier (50,000 reads / 20,000 writes daily).

### Collection Structures

| Collection | Document ID | Fields | Purpose & Access |
| :--- | :--- | :--- | :--- |
| `settings` | `business` | `phone`, `whatsapp`, `email`, `address`, `workingHours`, `companyName`, `tagline`, `announcement` | Public read, Admin write |
| `pincodes` | `6-digit pincode` (e.g., `515001`) | `pincode`, `area`, `branch`, `district`, `state`, `delivery` (bool), `fastTrack` (bool), `remarks` | Public read, Admin write. Keyed by pincode so lookup is 1 read |
| `countries` | `countryCode` (e.g., `AE`, `US`) | `code`, `name`, `region`, `serviceable` (bool), `notes`, `order` | Public read, Admin write |
| `allowedItems` | Auto-ID | `title`, `description`, `category`, `restricted` (bool) | Public read, Admin write |
| `prohibitedItems`| Auto-ID | `title`, `description`, `category`, `reason` | Public read, Admin write |
| `enquiries` | Auto-ID | `name`, `email`, `phone`, `subject`, `message`, `source`, `status`, `userId`, `createdAt` | Public create (rate-limited + honeypot), Admin read/write |
| `pickupRequests`| Auto-ID | `userId`, `name`, `phone`, `pickupAddress`, `pincode`, `parcelType`, `preferredDate`, `preferredTime`, `status`, `createdAt` | User create/read own, Admin read/write |
| `labels` | Auto-ID | `toName`, `toAddress`, `toPhone`, `toPincode`, `fromName`, `fromArea`, `createdAt`, `createdBy` | Admin read/write |
| `users` | `uid` | `email`, `displayName`, `phone`, `role` ("user" \| "admin"), `address`, `createdAt`, `updatedAt` | User read/write own profile (cannot change role), Admin read all |
| `users/{uid}/savedAddresses` | Auto-ID | `name`, `phone`, `address`, `pincode`, `city`, `state`, `isDefault`, `createdAt` | User own subcollection |
| `users/{uid}/searchHistory` | Auto-ID | `pincode`, `result`, `searchedAt` | User own subcollection |
| `users/{uid}/favouritePincodes` | `pincode` | `pincode`, `addedAt` | User own subcollection |

---

## 4. Step-by-Step: Creating the First Admin

Because the frontend strictly enforces admin privileges based on the Firestore document `users/{uid}.role == 'admin'`, and Firestore Security Rules disallow regular users from setting their own role, the initial admin must be designated once through the Firebase Console:

1. **Register the Admin Account**:
   - Go to your website's `login.html` (or through the live site).
   - Sign up with the email address you wish to make admin (e.g. `admin@omkar.com`) or log in via Google.
2. **Find the User's UID**:
   - Open [Firebase Console](https://console.firebase.google.com/) → **Authentication** → **Users**.
   - Copy the User UID (a string of ~28 characters, e.g., `8dF4kL90PqR...`).
3. **Assign Admin Role in Firestore**:
   - Open **Firestore Database** → Navigate to the `users` collection.
   - Click on the document named with the user's UID (create it if it doesn't exist).
   - Add/Update the field:
     - Field name: `role`
     - Type: `string`
     - Value: `admin`
4. **Log in to Admin Panel**:
   - Refresh your browser or visit `admin/index.html`.
   - The navigation will now display the **Admin** shield icon and grant full access to admin tools.

---

## 5. Domestic Pincode Serviceability & CSV Engine

### Search Engine Architecture
1. **Direct Document Lookup**: Every pincode is stored with its 6-digit numeric string as the Firestore Document ID (`doc(db, 'pincodes', '515001')`). This guarantees $O(1)$ single-read lookups without expensive query scans.
2. **Session & In-Memory Caching**: Checked pincodes are stored in `sessionStorage` and JavaScript memory. Repeated queries for the same pincode cost **zero** Firestore reads.
3. **Input Sanitization**: Strict regular expression validation (`/^[1-9][0-9]{5}$/`) guarantees that Indian pincodes never start with `0` and are strictly 6 digits before hitting the network.

### Admin CSV / Excel Upload Workflow
- **Library**: `SheetJS` (xlsx.full.min.js via CDN).
- **Processing**: Client-side parsing in the browser with no server required.
- **Normalization Rules**:
  - Pincodes stripped of spaces and validated.
  - Delivery status parsed (`YES`, `Y`, `1`, `TRUE` $\rightarrow$ `serviceable: true`).
  - Fast-track delivery parsed (`YES`, `Y`, `1`, `TRUE` $\rightarrow$ `fastTrack: true`).
- **Batching**: Batched writes using Firestore `writeBatch()` in chunks of **500 documents** (Firestore's maximum batch size), accompanied by a live progress bar.

---

## 6. Camera OCR Scanner Architecture (Tesseract.js)

The camera scanner provides an effortless mobile experience for courier staff and customers looking at shipping labels:

1. **Media Stream Initialization**:
   - Requests `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` to prefer the high-resolution rear camera.
2. **Viewfinder & Guide Overlay**:
   - Displays a live video feed with an illuminated aiming guide box.
3. **Canvas Frame Preprocessing**:
   - Captures only the cropped bounding box region into an offscreen HTML5 `<canvas>`.
   - Applies pixel-level grayscale and contrast thresholding to maximize OCR contrast on low-light shipping labels.
4. **Digit-Restricted OCR**:
   - Invokes Tesseract.js worker with `tessedit_char_whitelist: '0123456789'`.
   - Matches 6-digit sequences using regex `\b[1-9][0-9]{5}\b`.
5. **Selection & Fallback**:
   - If multiple candidates are detected, presents a selection sheet to the user.
   - If camera access is denied or unavailable, cleanly falls back to image upload (`<input type="file" accept="image/*" capture="environment">`).

---

## 7. Admin Printable Address Label Generator

### Label Layout Standard
The address label generator strictly adheres to the courier industry standard layout:

```text
+---------------------------------------------------------+
|  To,                                                    |
|  Amit Sharma                                            |
|  Flat 402, Sunshine Heights, M.G. Road                 |
|  Bandra West, Mumbai, Maharashtra                       |
|  Phone: +91 98765 43210 / +91 91234 56789               |
|  PINCODE: 400050                                        |
|                                                         |
|  From,                                                  |
|  Omkar Enterprises                                      |
|  Shop No. 4, Courier Hub, Andheri East                  |
+---------------------------------------------------------+
```

### Printing Engine
- Dedicated `css/print.css` utilizing `@media print` rules.
- Strips all navigation bars, sidebars, buttons, and backgrounds during printing.
- Supported paper dimensions:
  - Standard A4 Sheet (single or multiple label grid)
  - A5 Half-sheet
  - Standard 4" × 6" thermal adhesive label
- Options for high-contrast bold typography, border toggles, and logo inclusion.
- Automatically saves created labels into Firestore `labels` collection for instant reprinting and auditing.

---

## 8. International Shipping Architecture

The international module is isolated from the domestic pincode database to prevent cross-contamination of queries and optimize user clarity.

- **Global Reach**: Pre-configured with 220+ world countries and territories categorized by continents (Asia, Europe, North America, Middle East, Africa, Oceania, South America).
- **Customs & Parcel Categories**:
  - **Allowed Items**: Documents, garments, spices, non-perishable foods, handicrafts, electronics (with MSDS).
  - **Prohibited Items**: Flammable liquids, lithium batteries (uninstalled), currencies, hazardous chemicals, perishable meats.
- **Direct Engagement CTAs**:
  - **WhatsApp Direct**: Constructs instant click-to-chat links:  
    `https://wa.me/<whatsapp_number>?text=Hello%20Omkar%20Enterprises,%20I%20have%20an%20international%20courier%20enquiry%20for%20<CountryName>`
  - **Direct Phone Call**: Direct `tel:<phone_number>` link.

---

## 9. Mobile-First "Super Easy Mode" UI/UX System

Designed following the app mockups:
- **Bottom Navigation Dock**: Floating glassmorphism pill with primary routes (`Home`, `Domestic`, `Scan [Camera]`, `Int'l`, `Account`).
- **One-Thumb Interaction**: Core inputs and primary action buttons are located within comfortable thumb-reach zones.
- **Instant Status Cards**: Large colored badges with clear iconography:
  - 🟢 **Serviceable** (Green badge with checkmark and delivery details)
  - 🔴 **Not Serviceable** (Red badge with alternative enquiry options)
- **High-Accessibility Design**: High contrast ratios, bold typography with Google Font Inter, and full keyboard navigation support.

---

## 10. Deployment to GitHub Pages

1. **Initialize Git Repository**:
   ```bash
   git init
   git add .
   git commit -m "Initial release of Omkar Enterprises Courier Portal"
   ```
2. **Push to GitHub**:
   ```bash
   git remote add origin https://github.com/<username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```
3. **Configure GitHub Pages**:
   - In GitHub repository settings → **Pages**.
   - Under **Build and deployment** → Source: **Deploy from a branch**.
   - Branch: `main` / Folder: `/ (root)` → Click **Save**.
4. **Verify Domain in Firebase**:
   - Add `<username>.github.io` to your Firebase Authentication Authorized Domains.

---

## 11. Troubleshooting & Maintenance Checklist

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Pincode query returns permission denied** | Firestore rules not published | Publish rules from `firestore.rules` in Firebase Console |
| **Camera won't open on mobile** | Insecure context (HTTP) | WebRTC `getUserMedia` requires HTTPS; test via GitHub Pages or `localhost` |
| **Google Sign-In popup blocked / fails** | Unauthorized domain | Add domain to Firebase Authentication Authorized Domains list |
| **OCR not detecting pincode** | Poor contrast or blurry label | Use the guide box, ensure adequate lighting, or use the file upload fallback |
| **Admin page redirects to login** | User role is not `'admin'` | Check `users/{uid}` in Firestore and set `role: 'admin'` |

---
*Maintained for Omkar Enterprises – Reliable Domestic & International Logistics.*
