const isWithinDeliveryWindow = (entity, now = new Date()) => {
  if (!entity) return false;

  const nowTime = now.getTime();
  const startTime = new Date(entity.startDate).getTime();
  if (!Number.isFinite(startTime) || startTime > nowTime) return false;

  if (!entity.endDate) return true;
  const endTime = new Date(entity.endDate).getTime();
  return Number.isFinite(endTime) && endTime >= nowTime;
};

const isCampaignDeliverable = (campaign, now = new Date()) => (
  Boolean(campaign) &&
  campaign.status === 'active' &&
  isWithinDeliveryWindow(campaign, now)
);

const isAdUnitDeliverable = (adUnit, now = new Date()) => (
  Boolean(adUnit) &&
  adUnit.status === 'active' &&
  isWithinDeliveryWindow(adUnit, now) &&
  isCampaignDeliverable(adUnit.campaign, now)
);

module.exports = {
  isAdUnitDeliverable,
  isCampaignDeliverable,
  isWithinDeliveryWindow
};
