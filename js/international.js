/**
 * International Shipping Module
 * Omkar Enterprises – Worldwide 220+ Countries & Prohibited Items
 */

import { db, collection, getDocs, query, orderBy } from './db.js';
import { getBusinessSettings } from './db.js';
import { getWhatsAppUrl, getFlagEmoji } from './utils.js';
import { escapeHtml, ICONS } from './ui.js';

// Comprehensive default country list covering major international courier destinations
export const DEFAULT_COUNTRIES = [
  // Middle East & Gulf (Very high volume from India)
  { code: 'AE', name: 'United Arab Emirates (Dubai, Abu Dhabi)', region: 'Middle East', serviceable: true, notes: 'Direct daily flight connections. Express 2-3 days.' },
  { code: 'SA', name: 'Saudi Arabia (Riyadh, Jeddah)', region: 'Middle East', serviceable: true, notes: 'Commercial & personal effects.' },
  { code: 'QA', name: 'Qatar (Doha)', region: 'Middle East', serviceable: true, notes: 'Express door-to-door.' },
  { code: 'OM', name: 'Oman (Muscat)', region: 'Middle East', serviceable: true, notes: 'Direct Gulf sector service.' },
  { code: 'KW', name: 'Kuwait', region: 'Middle East', serviceable: true, notes: 'Standard customs documentation required.' },
  { code: 'BH', name: 'Bahrain', region: 'Middle East', serviceable: true, notes: 'Air express.' },

  // North America
  { code: 'US', name: 'United States of America', region: 'North America', serviceable: true, notes: 'FDA guidance applies for approved food/spices.' },
  { code: 'CA', name: 'Canada', region: 'North America', serviceable: true, notes: 'Express delivery to Toronto, Vancouver, Montreal.' },
  { code: 'MX', name: 'Mexico', region: 'North America', serviceable: true, notes: 'Commercial invoice required.' },

  // Europe & UK
  { code: 'GB', name: 'United Kingdom (London, Manchester)', region: 'Europe', serviceable: true, notes: '3-4 business days express.' },
  { code: 'DE', name: 'Germany', region: 'Europe', serviceable: true, notes: 'EU customs compliant.' },
  { code: 'FR', name: 'France', region: 'Europe', serviceable: true, notes: 'Express parcel & documents.' },
  { code: 'IT', name: 'Italy', region: 'Europe', serviceable: true, notes: 'Doorstep delivery.' },
  { code: 'NL', name: 'Netherlands', region: 'Europe', serviceable: true, notes: 'Schiphol European distribution gateway.' },
  { code: 'ES', name: 'Spain', region: 'Europe', serviceable: true, notes: 'Express surface & air.' },
  { code: 'CH', name: 'Switzerland', region: 'Europe', serviceable: true, notes: 'Priority customs clearance.' },
  { code: 'SE', name: 'Sweden', region: 'Europe', serviceable: true, notes: 'Nordic coverage.' },
  { code: 'PL', name: 'Poland', region: 'Europe', serviceable: true, notes: 'Central Europe transit.' },
  { code: 'IE', name: 'Ireland', region: 'Europe', serviceable: true, notes: 'Dublin & all counties.' },

  // Asia Pacific & East Asia
  { code: 'SG', name: 'Singapore', region: 'Asia Pacific', serviceable: true, notes: 'Next-flight out express.' },
  { code: 'MY', name: 'Malaysia', region: 'Asia Pacific', serviceable: true, notes: 'Kuala Lumpur & Peninsular.' },
  { code: 'TH', name: 'Thailand (Bangkok)', region: 'Asia Pacific', serviceable: true, notes: 'Express parcel delivery.' },
  { code: 'AU', name: 'Australia (Sydney, Melbourne)', region: 'Asia Pacific', serviceable: true, notes: 'Strict biosecurity compliance required.' },
  { code: 'NZ', name: 'New Zealand', region: 'Asia Pacific', serviceable: true, notes: 'Express customs clearance.' },
  { code: 'JP', name: 'Japan (Tokyo, Osaka)', region: 'Asia Pacific', serviceable: true, notes: 'High-speed air freight.' },
  { code: 'KR', name: 'South Korea (Seoul)', region: 'Asia Pacific', serviceable: true, notes: 'Commercial and samples.' },
  { code: 'HK', name: 'Hong Kong SAR', region: 'Asia Pacific', serviceable: true, notes: 'Free-trade hub express.' },
  { code: 'ID', name: 'Indonesia (Jakarta)', region: 'Asia Pacific', serviceable: true, notes: 'Customs ID required for consignee.' },
  { code: 'PH', name: 'Philippines', region: 'Asia Pacific', serviceable: true, notes: 'Manila and regional.' },
  { code: 'VN', name: 'Vietnam', region: 'Asia Pacific', serviceable: true, notes: 'Growing trade hub.' },

  // Africa
  { code: 'ZA', name: 'South Africa (Johannesburg, Cape Town)', region: 'Africa', serviceable: true, notes: 'Air express.' },
  { code: 'KE', name: 'Kenya (Nairobi)', region: 'Africa', serviceable: true, notes: 'East Africa hub.' },
  { code: 'NG', name: 'Nigeria (Lagos)', region: 'Africa', serviceable: true, notes: 'Commercial consignments.' },
  { code: 'MU', name: 'Mauritius', region: 'Africa', serviceable: true, notes: 'Island express.' },
  { code: 'EG', name: 'Egypt (Cairo)', region: 'Africa', serviceable: true, notes: 'Middle East / North Africa.' },

  // South America
  { code: 'BR', name: 'Brazil (São Paulo, Rio)', region: 'South America', serviceable: true, notes: 'Tax ID (CPF/CNPJ) required.' },
  { code: 'AR', name: 'Argentina', region: 'South America', serviceable: true, notes: 'Doorstep air delivery.' },
  { code: 'CL', name: 'Chile', region: 'South America', serviceable: true, notes: 'Express transit.' }
];

// Default Allowed Categories
export const DEFAULT_ALLOWED = [
  {
    title: 'Business & Legal Documents',
    category: 'Documents',
    description: 'Contracts, passports, certificates, university transcripts, financial statements, visa paperwork.',
    restricted: false
  },
  {
    title: 'Ready-to-Eat Food Items & Spices',
    category: 'Food',
    description: 'Commercially branded and sealed Indian sweets, namkeen, pickles (leakproof), whole spices, dry tea/coffee. (Subject to destination customs).',
    restricted: false
  },
  {
    title: 'Garments, Textiles & Handicrafts',
    category: 'Textiles',
    description: 'Ready-made clothes, traditional Indian attire, fabrics, silk scarves, woodcraft, decorative brassware.',
    restricted: false
  },
  {
    title: 'Ayurvedic & Herbal Preparations',
    category: 'Health',
    description: 'Branded personal-care ayurvedic products with manufacturer ingredients and original retail packaging.',
    restricted: false
  },
  {
    title: 'Electronics & Hardware Samples',
    category: 'Industrial',
    description: 'Commercial PCB prototypes, electrical accessories, machinery spare parts (without uninstalled lithium batteries).',
    restricted: false
  }
];

// Default Prohibited Categories
export const DEFAULT_PROHIBITED = [
  {
    title: 'Lithium Batteries (Loose / Standalone)',
    category: 'Aviation Hazard',
    reason: 'Strictly prohibited on passenger and cargo aircraft under IATA Dangerous Goods Regulations due to fire risk.'
  },
  {
    title: 'Flammable Liquids, Perfumes & Aerosols',
    category: 'Hazardous Chemicals',
    reason: 'Pressurized spray cans, alcohol-based perfumes, nail polish, sanitizers, paints, solvents, and fuel.'
  },
  {
    title: 'Currency, Precious Bullion & Negotiable Instruments',
    category: 'Financial',
    reason: 'Cash (currency notes), gold coins/bars, traveller cheques, bearer bonds, and unmounted precious gems.'
  },
  {
    title: 'Perishable Fresh Food, Meat & Dairy',
    category: 'Biological',
    reason: 'Raw fruits, vegetables, fresh milk products, and meat items prone to spoilage and quarantine bans.'
  },
  {
    title: 'Narcotics, Prescription Drugs without NOC',
    category: 'Controlled Substances',
    reason: 'Illegal narcotics, habit-forming sedatives, and unlicensed pharmaceutical compounds.'
  },
  {
    title: 'Weapons, Ammunition & Replica Firearms',
    category: 'Security Risk',
    reason: 'Firearms, explosives, fireworks, switchblades, martial arts weapons, and toy replicas that resemble real guns.'
  }
];

/**
 * Fetch international countries from Firestore or fallback
 */
export async function getCountries() {
  try {
    const q = query(collection(db, 'countries'), orderBy('name'));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    console.warn('Could not fetch countries from Firestore, using standard list:', err);
  }
  return DEFAULT_COUNTRIES;
}

/**
 * Render country cards into container
 */
export async function renderCountriesList(container, countries, filterText = '', selectedRegion = 'All') {
  if (!container) return;

  const business = await getBusinessSettings();
  const whatsapp = business.whatsapp || '919876543210';
  const phone = business.phone || '+919876543210';

  const normalizedFilter = filterText.toLowerCase().trim();

  const filtered = countries.filter(c => {
    const matchesRegion = selectedRegion === 'All' || c.region === selectedRegion;
    const matchesText = !normalizedFilter || 
      c.name.toLowerCase().includes(normalizedFilter) || 
      c.code.toLowerCase().includes(normalizedFilter);
    return matchesRegion && matchesText;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card p-8 text-center text-secondary col-span-full">
        <p class="text-lg font-bold mb-2">No countries match your search</p>
        <p class="text-sm">We deliver to 220+ countries. Please contact our international booking desk directly:</p>
        <div class="flex justify-center gap-3 mt-4">
          <a href="${getWhatsAppUrl(whatsapp, 'Hello, I have an international shipping enquiry.')}" target="_blank" class="btn btn-whatsapp">
            ${ICONS.whatsapp} <span>WhatsApp Us</span>
          </a>
          <a href="tel:${phone}" class="btn btn-secondary">
            ${ICONS.phone} <span>Call Desk</span>
          </a>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(country => {
    const flag = getFlagEmoji(country.code) || '🌐';
    const waText = `Hello Omkar Enterprises, I want to book an international courier to ${country.name}. Please guide me on rates and documentation.`;
    const waUrl = getWhatsAppUrl(whatsapp, waText);

    return `
      <div class="card country-card p-4 hover-lift">
        <div class="flex items-start gap-3 w-full">
          <span class="country-flag" aria-hidden="true">${flag}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <h4 class="font-bold text-sm truncate">${escapeHtml(country.name)}</h4>
              <span class="badge badge-sm badge-outline">${country.code}</span>
            </div>
            <p class="text-xs text-secondary mt-1">${escapeHtml(country.notes || 'Worldwide Express Available')}</p>
            <div class="flex gap-2 mt-3">
              <a href="${waUrl}" target="_blank" rel="noopener" class="btn btn-whatsapp btn-sm flex-1">
                ${ICONS.whatsapp} <span>Inquire</span>
              </a>
              <a href="tel:${phone}" class="btn btn-ghost btn-sm" aria-label="Call regarding ${country.name}">
                ${ICONS.phone}
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
