const crypto = require('crypto');
const {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME
} = require('../config/authCookies');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length
    && leftBuffer.length > 0
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const usesCookieAuthentication = Boolean(
    req.cookies?.[ACCESS_COOKIE_NAME]
    || req.cookies?.[REFRESH_COOKIE_NAME]
  );
  if (!usesCookieAuthentication) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get('x-csrf-token');
  if (!safeEqual(cookieToken, headerToken)) {
    return res.status(403).json({
      success: false,
      code: 'CSRF_TOKEN_INVALID',
      message: 'Security token is missing or invalid. Refresh the page and try again.'
    });
  }

  return next();
};

module.exports = { csrfProtection, safeEqual };
