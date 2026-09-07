const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCampaignAdUnitFilter } = require('../backend/controllers/campaignController');

test('campaign child query intersects campaign, ad channel, and ad unit search', () => {
  const campaignIds = ['campaign-1'];
  const inventoryFilterIds = ['inventory-1'];
  const searchRegex = /pullman/i;
  const filter = buildCampaignAdUnitFilter({
    accountId: 'account-1',
    campaignIds,
    inventoryFilterIds,
    searchRegex,
    searchScope: 'adunit'
  });

  assert.equal(filter.account, 'account-1');
  assert.deepEqual(filter.campaign, { $in: campaignIds });
  assert.equal(filter.$and.length, 2);
  assert.deepEqual(filter.$and[0], {
    $or: [
      { inventory: { $in: inventoryFilterIds } },
      { inventories: { $in: inventoryFilterIds } }
    ]
  });
  assert.equal(filter.$and[1].$or[0].name, searchRegex);
});

test('campaign child query stays backward compatible without explicit filters', () => {
  const filter = buildCampaignAdUnitFilter({
    accountId: 'account-1',
    campaignIds: ['campaign-1'],
    inventoryFilterIds: null,
    searchRegex: /ignored/i,
    searchScope: 'all'
  });

  assert.equal(filter.$and, undefined);
});
