const test = require('node:test');
const assert = require('node:assert/strict');

const AdUnit = require('../backend/models/AdUnit');
const Inventory = require('../backend/models/Inventory');
const { deleteInventory } = require('../backend/controllers/inventoryController');

const originalMethods = {
  inventoryFindById: Inventory.findById,
  inventoryFindByIdAndDelete: Inventory.findByIdAndDelete,
  adUnitCountDocuments: AdUnit.countDocuments
};

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

test.afterEach(() => {
  Inventory.findById = originalMethods.inventoryFindById;
  Inventory.findByIdAndDelete = originalMethods.inventoryFindByIdAndDelete;
  AdUnit.countDocuments = originalMethods.adUnitCountDocuments;
});

test('ad channel deletion is rejected while active ad units remain linked', async () => {
  let deleteCalled = false;
  Inventory.findById = async () => ({ _id: 'inventory-1', account: 'account-1' });
  AdUnit.countDocuments = async (filter) => filter.status === 'active' ? 2 : 3;
  Inventory.findByIdAndDelete = async () => {
    deleteCalled = true;
  };
  const res = createResponse();

  await deleteInventory(
    { params: { id: 'inventory-1' }, user: { accountId: 'account-1' } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.linkedAdUnitCount, 3);
  assert.equal(res.body.activeAdUnitCount, 2);
  assert.match(res.body.error, /2 active Ad Units still linked/);
  assert.match(res.body.error, /uncheck all Ad Units, and save/i);
  assert.equal(deleteCalled, false);
});

test('ad channel deletion is rejected until paused ad units are also unlinked', async () => {
  Inventory.findById = async () => ({ _id: 'inventory-1', account: 'account-1' });
  AdUnit.countDocuments = async (filter) => filter.status === 'active' ? 0 : 1;
  const res = createResponse();

  await deleteInventory(
    { params: { id: 'inventory-1' }, user: { accountId: 'account-1' } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.linkedAdUnitCount, 1);
  assert.equal(res.body.activeAdUnitCount, 0);
  assert.match(res.body.error, /1 Ad Unit still linked/);
});

test('empty ad channel can be deleted', async () => {
  let deletedInventoryId = null;
  Inventory.findById = async () => ({ _id: 'inventory-1', account: 'account-1' });
  AdUnit.countDocuments = async () => 0;
  Inventory.findByIdAndDelete = async (inventoryId) => {
    deletedInventoryId = inventoryId;
    return { _id: inventoryId };
  };
  const res = createResponse();

  await deleteInventory(
    { params: { id: 'inventory-1' }, user: { accountId: 'account-1' } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: 'Inventory deleted' });
  assert.equal(deletedInventoryId, 'inventory-1');
});
