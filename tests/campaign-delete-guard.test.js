const test = require('node:test');
const assert = require('node:assert/strict');

const AdUnit = require('../backend/models/AdUnit');
const Campaign = require('../backend/models/Campaign');
const { deleteCampaign } = require('../backend/controllers/campaignController');

const originalMethods = {
  campaignFindById: Campaign.findById,
  campaignFindOneAndDelete: Campaign.findOneAndDelete,
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
  Campaign.findById = originalMethods.campaignFindById;
  Campaign.findOneAndDelete = originalMethods.campaignFindOneAndDelete;
  AdUnit.countDocuments = originalMethods.adUnitCountDocuments;
});

test('campaign deletion is rejected while linked ad units exist', async () => {
  let deleteCalled = false;
  Campaign.findById = async () => ({ _id: 'campaign-1', account: 'account-1' });
  AdUnit.countDocuments = async (filter) => {
    assert.deepEqual(filter, { account: 'account-1', campaign: 'campaign-1' });
    return 3;
  };
  Campaign.findOneAndDelete = async () => {
    deleteCalled = true;
    return null;
  };
  const res = createResponse();

  await deleteCampaign(
    { params: { id: 'campaign-1' }, user: { accountId: 'account-1' } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.adUnitCount, 3);
  assert.match(res.body.error, /cannot be deleted while it still contains Ad Units/);
  assert.equal(deleteCalled, false);
});

test('empty campaign is deleted with an atomic empty-relation condition', async () => {
  let deleteFilter = null;
  Campaign.findById = async () => ({ _id: 'campaign-1', account: 'account-1' });
  AdUnit.countDocuments = async () => 0;
  Campaign.findOneAndDelete = async (filter) => {
    deleteFilter = filter;
    return { _id: 'campaign-1' };
  };
  const res = createResponse();

  await deleteCampaign(
    { params: { id: 'campaign-1' }, user: { accountId: 'account-1' } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: 'Campaign deleted' });
  assert.deepEqual(deleteFilter, {
    _id: 'campaign-1',
    account: 'account-1',
    adUnits: { $size: 0 }
  });
});

test('campaign deletion fails safely when relationships change concurrently', async () => {
  Campaign.findById = async () => ({ _id: 'campaign-1', account: 'account-1' });
  AdUnit.countDocuments = async () => 0;
  Campaign.findOneAndDelete = async () => null;
  const res = createResponse();

  await deleteCampaign(
    { params: { id: 'campaign-1' }, user: { accountId: 'account-1' } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /relationships changed/);
});

test('campaign deletion preserves not-found and account-isolation behavior', async () => {
  const missingResponse = createResponse();
  Campaign.findById = async () => null;

  await deleteCampaign(
    { params: { id: 'missing' }, user: { accountId: 'account-1' } },
    missingResponse
  );

  assert.equal(missingResponse.statusCode, 404);

  const forbiddenResponse = createResponse();
  Campaign.findById = async () => ({ _id: 'campaign-1', account: 'account-2' });

  await deleteCampaign(
    { params: { id: 'campaign-1' }, user: { accountId: 'account-1' } },
    forbiddenResponse
  );

  assert.equal(forbiddenResponse.statusCode, 403);
});
