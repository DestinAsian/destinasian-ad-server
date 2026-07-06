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
    sourceCode: {
      type: String,
      enum: ['01', '02'],
      trim: true
    },
    inventoryCode: {
      type: Number,
      min: 1,
      max: 999
    },
    campaignCode: {
      type: Number,
      min: 1,
      max: 9999
    },
    adUnitCode: {
      type: Number,
      min: 1,
      max: 99
    },
    crmAdId: {
      type: String,
      match: [/^\d{11}$/, 'CRM AD ID must be exactly 11 digits'],
      trim: true
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
adUnitSchema.index(
  { crmAdId: 1 },
  {
    unique: true,
    partialFilterExpression: { crmAdId: { $type: 'string' } }
  }
);
adUnitSchema.index(
  { account: 1, campaign: 1, inventory: 1, adUnitCode: 1 },
  {
    unique: true,
    partialFilterExpression: { adUnitCode: { $exists: true } }
  }
);

module.exports = mongoose.model('AdUnit', adUnitSchema);
