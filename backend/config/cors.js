const { isStagingDashboard } = require('./stagingPublicAds');
const DAI_TESTING_ORIGIN = 'https://test.destinasian.co.id';

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

  return (req, callback) => callback(null, {
    origin: (origin, originCallback) => {
      const isDaiPublicRequest = allowDaiTesting
        && origin === DAI_TESTING_ORIGIN
        && isPublicAdRoute(req.path);

      if (!origin || allowedCorsOrigins.includes(origin) || isDaiPublicRequest) {
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
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
  });
};

module.exports = { createCorsOptions };
