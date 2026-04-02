const mongoose = require('mongoose');

const adDailyStatSchema = new mongoose.Schema(
  {
    statDate: {
      type: Date,
      required: true,
      index: true
    },
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
    impressions: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    ctr: {
      type: Number,
      default: 0
    },
    lastAggregatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'ad_daily_stats',
    timestamps: true
  }
);

adDailyStatSchema.index({ statDate: 1, account: 1 });
adDailyStatSchema.index({ statDate: 1, campaign: 1 });
adDailyStatSchema.index({ statDate: 1, adUnit: 1 });
adDailyStatSchema.index({ statDate: 1, inventory: 1 });
adDailyStatSchema.index(
  { statDate: 1, account: 1, campaign: 1, adUnit: 1, inventory: 1 },
  { name: 'ad_daily_stats_rollup_key', unique: true }
);

module.exports = mongoose.model('AdDailyStat', adDailyStatSchema);
