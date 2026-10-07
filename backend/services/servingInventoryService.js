const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');

const resolveServingInventory = async ({ inventory, inventoryId, accountId } = {}) => {
  const filter = { isActive: true };
  for (const [field, value] of [['inventoryId', inventoryId], ['accountId', accountId]]) {
    if (value === undefined || value === '') continue;
    if (!mongoose.Types.ObjectId.isValid(String(value))) {
      const error = new Error(`Invalid ${field}`);
      error.statusCode = 400;
      throw error;
    }
    filter[field === 'inventoryId' ? '_id' : 'account'] = value;
  }
  if (!filter._id) filter.key = String(inventory || '').trim().toLowerCase();
  const candidates = await Inventory.find(filter).limit(2);
  if (candidates.length > 1) {
    const error = new Error('Ad Channel key is ambiguous. Use inventoryId or accountId in the ad integration.');
    error.statusCode = 409;
    throw error;
  }
  return candidates[0] || null;
};

module.exports = { resolveServingInventory };
