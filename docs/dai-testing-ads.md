# DestinAsian Indonesia testing banner delivery

This change is prepared on the ad server `test` branch. The existing DA CORS
origins, credentials support, allowed headers, authentication, CSRF checks,
campaigns, inventories, and production configuration are preserved.

When the backend's existing `DASHBOARD_URL` has origin
`https://admin-staging.destinasian.com`, it additionally accepts browser origin
`https://test.destinasian.co.id` for these public routes:

- `GET /ad-client.js` and `GET /api/ad-client.js`
- `GET /api/serve`
- `POST /api/tracking/:adUnitId/impression`
- `POST /api/tracking/:adUnitId/click`
- CORS preflight `OPTIONS` for those same paths

This addition does not permit DAI to call dashboard management APIs. Existing
origins listed in `CORS_ORIGIN` retain their existing access. Production does not
receive this automatic DAI testing origin addition.

DA's older staging SDK tags specify only an inventory name. Because DA and DAI
can both own names such as `homepage`, `footer`, and `ros`, staging requests from
`https://test.destinasian.com` with only a name are additionally scoped to the
existing DA account `69b93d4c08ec4bf1fc9d0245`. Explicit account IDs, inventory
IDs, and ad codes are never replaced. Requests from other origins or without an
origin retain the existing resolver behavior, including rejection of ambiguous
names. This compatibility rule does not run with the production dashboard URL.

## Server application

Deploy the reviewed `test` branch changes to the staging ad server only. The
existing workflow identifies its staging checkout as
`/srv/apps/staging/destinasian-ad-server` and invokes the existing server-managed
deployment script. No workflow changes are required for this patch.

Verify that the staging backend process receives the existing setting:

```text
DASHBOARD_URL=https://admin-staging.destinasian.com
```

Retain every existing `CORS_ORIGIN` value. No new secret or GitHub variable is
required. Reload only the staging backend through the normal staging deployment
procedure after deploying the code. Updating the template alone will not update
a running server.

No WordPress or dashboard campaign edit is needed for the CORS change. Keep the
DestinAsian Indonesia account and its configured inventory IDs on DAI banners.

## Verification after deployment

1. Request `/api/serve` with the DAI inventory/account identifiers and the actual
   `Origin: https://test.destinasian.co.id`. An active banner should return 200
   with `Access-Control-Allow-Origin: https://test.destinasian.co.id` and
   `Vary: Origin`.
2. Verify a tracking `OPTIONS` request accepts `POST` and `Content-Type`; do not
   send artificial impression or click events.
3. Reload the DAI homepage and category pages. Confirm creatives render and
   normal visible impressions succeed in the browser.
4. Confirm DA testing still loads ads and unknown origins remain rejected.

This local preparation does not deploy or restart a remote service.
