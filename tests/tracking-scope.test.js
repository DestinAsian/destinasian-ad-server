const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('../backend/node_modules/mongoose');

const AdUnit = require('../backend/models/AdUnit');
const { buildScopedMatches } = require('../backend/controllers/trackingController');

const originalExists = AdUnit.exists;

test.afterEach(() => {
  AdUnit.exists = originalExists;
});

test('analytics applies an exact account-scoped Ad Unit filter to daily and event data', async () => {
  const accountId = new mongoose.Types.ObjectId();
  const adUnitId = new mongoose.Types.ObjectId();
  AdUnit.exists = async (filter) => {
    assert.equal(String(filter._id), String(adUnitId));
    assert.equal(String(filter.account), String(accountId));
    return { _id: adUnitId };
  };

  const result = await buildScopedMatches(accountId, { adUnitId: String(adUnitId) });

  assert.equal(result.noResults, false);
  assert.equal(String(result.dailyMatch.adUnit), String(adUnitId));
  assert.equal(String(result.eventMatch.adUnit), String(adUnitId));
});

test('analytics rejects malformed Ad Unit filters without querying aggregate data', async () => {
  const result = await buildScopedMatches(new mongoose.Types.ObjectId(), {
    adUnitId: 'not-an-object-id'
  });

  assert.equal(result.noResults, true);
});
