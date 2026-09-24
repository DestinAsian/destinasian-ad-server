const crypto = require('crypto');
const AuthRateLimit = require('../models/AuthRateLimit');

const hashKey = (scope, identifier) => crypto
  .createHash('sha256')
  .update(`${scope}:${identifier}`)
  .digest('hex');

const normalizeIdentifiers = (identifiers) => Array.from(new Set(
  (identifiers || [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
));

const consumeKey = async ({ scope, identifier, limit, windowMs }) => {
  const key = hashKey(scope, identifier);
  const now = new Date();
  const nextExpiry = new Date(now.getTime() + windowMs);
  const activeWindowExpression = {
    $gt: [
      { $ifNull: ['$expiresAt', new Date(0)] },
      now
    ]
  };

  const update = [
    {
      $set: {
        scope,
        count: {
          $cond: [
            activeWindowExpression,
            { $add: [{ $ifNull: ['$count', 0] }, 1] },
            1
          ]
        },
        windowStartedAt: {
          $cond: [activeWindowExpression, '$windowStartedAt', now]
        },
        expiresAt: {
          $cond: [activeWindowExpression, '$expiresAt', nextExpiry]
        }
      }
    }
  ];

  let record;
  try {
    record = await AuthRateLimit.findOneAndUpdate({ key }, update, {
      upsert: true,
      new: true
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    record = await AuthRateLimit.findOneAndUpdate({ key }, update, { new: true });
  }

  const retryAfterMs = Math.max(0, new Date(record.expiresAt).getTime() - Date.now());
  return {
    key,
    blocked: Number(record.count) > limit,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
  };
};

const consumeAuthRateLimit = async ({ scope, identifiers, limit, windowMs }) => {
  const normalizedIdentifiers = normalizeIdentifiers(identifiers);
  const results = [];

  for (const identifier of normalizedIdentifiers) {
    results.push(await consumeKey({ scope, identifier, limit, windowMs }));
  }

  const blockedResult = results.find((result) => result.blocked);
  return {
    blocked: Boolean(blockedResult),
    retryAfterSeconds: blockedResult?.retryAfterSeconds || 0,
    keys: results.map((result) => result.key)
  };
};

const clearAuthRateLimit = async ({ scope, identifiers }) => {
  const keys = normalizeIdentifiers(identifiers).map((identifier) => hashKey(scope, identifier));
  if (keys.length === 0) return;
  await AuthRateLimit.deleteMany({ key: { $in: keys } });
};

const getRequestIp = (req) => String(
  req.ip
  || req.socket?.remoteAddress
  || 'unknown'
).trim();

module.exports = {
  consumeAuthRateLimit,
  clearAuthRateLimit,
  getRequestIp
};
