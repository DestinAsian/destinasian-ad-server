# DestinAsian Ad Server Dashboard

Publisher-side ad server and CMS/dashboard for managing campaigns, ad units, and ad channels (internally still modeled as `Inventory` in MongoDB).  
The product focuses on operational metrics only: **impressions, clicks, CTR** (no revenue KPI in the UI).

## Current Features
- Authentication with JWT, owner/editor roles, and owner 2FA flow.
- Account-based access with account selector and account switching.
- Dashboard overview:
  - KPI cards (impressions, clicks, CTR, campaign/ad unit/ad channel context).
  - Search from topbar (`Campaign`, `Ad Unit`, `Ad Channel`).
  - Account-scoped analytics and filtering.
- Campaign management:
  - CRUD, ad unit assignment, date/status handling.
  - Topbar search and infinite scroll in batches.
- Ad Unit management:
  - CRUD with ad channel mapping.
  - Collapsible ad channel selector with search.
- Ad Channels management:
  - CRUD with collapsible cards.
  - Running Ads filter, sort modes, visibility multi-checkbox filter.
  - Linked/Running ad unit views, campaign context, CMS tag/snippet copy.
- Users management:
  - Owner manages users.
  - Editor limited access by role rules.
- My Accounts:
  - Account CRUD (owner), sharing with users/editors, account switching.
- Ad serving/tracking:
  - Serve route + ad client.
  - Impression/click event capture and analytics endpoints.
- Scheduled jobs:
  - Campaign stats updater.
  - End-date enforcement cron.

## Role Model (Current)
- **Owner**
  - Full management of users/accounts/campaigns/ad units/ad channels.
  - Account sharing controls.
  - 2FA-required flows (as implemented in backend auth/user controllers).
- **Editor**
  - Access only to shared account data.
  - Limited write access based on backend permission checks.

## Tech Stack
- **Backend:** Node.js, Express
- **Database:** MongoDB + Mongoose
- **Frontend:** React (CRA)
- **Auth:** JWT + account selection token rotation + owner 2FA (TOTP)
- **Scheduling:** `node-cron`
- **Charts:** `chart.js`, `react-chartjs-2`
- **HTTP client (frontend):** `axios`

## Project Structure
```text
destinasian-ad-server/
├── ad-client.js
├── backend/
│   ├── controllers/   # API business logic
│   ├── jobs/          # cron jobs (stats + end-date enforcement)
│   ├── middleware/    # auth/account access middleware
│   ├── migrations/    # additive/backfill migration scripts
│   ├── models/        # Mongoose models
│   ├── routes/        # API routes
│   ├── utils/         # helper utilities (2FA, etc.)
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── pages/
│   │   ├── services/
│   │   └── styles/
│   └── package.json
└── tests/             # ad-client tests
```

## Environment Variables

### Backend (`backend/.env`)
Based on code usage:
- `NODE_ENV`
- `PORT`
- `HOST`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_EXPIRE`
- `OWNER_SETUP_TOKEN_EXPIRE`
- `TWO_FACTOR_CHALLENGE_EXPIRE`
- `MAX_2FA_ATTEMPTS`
- `TWO_FACTOR_LOCK_WINDOW_MS`
- `TWO_FACTOR_ISSUER`
- `TWO_FACTOR_WINDOW`
- `DASHBOARD_URL`
- `CORS_ORIGIN`
- `ENABLE_STATUS_CRON`
- `STATUS_CRON_SCHEDULE`

Reference starter file: `backend/.env.example`.

### Frontend (`frontend/.env`)
- `REACT_APP_API_URL` (default fallback in code: `http://localhost:5001/api`)
- `REACT_APP_ENABLE_RESPONSIVE_AD_PREVIEW` (used by ad unit chart preview logic)

## Local Development

### 1) Backend
```bash
cd backend
npm install
npm run dev
```

### 2) Frontend
```bash
cd frontend
npm install
npm start
```

### 3) Production build (frontend)
```bash
cd frontend
npm run build
```

## Available Scripts (Actual)

### Backend (`backend/package.json`)
- `npm run start`
- `npm run dev`
- `npm run migrate:add-ad-events`
- `npm run migrate:rollback:add-ad-events`
- `npm run migrate:merge-inventory-entity`
- `npm run migrate:rollback:merge-inventory-entity`
- `npm run migrate:user-roles`
- `npm run migrate:rollback:user-roles`
- `npm run migrate:owner-2fa`
- `npm run migrate:rollback:owner-2fa`
- `npm run migrate:account-sharing`
- `npm run migrate:rollback:account-sharing`
- `npm run migrate:cleanup-editor-accounts`
- `npm run migrate:rollback:cleanup-editor-accounts`

### Frontend (`frontend/package.json`)
- `npm start`
- `npm run build`
- `npm test`
- `npm run eject`

## Migrations
- Migrations are JavaScript scripts in `backend/migrations`.
- They are additive/backfill oriented and should be reviewed before production runs.
- Run with the `npm run migrate:*` scripts listed above.

## Deployment Notes
- Backend serves API and `ad-client.js`.
- Frontend is a separate build/deploy artifact (`frontend/build`).
- Ensure environment variables are configured for database, JWT, CORS, and cron behavior.

## Cleanup Notes (Current)
- User-facing terminology is standardized to **Ad Channel(s)**.
- Revenue UI has been removed from dashboard/user-facing pages.
- Internal Mongo model/collection naming may still use `Inventory` for compatibility.

