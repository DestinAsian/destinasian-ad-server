const mongoose = require('mongoose');

const adImpressionEventSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true
    },
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      index: true
    },
    adUnit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdUnit',
      index: true
    },
    inventory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      index: true
    },
    adCode: {
      type: String,
      trim: true,
      index: true
    },
    userIp: {
      type: String,
      trim: true
    },
    userAgent: {
      type: String
    },
    referrer: {
      type: String
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    meta: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  {
    collection: 'ad_impression_events',
    timestamps: false
  }
);

adImpressionEventSchema.index({ account: 1, occurredAt: -1 });
adImpressionEventSchema.index({ campaign: 1, occurredAt: -1 });
adImpressionEventSchema.index({ adUnit: 1, occurredAt: -1 });
adImpressionEventSchema.index({ inventory: 1, occurredAt: -1 });
adImpressionEventSchema.index({ adCode: 1, occurredAt: -1 });

module.exports = mongoose.model('AdImpressionEvent', adImpressionEventSchema);
