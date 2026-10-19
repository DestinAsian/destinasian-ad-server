const { isStagingDashboard } = require('./stagingPublicAds');
const DAI_TESTING_ORIGIN = 'https://test.destinasian.co.id';
const DAI_PRODUCTION_ORIGINS = new Set(['https://destinasian.co.id', 'http://localhost:3000']);

const isProductionDashboard = (value) => {
  try {
    return new URL(String(value || '')).origin === 'https://adserver.destinasian.com';
  } catch {
    return false;
  }
};

const isPublicAdRoute = (requestPath) => (
  /^\/(?:api\/)?ad-client\.js$/.test(requestPath)
  || /^\/api\/serve\/?$/.test(requestPath)
  || /^\/api\/tracking\/[a-zA-Z0-9_-]+\/(?:impression|click)\/?$/.test(requestPath)
);

const createCorsOptions = (environment = process.env) => {
  const configuredCorsOrigins = String(environment.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Preserve DA's configured origins and the existing local fallback exactly.
  const allowedCorsOrigins = configuredCorsOrigins.length > 0
    ? configuredCorsOrigins
    : ['http://localhost:3000', 'http://localhost:3001'];
  const allowDaiTesting = isStagingDashboard(environment.DASHBOARD_URL);
  const allowDaiProduction = isProductionDashboard(environment.DASHBOARD_URL);

  return (req, callback) => {
    // Production DAI is public delivery only; configured DA/admin origins retain
    // their existing permissions, and the testing rule below stays unchanged.
    const isDaiProductionPublicRequest = allowDaiProduction
      && DAI_PRODUCTION_ORIGINS.has(req.headers.origin)
      && ['GET', 'POST', 'OPTIONS'].includes(req.method)
      && isPublicAdRoute(req.path);
    return callback(null, {
      origin: (origin, originCallback) => {
        const isDaiPublicRequest = allowDaiTesting
          && origin === DAI_TESTING_ORIGIN
          && isPublicAdRoute(req.path);

        if (!origin || allowedCorsOrigins.includes(origin) || isDaiPublicRequest || isDaiProductionPublicRequest) {
          return originCallback(null, true);
        }

        console.warn(`[security-audit] ${JSON.stringify({
          event: 'cors_origin_rejected',
          timestamp: new Date().toISOString(),
          origin
        })}`);
        const error = new Error('Origin is not allowed by CORS policy.');
        error.statusCode = 403;
        return originCallback(error);
      },
      credentials: isDaiProductionPublicRequest && !allowedCorsOrigins.includes(req.headers.origin) ? false : true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
    });
  };
};

module.exports = { createCorsOptions };
