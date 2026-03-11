const mongoose = require('mongoose');

const clickSchema = new mongoose.Schema(
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

module.exports = mongoose.model('Click', clickSchema);
