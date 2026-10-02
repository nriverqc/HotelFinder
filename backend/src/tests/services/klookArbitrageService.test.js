/**
 * @fileoverview Unit tests for klookArbitrageService.
 * Verifies multi-currency calculations and honest 1.5% loyalty credit rewards.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const { checkKlookDiscount, calculateDynamicCashback } = require('../../services/klookArbitrageService');

describe('klookArbitrageService', () => {
  describe('calculateDynamicCashback()', () => {
    it('should calculate 1.5% proportional loyalty credits on USD total', () => {
      const result = calculateDynamicCashback(200);
      assert.ok(result.cashbackAmount > 0, 'Cashback should be positive');
      assert.equal(result.cashbackPercentage, 1.5);
      assert.equal(result.cashbackAmount, 3.0); // 1.5% of $200
    });

    it('should return minimum default credit for zero spend', () => {
      const result = calculateDynamicCashback(0);
      assert.equal(result.cashbackAmount, 1.5);
    });
  });

  describe('checkKlookDiscount() currency preservation', () => {
    it('should return figures in the requested native currency (EUR)', async () => {
      const inputPrice = 246.02;
      const result = await checkKlookDiscount({
        productId: 'hilton_bogota',
        currentPrice: inputPrice,
        currency: 'EUR',
        pageUrl: 'https://www.klook.com/es/hotels/detail/12345',
      });

      assert.equal(result.currency, 'EUR', 'Currency must match user currency');
      assert.equal(result.originalPrice, 246.02, 'Original price must be exactly what user sees');
      assert.ok(result.discountedPrice <= result.originalPrice, 'Discounted price cannot exceed original');
      assert.ok(decodeURIComponent(result.affiliateUrl).includes('hotelfinder_active=true'), 'Affiliate URL must be tagged');
    });

    it('should return honest verified rate and 1.5% loyalty credit in EUR', async () => {
      const result = await checkKlookDiscount({
        productId: 'hilton_bogota',
        currentPrice: 246.02,
        currency: 'EUR',
        pageUrl: 'https://www.klook.com/es/hotels/detail/12345',
      });

      assert.equal(result.hasDiscount, false);
      assert.equal(result.hasCashback, true);
      assert.equal(result.originalPrice, 246.02);
      assert.ok(result.cashbackAmount > 0);
    });

    it('should handle USD currency without conversion loss', async () => {
      const result = await checkKlookDiscount({
        productId: 'hotel_usd',
        currentPrice: 100,
        currency: 'USD',
      });

      assert.equal(result.currency, 'USD');
      assert.equal(result.originalPrice, 100);
      assert.equal(result.cashbackAmount, 1.5); // 1.5% of $100
    });
  });
});
