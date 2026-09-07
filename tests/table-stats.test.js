const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('../backend/node_modules/mongoose');

const AdDailyStat = require('../backend/models/AdDailyStat');
const Impression = require('../backend/models/Impression');
const Click = require('../backend/models/Click');
const { getTableStatsByIds } = require('../backend/services/tableStatsService');

const originalMethods = {
  dailyAggregate: AdDailyStat.aggregate,
  impressionAggregate: Impression.aggregate,
  clickAggregate: Click.aggregate
};

test.afterEach(() => {
  AdDailyStat.aggregate = originalMethods.dailyAggregate;
  Impression.aggregate = originalMethods.impressionAggregate;
  Click.aggregate = originalMethods.clickAggregate;
});

test('table stats groups totals and today counts without per-row queries', async () => {
  const accountId = new mongoose.Types.ObjectId();
  const firstId = new mongoose.Types.ObjectId();
  const secondId = new mongoose.Types.ObjectId();
  let dailyCalls = 0;
  let impressionCalls = 0;
  let clickCalls = 0;

  AdDailyStat.aggregate = async (pipeline) => {
    dailyCalls += 1;
    assert.equal(String(pipeline[0].$match.account), String(accountId));
    assert.deepEqual(
      pipeline[0].$match.adUnit.$in.map(String),
      [String(firstId), String(secondId)]
    );
    return [{ _id: firstId, impressions: 100, clicks: 4 }];
  };
  Impression.aggregate = async () => {
    impressionCalls += 1;
    return [{ _id: firstId, count: 7 }];
  };
  Click.aggregate = async () => {
    clickCalls += 1;
    return [{ _id: firstId, count: 1 }];
  };

  const result = await getTableStatsByIds({
    accountId,
    dimension: 'adUnit',
    ids: [firstId, secondId]
  });

  assert.deepEqual(result.get(String(firstId)), {
    impressions: 100,
    impressionsToday: 7,
    clicks: 4,
    clicksToday: 1,
    ctr: '4.00'
  });
  assert.deepEqual(result.get(String(secondId)), {
    impressions: 0,
    impressionsToday: 0,
    clicks: 0,
    clicksToday: 0,
    ctr: 0
  });
  assert.equal(dailyCalls, 1);
  assert.equal(impressionCalls, 1);
  assert.equal(clickCalls, 1);
});

test('table stats rejects unsupported grouping dimensions', async () => {
  await assert.rejects(
    getTableStatsByIds({
      accountId: new mongoose.Types.ObjectId(),
      dimension: 'inventory',
      ids: [new mongoose.Types.ObjectId()]
    }),
    /Unsupported statistics dimension/
  );
});
