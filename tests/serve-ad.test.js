const test = require('node:test');
const assert = require('node:assert/strict');

const AdUnit = require('../backend/models/AdUnit');
const Campaign = require('../backend/models/Campaign');
const Inventory = require('../backend/models/Inventory');
const { serveAd } = require('../backend/controllers/adUnitController');

const originalMethods = {
  adUnitFind: AdUnit.find,
  adUnitFindOne: AdUnit.findOne,
  campaignFind: Campaign.find,
  inventoryFindOne: Inventory.findOne
};

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    }
  };
}

function mockInventoryServing(candidates) {
  Inventory.findOne = async () => ({ _id: 'inventory-1', account: 'account-1' });
  Campaign.find = () => ({
    select: async () => [{ _id: 'campaign-1' }]
  });
  AdUnit.find = () => ({
    populate: async () => candidates
  });
}

test.afterEach(() => {
  AdUnit.find = originalMethods.adUnitFind;
  AdUnit.findOne = originalMethods.adUnitFindOne;
  Campaign.find = originalMethods.campaignFind;
  Inventory.findOne = originalMethods.inventoryFindOne;
});

test('available ad returns 200 and the existing payload contract', async () => {
  mockInventoryServing([
    {
      adCode: 'ad-123',
      crmAdId: 'crm-123',
      name: 'Test Ad',
      imageUrl: 'https://example.com/ad.jpg',
      clickUrl: 'https://example.com',
      width: '100%',
      aspectRatio: '1/1',
      campaign: { _id: 'campaign-1' }
    }
  ]);
  const res = createResponse();

  await serveAd({ query: { inventory: 'homepage' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.adCode, 'ad-123');
  assert.equal(res.body.campaignId, 'campaign-1');
});

test('inventory with no active ad returns 204', async () => {
  mockInventoryServing([]);
  const res = createResponse();

  await serveAd({ query: { inventory: 'homepage' } }, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.body, undefined);
});

test('unknown inventory is an expected 204 empty response', async () => {
  Inventory.findOne = async () => null;
  const res = createResponse();

  await serveAd({ query: { inventory: 'unconfigured' } }, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.body, undefined);
});

test('all excluded candidates preserve the existing rotation fallback', async () => {
  mockInventoryServing([{ adCode: 'ad-123', campaign: { _id: 'campaign-1' } }]);
  const res = createResponse();

  await serveAd(
    { query: { inventory: 'homepage', exclude: 'ad-123' } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.adCode, 'ad-123');
});

test('missing inventory and adCode remains a 400 malformed request', async () => {
  const res = createResponse();

  await serveAd({ query: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'inventory or adCode is required' });
});

test('internal serving failure remains 500 without exposing raw details', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  Inventory.findOne = async () => {
    throw new Error('Database credentials leaked');
  };
  const res = createResponse();

  try {
    await serveAd({ query: { inventory: 'homepage' } }, res);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal Server Error' });
});
