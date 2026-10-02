/**
 * @module database
 * @description SQLite database engine for HotelFinder v2 (Camino A1: Honest Progressive Accumulation & Milestone Tier Rewards).
 */

const sqlite3 = require('sqlite3').verbose();
const config = require('../config');
const logger = require('../utils/logger');

const DB_PATH = config.database.path;
let db = null;

// ──────────────────────────────────────────────
//  Reward Milestone Tier Definitions
// ──────────────────────────────────────────────

const REWARD_TIERS_CENTS = [
  { id: 'tier_1', amountUsd: 3.00, amountCents: 300, label: 'Cupón Klook $3 USD' },
  { id: 'tier_2', amountUsd: 10.00, amountCents: 1000, label: 'Tarjeta Regalo Klook $10 USD' },
  { id: 'tier_3', amountUsd: 25.00, amountCents: 2500, label: 'Tarjeta Regalo Klook $25 USD' },
];

// ──────────────────────────────────────────────
//  Helper Utilities (Cents <-> USD)
// ──────────────────────────────────────────────

function toCents(dollars) {
  const parsed = parseFloat(dollars);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

function toUsd(cents) {
  const parsed = parseInt(cents, 10);
  if (isNaN(parsed)) return 0.00;
  return Math.round((parsed / 100) * 100) / 100;
}

// ──────────────────────────────────────────────
//  Promise Wrappers for sqlite3
// ──────────────────────────────────────────────

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ──────────────────────────────────────────────
//  Database Initialization & Migrations
// ──────────────────────────────────────────────

async function initialize() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('Failed to open database', { path: DB_PATH, error: err.message });
        return reject(err);
      }
      logger.info('Database connection established (v2 Milestone Rewards)', { path: DB_PATH });
      runMigrations().then(resolve).catch(reject);
    });
  });
}

async function runMigrations() {
  // 1. Users / Device Tokens
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_token TEXT UNIQUE NOT NULL,
      email TEXT,
      balance_pending_cents INTEGER DEFAULT 0 CHECK (balance_pending_cents >= 0),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_users_device ON users(device_token)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

  // 2. Credit Ledger (Individual confirmed lots)
  await run(`
    CREATE TABLE IF NOT EXISTS credit_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_token TEXT NOT NULL,
      booking_subid TEXT UNIQUE NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      used_cents INTEGER DEFAULT 0 CHECK (used_cents >= 0),
      status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      CHECK (used_cents <= amount_cents),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_ledger_user_status ON credit_ledger(user_id, status, expires_at)`);

  // 3. Reward Claims (Milestone Vouchers / Gift Cards)
  await run(`
    CREATE TABLE IF NOT EXISTS reward_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_token TEXT NOT NULL,
      email TEXT NOT NULL,
      tier_amount_cents INTEGER NOT NULL CHECK (tier_amount_cents > 0),
      status TEXT DEFAULT 'PENDING_FULFILLMENT' CHECK (status IN ('PENDING_FULFILLMENT', 'COMPLETED', 'REJECTED')),
      voucher_code TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_claims_user ON reward_claims(user_id, status)`);

  // 4. Webhook Idempotency Table
  await run(`
    CREATE TABLE IF NOT EXISTS processed_webhooks (
      event_id TEXT PRIMARY KEY,
      provider TEXT DEFAULT 'travelpayouts',
      payload_hash TEXT NOT NULL,
      processed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  logger.info('Database schema v2 (Milestone Rewards) migrated successfully');
}

// ──────────────────────────────────────────────
//  User & Session Operations
// ──────────────────────────────────────────────

async function syncSession(deviceToken) {
  let user = await get('SELECT * FROM users WHERE device_token = ?', [deviceToken]);

  if (!user) {
    const result = await run('INSERT INTO users (device_token) VALUES (?)', [deviceToken]);
    user = await get('SELECT * FROM users WHERE id = ?', [result.lastID]);
    logger.info('New user session created', { deviceToken });
  }

  return user;
}

async function saveEmail(deviceToken, email) {
  const cleanEmail = email.trim().toLowerCase();
  let currentUser = await syncSession(deviceToken);

  const previousUsers = await all(
    'SELECT * FROM users WHERE email = ? AND device_token != ?',
    [cleanEmail, deviceToken]
  );

  if (previousUsers.length > 0) {
    for (const prev of previousUsers) {
      await run(
        'UPDATE credit_ledger SET user_id = ?, device_token = ? WHERE user_id = ?',
        [currentUser.id, deviceToken, prev.id]
      );
      await run(
        'UPDATE reward_claims SET user_id = ?, device_token = ? WHERE user_id = ?',
        [currentUser.id, deviceToken, prev.id]
      );
    }
  }

  await run('UPDATE users SET email = ? WHERE id = ?', [cleanEmail, currentUser.id]);
  await recalculateUserPendingCache(currentUser.id);

  return get('SELECT * FROM users WHERE id = ?', [currentUser.id]);
}

// ──────────────────────────────────────────────
//  Single Source of Truth: Balance & Milestones
// ──────────────────────────────────────────────

async function getAvailableBalanceCents(userId) {
  const row = await get(`
    SELECT COALESCE(SUM(amount_cents - used_cents), 0) AS total_confirmed
    FROM credit_ledger
    WHERE user_id = ? 
      AND status = 'CONFIRMED'
      AND (expires_at > datetime('now') OR expires_at IS NULL)
  `, [userId]);

  return row?.total_confirmed || 0;
}

async function getPendingBalanceCents(userId) {
  const row = await get(`
    SELECT COALESCE(SUM(amount_cents), 0) AS total_pending
    FROM credit_ledger
    WHERE user_id = ? AND status = 'PENDING'
  `, [userId]);
  return row?.total_pending || 0;
}

async function recalculateUserPendingCache(userId) {
  const pendingCents = await getPendingBalanceCents(userId);
  await run('UPDATE users SET balance_pending_cents = ? WHERE id = ?', [pendingCents, userId]);
}

function calculateMilestoneProgress(availableCents) {
  const cents = Math.max(0, availableCents || 0);

  let targetTier = REWARD_TIERS_CENTS[0];
  let claimableTiers = [];

  for (const tier of REWARD_TIERS_CENTS) {
    if (cents >= tier.amountCents) {
      claimableTiers.push(tier);
    }
  }

  for (const tier of REWARD_TIERS_CENTS) {
    if (cents < tier.amountCents) {
      targetTier = tier;
      break;
    }
    targetTier = tier;
  }

  const percent = targetTier.amountCents > 0
    ? Math.min(100, Math.round((cents / targetTier.amountCents) * 100))
    : 0;

  const remainingCents = Math.max(0, targetTier.amountCents - cents);

  return {
    availableCents: cents,
    availableUsd: toUsd(cents),
    targetTier,
    progressPercent: percent,
    remainingCents,
    remainingUsd: toUsd(remainingCents),
    hasClaimableReward: claimableTiers.length > 0,
    claimableTiers,
    allTiers: REWARD_TIERS_CENTS,
  };
}

// ──────────────────────────────────────────────
//  Atomic Ledger Operations
// ──────────────────────────────────────────────

async function recordPendingBookingCredit({ deviceToken, bookingSubid, commissionCents }) {
  const user = await syncSession(deviceToken);

  const result = await run(`
    INSERT INTO credit_ledger (user_id, device_token, booking_subid, amount_cents, status)
    VALUES (?, ?, ?, ?, 'PENDING')
  `, [user.id, deviceToken, bookingSubid, parseInt(commissionCents, 10)]);

  await recalculateUserPendingCache(user.id);
  return get('SELECT * FROM credit_ledger WHERE id = ?', [result.lastID]);
}

async function confirmBookingCredit({ eventId, bookingSubid, newCommissionCents }) {
  await run('BEGIN IMMEDIATE');

  try {
    if (eventId) {
      const processed = await get('SELECT * FROM processed_webhooks WHERE event_id = ?', [eventId]);
      if (processed) {
        await run('COMMIT');
        logger.info('Duplicate webhook event ignored (idempotent)', { eventId });
        return { success: true, duplicate: true };
      }
      await run('INSERT INTO processed_webhooks (event_id, payload_hash) VALUES (?, ?)', [eventId, bookingSubid]);
    }

    const existingLot = await get('SELECT * FROM credit_ledger WHERE booking_subid = ?', [bookingSubid]);

    if (existingLot) {
      await run(`
        UPDATE credit_ledger 
        SET status = 'CONFIRMED', 
            amount_cents = ?,
            expires_at = datetime('now', '+365 days')
        WHERE id = ?
      `, [parseInt(newCommissionCents, 10), existingLot.id]);
      await recalculateUserPendingCache(existingLot.user_id);
    }

    await run('COMMIT');
    logger.info('Booking credit confirmed (+365 days)', { bookingSubid, newCommissionCents });
    return { success: true, duplicate: false };
  } catch (error) {
    try { await run('ROLLBACK'); } catch {}
    logger.error('Error in confirmBookingCredit, rolled back', { error: error.message });
    throw error;
  }
}

async function claimRewardVoucher({ deviceToken, email, tierCents }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Debes ingresar un correo electrónico válido para recibir tu tarjeta de regalo.');
  }

  const requestedCents = parseInt(tierCents, 10);
  const user = await syncSession(deviceToken);
  const confirmedBalanceCents = await getAvailableBalanceCents(user.id);

  if (confirmedBalanceCents < requestedCents) {
    throw new Error(`Saldo insuficiente. Tienes $${toUsd(confirmedBalanceCents)} USD y la meta seleccionada requiere $${toUsd(requestedCents)} USD.`);
  }

  await run('BEGIN IMMEDIATE');

  try {
    await saveEmail(deviceToken, cleanEmail);

    // Consume tierCents from oldest confirmed lots (FIFO)
    const eligibleLots = await all(`
      SELECT id, amount_cents, used_cents
      FROM credit_ledger
      WHERE user_id = ?
        AND status = 'CONFIRMED'
        AND (amount_cents - used_cents) > 0
        AND (expires_at > datetime('now') OR expires_at IS NULL)
      ORDER BY expires_at ASC, id ASC
    `, [user.id]);

    let remainingToDeduct = requestedCents;

    for (const lot of eligibleLots) {
      if (remainingToDeduct <= 0) break;
      const availableInLot = lot.amount_cents - lot.used_cents;
      const deduct = Math.min(availableInLot, remainingToDeduct);

      await run(`
        UPDATE credit_ledger
        SET used_cents = used_cents + ?
        WHERE id = ?
      `, [deduct, lot.id]);

      remainingToDeduct -= deduct;
    }

    const claimRes = await run(`
      INSERT INTO reward_claims (user_id, device_token, email, tier_amount_cents, status)
      VALUES (?, ?, ?, ?, 'PENDING_FULFILLMENT')
    `, [user.id, deviceToken, cleanEmail, requestedCents]);

    await run('COMMIT');

    logger.info('Reward voucher claimed successfully', {
      userId: user.id,
      claimId: claimRes.lastID,
      email: cleanEmail,
      tierUsd: toUsd(requestedCents),
    });

    return {
      success: true,
      claimId: claimRes.lastID,
      tierAmountUsd: toUsd(requestedCents),
      email: cleanEmail,
      status: 'PENDING_FULFILLMENT',
      message: `¡Felicidades! Tu solicitud para la tarjeta de regalo de $${toUsd(requestedCents)} USD ha sido registrada. Te enviaremos tu código oficial a ${cleanEmail}.`,
    };
  } catch (error) {
    try { await run('ROLLBACK'); } catch {}
    logger.error('Error claiming reward voucher', { error: error.message });
    throw error;
  }
}

async function runDailyLedgerMaintenance() {
  logger.info('Running daily loyalty ledger maintenance...');
  try {
    const expired = await run(`
      UPDATE credit_ledger
      SET status = 'EXPIRED'
      WHERE status = 'CONFIRMED'
        AND expires_at <= datetime('now')
    `);

    const allUsers = await all('SELECT id FROM users');
    for (const u of allUsers) {
      await recalculateUserPendingCache(u.id);
    }

    logger.info('Maintenance complete', { expiredLots: expired.changes });
  } catch (error) {
    logger.error('Error in maintenance', { error: error.message });
  }
}

async function getUserAccount(deviceToken) {
  const user = await syncSession(deviceToken);
  const availableCents = await getAvailableBalanceCents(user.id);
  const pendingCents = await getPendingBalanceCents(user.id);
  const milestone = calculateMilestoneProgress(availableCents);

  const history = await all(`
    SELECT id, booking_subid, amount_cents, used_cents, status, expires_at, created_at
    FROM credit_ledger
    WHERE user_id = ?
    ORDER BY created_at DESC
  `, [user.id]);

  const claims = await all(`
    SELECT id, email, tier_amount_cents, status, voucher_code, created_at, completed_at
    FROM reward_claims
    WHERE user_id = ?
    ORDER BY created_at DESC
  `, [user.id]);

  return {
    user: {
      device_token: user.device_token,
      email: user.email,
      available_balance_cents: availableCents,
      available_balance_usd: toUsd(availableCents),
      pending_balance_cents: pendingCents,
      pending_balance_usd: toUsd(pendingCents),
    },
    milestone,
    history: history.map(h => ({
      ...h,
      amount_usd: toUsd(h.amount_cents),
      used_usd: toUsd(h.used_cents),
    })),
    claims: claims.map(c => ({
      ...c,
      tier_amount_usd: toUsd(c.tier_amount_cents),
    })),
  };
}

function close() {
  if (db) {
    db.close((err) => {
      if (err) logger.error('Error closing database', { error: err.message });
      else logger.info('Database connection closed');
    });
  }
}

module.exports = {
  initialize,
  close,
  toCents,
  toUsd,
  syncSession,
  saveEmail,
  getAvailableBalanceCents,
  getPendingBalanceCents,
  calculateMilestoneProgress,
  recordPendingBookingCredit,
  confirmBookingCredit,
  claimRewardVoucher,
  runDailyLedgerMaintenance,
  getUserAccount,
  REWARD_TIERS_CENTS,
};
