const mongoose = require('mongoose');

const adClickEventSchema = new mongoose.Schema(
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
    clickUrl: {
      type: String,
      trim: true
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
    collection: 'ad_click_events',
    timestamps: false
  }
);

adClickEventSchema.index({ account: 1, occurredAt: -1 });
adClickEventSchema.index({ campaign: 1, occurredAt: -1 });
adClickEventSchema.index({ adUnit: 1, occurredAt: -1 });
adClickEventSchema.index({ inventory: 1, occurredAt: -1 });
adClickEventSchema.index({ adCode: 1, occurredAt: -1 });

module.exports = mongoose.model('AdClickEvent', adClickEventSchema);
