/**
 * @fileoverview Unit tests for the deal engine.
 * Uses Node.js built-in test runner.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const { calculateRealDiscount } = require('../../services/dealEngine');

describe('dealEngine', () => {
  describe('calculateRealDiscount()', () => {
    it('should return OFFICIAL_VERIFIED when no coupon applies', async () => {
      const extracted = {
        displayed_price: 30,
        currency: 'USD',
      };
      const competitors = [];

      const result = await calculateRealDiscount(extracted, competitors);

      assert.equal(result.is_real_discount, false);
      assert.equal(result.discount_quality, 'OFFICIAL_VERIFIED');
      assert.equal(result.current_offer.price_usd, 30);
      assert.equal(result.current_offer.final_price_usd, 30);
      assert.equal(result.savings.amount_usd, 0);
    });

    it('should return verified official rate for standard hotel listings', async () => {
      const extracted = {
        displayed_price: 200,
        currency: 'USD',
      };
      const competitors = [];

      const result = await calculateRealDiscount(extracted, competitors, 'klook');

      assert.equal(result.is_real_discount, false);
      assert.equal(result.discount_quality, 'OFFICIAL_VERIFIED');
      assert.equal(result.current_offer.price_usd, 200);
      assert.equal(result.current_offer.final_price_usd, 200);
    });

    it('should process room options and convert to USD', async () => {
      const extracted = {
        displayed_price: 100,
        currency: 'USD',
        room_options: [
          { room_name: 'Standard', bed_type: '1 King', price: 100, currency: 'USD' },
          { room_name: 'Deluxe', bed_type: '2 Queens', price: 150, currency: 'USD' },
        ],
      };
      const competitors = [];

      const result = await calculateRealDiscount(extracted, competitors);

      assert.equal(result.room_options.length, 2);
      assert.equal(result.room_options[0].room_name, 'Standard');
      assert.equal(result.room_options[1].room_name, 'Deluxe');
      assert.ok(result.room_options[0].price_usd > 0);
    });

    it('should handle empty room_options gracefully', async () => {
      const extracted = {
        displayed_price: 100,
        currency: 'USD',
        room_options: [],
      };
      const competitors = [];

      const result = await calculateRealDiscount(extracted, competitors);
      assert.equal(result.room_options.length, 0);
    });

    it('should return null coupon when none applies', async () => {
      const extracted = {
        displayed_price: 10,
        currency: 'USD',
      };
      const competitors = [];

      const result = await calculateRealDiscount(extracted, competitors);
      assert.equal(result.coupon, null);
    });
  });
});
