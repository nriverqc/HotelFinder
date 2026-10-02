/**
 * @module klookController
 * @description Controller for Klook-specific discount and loyalty checking.
 *
 * Handles requests from the extension's content script when the user is
 * browsing a Klook product page. Calculates applicable coupons, verified
 * rates, and available loyalty credit boosts.
 *
 * Endpoint: POST /api/klook/check-discount
 */

const { checkKlookDiscount } = require('../services/klookArbitrageService');
const loyaltyEngine = require('../services/loyaltyEngine');
const db = require('../data/database');
const logger = require('../utils/logger');

/**
 * POST /api/klook/check-discount
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleKlookDiscountCheck(req, res) {
  try {
    const { productId, currentPrice, currency, pageUrl, hotel_name, device_token } = req.body;

    if (!currentPrice || isNaN(parseFloat(currentPrice))) {
      return res.json({ hasDiscount: false });
    }

    // 1. Check coupon / verified rate discount
    const result = await checkKlookDiscount({
      productId: productId || hotel_name || 'klook_item',
      currentPrice: parseFloat(currentPrice),
      currency: currency || 'USD',
      pageUrl: pageUrl || 'https://www.klook.com/',
    });

    // 2. If device_token is provided, evaluate user's spendable loyalty credits
    if (device_token) {
      try {
        const user = await db.syncSession(device_token);
        const availableCents = await db.getAvailableBalanceCents(user.id);

        if (availableCents > 0) {
          const loyaltyCalc = await loyaltyEngine.calculateApplicableCredit({
            availableBalanceCents: availableCents,
            bookingAmount: parseFloat(currentPrice),
            currency: currency || 'USD',
          });

          result.loyalty = loyaltyCalc;
        }
      } catch (err) {
        logger.warn('Failed to calculate loyalty credit for user', { error: err.message });
      }
    }

    return res.json(result);
  } catch (error) {
    logger.error('Error in klookController', { error: error.message });
    return res.json({ hasDiscount: false });
  }
}

module.exports = { handleKlookDiscountCheck };
