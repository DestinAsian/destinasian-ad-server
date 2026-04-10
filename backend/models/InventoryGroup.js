const mongoose = require('mongoose');

const inventoryGroupSchema = new mongoose.Schema(
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
    sortOrder: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

inventoryGroupSchema.index({ account: 1, name: 1 }, { unique: true });
inventoryGroupSchema.index({ account: 1, sortOrder: 1, name: 1 });

module.exports = mongoose.model('InventoryGroup', inventoryGroupSchema);
