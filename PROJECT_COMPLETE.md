# PROJECT COMPLETE - DestinAsian Ad Server Dashboard

## Current Project Status

The DestinAsian Ad Server Dashboard is a publisher-side ad server application for managing campaigns, ad units, ad channels, users, accounts, serving tags, and operational performance reporting.

The application is focused on publisher operations and delivery metrics:

- Impressions
- Clicks
- CTR
- Campaign, ad unit, and ad channel activity

Revenue-focused dashboard UI has been removed. User-facing terminology is standardized around **Ad Channels**, while some internal MongoDB models and API routes still use `Inventory` for compatibility.

---

## What Is Included

### Core Features

- JWT authentication with owner/editor roles.
- Owner two-factor authentication support using TOTP.
- Account selector and account-scoped data access.
- My Accounts page with account sharing.
- Users management with owner/editor permission rules.
- Dashboard overview with topbar search by campaign, ad unit, and ad channel.
- Campaign management with topbar search and infinite scrolling.
- Ad unit management with ad channel assignment.
- Ad Channels page with search, filters, sorting, collapsible cards, CMS tags, and linked/running ad unit views.
- Impression and click tracking.
- Client-side ad embed script via `ad-client.js`.
- Scheduled backend jobs for campaign stats and end-date enforcement.
- Migration scripts for stats collections, inventory/ad channel backfills, roles, owner 2FA, and account sharing.

---

## Project Structure

```text
destinasian-ad-server/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── backend/
│   ├── controllers/
│   │   ├── accountController.js
│   │   ├── adUnitController.js
│   │   ├── authController.js
│   │   ├── campaignController.js
│   │   ├── inventoryController.js
│   │   ├── trackingController.js
│   │   └── userController.js
│   ├── jobs/
│   │   ├── enforceEndDates.js
│   │   └── updateCampaignStats.js
│   ├── middleware/
│   │   └── auth.js
│   ├── migrations/
│   │   ├── 20260402_add_ad_event_and_daily_stat_collections.js
│   │   ├── 20260430_merge_inventory_group_and_backfill_adunit_inventories.js
│   │   ├── 20260505_add_two_factor_owner_enforcement.js
│   │   ├── 20260505_enforce_single_owner_and_editor_roles.js
│   │   ├── 20260506_add_account_sharing_fields_and_indexes.js
│   │   └── 20260506_cleanup_auto_created_editor_accounts.js
│   ├── models/
│   │   ├── Account.js
│   │   ├── AdClickEvent.js
│   │   ├── AdDailyStat.js
│   │   ├── AdImpressionEvent.js
│   │   ├── AdUnit.js
│   │   ├── Campaign.js
│   │   ├── Click.js
│   │   ├── Impression.js
│   │   ├── Inventory.js
│   │   └── User.js
│   ├── routes/
│   │   ├── accounts.js
│   │   ├── adUnits.js
│   │   ├── auth.js
│   │   ├── campaigns.js
│   │   ├── inventories.js
│   │   ├── serve.js
│   │   ├── tracking.js
│   │   └── users.js
│   ├── utils/
│   │   └── twoFactor.js
│   ├── .env.example
│   ├── package.json
│   ├── seed.js
│   └── server.js
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── AccountSelector.js
│   │   │   ├── AdUnit.js
│   │   │   ├── AdUnitChart.js
│   │   │   ├── AdUnitForm.js
│   │   │   ├── CampaignForm.js
│   │   │   └── Modal.js
│   │   ├── contexts/
│   │   │   └── AuthContext.js
│   │   ├── pages/
│   │   │   ├── AccountManagement.js
│   │   │   ├── Dashboard.js
│   │   │   ├── ForgotPassword.js
│   │   │   ├── Inventory.js
│   │   │   ├── Login.js
│   │   │   ├── ResetPassword.js
│   │   │   ├── Signup.js
│   │   │   ├── TwoFactorSetup.js
│   │   │   └── Users.js
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── styles/
│   │   │   ├── AccountManagement.css
│   │   │   ├── Auth.css
│   │   │   ├── Dashboard.css
│   │   │   ├── Inventory.css
│   │   │   ├── ResponsiveAdUnit.css
│   │   │   └── Users.css
│   │   ├── utils/
│   │   │   └── adTracking.js
│   │   ├── App.js
│   │   ├── index.css
│   │   └── index.js
├── tests/
│   └── ad-client.test.js
├── ad-client.js
├── INTEGRATION_EXAMPLE.html
├── TEST_ADS.html
├── README.md
├── AUTHENTICATION_SETUP.md
├── ARCHITECTURE.md
├── FILE_STRUCTURE.md
├── INSTALLATION_GUIDE.md
├── QUICKSTART.md
└── PROJECT_COMPLETE.md
```

---

## Backend Overview

### API Areas

- `auth` - registration, login, password reset, owner 2FA, account selection.
- `accounts` - account CRUD, account sharing, account stats.
- `users` - user management, owner reassignment, role/status/password flows.
- `campaigns` - campaign CRUD, pagination/search, stats, ad unit to ad channel mappings.
- `ad-units` - ad unit CRUD, status changes, serving helpers.
- `inventories` - internal route for Ad Channels.
- `tracking` - impression/click recording and analytics.
- `serve` - public ad-serving route.

### Database Models

- `Account`
- `User`
- `Campaign`
- `AdUnit`
- `Inventory` (internal Ad Channel model)
- `Impression`
- `Click`
- `AdImpressionEvent`
- `AdClickEvent`
- `AdDailyStat`

### Jobs

- `updateCampaignStats.js` updates campaign delivery totals.
- `enforceEndDates.js` enforces campaign/ad unit status based on end dates.

### Migrations

Migration scripts live in `backend/migrations` and are exposed through `backend/package.json` scripts. Review them before production execution.

---

## Frontend Overview

### Main Screens

- `Dashboard.js` powers both Dashboard overview and Campaigns view.
- `Inventory.js` powers the user-facing Ad Channels page.
- `AccountManagement.js` powers My Accounts.
- `Users.js` powers user management.
- Auth pages include login, signup, reset/forgot password, and owner 2FA setup.

### Navigation

The app shell in `App.js` contains:

- Dashboard
- Campaigns
- Admin dropdown
  - Ad Channels
  - Users
  - My Accounts
- Logout

Topbar search is available for Dashboard, Campaigns, and Ad Channels.

### Styling

CSS is organized by feature:

- `index.css` for global shell/topbar styles.
- `Dashboard.css` for dashboard and campaigns UI.
- `Inventory.css` for Ad Channels UI.
- `Users.css` for users and shared management styling.
- `AccountManagement.css` for My Accounts.
- `Auth.css` for auth screens.
- `ResponsiveAdUnit.css` for embeddable ad unit rendering.

---

## Local Development

### Backend

```bash
cd backend
npm install
npm run dev
```

Backend defaults to `http://localhost:5001`.

### Frontend

```bash
cd frontend
npm install
npm start
```

Frontend defaults to Create React App behavior. The current `frontend/package.json` proxy points to `http://localhost:5001`.

### Frontend Build

```bash
cd frontend
npm run build
```

---

## Available Scripts

### Backend

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

### Frontend

- `npm start`
- `npm run build`
- `npm test`
- `npm run eject`

There is currently no dedicated `lint` script in either package.

---

## Environment Files

### Backend

Template: `backend/.env.example`

Important variables include:

- `HOST`
- `PORT`
- `MONGO_URI`
- `MONGODB_URI` (legacy seed script support)
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

### Frontend

Template: `frontend/.env.example`

- `PORT`
- `REACT_APP_API_URL`
- `REACT_APP_ENABLE_RESPONSIVE_AD_PREVIEW`

---

## Testing And Integration Files

- `tests/ad-client.test.js` contains ad client tests.
- `TEST_ADS.html` is an interactive browser test page.
- `INTEGRATION_EXAMPLE.html` documents integration usage.
- `ad-client.js` is the public client script served by the backend at `/ad-client.js`.

Example embed:

```html
<script src="http://localhost:5001/ad-client.js"></script>
<div data-inventory="homepage-leaderboard" data-width="100%"></div>
```

---

## Deployment

Deployment workflow:

- `.github/workflows/deploy.yml`

The workflow deploys:

- `main` to production.
- `test` to staging.

Server-side deployment is delegated to VPS scripts referenced by the workflow.

---

## Verification Checklist

- Backend installs with `npm install`.
- Backend starts with `npm run dev` or `npm run start`.
- Frontend installs with `npm install`.
- Frontend builds with `npm run build`.
- Login and owner 2FA flows work.
- Dashboard loads account-scoped metrics.
- Campaigns search and infinite scroll work.
- Campaign items expand/collapse correctly.
- Ad Channels search/filter/sort and collapsible cards work.
- CMS tag copy behavior works.
- Users page works.
- My Accounts sharing works.
- Owner/editor permissions remain enforced by backend.
- Revenue is not visible in user-facing UI.

---

## Current Completion Summary

The project is now a multi-account, role-aware publisher ad server dashboard with:

- Express and MongoDB backend.
- React dashboard frontend.
- JWT authentication and owner 2FA.
- Account sharing and account-scoped access.
- Campaign, ad unit, and Ad Channel management.
- Public ad serving and tracking.
- Operational analytics for impressions, clicks, and CTR.
- Scheduled jobs and migration scripts.
- Deployment workflow and integration examples.

**Project status:** complete and actively evolved.
