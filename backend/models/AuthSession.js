const mongoose = require('mongoose');

const authSessionSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true
    },
    tokenVersion: {
      type: Number,
      required: true
    },
    userAgentHash: String,
    ipHash: String,
    lastUsedAt: Date,
    expiresAt: {
      type: Date,
      required: true
    },
    revokedAt: Date
  },
  {
    timestamps: true,
    collection: 'auth_sessions'
  }
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ user: 1, revokedAt: 1, expiresAt: 1 });

module.exports = mongoose.model('AuthSession', authSessionSchema);
