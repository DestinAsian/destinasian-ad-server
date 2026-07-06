# DestinAsian Ad Server

## Overview

DestinAsian Ad Server is a publisher-side ad server dashboard for managing campaigns, ad units, ad channels, accounts, users, serving tags, and delivery reporting.

The application focuses on operational publisher metrics: impressions, clicks, CTR, campaign activity, ad unit activity, and ad channel activity. Revenue-focused UI is intentionally not part of the dashboard.

User-facing terminology is **Ad Channels**. Some backend model and route names still use `Inventory` for compatibility with existing data and APIs.

## Tech Stack

- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- Frontend: React via Create React App
- Authentication: JWT, account selection, owner TOTP 2FA
- Scheduling: `node-cron`
- Charts: `chart.js`, `react-chartjs-2`
- HTTP client: `axios`
- Process manager on server: PM2

## Project Structure

```text
destinasian-ad-server/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── backend/
│   ├── controllers/
│   ├── jobs/
│   ├── middleware/
│   ├── migrations/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   ├── .env.example
│   ├── package.json
│   ├── seed.js
│   └── server.js
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── styles/
│   │   └── utils/
│   ├── .env.example
│   └── package.json
├── tests/
│   └── ad-client.test.js
├── ad-client.js
├── INTEGRATION_EXAMPLE.html
├── TEST_ADS.html
├── package.json
└── README.md
```

## Backend

Backend entrypoint: `backend/server.js`.

Main backend areas:

- `backend/routes/auth.js` - authentication, setup status, password reset, 2FA, account selection.
- `backend/routes/accounts.js` - account CRUD, sharing, account stats.
- `backend/routes/users.js` - user management and owner reassignment.
- `backend/routes/campaigns.js` - campaign CRUD, search/pagination, campaign ad unit to ad channel mappings.
- `backend/routes/adUnits.js` - ad unit CRUD and status handling.
- `backend/routes/inventories.js` - internal route for user-facing Ad Channels.
- `backend/routes/tracking.js` - impression/click tracking and analytics.
- `backend/routes/serve.js` - public ad-serving endpoint.

Backend jobs:

- `backend/jobs/updateCampaignStats.js`
- `backend/jobs/enforceEndDates.js`

Backend migrations are in `backend/migrations` and are exposed through `backend/package.json` scripts. Review migrations before running them against production data.

## Frontend

Frontend entrypoint: `frontend/src/index.js`.

Main frontend screens:

- `frontend/src/App.js` - app shell, topbar search, navigation, Admin dropdown.
- `frontend/src/pages/Dashboard.js` - Dashboard overview and Campaigns view.
- `frontend/src/pages/Inventory.js` - Ad Channels page.
- `frontend/src/pages/AccountManagement.js` - My Accounts page.
- `frontend/src/pages/Users.js` - Users page.
- `frontend/src/pages/Login.js`, `Signup.js`, `ForgotPassword.js`, `ResetPassword.js`, `TwoFactorSetup.js` - authentication flows.

Frontend build output is generated at `frontend/build` by `npm --prefix frontend run build` or root `npm run build`.

## Ad Client Integration

The backend serves the public client script at:

```text
/ad-client.js
```

Example external site integration:

```html
<script src="https://your-ad-server-domain.example/ad-client.js"></script>
<div data-inventory="homepage-leaderboard" data-width="100%"></div>
```

Local example:

```html
<script src="http://localhost:5001/ad-client.js"></script>
<div data-inventory="homepage-leaderboard" data-width="100%"></div>
```

Additional examples are available in:

- `INTEGRATION_EXAMPLE.html`
- `TEST_ADS.html`

## Authentication

The app uses JWT authentication with owner/editor roles. The owner account supports required TOTP 2FA setup and verification. Account selection is part of the authenticated flow so dashboard, campaign, ad channel, user, and account data remain scoped to accessible accounts.

Role behavior is enforced by backend middleware and controllers. Frontend visibility is only a usability layer.

## Environment Variables

Do not commit real `.env` files. Use the `.env.example` files as templates and provide real values on each environment.

### Backend Variables

Defined by current backend code and `backend/.env.example`:

- `NODE_ENV`
- `HOST`
- `PORT`
- `MONGO_URI`
- `MONGODB_URI`
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

### Frontend Variables

Defined by current frontend code and `frontend/.env.example`:

- `PORT`
- `REACT_APP_API_URL`
- `REACT_APP_ENABLE_RESPONSIVE_AD_PREVIEW`

## Installation

Root install for local development:

```bash
npm install
npm run install:all
```

Separate installs are also supported:

```bash
npm install --prefix backend
npm install --prefix frontend
```

## Local Development

Start backend and frontend together from the root:

```bash
npm run dev
```

This uses `concurrently` to run:

```bash
npm --prefix backend run dev
npm --prefix frontend start
```

Start backend only:

```bash
npm --prefix backend run dev
```

Start frontend only:

```bash
npm --prefix frontend start
```

## Running the Project

Root scripts in `package.json`:

- `npm run install:all` - install backend and frontend dependencies.
- `npm run dev` - run backend dev server and frontend CRA dev server together.
- `npm run start` - run backend start and frontend CRA start together.
- `npm run build` - build the frontend.

Backend scripts in `backend/package.json`:

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

Frontend scripts in `frontend/package.json`:

- `npm start`
- `npm run build`
- `npm test`
- `npm run eject`

There is currently no dedicated lint script in the root, backend, or frontend package files.

## Testing

Frontend tests can be run from the frontend package:

```bash
npm --prefix frontend test
```

The root `tests/ad-client.test.js` file exists for the ad client, but there is no root `npm test` script currently defined.

## Production Build

Build the frontend from the root:

```bash
npm run build
```

Equivalent direct frontend command:

```bash
npm --prefix frontend run build
```

The backend does not have a build step. It runs from `backend/server.js`.

## Deployment

Deployment is handled by GitHub Actions in `.github/workflows/deploy.yml`.

Branch mapping:

- `main` deploys production.
- `test` deploys staging/testing.

The workflow connects to the VPS through SSH, calls the server-side deploy script, then restarts the correct PM2 apps for the target environment.

Migrations are not run automatically by the workflow. Run migrations manually or through a controlled release step after reviewing the migration script and target data.

## PM2 Server Setup

Current server PM2 app names:

- `adserver-backend-production`
- `adserver-backend-staging`
- `adserver-frontend-production`
- `adserver-frontend-staging`

Recommended structure: keep 4 PM2 apps.

Reason: the root `npm run start` command uses `concurrently` to start `backend start` and `frontend start`. The frontend command is CRA's development server, not a production static-file server. Backend and frontend should therefore remain separately managed on the server unless a dedicated production frontend server command is introduced and tested.

Backend examples:

```bash
pm2 start backend/server.js --name adserver-backend-production
pm2 start backend/server.js --name adserver-backend-staging
```

Frontend should serve the built `frontend/build` directory with the server's existing static hosting command or service. If PM2 is used with `serve`, install and configure `serve` on the server, then use separate app names for production and staging. Example pattern:

```bash
pm2 start serve --name adserver-frontend-production -- -s frontend/build -l 3000
pm2 start serve --name adserver-frontend-staging -- -s frontend/build -l 3001
```

Adjust ports and working directories to match the server environment.

### Alternative: one PM2 app per environment

Do not switch to one PM2 app per environment with the current scripts. A consolidated PM2 app would run the frontend CRA dev server in production through root `npm run start`, which is not the preferred production setup.

## PM2 Commands

Check status:

```bash
pm2 status
```

View logs:

```bash
pm2 logs adserver-backend-production
pm2 logs adserver-backend-staging
pm2 logs adserver-frontend-production
pm2 logs adserver-frontend-staging
```

Restart production apps:

```bash
pm2 restart adserver-backend-production
pm2 restart adserver-frontend-production
pm2 save
```

Restart staging/testing apps:

```bash
pm2 restart adserver-backend-staging
pm2 restart adserver-frontend-staging
pm2 save
```

## GitHub Actions Deployment

Required GitHub Secrets based on the workflow:

- `VPS_SSH_KEY`
- `VPS_HOST`
- `VPS_PORT`
- `VPS_USER`
- `TARGET_PRODUCTION_DIRECTORY`
- `TARGET_TESTING_DIRECTORY`

Required GitHub Variables based on the workflow:

- `DEPLOY_SCRIPT_PATH`

Production deployment uses:

- branch: `main`
- target directory: `secrets.TARGET_PRODUCTION_DIRECTORY`
- PM2 restarts:
  - `adserver-backend-production`
  - `adserver-frontend-production`

Staging/testing deployment uses:

- branch: `test`
- target directory: `secrets.TARGET_TESTING_DIRECTORY`
- PM2 restarts:
  - `adserver-backend-staging`
  - `adserver-frontend-staging`

The workflow does not expose secret values and does not hardcode server paths. The server deploy script path is supplied by `vars.DEPLOY_SCRIPT_PATH`.

## Troubleshooting

If deployment does not start:

```bash
pm2 status
pm2 logs adserver-backend-production
pm2 logs adserver-frontend-production
```

For staging/testing:

```bash
pm2 logs adserver-backend-staging
pm2 logs adserver-frontend-staging
```

If frontend API calls fail, verify:

- `REACT_APP_API_URL` in the frontend environment.
- `CORS_ORIGIN` in the backend environment.
- Backend PM2 app is online.
- Frontend PM2/static server is serving the latest `frontend/build`.

If authentication fails, verify:

- `JWT_SECRET` is set consistently for the environment.
- Owner 2FA environment settings are present.
- The selected account exists and the user has access.

If scheduled status updates are unexpected, verify:

- `ENABLE_STATUS_CRON`
- `STATUS_CRON_SCHEDULE`

## Notes

- Keep real `.env` files out of git.
- Keep backend and frontend PM2 apps separate with the current scripts.
- Use root scripts for convenience during local development.
- Use frontend build output for production frontend hosting.
- User-facing terminology is Ad Channel/Ad Channels; internal compatibility names may still use Inventory.
- Revenue UI is intentionally excluded from the dashboard.
