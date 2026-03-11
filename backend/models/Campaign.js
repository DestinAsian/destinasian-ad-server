const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'ended'],
      default: 'active'
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date
    },
    adUnits: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdUnit'
    }],
    totalImpressions: {
      type: Number,
      default: 0
    },
    totalClicks: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Campaign', campaignSchema);
