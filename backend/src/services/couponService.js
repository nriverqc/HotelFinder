/**
 * @module couponService
 * @description Evaluates applicable coupons from a local verified coupon store.
 *
 * Coupons are loaded from a JSON file and cached in memory after first read.
 * Each coupon has an `active` flag and a minimum spend threshold.
 *
 * @example
 *   const { getApplicableCoupon } = require('./couponService');
 *   const coupon = getApplicableCoupon('klook', 200); // totalUsd = $200
 *   // => { code: 'HOTELVIP10', discount_percent: 10, savings_usd: 20, ... }
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const COUPONS_FILE = path.join(__dirname, '../data/coupons.json');

/** In-memory coupon cache. Loaded once on first call. */
let cachedCoupons = null;

/**
 * Loads coupons from the JSON file. Caches the result in memory.
 * @returns {Array} Array of coupon objects
 */
function loadCoupons() {
  if (cachedCoupons !== null) {
    return cachedCoupons;
  }

  try {
    if (!fs.existsSync(COUPONS_FILE)) {
      logger.warn('Coupons file not found', { path: COUPONS_FILE });
      cachedCoupons = [];
      return cachedCoupons;
    }

    const raw = fs.readFileSync(COUPONS_FILE, 'utf8');
    cachedCoupons = JSON.parse(raw);
    logger.info('Coupons loaded', { count: cachedCoupons.length });
    return cachedCoupons;
  } catch (error) {
    logger.error('Error loading coupons', { error: error.message });
    cachedCoupons = [];
    return cachedCoupons;
  }
}

/**
 * Finds the best applicable coupon for a given platform and spend amount.
 *
 * Rules:
 * - Coupon must be `active: true`
 * - Coupon platform must match (case-insensitive)
 * - Total USD spend must meet the `min_spend_usd` threshold
 * - Returns the coupon with the highest discount percentage
 *
 * @param {string} [platform='klook'] - Platform name to filter by
 * @param {number} [totalUsd=0] - Total booking amount in USD
 * @returns {Object|null} Best coupon or null if none applicable
 */
function getApplicableCoupon(platform = 'klook', totalUsd = 0) {
  const coupons = loadCoupons();
  const platformKey = platform.toLowerCase();

  // Filter active coupons for the platform that meet minimum spend
  const validCoupons = coupons.filter(c =>
    c.active &&
    platformKey.includes(c.platform.toLowerCase()) &&
    totalUsd >= c.min_spend_usd
  );

  if (validCoupons.length === 0) {
    return null;
  }

  // Pick the one with highest discount percentage
  validCoupons.sort((a, b) => b.discount_percent - a.discount_percent);
  const best = validCoupons[0];

  const savingsUsd = Math.round((totalUsd * (best.discount_percent / 100)) * 100) / 100;

  return {
    code: best.code,
    discount_percent: best.discount_percent,
    savings_usd: savingsUsd,
    min_spend_usd: best.min_spend_usd,
    description: best.description,
  };
}

/**
 * Clears the in-memory coupon cache. Useful for testing or hot-reloading coupons.
 */
function clearCache() {
  cachedCoupons = null;
}

module.exports = { getApplicableCoupon, clearCache };
