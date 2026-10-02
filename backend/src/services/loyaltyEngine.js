/**
 * @module loyaltyEngine
 * @description Core loyalty discount calculation engine for HotelFinder v2.
 *
 * Implements the 20% anti-abuse cap rule:
 *   maxApplicableCents = Math.min(availableBalanceCents, Math.floor(bookingAmountCents * 0.20))
 *
 * Operates purely in integer cents for zero-loss financial accuracy.
 * Handles spot conversion to the user's native currency (EUR, COP, MXN, etc.)
 * at the exact moment of query/holding.
 */

const { convertToUSD, convertFromUSD } = require('./currencyService');
const { toCents, toUsd } = require('../data/database');
const logger = require('../utils/logger');

/**
 * Calculates the applicable loyalty credit for a new booking.
 *
 * @param {Object} params
 * @param {number} params.availableBalanceCents - User's confirmed spendable balance in cents
 * @param {number} params.bookingAmount - Booking amount in user's currency
 * @param {string} [params.currency='USD'] - ISO currency code
 * @returns {Promise<Object>} Structured loyalty discount summary in user currency + USD
 */
async function calculateApplicableCredit({ availableBalanceCents, bookingAmount, currency = 'USD' }) {
  const userCurr = (currency || 'USD').toUpperCase();
  const parsedBooking = parseFloat(bookingAmount) || 0;

  // 1. Convert booking amount to USD cents
  const bookingUsd = await convertToUSD(parsedBooking, userCurr);
  const bookingCents = toCents(bookingUsd);

  // 2. Apply 20% anti-abuse cap rule in integer cents
  const maxCapCents = Math.floor(bookingCents * 0.20);
  const applicableCents = Math.max(0, Math.min(availableBalanceCents || 0, maxCapCents));
  const remainingAvailableCents = Math.max(0, (availableBalanceCents || 0) - applicableCents);

  // 3. Convert applicable credit back to user's currency (Spot conversion)
  let applicableUserCurrency = 0;
  let availableUserCurrency = 0;

  if (userCurr === 'USD') {
    applicableUserCurrency = toUsd(applicableCents);
    availableUserCurrency = toUsd(availableBalanceCents);
  } else {
    const convertedApplicable = await convertFromUSD(toUsd(applicableCents), userCurr);
    const convertedAvailable = await convertFromUSD(toUsd(availableBalanceCents), userCurr);
    applicableUserCurrency = Math.round(convertedApplicable * 100) / 100;
    availableUserCurrency = Math.round(convertedAvailable * 100) / 100;
  }

  const effectiveDiscountPercent = parsedBooking > 0
    ? Math.round((applicableUserCurrency / parsedBooking) * 100 * 10) / 10
    : 0;

  logger.debug('Loyalty calculation result', {
    userCurr,
    bookingCents,
    availableCents: availableBalanceCents,
    applicableCents,
    applicableUserCurrency,
  });

  return {
    hasLoyaltyDiscount: applicableCents > 0,
    availableBalanceCents,
    availableBalanceUsd: toUsd(availableBalanceCents),
    availableBalanceUserCurrency: availableUserCurrency,
    applicableCents,
    applicableUsd: toUsd(applicableCents),
    applicableUserCurrency,
    remainingBalanceCents: remainingAvailableCents,
    remainingBalanceUsd: toUsd(remainingAvailableCents),
    effectiveDiscountPercent,
    currency: userCurr,
    disclaimer: 'Descuento aproximado sujeto a la tasa de cambio vigente al confirmar tu reserva.',
  };
}

module.exports = {
  calculateApplicableCredit,
  toCents,
  toUsd,
};
