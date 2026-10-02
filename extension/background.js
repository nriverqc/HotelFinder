/**
 * @module background
 * @description Service Worker for HotelFinder Chrome Extension (Manifest V3).
 *
 * Acts as a privileged bridge between the content script (which runs on
 * hotel provider pages) and the HotelFinder backend API. The content script
 * cannot make cross-origin requests directly, so it sends messages here.
 *
 * Message Actions:
 * - CHECK_KLOOK_DISCOUNT: Checks for Klook price arbitrage
 * - COMPARE_HOTEL: Runs the full hotel comparison pipeline
 *
 * All results are also persisted to chrome.storage.local so the popup
 * can display them even after the content script tab changes.
 */

// ──────────────────────────────────────────────
//  Configuration
// ──────────────────────────────────────────────

/**
 * Backend API base URL.
 * In production, replace with the deployed API URL.
 * @type {string}
 */
const API_BASE_URL = "http://localhost:5000/api";

const ENDPOINTS = {
  klookCheckDiscount: `${API_BASE_URL}/klook/check-discount`,
  compareHotel: `${API_BASE_URL}/v1/compare`,
};

// ──────────────────────────────────────────────
//  Message Handler
// ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CHECK_KLOOK_DISCOUNT") {
    handleKlookDiscount(request.data, sendResponse);
    return true; // Keep the message channel open for async response
  }

  if (request.action === "COMPARE_HOTEL") {
    handleCompareHotel(request.data, sendResponse);
    return true;
  }

  // Handle request for latest data from popup
  if (request.action === "GET_HOTEL_DATA") {
    chrome.storage.local.get(['lastHotelData'], (res) => {
      sendResponse({ data: res.lastHotelData || null });
    });
    return true;
  }
});

// ──────────────────────────────────────────────
//  API Handlers
// ──────────────────────────────────────────────

/**
 * Sends the extracted Klook data to the backend for discount checking.
 *
 * @param {Object} payload - Extracted hotel/activity data from content script
 * @param {Function} sendResponse - Chrome message response callback
 */
function handleKlookDiscount(payload, sendResponse) {
  fetch(ENDPOINTS.klookCheckDiscount, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(response => response.json())
    .then(data => {
      // Persist to storage for popup access
      chrome.storage.local.set({
        lastKlookResult: { reqData: payload, response: data },
      });
      sendResponse(data);
    })
    .catch(error => {
      console.error("HotelFinder: Klook API error:", error.message);
      sendResponse({ hasDiscount: false, error: error.message });
    });
}

/**
 * Sends extracted hotel data to the backend for full comparison.
 *
 * @param {Object} payload - Hotel context with extracted price data
 * @param {Function} sendResponse - Chrome message response callback
 */
function handleCompareHotel(payload, sendResponse) {
  fetch(ENDPOINTS.compareHotel, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(response => response.json())
    .then(data => {
      if (data && data.status === 'success' && data.comparison) {
        const latestResult = {
          reqDataUi: payload,
          comparison: data.comparison,
        };

        chrome.storage.local.set({ lastHotelData: latestResult });
        sendResponse({
          status: 'success',
          comparison: data.comparison,
          reqDataUi: payload,
        });
      } else {
        sendResponse({ status: 'error', message: 'Invalid server response' });
      }
    })
    .catch(error => {
      console.error("HotelFinder: Compare API error:", error.message);
      sendResponse({ status: 'error', error: error.message });
    });
}
