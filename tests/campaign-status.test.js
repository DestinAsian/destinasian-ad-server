const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateCampaignUpdateDates
} = require('../backend/controllers/campaignController');

test('reactivating a paused Campaign preserves a valid old start date', () => {
  const startDate = new Date('2026-08-05T08:03:00.000Z');
  const endDate = new Date('2030-12-05T15:59:00.000Z');

  const result = validateCampaignUpdateDates({
    payload: { status: 'active' },
    campaign: {
      status: 'paused',
      startDate,
      endDate
    }
  });

  assert.equal(result.valid, true);
  assert.equal(result.startDate, startDate);
  assert.equal(result.endDate, endDate);
});
