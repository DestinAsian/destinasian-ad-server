const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isAdUnitDeliverable,
  isCampaignDeliverable
} = require('../backend/services/deliveryEligibilityService');

const now = new Date('2026-09-15T00:00:00.000Z');
const activeCampaign = {
  status: 'active',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2030-01-01T00:00:00.000Z')
};

test('campaign delivery eligibility requires active status and a valid date window', () => {
  assert.equal(isCampaignDeliverable(activeCampaign, now), true);
  assert.equal(isCampaignDeliverable({ ...activeCampaign, status: 'paused' }, now), false);
  assert.equal(isCampaignDeliverable({ ...activeCampaign, startDate: new Date('2027-01-01') }, now), false);
});

test('ad unit delivery eligibility also enforces its parent campaign', () => {
  const adUnit = {
    status: 'active',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2030-01-01T00:00:00.000Z'),
    campaign: activeCampaign
  };

  assert.equal(isAdUnitDeliverable(adUnit, now), true);
  assert.equal(isAdUnitDeliverable({ ...adUnit, status: 'paused' }, now), false);
  assert.equal(
    isAdUnitDeliverable({ ...adUnit, campaign: { ...activeCampaign, status: 'paused' } }, now),
    false
  );
});
