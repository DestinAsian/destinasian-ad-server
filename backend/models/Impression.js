const mongoose = require('mongoose');

const impressionSchema = new mongoose.Schema(
  {
    adUnit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdUnit',
      required: true
    },
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true
    },
    userIp: String,
    userAgent: String,
    referrer: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: false }
);

impressionSchema.index({ account: 1, campaign: 1, timestamp: 1 });
impressionSchema.index({ account: 1, adUnit: 1, timestamp: 1 });

module.exports = mongoose.model('Impression', impressionSchema);
