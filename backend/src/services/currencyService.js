/**
 * @module currencyService
 * @description Unified currency conversion service for HotelFinder.
 *
 * Replaces the old duplicated services (currencyService.js + exchangeService.js).
 * Uses ExchangeRate API with node-cache (12h TTL) and hardcoded fallback rates.
 *
 * All price comparisons in HotelFinder use USD as the normalization base.
 *
 * @example
 *   const { convertToUSD, convertFromUSD, convert } = require('./currencyService');
 *
 *   const usd = await convertToUSD(450000, 'COP');  // ~109.76
 *   const cop = await convertFromUSD(100, 'COP');     // ~410000
 *   const eur = await convert(100, 'USD', 'EUR');     // ~92
 */

const NodeCache = require('node-cache');
const config = require('../config');
const logger = require('../utils/logger');

/** In-memory cache for exchange rates. TTL = 12 hours. */
const ratesCache = new NodeCache({ stdTTL: config.exchangeRate.cacheTTLSeconds });

/**
 * Fetches current exchange rates from the API, with cache and fallback.
 * Rates are relative to USD (i.e., 1 USD = X units of target currency).
 *
 * @returns {Promise<Object>} Map of currency code → rate relative to USD
 */
async function getExchangeRates() {
  // 1. Check in-memory cache first
  const cached = ratesCache.get('rates');
  if (cached) {
    return cached;
  }

  // 2. Fetch from external API
  try {
    const response = await fetch(config.exchangeRate.apiUrl);
    const data = await response.json();

    if (data && data.rates) {
      ratesCache.set('rates', data.rates);
      logger.info('Exchange rates fetched and cached successfully');
      return data.rates;
    }
  } catch (error) {
    logger.warn('Failed to fetch exchange rates from API, using fallback', {
      error: error.message,
    });
  }

  // 3. Fallback to hardcoded approximate rates
  return config.exchangeRate.fallbackRates;
}

/**
 * Converts an amount from a specific currency to USD.
 *
 * @param {number} amount - The amount to convert
 * @param {string} fromCurrency - ISO 4217 currency code (e.g., 'COP', 'EUR')
 * @returns {Promise<number>} Amount in USD, rounded to 2 decimals
 */
async function convertToUSD(amount, fromCurrency) {
  const parsed = parseFloat(amount);
  if (isNaN(parsed)) return 0;
  if (fromCurrency === 'USD') return parsed;

  const rates = await getExchangeRates();
  const rate = rates[fromCurrency.toUpperCase()];

  if (!rate) {
    logger.warn(`Unsupported currency: ${fromCurrency}, returning original value`);
    return parsed;
  }

  // rates are "1 USD = X <currency>", so to get USD: amount / rate
  return Math.round((parsed / rate) * 100) / 100;
}

/**
 * Converts an amount from USD to a target currency.
 *
 * @param {number} amountUSD - The amount in USD
 * @param {string} toCurrency - Target ISO 4217 currency code
 * @returns {Promise<number>} Converted amount, rounded to 2 decimals
 */
async function convertFromUSD(amountUSD, toCurrency) {
  const parsed = parseFloat(amountUSD);
  if (isNaN(parsed)) return 0;
  if (toCurrency === 'USD') return parsed;

  const rates = await getExchangeRates();
  const rate = rates[toCurrency.toUpperCase()];

  if (!rate) {
    logger.warn(`Unsupported currency: ${toCurrency}, returning original value`);
    return parsed;
  }

  return Math.round((parsed * rate) * 100) / 100;
}

/**
 * Converts between any two currencies using USD as the intermediary.
 *
 * @param {number} amount - The amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @returns {Promise<number>} Converted amount, rounded to 2 decimals
 */
async function convert(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return parseFloat(amount);

  const usdAmount = await convertToUSD(amount, fromCurrency);
  return convertFromUSD(usdAmount, toCurrency);
}

module.exports = {
  getExchangeRates,
  convertToUSD,
  convertFromUSD,
  convert,
};
