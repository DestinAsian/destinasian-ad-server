const crypto = require('crypto');
const AuthSession = require('../models/AuthSession');
const { REFRESH_TOKEN_MAX_AGE_MS } = require('../config/authCookies');
const { getRequestIp } = require('./authRateLimitService');

const hashValue = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const generateRefreshToken = () => crypto.randomBytes(48).toString('hex');

const buildRequestMetadata = (req) => ({
  ipHash: hashValue(getRequestIp(req)),
  userAgentHash: hashValue(req.get?.('user-agent') || '')
});

const createAuthSession = async ({ userId, accountId, tokenVersion, req }) => {
  const refreshToken = generateRefreshToken();
  await AuthSession.create({
    tokenHash: hashValue(refreshToken),
    user: userId,
    account: accountId,
    tokenVersion: Number(tokenVersion || 0),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
    lastUsedAt: new Date(),
    ...buildRequestMetadata(req)
  });
  return refreshToken;
};

const rotateAuthSession = async ({ refreshToken, req }) => {
  const nextRefreshToken = generateRefreshToken();
  const session = await AuthSession.findOneAndUpdate(
    {
      tokenHash: hashValue(refreshToken),
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() }
    },
    {
      $set: {
        tokenHash: hashValue(nextRefreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
        lastUsedAt: new Date(),
        ...buildRequestMetadata(req)
      }
    },
    { new: true }
  );

  return session ? { session, refreshToken: nextRefreshToken } : null;
};

const replaceAuthSession = async ({ currentRefreshToken, userId, accountId, tokenVersion, req }) => {
  if (currentRefreshToken) {
    await AuthSession.updateOne(
      { tokenHash: hashValue(currentRefreshToken), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    );
  }
  return createAuthSession({ userId, accountId, tokenVersion, req });
};

const revokeAuthSession = async (refreshToken) => {
  if (!refreshToken) return;
  await AuthSession.updateOne(
    { tokenHash: hashValue(refreshToken), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
};

const revokeAllUserSessions = async (userId) => {
  await AuthSession.updateMany(
    { user: userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
};

module.exports = {
  createAuthSession,
  rotateAuthSession,
  replaceAuthSession,
  revokeAuthSession,
  revokeAllUserSessions
};
