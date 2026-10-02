/**
 * @module routes
 * @description API route definitions for HotelFinder backend (v2 Milestone Rewards).
 */

const express = require('express');
const router = express.Router();

const compareController = require('../controllers/compareController');
const klookController = require('../controllers/klookController');
const userController = require('../controllers/userController');
const webhookController = require('../controllers/webhookController');
const db = require('../data/database');
const affiliateService = require('../services/affiliateService');
const { validateBody } = require('../middleware/validateRequest');
const logger = require('../utils/logger');

// ──────────────────────────────────────────────
//  Klook & Loyalty Routes
// ──────────────────────────────────────────────

router.post(
  '/klook/check-discount',
  validateBody({
    currentPrice: { type: 'number', required: true },
    currency: { type: 'string', required: false, default: 'USD' },
    pageUrl: { type: 'string', required: false },
    productId: { type: 'string', required: false },
    hotel_name: { type: 'string', required: false },
    device_token: { type: 'string', required: false },
  }),
  klookController.handleKlookDiscountCheck
);

/**
 * GET /api/loyalty/account
 * Returns user confirmed balance, milestone ladder progress, and claims history.
 */
router.get('/loyalty/account', async (req, res) => {
  try {
    const deviceToken = req.query.device_token;
    if (!deviceToken) {
      return res.status(400).json({ status: 'error', message: 'Missing device_token' });
    }

    const account = await db.getUserAccount(deviceToken);
    res.json({ status: 'success', ...account });
  } catch (error) {
    logger.error('Error fetching loyalty account', { error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Alias for backwards compatibility
router.get('/loyalty/balance', async (req, res) => {
  try {
    const deviceToken = req.query.device_token;
    if (!deviceToken) {
      return res.status(400).json({ status: 'error', message: 'Missing device_token' });
    }

    const account = await db.getUserAccount(deviceToken);
    res.json({ status: 'success', ...account });
  } catch (error) {
    logger.error('Error fetching loyalty balance', { error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/loyalty/claim-reward
 * Server-side verified reward voucher claim execution.
 */
router.post(
  '/loyalty/claim-reward',
  validateBody({
    device_token: { type: 'string', required: true },
    email: { type: 'string', required: true },
    tier_cents: { type: 'number', required: true },
  }),
  async (req, res) => {
    try {
      const { device_token, email, tier_cents } = req.body;
      const claimResult = await db.claimRewardVoucher({
        deviceToken: device_token,
        email,
        tierCents: tier_cents,
      });

      res.json(claimResult);
    } catch (error) {
      logger.warn('Reward claim failed', { error: error.message });
      res.status(400).json({ status: 'error', message: error.message });
    }
  }
);

// ──────────────────────────────────────────────
//  Affiliate Webhook Ingestion
// ──────────────────────────────────────────────

router.post('/webhooks/travelpayouts', webhookController.handleTravelpayoutsWebhook);

// ──────────────────────────────────────────────
//  Hotel Comparison & User Routes
// ──────────────────────────────────────────────

router.post(
  '/compare',
  validateBody({
    hotel_name: { type: 'string', required: true },
    klook_extracted_price: { type: 'object', required: true },
  }),
  compareController.compareHotels
);

router.post(
  '/user/sync-session',
  validateBody({ device_token: { type: 'string', required: true } }),
  userController.syncSession
);

router.post(
  '/user/save-email',
  validateBody({
    device_token: { type: 'string', required: true },
    email: { type: 'string', required: true },
  }),
  userController.saveEmail
);

module.exports = router;
