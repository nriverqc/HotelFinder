# 🏨 HotelFinder

> Chrome extension that finds cheaper hotel rates and earns affiliate commissions by redirecting users through Travelpayouts deeplinks.

## Vision

HotelFinder is a Chrome extension focused on the hotel niche. When a user browses hotel listings on supported providers (Klook, Booking.com), the extension:

1. **Extracts** the displayed hotel price from the page
2. **Compares** it against prices in other currencies/markets (arbitrage)
3. **Shows** the user any savings found, or offers cashback
4. **Redirects** through a Travelpayouts affiliate link if the user books

Revenue comes from Travelpayouts affiliate commissions. A portion of the commission is shared back with users as "cashback."

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CHROME EXTENSION (Manifest V3)                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ Content Script│→ │  Background  │→ │   Popup UI         │     │
│  │ (extraction)  │  │  (API bridge)│  │   (results panel)  │     │
│  └──────────────┘  └──────┬───────┘  └────────────────────┘     │
└─────────────────────────────┼───────────────────────────────────┘
                              │ HTTP POST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND API (Node.js + Express)                                 │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐     │
│  │ Routes   │→ │ Controllers  │→ │ Services              │     │
│  │ /api/v1  │  │ (validation) │  │ • Klook Arbitrage     │     │
│  └──────────┘  └──────────────┘  │ • Currency Conversion │     │
│                                   │ • Deal Engine         │     │
│                                   │ • Deeplink Generator  │     │
│                                   │ • Coupon Service      │     │
│                                   └───────────┬───────────┘     │
│                                               │                  │
│  ┌────────────────┐  ┌────────────────────────┘                 │
│  │ SQLite Database│  │ External APIs                             │
│  │ (users,cashback)│  │ • ExchangeRate API                      │
│  └────────────────┘  │ • Travelpayouts                          │
│                      └──────────────────────────────────────────┘
│
┌─────────────────────────────────────────────────────────────────┐
│  LANDING PAGE (Static HTML/CSS/JS)                               │
│  • Product landing page for Chrome Web Store listing             │
│  • Privacy policy (required by Chrome Web Store)                 │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
HotelFinder/
├── .gitignore
├── README.md                          ← You are here
│
├── backend/                           ← Node.js API server
│   ├── .env                           ← Environment variables (gitignored)
│   ├── .env.example                   ← Template for .env
│   ├── package.json
│   └── src/
│       ├── server.js                  ← Entry point (starts HTTP server)
│       ├── app.js                     ← Express configuration
│       ├── config/
│       │   └── index.js               ← Centralized configuration
│       ├── middleware/
│       │   ├── errorHandler.js        ← Global error handling
│       │   └── validateRequest.js     ← Request body validation
│       ├── controllers/
│       │   ├── compareController.js   ← Hotel comparison endpoint
│       │   ├── klookController.js     ← Klook discount check
│       │   └── userController.js      ← User sessions & cashback
│       ├── routes/
│       │   └── index.js               ← All API route definitions
│       ├── services/
│       │   ├── affiliateService.js    ← Booking.com scraping (experimental)
│       │   ├── aggregatorService.js   ← Multi-source price aggregator
│       │   ├── couponService.js       ← Verified coupon evaluator
│       │   ├── currencyService.js     ← Currency conversion (API + cache)
│       │   ├── dealEngine.js          ← Discount calculation engine
│       │   ├── deeplinkService.js     ← Travelpayouts URL generator
│       │   ├── entityMatcher.js       ← Hotel name fingerprinting
│       │   └── klookArbitrageService.js ← Klook multi-market arbitrage
│       ├── data/
│       │   ├── database.js            ← SQLite database engine
│       │   ├── coupons.json           ← Verified coupon store
│       │   └── hotelfinder.db         ← SQLite database file (auto-created)
│       ├── utils/
│       │   └── logger.js              ← Structured logging utility
│       └── tests/
│           └── services/
│               ├── currencyService.test.js
│               ├── dealEngine.test.js
│               └── deeplinkService.test.js
│
├── extension/                         ← Chrome Extension (Manifest V3)
│   ├── manifest.json                  ← Extension configuration
│   ├── background.js                  ← Service Worker (API bridge)
│   ├── content_script.js              ← Injected into hotel pages
│   └── ui/
│       ├── popup.html                 ← Extension popup markup
│       ├── popup.css                  ← Extension popup styles
│       ├── popup.js                   ← Extension popup logic
│       └── assets/
│           ├── logo_icon.png
│           └── logo_text.png
│
└── frontend/                          ← Landing Page (static)
    ├── index.html                     ← Main landing page
    ├── privacy.html                   ← Privacy policy
    ├── style.css                      ← Styles
    ├── main.js                        ← Interactions
    └── assets/
        ├── hero_bg.png
        ├── logo.png
        ├── logo_icon.png
        ├── logo_text.png
        └── title.png
```

## Development Setup

### Prerequisites
- Node.js >= 18
- npm

### Backend

```bash
cd backend
cp .env.example .env      # Configure your environment variables
npm install
npm run dev               # Starts with nodemon on http://localhost:5000
```

### Extension (Development Mode)

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `extension/` folder
4. Navigate to klook.com or booking.com to test

### Landing Page

```bash
cd frontend
npx serve                 # Or just open index.html in a browser
```

### Running Tests

```bash
cd backend
npm test                  # Runs all unit tests (Node.js built-in test runner)
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/klook/check-discount` | Klook arbitrage + cashback check |
| `POST` | `/api/compare` | Full hotel price comparison |
| `POST` | `/api/compare-live` | Live Booking.com scraping (experimental) |
| `POST` | `/api/user/sync-session` | Create/retrieve anonymous session |
| `POST` | `/api/user/save-email` | Link email for balance recovery |
| `GET`  | `/api/user/account` | Get account + cashback records |
| `POST` | `/api/user/record-cashback` | Record a cashback transaction |
| `GET`  | `/health` | Health check |

## Roadmap

- [ ] Replace Booking.com scraping with official Travelpayouts API
- [ ] Add PostgreSQL for production database
- [ ] Add Redis caching layer
- [ ] Implement real cashback payout system
- [ ] Add more hotel providers
- [ ] CI/CD pipeline
- [ ] Docker deployment
- [ ] Admin dashboard for cashback management

## License

All rights reserved © 2026 HotelFinder.
