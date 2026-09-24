const mongoose = require('mongoose');

const authRateLimitSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true
    },
    scope: {
      type: String,
      required: true
    },
    count: {
      type: Number,
      required: true,
      default: 0
    },
    windowStartedAt: {
      type: Date,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'auth_rate_limits'
  }
);

authRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthRateLimit', authRateLimitSchema);
