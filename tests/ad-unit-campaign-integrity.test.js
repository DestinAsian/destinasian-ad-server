const test = require('node:test');
const assert = require('node:assert/strict');

const AdUnit = require('../backend/models/AdUnit');
const Campaign = require('../backend/models/Campaign');
const {
  ensureUniqueAdUnitName,
  linkCreatedAdUnitToCampaign
} = require('../backend/controllers/adUnitController');

const originalMethods = {
  campaignFindOneAndUpdate: Campaign.findOneAndUpdate,
  adUnitFindByIdAndDelete: AdUnit.findByIdAndDelete,
  adUnitExists: AdUnit.exists
};

test.afterEach(() => {
  Campaign.findOneAndUpdate = originalMethods.campaignFindOneAndUpdate;
  AdUnit.findByIdAndDelete = originalMethods.adUnitFindByIdAndDelete;
  AdUnit.exists = originalMethods.adUnitExists;
});

test('duplicate ad unit names are rejected within the same campaign', async () => {
  let receivedFilter = null;
  AdUnit.exists = async (filter) => {
    receivedFilter = filter;
    return { _id: 'existing-ad-unit' };
  };

  await assert.rejects(
    ensureUniqueAdUnitName({
      accountId: 'account-1',
      campaignId: 'campaign-1',
      name: '  Example Banner  '
    }),
    (error) => error.statusCode === 409 && /already exists/.test(error.message)
  );

  assert.equal(receivedFilter.account, 'account-1');
  assert.equal(receivedFilter.campaign, 'campaign-1');
  assert.equal(receivedFilter.name.source, '^Example Banner$');
  assert.equal(receivedFilter.name.flags, 'i');
});

test('ad unit uniqueness check excludes the record being renamed', async () => {
  let receivedFilter = null;
  AdUnit.exists = async (filter) => {
    receivedFilter = filter;
    return null;
  };

  await ensureUniqueAdUnitName({
    accountId: 'account-1',
    campaignId: 'campaign-1',
    name: 'Banner [300x250]',
    excludeAdUnitId: 'ad-unit-1'
  });

  assert.deepEqual(receivedFilter._id, { $ne: 'ad-unit-1' });
  assert.equal(receivedFilter.name.test('banner [300x250]'), true);
  assert.equal(receivedFilter.name.test('banner 300x250'), false);
});

test('new ad unit is linked using both campaign and account identity', async () => {
  let receivedFilter = null;
  let receivedUpdate = null;
  let cleanupCalled = false;
  Campaign.findOneAndUpdate = async (filter, update) => {
    receivedFilter = filter;
    receivedUpdate = update;
    return { _id: 'campaign-1' };
  };
  AdUnit.findByIdAndDelete = async () => {
    cleanupCalled = true;
  };

  const linked = await linkCreatedAdUnitToCampaign({
    adUnit: { _id: 'ad-unit-1' },
    campaignId: 'campaign-1',
    accountId: 'account-1'
  });

  assert.equal(linked, true);
  assert.deepEqual(receivedFilter, { _id: 'campaign-1', account: 'account-1' });
  assert.deepEqual(receivedUpdate, { $addToSet: { adUnits: 'ad-unit-1' } });
  assert.equal(cleanupCalled, false);
});

test('new ad unit is removed when its campaign disappears before linking', async () => {
  let removedAdUnitId = null;
  Campaign.findOneAndUpdate = async () => null;
  AdUnit.findByIdAndDelete = async (adUnitId) => {
    removedAdUnitId = adUnitId;
  };

  const linked = await linkCreatedAdUnitToCampaign({
    adUnit: { _id: 'ad-unit-1' },
    campaignId: 'campaign-1',
    accountId: 'account-1'
  });

  assert.equal(linked, false);
  assert.equal(removedAdUnitId, 'ad-unit-1');
});

test('new ad unit is removed when campaign linking fails', async () => {
  let removedAdUnitId = null;
  const databaseError = new Error('temporary database failure');
  Campaign.findOneAndUpdate = async () => {
    throw databaseError;
  };
  AdUnit.findByIdAndDelete = async (adUnitId) => {
    removedAdUnitId = adUnitId;
  };

  await assert.rejects(
    linkCreatedAdUnitToCampaign({
      adUnit: { _id: 'ad-unit-1' },
      campaignId: 'campaign-1',
      accountId: 'account-1'
    }),
    databaseError
  );

  assert.equal(removedAdUnitId, 'ad-unit-1');
});
