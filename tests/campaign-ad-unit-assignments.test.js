const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('../backend/node_modules/mongoose');

const Campaign = require('../backend/models/Campaign');
const AdUnit = require('../backend/models/AdUnit');
const Inventory = require('../backend/models/Inventory');
const {
  applyAdUnitInventoryMappings,
  getCampaignAdUnitInventories
} = require('../backend/controllers/campaignController');

const originalMethods = {
  campaignFindById: Campaign.findById,
  adUnitFind: AdUnit.find,
  adUnitBulkWrite: AdUnit.bulkWrite,
  inventoryFind: Inventory.find
};

test.afterEach(() => {
  Campaign.findById = originalMethods.campaignFindById;
  AdUnit.find = originalMethods.adUnitFind;
  AdUnit.bulkWrite = originalMethods.adUnitBulkWrite;
  Inventory.find = originalMethods.inventoryFind;
});

test('campaign assignment response normalizes populated Inventory ObjectIds without recursion', async () => {
  const accountId = new mongoose.Types.ObjectId();
  const campaignId = new mongoose.Types.ObjectId();
  const adUnitId = new mongoose.Types.ObjectId();
  const inventoryId = new mongoose.Types.ObjectId();

  Campaign.findById = async (id) => {
    assert.equal(String(id), String(campaignId));
    return { _id: campaignId, account: accountId };
  };
  AdUnit.find = (filter) => {
    assert.deepEqual(filter, { account: String(accountId), campaign: campaignId });
    return {
      populate(field) {
        if (field === 'inventories') return this;
        assert.equal(field, 'inventory');
        return [{
          _id: adUnitId,
          name: 'Banner A',
          inventory: { _id: inventoryId },
          inventories: [{ _id: inventoryId }]
        }];
      }
    };
  };

  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  await getCampaignAdUnitInventories(
    { params: { id: String(campaignId) }, user: { accountId: String(accountId) } },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.mappings[0].inventoryIds, [String(inventoryId)]);
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
  AdUnit.bulkWrite = async (operations) => {
    updates.push(...operations.map((operation) => operation.updateOne));
    return { matchedCount: operations.length, modifiedCount: operations.length };
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
  AdUnit.bulkWrite = async () => {
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

test('duplicate mapping rows fail before any assignment is changed', async () => {
  const accountId = new mongoose.Types.ObjectId();
  const campaignId = new mongoose.Types.ObjectId();
  const adUnitId = new mongoose.Types.ObjectId();
  let bulkWriteCalled = false;

  AdUnit.find = () => ({
    select: async () => [{ _id: adUnitId, name: 'Banner A' }]
  });
  AdUnit.bulkWrite = async () => {
    bulkWriteCalled = true;
  };

  await assert.rejects(
    applyAdUnitInventoryMappings({
      accountId,
      campaignId,
      mappings: [
        { adUnitId, inventoryIds: [] },
        { adUnitId, inventoryIds: [] }
      ]
    }),
    (error) => error.statusCode === 400 && /only appear once/i.test(error.message)
  );
  assert.equal(bulkWriteCalled, false);
});

test('assignment update fails closed when an exact Ad Unit no longer matches', async () => {
  const accountId = new mongoose.Types.ObjectId();
  const campaignId = new mongoose.Types.ObjectId();
  const adUnitId = new mongoose.Types.ObjectId();

  AdUnit.find = () => ({
    select: async () => [{ _id: adUnitId, name: 'Banner A' }]
  });
  AdUnit.bulkWrite = async () => ({ matchedCount: 0, modifiedCount: 0 });

  await assert.rejects(
    applyAdUnitInventoryMappings({
      accountId,
      campaignId,
      mappings: [{ adUnitId, inventoryIds: [] }]
    }),
    (error) => error.statusCode === 409 && /relationships changed/i.test(error.message)
  );
});
