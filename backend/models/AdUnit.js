const mongoose = require('mongoose');

const adUnitSchema = new mongoose.Schema(
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
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true
    },
    inventory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory'
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    adCode: {
      type: String,
      unique: true,
      required: true
    },
    width: {
      type: String,
      enum: ['flexible', '100%'],
      default: '100%'
    },
    aspectRatio: {
      type: String,
      default: '1:1'
    },
    imageUrl: {
      type: String,
      required: true
    },
    clickUrl: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'paused'],
      default: 'active'
    },
    impressions: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdUnit', adUnitSchema);
