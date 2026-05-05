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
    inventories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory'
    }],
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
      trim: true
    },
    htmlCreative: {
      type: String
    },
    iframeUrl: {
      type: String,
      trim: true
    },
    clickUrl: {
      type: String,
      trim: true
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

adUnitSchema.pre('validate', function(next) {
  if (!this.imageUrl && !this.htmlCreative && !this.iframeUrl) {
    this.invalidate('imageUrl', 'At least one creative is required');
  }

  if (Array.isArray(this.inventories) && this.inventories.length > 0) {
    this.inventory = this.inventories[0];
  } else if (this.inventory) {
    this.inventories = [this.inventory];
  }

  next();
});

adUnitSchema.index({ account: 1, inventories: 1 });
adUnitSchema.index({ account: 1, inventory: 1 });

module.exports = mongoose.model('AdUnit', adUnitSchema);
