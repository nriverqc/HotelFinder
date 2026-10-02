/**
 * @module webhookController
 * @description Ingestion controller for Travelpayouts / affiliate partner postbacks.
 *
 * Implements:
 * - Authentication via HMAC SHA-256 signature verification or secure webhook token.
 * - Replay attack prevention: Rejects payloads with timestamps older than 24 hours.
 * - Idempotency: Duplicate events with the same event_id are safely ignored.
 * - Confirmation of credit lots when stays complete.
 *
 * Endpoint: POST /api/webhooks/travelpayouts
 */

const crypto = require('crypto');
const db = require('../data/database');
const logger = require('../utils/logger');

const WEBHOOK_SECRET = process.env.TRAVELPAYOUTS_WEBHOOK_SECRET || 'hotelfinder_secret_fallback';

function verifyWebhookAuth(req) {
  const token = req.query.token || req.headers['x-webhook-token'];
  if (token && token === WEBHOOK_SECRET) {
    return true;
  }

  const signature = req.headers['x-signature'] || req.headers['x-travelpayouts-signature'];
  if (signature && req.body) {
    try {
      const payloadStr = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payloadStr).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  if (process.env.NODE_ENV === 'development' && !process.env.TRAVELPAYOUTS_WEBHOOK_SECRET) {
    return true;
  }

  return false;
}

async function handleTravelpayoutsWebhook(req, res) {
  try {
    if (!verifyWebhookAuth(req)) {
      logger.warn('Unauthorized webhook request rejected', { ip: req.ip });
      return res.status(401).json({ status: 'error', message: 'Unauthorized webhook' });
    }

    const { event_id, event_type, subid, commission_usd, timestamp } = req.body;

    if (!event_id || !event_type || !subid) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required webhook fields: event_id, event_type, subid',
      });
    }

    // Replay attack mitigation (>24h)
    if (timestamp) {
      const eventTimeMs = timestamp > 9999999999 ? timestamp : timestamp * 1000;
      const ageMs = Date.now() - eventTimeMs;
      if (ageMs > 24 * 60 * 60 * 1000) {
        logger.warn('Rejected stale webhook event (>24h)', { event_id, ageHours: Math.round(ageMs / 3600000) });
        return res.status(400).json({ status: 'error', message: 'Event timestamp expired' });
      }
    }

    const totalCommissionUsd = parseFloat(commission_usd) || 0;
    // User receives 30% of Travelpayouts commission (1.5% of GMV)
    const userCommissionUsd = Math.round((totalCommissionUsd * 0.30) * 100) / 100;
    const commissionCents = db.toCents(userCommissionUsd);

    switch (event_type.toLowerCase()) {
      case 'booking_created':
      case 'pending': {
        await db.recordPendingBookingCredit({
          deviceToken: subid,
          bookingSubid: subid,
          commissionCents,
        });
        break;
      }

      case 'invoice_paid':
      case 'booking_confirmed':
      case 'confirmed': {
        await db.confirmBookingCredit({
          eventId: event_id,
          bookingSubid: subid,
          newCommissionCents: commissionCents,
        });
        break;
      }

      default:
        logger.info('Unhandled webhook event type', { event_type });
    }

    return res.json({ status: 'success', event_id, processed: true });
  } catch (error) {
    logger.error('Error processing Travelpayouts webhook', { error: error.message });
    return res.status(500).json({ status: 'error', message: error.message });
  }
}

module.exports = {
  handleTravelpayoutsWebhook,
  verifyWebhookAuth,
};
