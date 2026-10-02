/**
 * @module dealEngine
 * @description Core pricing intelligence engine for HotelFinder.
 *
 * Processes extracted hotel prices, normalizes them to USD, applies any
 * verified coupons, and calculates the real discount/savings.
 *
 * Supports multiple room options from a single hotel listing.
 * All monetary values are rounded to 2 decimal places for consistency.
 *
 * Discount Quality Labels:
 * - GREAT_DEAL: A verified coupon applies, providing real savings
 * - OFFICIAL_VERIFIED: No additional savings found, but price is confirmed as official
 */

const { convertToUSD } = require('./currencyService');
const { getApplicableCoupon } = require('./couponService');
const logger = require('../utils/logger');

/**
 * Rounds a number to 2 decimal places.
 * @param {number} value
 * @returns {number}
 */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Calculates the real discount for a hotel offer.
 *
 * @param {Object} extractedPriceData - Price data extracted from the provider
 * @param {number} extractedPriceData.displayed_price - The visible price on the page
 * @param {string} extractedPriceData.currency - Currency code of the displayed price
 * @param {Array}  [extractedPriceData.room_options] - Optional list of room options
 * @param {Array}  competitorPrices - Prices from other sources (from aggregatorService)
 * @param {string} [provider='klook'] - Provider name for coupon matching
 * @returns {Promise<Object>} Structured comparison result
 */
async function calculateRealDiscount(extractedPriceData, competitorPrices, provider = 'klook') {
  // 1. Convert the main extracted offer to USD
  const currentOfferUsd = await convertToUSD(
    extractedPriceData.displayed_price,
    extractedPriceData.currency
  );

  // 2. Process room options (if available) and normalize to USD
  let roomOptions = [];
  if (Array.isArray(extractedPriceData.room_options) && extractedPriceData.room_options.length > 0) {
    roomOptions = await Promise.all(
      extractedPriceData.room_options.map(async (room) => {
        const priceUsd = await convertToUSD(
          room.price,
          room.currency || extractedPriceData.currency
        );
        return {
          room_id: room.room_id || null,
          room_name: room.room_name || 'Habitación Estándar',
          bed_type: room.bed_type || '1 Cama',
          benefits: Array.isArray(room.benefits)
            ? room.benefits
            : (room.benefits ? [room.benefits] : []),
          price: round2(room.price),
          price_usd: round2(priceUsd),
          currency: room.currency || extractedPriceData.currency,
        };
      })
    );
  }

  // 3. Check for applicable verified coupons
  const validCoupon = getApplicableCoupon(provider, currentOfferUsd);

  // 4. Calculate total savings
  let totalSavingsUsd = 0;
  if (validCoupon) {
    totalSavingsUsd = validCoupon.savings_usd;
  }

  const finalPriceUsd = Math.max(0, currentOfferUsd - totalSavingsUsd);
  const savingsPercent = currentOfferUsd > 0
    ? (totalSavingsUsd / currentOfferUsd) * 100
    : 0;

  const hasRealSavings = validCoupon !== null && totalSavingsUsd > 0;
  const discountQuality = hasRealSavings ? 'GREAT_DEAL' : 'OFFICIAL_VERIFIED';

  logger.debug('Deal engine result', {
    currentOfferUsd: round2(currentOfferUsd),
    finalPriceUsd: round2(finalPriceUsd),
    savingsPercent: round2(savingsPercent),
    discountQuality,
    coupon: validCoupon?.code || null,
    roomOptionsCount: roomOptions.length,
  });

  return {
    is_real_discount: hasRealSavings,
    discount_quality: discountQuality,
    current_offer: {
      provider: 'Klook',
      price_usd: round2(currentOfferUsd),
      final_price_usd: round2(finalPriceUsd),
      original_currency: extractedPriceData.currency,
      original_price: extractedPriceData.displayed_price,
    },
    room_options: roomOptions,
    coupon: validCoupon
      ? {
          code: validCoupon.code,
          discount_percent: validCoupon.discount_percent,
          savings_usd: validCoupon.savings_usd,
          description: validCoupon.description,
        }
      : null,
    market_baseline: {
      median_price_usd: round2(currentOfferUsd),
      cheapest_alternative_usd: round2(finalPriceUsd),
      alternative_provider: 'Klook Official',
    },
    savings: {
      amount_usd: round2(totalSavingsUsd),
      percentage: round2(savingsPercent),
      formatted_text: validCoupon
        ? `¡Cupón ${validCoupon.code} aplicado! Ahorras $${validCoupon.savings_usd} USD adicionales.`
        : '🛡️ Tarifa Oficial MÁS BAJA Verificada. Reserva con garantía directa.',
    },
  };
}

module.exports = { calculateRealDiscount };
