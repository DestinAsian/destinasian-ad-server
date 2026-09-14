const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('../backend/node_modules/mongoose');

const AdUnit = require('../backend/models/AdUnit');
const Inventory = require('../backend/models/Inventory');
const { applyAdUnitInventoryMappings } = require('../backend/controllers/campaignController');

const originalMethods = {
  adUnitFind: AdUnit.find,
  adUnitUpdateOne: AdUnit.updateOne,
  inventoryFind: Inventory.find
};

test.afterEach(() => {
  AdUnit.find = originalMethods.adUnitFind;
  AdUnit.updateOne = originalMethods.adUnitUpdateOne;
  Inventory.find = originalMethods.inventoryFind;
});

test('campaign assignment editor can unlink every Ad Channel without deleting the Ad Unit', async () => {
  const accountId = new mongoose.Types.ObjectId();
  const campaignId = new mongoose.Types.ObjectId();
  const adUnitId = new mongoose.Types.ObjectId();
  const updates = [];

  AdUnit.find = (filter) => {
    assert.deepEqual(filter, { account: accountId, campaign: campaignId });
    return {
      select: async () => [{ _id: adUnitId, name: 'Banner A' }]
    };
  };
  AdUnit.updateOne = async (filter, update) => {
    updates.push({ filter, update });
    return { matchedCount: 1, modifiedCount: 1 };
  };
  Inventory.find = () => {
    throw new Error('Inventory lookup must not run for an explicit empty assignment');
  };

  await applyAdUnitInventoryMappings({
    accountId,
    campaignId,
    mappings: [{ adUnitId, inventoryIds: [] }]
  });

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].filter, {
    _id: adUnitId,
    account: accountId,
    campaign: campaignId
  });
  assert.deepEqual(updates[0].update, {
    $set: {
      inventory: null,
      inventories: []
    },
    $unset: {
      inventoryCode: '',
      adUnitCode: '',
      crmAdId: ''
    }
  });
});

test('malformed Ad Channel ids are rejected instead of being treated as unlink', async () => {
  const accountId = new mongoose.Types.ObjectId();
  const campaignId = new mongoose.Types.ObjectId();
  const adUnitId = new mongoose.Types.ObjectId();
  let updateCalled = false;

  AdUnit.find = () => ({
    select: async () => [{ _id: adUnitId, name: 'Banner A' }]
  });
  AdUnit.updateOne = async () => {
    updateCalled = true;
  };

  await assert.rejects(
    applyAdUnitInventoryMappings({
      accountId,
      campaignId,
      mappings: [{ adUnitId, inventoryIds: ['not-an-object-id'] }]
    }),
    (error) => error.statusCode === 400 && /inventories are invalid/.test(error.message)
  );
  assert.equal(updateCalled, false);
});
