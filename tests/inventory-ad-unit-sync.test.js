const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('../backend/node_modules/mongoose');

const AdUnit = require('../backend/models/AdUnit');
const { syncInventoryAdUnits } = require('../backend/controllers/inventoryController');

const originalMethods = {
  find: AdUnit.find,
  updateOne: AdUnit.updateOne
};

const inventoryId = new mongoose.Types.ObjectId();
const otherInventoryId = new mongoose.Types.ObjectId();
const accountId = new mongoose.Types.ObjectId();

test.afterEach(() => {
  AdUnit.find = originalMethods.find;
  AdUnit.updateOne = originalMethods.updateOne;
});

test('unchecking every ad unit clears both primary and secondary channel assignments', async () => {
  const linkedAdUnit = {
    _id: new mongoose.Types.ObjectId(),
    account: accountId,
    campaign: new mongoose.Types.ObjectId(),
    inventory: inventoryId,
    inventories: [inventoryId]
  };
  const updates = [];

  AdUnit.find = () => ({ select: async () => [linkedAdUnit] });
  AdUnit.updateOne = async (filter, update) => updates.push({ filter, update });

  await syncInventoryAdUnits({ inventoryId, accountId, adUnitIds: [] });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].update.$set.inventory, null);
  assert.deepEqual(updates[0].update.$set.inventories, []);
});

test('unchecking one secondary channel preserves the remaining primary assignment', async () => {
  const linkedAdUnit = {
    _id: new mongoose.Types.ObjectId(),
    account: accountId,
    campaign: new mongoose.Types.ObjectId(),
    inventory: otherInventoryId,
    inventories: [otherInventoryId, inventoryId],
    crmAdId: 'existing-id'
  };
  const updates = [];

  AdUnit.find = () => ({ select: async () => [linkedAdUnit] });
  AdUnit.updateOne = async (filter, update) => updates.push({ filter, update });

  await syncInventoryAdUnits({ inventoryId, accountId, adUnitIds: [] });

  assert.equal(updates.length, 1);
  assert.equal(String(updates[0].update.$set.inventory), String(otherInventoryId));
  assert.deepEqual(
    updates[0].update.$set.inventories.map(String),
    [String(otherInventoryId)]
  );
});

test('rejects selected ad units that do not belong to the current account', async () => {
  const selectedId = new mongoose.Types.ObjectId();
  AdUnit.find = () => ({ select: async () => [] });

  await assert.rejects(
    syncInventoryAdUnits({ inventoryId, accountId, adUnitIds: [selectedId] }),
    (error) => error.statusCode === 400 && /invalid for this account/i.test(error.message)
  );
});
