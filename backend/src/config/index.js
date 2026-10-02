/**
 * @module config
 * @description Centralized configuration for the HotelFinder backend.
 * All environment variables and application constants are defined here.
 * Import this module instead of reading process.env directly.
 */
require('dotenv').config();

const config = {
  /** Server configuration */
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',
    isDev: (process.env.NODE_ENV || 'development') === 'development',
  },

  /** Travelpayouts affiliate program credentials */
  travelpayouts: {
    marker: process.env.TRAVELPAYOUTS_MARKER || '',
    trs: process.env.TRAVELPAYOUTS_TRS || '',
    pKlook: process.env.TRAVELPAYOUTS_P_KLOOK || '4110',
    campaignKlook: process.env.TRAVELPAYOUTS_CAMPAIGN_KLOOK || '137',
    klookCommissionRate: parseFloat(process.env.TRAVELPAYOUTS_KLOOK_COMMISSION_RATE) || 0.05,
    userCashbackShare: parseFloat(process.env.USER_CASHBACK_SHARE_PERCENT) || 0.50,
  },

  /** Exchange rate API configuration */
  exchangeRate: {
    apiUrl: process.env.EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD',
    cacheTTLSeconds: 43200, // 12 hours
    /** Fallback rates when API is unavailable (approximate values) */
    fallbackRates: {
      USD: 1, COP: 4100, EUR: 0.92, MXN: 18.5,
      GBP: 0.78, BRL: 5.4, JPY: 150, THB: 35,
      ARS: 900, AUD: 1.55, CAD: 1.36, CHF: 0.88, INR: 83,
    },
  },

  /** Rate limiting configuration */
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  /** Arbitrage engine configuration */
  arbitrage: {
    timeoutMs: 2500,
    minSavingsThresholdPercent: 0.01, // 1% minimum savings to show
    currencyMarkets: ['USD', 'EUR', 'THB', 'JPY', 'GBP', 'BRL'],
    mobileUserAgents: {
      iOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
      Android: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
    },
  },

  /** Database configuration */
  database: {
    path: process.env.DB_PATH || require('path').join(__dirname, '..', 'data', 'hotelfinder.db'),
  },

  /** Logging configuration */
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

module.exports = config;
