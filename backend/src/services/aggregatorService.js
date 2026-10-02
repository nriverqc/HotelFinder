/**
 * @module aggregatorService
 * @description Multi-source price aggregator with concurrent fetching and timeouts.
 *
 * Fetches prices from multiple providers in parallel using Promise.allSettled
 * with per-provider timeouts. Currently uses the Klook-extracted price as the
 * reference baseline (no random/simulated prices).
 *
 * Future: Add real API integrations for Travelpayouts, Hotellook, etc.
 */

const logger = require('../utils/logger');

/**
 * Wraps a promise with a timeout. Rejects if the promise doesn't resolve
 * within the specified duration.
 *
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Maximum wait time in milliseconds
 * @returns {Promise} Resolves/rejects based on which completes first
 */
function withTimeout(promise, timeoutMs) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timeoutHandle));
}

/**
 * Returns the Klook extracted rate without modification.
 * This is the "official" rate that the user sees on the page.
 *
 * @param {Object} hotelContext - Context with extracted price data
 * @returns {Promise<Object>} Provider price entry
 */
async function fetchKlookRate(hotelContext) {
  const extractedPrice = hotelContext.klook_extracted_price?.displayed_price || 0;
  return {
    provider: 'Klook Official Rate',
    is_mobile_rate: false,
    market: 'direct',
    price: extractedPrice,
    currency: hotelContext.klook_extracted_price?.currency || 'USD',
  };
}

/**
 * Placeholder for future Travelpayouts API integration.
 * Currently returns the same extracted price as a benchmark.
 *
 * @param {Object} hotelContext
 * @returns {Promise<Object>} Provider price entry
 */
async function fetchTravelpayoutsBenchmark(hotelContext) {
  // TODO: Replace with actual Travelpayouts API call when API key is available
  const extractedPrice = hotelContext.klook_extracted_price?.displayed_price || 0;
  return {
    provider: 'Travelpayouts Benchmark',
    is_mobile_rate: false,
    market: 'global',
    price: extractedPrice,
    currency: hotelContext.klook_extracted_price?.currency || 'USD',
  };
}

/**
 * Fetches prices from all configured providers in parallel.
 * Each provider has an individual timeout to prevent slow sources from
 * blocking the response.
 *
 * @param {Object} hotelContext - Hotel search context with extracted price data
 * @returns {Promise<Array>} Array of successful provider price entries
 */
async function fetchPricesFromAllSources(hotelContext) {
  const TIMEOUT_MS = 1500;

  const providers = [
    withTimeout(fetchKlookRate(hotelContext), TIMEOUT_MS),
    withTimeout(fetchTravelpayoutsBenchmark(hotelContext), TIMEOUT_MS),
  ];

  const results = await Promise.allSettled(providers);

  const successful = results
    .filter(res => res.status === 'fulfilled' && res.value !== null && res.value.price > 0)
    .map(res => res.value);

  logger.debug('Aggregator results', {
    total: providers.length,
    successful: successful.length,
  });

  return successful;
}

module.exports = { fetchPricesFromAllSources };
