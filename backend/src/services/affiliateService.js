/**
 * @module affiliateService
 * @description Multi-market price comparison service for Booking.com.
 *
 * ⚠️ EXPERIMENTAL — DISABLED BY DEFAULT
 *
 * This service performs web scraping of Booking.com pages across different
 * currencies to find price arbitrage opportunities. This approach:
 * - May violate Booking.com's Terms of Service
 * - Is fragile (DOM selectors change frequently)
 * - Should be replaced with an official API integration when available
 *
 * Enable only for development/testing purposes by setting
 * ENABLE_BOOKING_SCRAPING=true in .env
 *
 * @see {@link module:klookArbitrageService} for the production-ready Klook integration
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { convert } = require('./currencyService');
const logger = require('../utils/logger');

/** Whether Booking.com scraping is enabled (default: false) */
const SCRAPING_ENABLED = process.env.ENABLE_BOOKING_SCRAPING === 'true';

/** Axios instance configured with browser-like headers */
const axiosInstance = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
  },
  timeout: 10000,
});

/** Markets to compare prices across */
const MARKETS = [
  { pos: 'US', currency: 'USD', name: 'USA' },
  { pos: 'BR', currency: 'BRL', name: 'Brasil' },
  { pos: 'ES', currency: 'EUR', name: 'España' },
  { pos: 'JP', currency: 'JPY', name: 'Japón' },
  { pos: 'AR', currency: 'ARS', name: 'Argentina' },
];

/**
 * Scrapes a Booking.com hotel page for pricing in a specific currency.
 *
 * @param {string} hotelUrl - Base Booking.com hotel URL
 * @param {string} checkin - Check-in date (YYYY-MM-DD)
 * @param {string} checkout - Check-out date (YYYY-MM-DD)
 * @param {string} guests - Guest count string
 * @param {string} currency - Target currency code
 * @returns {Promise<Object|null>} Extracted price or null
 */
async function scrapeBookingPrice(hotelUrl, checkin, checkout, guests, currency) {
  try {
    const baseUrl = hotelUrl.split('?')[0];
    const numGuests = guests?.match(/\d+/)?.[0] || 2;
    const scrapeUrl = `${baseUrl}?checkin=${checkin}&checkout=${checkout}&group_adults=${numGuests}&selected_currency=${currency}&lang=en-us`;

    logger.debug(`Scraping Booking.com (${currency})`, { url: scrapeUrl });
    const response = await axiosInstance.get(scrapeUrl);
    const $ = cheerio.load(response.data);

    let extractedPrice = null;

    // Method 1: JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const jsonText = $(el).html();
        if (jsonText && (jsonText.includes('priceRange') || jsonText.includes('price'))) {
          const data = JSON.parse(jsonText);
          if (data.offers?.price) {
            extractedPrice = parseFloat(data.offers.price);
          } else if (Array.isArray(data) && data[0]?.offers?.price) {
            extractedPrice = parseFloat(data[0].offers.price);
          }
        }
      } catch (parseError) {
        // Individual parse errors are expected
      }
    });

    // Method 2: DOM selector fallback
    if (!extractedPrice) {
      const priceText = $('.bui-price-display__value, [data-testid="price-and-discounted-price"]')
        .first()
        .text();
      if (priceText) {
        const cleaned = priceText.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
        extractedPrice = parseFloat(cleaned);
      }
    }

    if (extractedPrice && !isNaN(extractedPrice)) {
      return { price: extractedPrice, finalUrl: scrapeUrl };
    }

    logger.debug(`No price extracted for currency ${currency}`);
    return null;
  } catch (error) {
    logger.debug(`Scraping error for ${currency}: ${error.message}`);
    return null;
  }
}

/**
 * Compares live prices across multiple Booking.com markets.
 *
 * @param {string} hotelName - Hotel name
 * @param {string} checkin - Check-in date
 * @param {string} checkout - Check-out date
 * @param {string} guests - Guest count
 * @param {number} userPrice - User's current displayed price
 * @param {string} userCurrency - User's currency
 * @param {string} hotelUrl - Booking.com hotel URL
 * @returns {Promise<Object>} Comparison results with show_popup flag
 */
async function compareLiveOffers(hotelName, checkin, checkout, guests, userPrice, userCurrency, hotelUrl) {
  // Gate: only run if explicitly enabled
  if (!SCRAPING_ENABLED) {
    logger.debug('Booking.com scraping is disabled. Set ENABLE_BOOKING_SCRAPING=true to enable.');
    return { show_popup: false, reason: 'scraping_disabled' };
  }

  logger.info('Starting live comparison', { hotelName, userPrice, userCurrency });

  if (!hotelUrl || !hotelUrl.includes('booking.com')) {
    logger.debug('Only Booking.com URLs are supported for live scraping');
    return { show_popup: false };
  }

  // 1. Scrape all markets in parallel
  const promises = MARKETS.map(market =>
    scrapeBookingPrice(hotelUrl, checkin, checkout, guests, market.currency)
      .then(result => result ? { ...market, originalPrice: result.price, finalUrl: result.finalUrl } : null)
  );

  const posResults = (await Promise.all(promises)).filter(r => r !== null);

  const roundedUserPrice = Math.round(userPrice);
  const minSavingsThreshold = roundedUserPrice * 0.01; // 1% minimum

  // 2. Normalize all prices to user's currency
  const normalizedResults = [];

  for (const result of posResults) {
    const normalizedPrice = await convert(result.originalPrice, result.currency, userCurrency);
    const roundedBestPrice = Math.round(normalizedPrice);

    if (roundedBestPrice < (roundedUserPrice - minSavingsThreshold)) {
      const savingsAmount = roundedUserPrice - roundedBestPrice;
      const savingsPercentage = Math.round((savingsAmount / roundedUserPrice) * 100);

      // Generate Travelpayouts affiliate link
      const tpMarker = process.env.TRAVELPAYOUTS_MARKER || '';
      const campaignId = '84'; // Booking.com in Travelpayouts
      const encodedUrl = encodeURIComponent(result.finalUrl);
      const affiliateLink = tpMarker
        ? `https://tp.media/r?marker=${tpMarker}&p=${campaignId}&u=${encodedUrl}`
        : result.finalUrl;

      normalizedResults.push({
        hotel_name: hotelName,
        user_price: roundedUserPrice,
        user_currency: userCurrency,
        best_price: roundedBestPrice,
        best_price_currency: userCurrency,
        original_price: result.originalPrice,
        original_currency: result.currency,
        pos: result.name,
        provider: 'Booking.com',
        savings_amount: savingsAmount,
        savings_percentage: savingsPercentage,
        affiliate_link: affiliateLink,
      });
    }
  }

  // 3. Sort by price and return top offers
  normalizedResults.sort((a, b) => a.best_price - b.best_price);
  const topOffers = normalizedResults.slice(0, 10);

  if (topOffers.length > 0) {
    logger.info(`Found ${topOffers.length} profitable offers`, { hotelName });
    return { show_popup: true, data: { offers: topOffers } };
  }

  logger.debug('No offers improved the current price', { hotelName });
  return { show_popup: false };
}

module.exports = { compareLiveOffers };
