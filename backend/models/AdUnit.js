const mongoose = require('mongoose');

const STATIC_IMAGE_MAX_BYTES = 1 * 1024 * 1024;
const GIF_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const getImageDataUrlMeta = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:([^;,]+);base64,(.*)$/i);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    base64Data: match[2]
  };
};

const getBase64ByteLength = (base64Data = '') => {
  try {
    return Buffer.byteLength(base64Data, 'base64');
  } catch (error) {
    return null;
  }
};

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

  if (this.imageUrl) {
    const imageMeta = getImageDataUrlMeta(this.imageUrl);
    if (!imageMeta && this.imageUrl.startsWith('data:')) {
      this.invalidate('imageUrl', 'Only PNG, JPG, JPEG, WebP, and GIF files are allowed.');
    } else if (imageMeta) {
      if (!ALLOWED_IMAGE_TYPES.includes(imageMeta.mimeType)) {
        this.invalidate('imageUrl', 'Only PNG, JPG, JPEG, WebP, and GIF files are allowed.');
      } else {
        const byteLength = getBase64ByteLength(imageMeta.base64Data);
        const maxBytes = imageMeta.mimeType === 'image/gif' ? GIF_MAX_BYTES : STATIC_IMAGE_MAX_BYTES;
        if (byteLength === null || byteLength > maxBytes) {
          this.invalidate(
            'imageUrl',
            imageMeta.mimeType === 'image/gif'
              ? 'GIF files must be 10MB or smaller.'
              : 'PNG, JPG, JPEG, and WebP files must be 1MB or smaller.'
          );
        }
      }
    }
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
