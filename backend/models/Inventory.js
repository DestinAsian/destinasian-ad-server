const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
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
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    inventoryCode: {
      type: Number,
      min: 1,
      max: 999
    },
    // Internal concurrency guard shared by assignment and delete transactions.
    assignmentRevision: { type: Number, default: 0, select: false },
    description: {
      type: String,
      trim: true
    },
    groupName: {
      type: String,
      trim: true
    },
    rotationMode: {
      type: String,
      enum: ['single', 'rotate'],
      default: 'rotate'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

inventorySchema.index({ account: 1, key: 1 }, { unique: true });
inventorySchema.index({ account: 1, name: 1 }, { unique: true });
inventorySchema.index({ account: 1, groupName: 1 });
inventorySchema.index(
  { account: 1, inventoryCode: 1 },
  {
    unique: true,
    partialFilterExpression: { inventoryCode: { $exists: true } }
  }
);

module.exports = mongoose.model('Inventory', inventorySchema);
