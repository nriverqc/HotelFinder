/**
 * @module entityMatcher
 * @description Generates normalized identifiers (fingerprints) for hotel entities.
 *
 * Used to match the same hotel across different providers by creating a
 * deterministic, normalized string from the hotel name and city.
 *
 * @example
 *   const { generateHotelFingerprint } = require('./entityMatcher');
 *   generateHotelFingerprint('Grand Hyatt Bogota', 'Bogota');
 *   // => "grand-hyatt-bogota-bogota"
 */

/** Common words removed from hotel names to improve matching accuracy */
const STOPWORDS = /\b(hotel|resort|spa|hostel|apartments|the|and|by|de|del|la|el|los|las)\b/gi;

/**
 * Generates a normalized fingerprint for a hotel entity.
 *
 * @param {string} name - Hotel name (e.g., "Grand Hyatt Bogota")
 * @param {string} [city=''] - City name (e.g., "Bogota")
 * @returns {string} Normalized fingerprint (e.g., "grand-hyatt-bogota-bogota")
 */
function generateHotelFingerprint(name, city = '') {
  if (!name) return 'unknown-hotel';

  const combined = `${name} ${city}`;

  const fingerprint = combined
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')      // Remove punctuation
    .replace(STOPWORDS, '')         // Remove stopwords
    .trim()
    .replace(/\s+/g, '-');         // Spaces → hyphens

  return fingerprint || 'unknown-hotel';
}

module.exports = { generateHotelFingerprint };
