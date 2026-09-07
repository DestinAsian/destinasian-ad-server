const test = require('node:test');
const assert = require('node:assert/strict');

const AdUnit = require('../backend/models/AdUnit');
const {
  AD_UNIT_SUMMARY_PROJECTION,
  applyAdUnitSummaryProjection,
  getImageCreativeIdSet,
  isAdUnitSummaryView
} = require('../backend/services/adUnitSummaryService');

const originalFind = AdUnit.find;

test.afterEach(() => {
  AdUnit.find = originalFind;
});

test('summary view is explicit and does not change default endpoint behavior', () => {
  assert.equal(isAdUnitSummaryView('summary'), true);
  assert.equal(isAdUnitSummaryView(' SUMMARY '), true);
  assert.equal(isAdUnitSummaryView(undefined), false);
  assert.equal(isAdUnitSummaryView('detail'), false);
});

test('summary projection excludes only large creative fields', () => {
  let selectedFields = null;
  const query = {
    select(fields) {
      selectedFields = fields;
      return this;
    }
  };

  assert.equal(applyAdUnitSummaryProjection(query, false), query);
  assert.equal(selectedFields, null);
  assert.equal(applyAdUnitSummaryProjection(query, true), query);
  assert.equal(selectedFields, AD_UNIT_SUMMARY_PROJECTION);
  assert.equal(selectedFields, '-imageUrl -htmlCreative -iframeUrl');
});

test('image availability is returned as lightweight ids without creative data', async () => {
  const rows = [{ _id: 'ad-1' }, { _id: 'ad-2' }];
  let receivedFilter = null;
  let selectedFields = null;

  AdUnit.find = (filter) => {
    receivedFilter = filter;
    return {
      select(fields) {
        selectedFields = fields;
        return this;
      },
      async lean() {
        return rows;
      }
    };
  };

  const result = await getImageCreativeIdSet({
    accountId: 'account-1',
    adUnitIds: ['ad-1', 'ad-2', 'ad-3']
  });

  assert.equal(selectedFields, '_id');
  assert.deepEqual(receivedFilter, {
    account: 'account-1',
    _id: { $in: ['ad-1', 'ad-2', 'ad-3'] },
    imageUrl: { $exists: true, $ne: '' }
  });
  assert.deepEqual([...result], ['ad-1', 'ad-2']);
});
