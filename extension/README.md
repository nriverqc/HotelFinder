# Extension — HotelFinder Chrome Extension

Chrome Manifest V3 extension that detects hotel pages and shows price comparisons.

## Loading in Development

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. Navigate to a supported site to test

## Supported Sites

- `*.klook.com` — Full support (arbitrage + cashback + room options)
- `*.booking.com` — Basic support (price extraction + comparison)
- `*.expedia.com` — Basic support (price extraction)

## Architecture

```
extension/
├── manifest.json        ← Extension config (permissions, scripts, icons)
├── background.js        ← Service Worker — bridges content script ↔ API
├── content_script.js    ← Injected into hotel pages — extraction + UI
└── ui/
    ├── popup.html       ← Extension popup markup
    ├── popup.css        ← Popup styles
    ├── popup.js         ← Popup logic (reads from chrome.storage)
    └── assets/          ← Logo images
```

## Message Flow

```
Content Script                Background Worker              Backend API
     │                              │                             │
     │ ── sendMessage ──────────>   │                             │
     │    CHECK_KLOOK_DISCOUNT      │ ── fetch POST ──────────>  │
     │    or COMPARE_HOTEL          │    /api/klook/check-discount│
     │                              │                             │
     │                              │ <── JSON response ────────  │
     │ <── sendResponse ──────────  │                             │
     │    {hasDiscount, cashback}    │                             │
     │                              │                             │
     │ ── chrome.storage.set ──>    │                             │
     │                              │                             │
     │                         Popup (reads storage)              │
```

## Content Script Features

- **Klook __NEXT_DATA__ extraction**: Reads structured JSON for precise pricing
- **DOM fallback extraction**: Scrapes price selectors when JSON unavailable
- **MutationObserver**: Watches for DOM changes (date picker, filters)
- **Debounced scanning**: 600ms debounce to avoid excessive API calls
- **Affiliate detection**: Detects when user is browsing through an active deeplink
- **Floating banner UI**: Renders discount/cashback banners directly on the page

## Configuration

The backend API URL is configured in `background.js`:

```javascript
const API_BASE_URL = "http://localhost:5000/api";
```

For production, update this to your deployed backend URL.
