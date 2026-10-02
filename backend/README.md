# Backend — HotelFinder API

REST API built with Node.js and Express that powers the HotelFinder extension.

## Quick Start

```bash
cp .env.example .env    # Configure environment
npm install             # Install dependencies
npm run dev             # Start with hot-reload (port 5000)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `development` or `production` |
| `TRAVELPAYOUTS_MARKER` | Yes | Your Travelpayouts partner marker ID |
| `TRAVELPAYOUTS_TRS` | Yes | TRS tracking ID |
| `TRAVELPAYOUTS_P_KLOOK` | No | Klook program ID (default: 4110) |
| `TRAVELPAYOUTS_CAMPAIGN_KLOOK` | No | Campaign ID (default: 137) |
| `TRAVELPAYOUTS_KLOOK_COMMISSION_RATE` | No | Commission rate (default: 0.05) |
| `USER_CASHBACK_SHARE_PERCENT` | No | User cashback share (default: 0.50) |
| `ENABLE_BOOKING_SCRAPING` | No | Enable Booking.com scraping (default: false) |
| `LOG_LEVEL` | No | Logging level: error, warn, info, debug |

## Architecture

```
src/
├── server.js          ← Entry point (HTTP startup + graceful shutdown)
├── app.js             ← Express config (middleware, routes, error handling)
├── config/index.js    ← Centralized configuration
├── middleware/         ← Request validation, error handling
├── controllers/       ← Route handlers (thin, delegate to services)
├── services/          ← Business logic (currency, arbitrage, deals)
├── data/              ← Database engine + seed data
├── utils/             ← Logger utility
└── tests/             ← Unit tests (Node.js built-in test runner)
```

## Data Flow

1. Extension sends extracted hotel data → `POST /api/klook/check-discount`
2. Controller validates input → passes to `klookArbitrageService`
3. Service fetches Klook page with different currencies/devices
4. `currencyService` converts all prices to USD
5. `dealEngine` calculates real discount + applies coupons
6. `deeplinkService` generates Travelpayouts affiliate URL
7. Response sent back to extension with discount/cashback data

## Database

SQLite (auto-created at `src/data/hotelfinder.db`). Tables:

- **users**: Anonymous sessions with optional email + balance tracking
- **cashback_records**: Transaction log (always starts as PENDING)

## Testing

```bash
npm test    # Runs all tests in src/tests/
```

Tests use Node.js built-in test runner (no external framework needed).
