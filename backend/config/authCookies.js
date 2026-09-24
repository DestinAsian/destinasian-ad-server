const crypto = require('crypto');

const ACCESS_COOKIE_NAME = 'da_access';
const REFRESH_COOKIE_NAME = 'da_refresh';
const CSRF_COOKIE_NAME = 'da_csrf';

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const ACCESS_TOKEN_MINUTES = parsePositiveInteger(process.env.ACCESS_TOKEN_MINUTES, 15);
const REFRESH_TOKEN_DAYS = parsePositiveInteger(process.env.REFRESH_TOKEN_DAYS, 7);
const ACCESS_TOKEN_EXPIRE = `${ACCESS_TOKEN_MINUTES}m`;
const ACCESS_TOKEN_MAX_AGE_MS = ACCESS_TOKEN_MINUTES * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

const configuredSameSite = String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
const COOKIE_SAME_SITE = ['lax', 'strict', 'none'].includes(configuredSameSite)
  ? configuredSameSite
  : 'lax';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true'
  || process.env.NODE_ENV === 'production';

if (COOKIE_SAME_SITE === 'none' && !COOKIE_SECURE) {
  throw new Error('COOKIE_SECURE must be true when COOKIE_SAME_SITE is none.');
}

const baseCookieOptions = () => ({
  secure: COOKIE_SECURE,
  sameSite: COOKIE_SAME_SITE
});

const setAuthCookies = (res, { accessToken, refreshToken, accessMaxAgeMs = ACCESS_TOKEN_MAX_AGE_MS }) => {
  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    ...baseCookieOptions(),
    httpOnly: true,
    path: '/api',
    maxAge: accessMaxAgeMs
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...baseCookieOptions(),
    httpOnly: true,
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS
  });
};

const issueCsrfCookie = (req, res) => {
  const existing = String(req?.cookies?.[CSRF_COOKIE_NAME] || '').trim();
  const token = existing || crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    httpOnly: false,
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS
  });
  return token;
};

const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE_NAME, {
    ...baseCookieOptions(),
    httpOnly: true,
    path: '/api'
  });
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...baseCookieOptions(),
    httpOnly: true,
    path: '/api/auth'
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    ...baseCookieOptions(),
    httpOnly: false,
    path: '/'
  });
};

module.exports = {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  ACCESS_TOKEN_EXPIRE,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
  setAuthCookies,
  issueCsrfCookie,
  clearAuthCookies
};
