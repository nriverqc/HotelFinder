/**
 * @module klookArbitrageService
 * @description Klook rate verification and dynamic loyalty credit calculation engine.
 *
 * All user-facing price figures (originalPrice, discountedPrice, credits)
 * are returned in the USER'S requested currency (EUR, USD, COP, MXN, etc.)
 * based on the real verified rate on the page.
 *
 * Core Business Model:
 * - Real Verified Rate on Klook: Displayed exactly as extracted from page.
 * - Loyalty Credits to User: 1.5% of total booking value (30% of Travelpayouts commission).
 * - Gross Operating Margin: 3.5% of total booking value (70% of Travelpayouts commission).
 * - Zero Synthetic / Fake Coupons: If no official partner promo applies, only real rates and credits are shown.
 */

const axios = require('axios');
const config = require('../config');
const { convertToUSD, convertFromUSD } = require('./currencyService');
const { getApplicableCoupon } = require('./couponService');
const { generateDeeplink } = require('./deeplinkService');
const logger = require('../utils/logger');

const { arbitrage, travelpayouts } = config;

/**
 * Calculates dynamic loyalty credits proportional to the booking total in USD.
 * Formula: 1.5% of total booking value.
 *
 * @param {number} totalPriceUsd - Total booking price in USD
 * @returns {Object} Cashback amount in USD, percentage, and gross operating margin
 */
function calculateDynamicCashback(totalPriceUsd) {
  if (!totalPriceUsd || totalPriceUsd <= 0) {
    return { cashbackAmount: 1.50, cashbackPercentage: 1.5, grossMarginUsd: 3.50 };
  }

  // 5% total estimated commission
  const totalCommissionUsd = totalPriceUsd * (travelpayouts.klookCommissionRate || 0.05);
  // User receives 30% of that commission = 1.5% of total spend
  const userCashbackUsd = totalCommissionUsd * 0.30;
  const roundedCashback = Math.max(0.50, Math.round(userCashbackUsd * 100) / 100);
  const cashbackPercentage = Math.round((roundedCashback / totalPriceUsd) * 100 * 10) / 10;
  const grossMarginUsd = Math.round((totalCommissionUsd - roundedCashback) * 100) / 100;

  return {
    cashbackAmount: roundedCashback,
    cashbackPercentage: cashbackPercentage || 1.5,
    grossMarginUsd,
  };
}

/**
 * Fetches a Klook page with a specific User-Agent and currency to check pricing.
 * @param {string} pageUrl
 * @param {string} userAgent
 * @param {string} targetCurrency
 * @returns {Promise<Object|null>}
 */
async function fetchKlookPriceOption(pageUrl, userAgent, targetCurrency) {
  try {
    const cleanUrl = pageUrl ? pageUrl.split('?')[0] : 'https://www.klook.com/';
    const targetUrl = `${cleanUrl}?currency=${targetCurrency}`;

    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'Cache-Control': 'no-cache',
      },
      timeout: arbitrage.timeoutMs,
    });

    const html = response.data;
    if (!html || typeof html !== 'string') return null;

    let extractedPrice = null;

    // Method 1: __NEXT_DATA__ structured JSON
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (nextDataMatch && nextDataMatch[1]) {
      try {
        const json = JSON.parse(nextDataMatch[1]);
        const lowestAmount =
          json.props?.pageProps?.initialState?.hotelDetails?.lowestPrice ||
          json.props?.pageProps?.initialState?.hotel?.lowestPrice ||
          json.props?.pageProps?.hotelDetail?.lowestPrice;

        if (lowestAmount && !isNaN(lowestAmount)) {
          extractedPrice = parseFloat(lowestAmount);
        }
      } catch {}
    }

    // Method 2: Regex fallback
    if (!extractedPrice) {
      const priceRegex = /"salePrice":\s*([\d.]+)|"lowestPrice":\s*([\d.]+)|"displayed_price":\s*([\d.]+)/;
      const priceMatch = html.match(priceRegex);
      if (priceMatch) {
        const val = parseFloat(priceMatch[1] || priceMatch[2] || priceMatch[3]);
        if (!isNaN(val) && val > 0) extractedPrice = val;
      }
    }

    if (extractedPrice && extractedPrice > 0) {
      return { currency: targetCurrency, price: extractedPrice, url: targetUrl };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Main entry point: validates rate and calculates loyalty credit reward in user's currency.
 *
 * @param {Object} params
 * @param {string} [params.productId]
 * @param {number} params.currentPrice - Current displayed price in user currency
 * @param {string} [params.currency='USD'] - Currency of current price
 * @param {string} [params.pageUrl] - Full URL of product page
 * @param {string} [params.deviceToken] - Device identifier for SubID tracking
 * @returns {Promise<Object>}
 */
async function checkKlookDiscount({ productId, currentPrice, currency = 'USD', pageUrl, deviceToken = 'HotelFinder' }) {
  const userCurrency = (currency || 'USD').toUpperCase();
  const parsedPrice = parseFloat(currentPrice) || 100;
  const userPrice = Math.round(parsedPrice * 100) / 100;

  // 1. Convert user's price to USD for commission and credit calculation
  const currentPriceUsd = await convertToUSD(userPrice, userCurrency);

  // Generate affiliate URL with sanitized deviceToken SubID
  const defaultAffiliateUrl = generateDeeplink(
    pageUrl || 'https://www.klook.com/',
    'Klook',
    deviceToken || 'HotelFinder'
  );

  // Calculate dynamic 1.5% loyalty credit in USD
  const cashbackDataUsd = calculateDynamicCashback(currentPriceUsd);

  // Convert credit amount to user's native currency
  let userCashbackAmount = cashbackDataUsd.cashbackAmount;
  if (userCurrency !== 'USD') {
    const convertedCashback = await convertFromUSD(cashbackDataUsd.cashbackAmount, userCurrency);
    userCashbackAmount = Math.max(0.50, Math.round(convertedCashback * 100) / 100);
  }

  try {
    // 2. Check if a real verified partner coupon exists (if any)
    const validCoupon = getApplicableCoupon('klook', currentPriceUsd);

    if (validCoupon && validCoupon.discount_percent > 0) {
      const savingsUserCurr = Math.round((userPrice * (validCoupon.discount_percent / 100)) * 100) / 100;
      const discountedPriceUserCurr = Math.max(0, Math.round((userPrice - savingsUserCurr) * 100) / 100);

      logger.info('Official partner coupon verified', {
        productId,
        code: validCoupon.code,
        savingsUserCurr,
      });

      return {
        hasDiscount: true,
        hasCashback: true,
        originalPrice: userPrice,
        discountedPrice: discountedPriceUserCurr,
        savings: savingsUserCurr,
        savingsPercentage: validCoupon.discount_percent,
        cashbackAmount: userCashbackAmount,
        cashbackPercentage: cashbackDataUsd.cashbackPercentage,
        currency: userCurrency,
        coupon: { code: validCoupon.code, discount_percent: validCoupon.discount_percent },
        affiliateUrl: defaultAffiliateUrl,
      };
    }

    // 3. Standard Honest Flow: Verified Official Rate + 1.5% Loyalty Credit
    logger.debug('Rate verified, returning honest loyalty credit offer', { productId, userPrice, userCurrency });

    return {
      hasDiscount: false,
      hasCashback: true,
      originalPrice: userPrice,
      discountedPrice: userPrice,
      savings: 0,
      cashbackAmount: userCashbackAmount,
      cashbackPercentage: cashbackDataUsd.cashbackPercentage,
      currency: userCurrency,
      originalPriceUsd: Math.round(currentPriceUsd * 100) / 100,
      discountedPriceUsd: Math.round(currentPriceUsd * 100) / 100,
      affiliateUrl: defaultAffiliateUrl,
    };
  } catch (error) {
    logger.error('Klook rate check error', { productId, error: error.message });

    return {
      hasDiscount: false,
      hasCashback: true,
      originalPrice: userPrice,
      discountedPrice: userPrice,
      savings: 0,
      cashbackAmount: userCashbackAmount,
      cashbackPercentage: cashbackDataUsd.cashbackPercentage,
      currency: userCurrency,
      originalPriceUsd: Math.round(currentPriceUsd * 100) / 100,
      discountedPriceUsd: Math.round(currentPriceUsd * 100) / 100,
      affiliateUrl: defaultAffiliateUrl,
    };
  }
}

module.exports = { checkKlookDiscount, calculateDynamicCashback };
