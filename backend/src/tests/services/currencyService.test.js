/**
 * @fileoverview Unit tests for the currency conversion service.
 * Uses Node.js built-in test runner (no external test framework needed).
 *
 * Run: npm test
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// We need to set up config before importing the service
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

const { convertToUSD, convertFromUSD, convert } = require('../../services/currencyService');

describe('currencyService', () => {
  describe('convertToUSD()', () => {
    it('should return the same amount when currency is USD', async () => {
      const result = await convertToUSD(100, 'USD');
      assert.equal(result, 100);
    });

    it('should convert EUR to USD (approximately)', async () => {
      const result = await convertToUSD(92, 'EUR');
      assert.ok(result > 0, 'Result should be positive');
      // With fallback rates: 92 EUR / 0.92 rate = 100 USD
      assert.ok(result > 50 && result < 200, `Expected ~100 USD, got ${result}`);
    });

    it('should convert COP to USD (large numbers)', async () => {
      const result = await convertToUSD(4100000, 'COP');
      assert.ok(result > 0, 'Result should be positive');
      // ~1000 USD with fallback rates
      assert.ok(result > 500 && result < 2000, `Expected ~1000 USD, got ${result}`);
    });

    it('should return 0 for NaN input', async () => {
      const result = await convertToUSD('not-a-number', 'EUR');
      assert.equal(result, 0);
    });

    it('should handle unsupported currencies gracefully', async () => {
      const result = await convertToUSD(100, 'FAKE');
      assert.equal(result, 100); // Returns original value
    });
  });

  describe('convertFromUSD()', () => {
    it('should return the same amount when currency is USD', async () => {
      const result = await convertFromUSD(100, 'USD');
      assert.equal(result, 100);
    });

    it('should convert USD to COP', async () => {
      const result = await convertFromUSD(100, 'COP');
      assert.ok(result > 100000, `Expected large COP value, got ${result}`);
    });
  });

  describe('convert()', () => {
    it('should return the same amount for same-currency conversion', async () => {
      const result = await convert(100, 'EUR', 'EUR');
      assert.equal(result, 100);
    });

    it('should convert between two non-USD currencies', async () => {
      const result = await convert(100, 'EUR', 'GBP');
      assert.ok(result > 0, 'Result should be positive');
    });
  });
});
