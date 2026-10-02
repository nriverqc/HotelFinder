/**
 * @module deeplinkService
 * @description Generates Travelpayouts affiliate tracking URLs (deeplinks).
 *
 * Travelpayouts uses the tp.media redirect format to track affiliate conversions.
 * The `u` parameter contains the encoded destination URL, and the `marker` identifies
 * the affiliate partner.
 *
 * It tags the destination URL with `hotelfinder_active=true` so the extension
 * content script can reliably detect when a user is browsing through an active
 * affiliate link even if HTTP referrers are stripped by browser security policies.
 *
 * SubID Formatting Rules (Travelpayouts Standard):
 * - Max 32 characters.
 * - Alphanumeric characters, hyphens, and underscores only.
 */

const config = require('../config');
const logger = require('../utils/logger');

const { marker, trs, pKlook, campaignKlook } = config.travelpayouts;

/**
 * Sanitizes a subid to comply with Travelpayouts alphanumeric rules.
 * @param {string} rawSubid
 * @returns {string} Clean subid (max 32 chars, a-z A-Z 0-9 _ -)
 */
function sanitizeSubid(rawSubid) {
  if (!rawSubid || typeof rawSubid !== 'string') return 'HotelFinder';
  const clean = rawSubid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return clean.length > 0 ? clean : 'HotelFinder';
}

/**
 * Builds a Travelpayouts affiliate deeplink URL.
 *
 * @param {string} destinationUrl - The target hotel/activity page URL
 * @param {string} [provider='Klook'] - Provider name (for future multi-provider support)
 * @param {string} [subid='HotelFinder'] - Sub-ID for filtering in Travelpayouts reports
 * @returns {string} The full affiliate tracking URL
 */
function generateDeeplink(destinationUrl, provider = 'Klook', subid = 'HotelFinder') {
  const rawTarget = destinationUrl || 'https://www.klook.com';

  if (!marker) {
    logger.warn('TRAVELPAYOUTS_MARKER not configured — deeplinks will not track conversions');
    return rawTarget;
  }

  try {
    const cleanSubid = sanitizeSubid(subid);

    // Validate that it is a valid URL
    const urlObj = new URL(rawTarget);

    // Tag destination URL with tracking markers
    urlObj.searchParams.set('hotelfinder_active', 'true');
    urlObj.searchParams.set('subid', cleanSubid);
    const taggedUrl = urlObj.toString();

    const encodedUrl = encodeURIComponent(taggedUrl);
    const fullMarker = cleanSubid ? `${marker}.${cleanSubid}` : marker;

    return `https://tp.media/r?marker=${fullMarker}&trs=${trs}&p=${pKlook}&campaign_id=${campaignKlook}&u=${encodedUrl}`;
  } catch (error) {
    logger.error('Error generating deeplink — invalid URL', {
      destinationUrl,
      error: error.message,
    });
    return rawTarget;
  }
}

module.exports = { generateDeeplink, sanitizeSubid };
