/**
 * @module compareController
 * @description Controller for the hotel price comparison endpoint.
 *
 * Receives extracted hotel data from the extension, runs it through the
 * aggregator → deal engine → deeplink pipeline, and returns a structured
 * comparison result.
 *
 * Endpoint: POST /api/v1/compare
 */

const { generateHotelFingerprint } = require('../services/entityMatcher');
const { fetchPricesFromAllSources } = require('../services/aggregatorService');
const { calculateRealDiscount } = require('../services/dealEngine');
const { generateDeeplink } = require('../services/deeplinkService');
const logger = require('../utils/logger');

/**
 * POST /api/v1/compare
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 *
 * @body {string} hotel_name - Name of the hotel
 * @body {string} [city] - City where the hotel is located
 * @body {string} [check_in] - Check-in date
 * @body {string} [check_out] - Check-out date
 * @body {number} [guests] - Number of guests
 * @body {number} [rooms] - Number of rooms
 * @body {Object} klook_extracted_price - Price data extracted from the provider
 * @body {number} klook_extracted_price.displayed_price - The visible price
 * @body {string} klook_extracted_price.currency - Currency code
 * @body {string} [url] - Full URL of the hotel page
 */
async function compareHotels(req, res) {
  try {
    const { hotel_name, city, check_in, check_out, guests, rooms, klook_extracted_price, url } = req.body;

    if (!hotel_name || !klook_extracted_price || !klook_extracted_price.currency) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: hotel_name, klook_extracted_price.currency',
      });
    }

    // 1. Generate unique hotel identifier
    const hotelId = generateHotelFingerprint(hotel_name, city);

    // 2. Build context for the aggregator
    const hotelContext = {
      hotel_id: hotelId,
      hotel_name,
      city,
      check_in,
      check_out,
      guests,
      rooms,
      klook_extracted_price,
    };

    // 3. Fetch competitor prices
    const competitorPrices = await fetchPricesFromAllSources(hotelContext);

    // 4. Calculate real discount
    const comparisonResult = await calculateRealDiscount(klook_extracted_price, competitorPrices);

    // 5. Attach affiliate deeplink
    const destinationUrl = url || `https://www.klook.com/search?query=${encodeURIComponent(hotel_name)}`;
    comparisonResult.current_offer.deeplink = generateDeeplink(destinationUrl, 'Klook');
    comparisonResult.current_offer.provider = 'Klook';

    logger.info('Comparison completed', {
      hotelId,
      hotelName: hotel_name,
      discountQuality: comparisonResult.discount_quality,
    });

    return res.json({
      status: 'success',
      hotel_id: hotelId,
      comparison: comparisonResult,
    });
  } catch (error) {
    logger.error('Error in compareController', { error: error.message, stack: error.stack });
    return res.status(500).json({
      status: 'error',
      message: 'Error processing price comparison',
    });
  }
}

module.exports = { compareHotels };
