/**
 * @fileoverview Unit tests for the deeplink generation service.
 * Uses Node.js built-in test runner.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.TRAVELPAYOUTS_MARKER = '740868';
process.env.TRAVELPAYOUTS_TRS = '540934';
process.env.TRAVELPAYOUTS_P_KLOOK = '4110';
process.env.TRAVELPAYOUTS_CAMPAIGN_KLOOK = '137';

// Must be required AFTER env vars are set
const { generateDeeplink } = require('../../services/deeplinkService');

describe('deeplinkService', () => {
  describe('generateDeeplink()', () => {
    it('should generate a valid Travelpayouts URL', () => {
      const link = generateDeeplink('https://www.klook.com/hotel/123', 'Klook');
      assert.ok(link.includes('tp.media/r'), 'Should use tp.media redirect');
      assert.ok(link.includes('marker=740868'), 'Should include marker');
      assert.ok(link.includes('trs=540934'), 'Should include trs');
      assert.ok(link.includes('p=4110'), 'Should include program ID');
      assert.ok(link.includes('campaign_id=137'), 'Should include campaign');
    });

    it('should encode the destination URL', () => {
      const link = generateDeeplink('https://www.klook.com/hotel/123?foo=bar');
      assert.ok(link.includes(encodeURIComponent('https://www.klook.com/hotel/123?foo=bar')));
    });

    it('should include the subid in the marker', () => {
      const link = generateDeeplink('https://www.klook.com', 'Klook', 'CustomSubId');
      assert.ok(link.includes('marker=740868.CustomSubId'));
    });

    it('should default to HotelFinder subid', () => {
      const link = generateDeeplink('https://www.klook.com');
      assert.ok(link.includes('marker=740868.HotelFinder'));
    });

    it('should return the original URL for invalid URLs', () => {
      const link = generateDeeplink('not-a-url');
      assert.equal(link, 'not-a-url');
    });

    it('should return default Klook URL when destination is empty', () => {
      const link = generateDeeplink('');
      assert.ok(link.includes('klook.com') || link === 'https://www.klook.com');
    });
  });
});
