/**
 * @module userController
 * @description Controller for user account and cashback management.
 *
 * Handles anonymous session sync, email linking (safety net for reinstalls),
 * account retrieval, and cashback recording.
 *
 * All operations are async since the database is now SQLite-based.
 */

const db = require('../data/database');
const logger = require('../utils/logger');

/**
 * POST /api/user/sync-session
 * Creates or retrieves an anonymous user based on device_token.
 */
async function syncSession(req, res) {
  try {
    const { device_token } = req.body;
    if (!device_token) {
      return res.status(400).json({ status: 'error', message: 'Missing device_token' });
    }

    const user = await db.syncSession(device_token);
    return res.json({ status: 'success', user });
  } catch (error) {
    logger.error('Error in syncSession', { error: error.message });
    return res.status(500).json({ status: 'error', message: error.message });
  }
}

/**
 * POST /api/user/save-email
 * Links an email to the user's device_token. Merges balances from previous
 * sessions with the same email (reinstallation recovery).
 */
async function saveEmail(req, res) {
  try {
    const { device_token, email } = req.body;
    if (!device_token || !email || !email.includes('@')) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email or missing device_token',
      });
    }

    const user = await db.saveEmail(device_token, email);
    return res.json({
      status: 'success',
      message: 'Email linked successfully. Balance secured.',
      user,
    });
  } catch (error) {
    logger.error('Error in saveEmail', { error: error.message });
    return res.status(500).json({ status: 'error', message: error.message });
  }
}

/**
 * GET /api/user/account
 * Retrieves full account info including cashback records.
 * Accepts device_token via query parameter or body.
 */
async function getUserAccount(req, res) {
  try {
    const device_token = req.query.device_token || req.body?.device_token;
    if (!device_token) {
      return res.status(400).json({ status: 'error', message: 'Missing device_token' });
    }

    const account = await db.getUserAccount(device_token);
    return res.json({ status: 'success', ...account });
  } catch (error) {
    logger.error('Error in getUserAccount', { error: error.message });
    return res.status(500).json({ status: 'error', message: error.message });
  }
}

/**
 * POST /api/user/record-cashback
 * Records a cashback transaction. All cashback starts as PENDING
 * until the hotel stay is confirmed by the provider.
 */
async function recordCashback(req, res) {
  try {
    const { device_token, hotelName, roomName, bookingUsd, cashbackUsd } = req.body;
    if (!device_token || !bookingUsd || !cashbackUsd) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required transaction data',
      });
    }

    const record = await db.addCashbackRecord({
      deviceToken: device_token,
      hotelName: hotelName || 'Hotel Klook',
      roomName: roomName || 'Habitación Estándar',
      bookingUsd: parseFloat(bookingUsd),
      cashbackUsd: parseFloat(cashbackUsd),
    });

    return res.json({
      status: 'success',
      notice: 'Balance pending confirmation after stay completion',
      record,
    });
  } catch (error) {
    logger.error('Error in recordCashback', { error: error.message });
    return res.status(500).json({ status: 'error', message: error.message });
  }
}

module.exports = { syncSession, saveEmail, getUserAccount, recordCashback };
