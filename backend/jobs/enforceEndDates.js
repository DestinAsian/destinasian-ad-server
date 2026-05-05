const cron = require('node-cron');
const Campaign = require('../models/Campaign');
const AdUnit = require('../models/AdUnit');

const enforceExpiredCampaignsAndAdUnits = async () => {
  const now = new Date();

  const expiredCampaignResult = await Campaign.updateMany(
    {
      status: 'active',
      endDate: { $ne: null, $lte: now }
    },
    {
      $set: { status: 'ended' }
    }
  );

  const expiredCampaigns = await Campaign.find({
    status: 'ended',
    endDate: { $ne: null, $lte: now }
  }).select('_id');

  const endedCampaignIds = expiredCampaigns.map((campaign) => campaign._id);
  let pausedFromEndedCampaignCount = 0;

  if (endedCampaignIds.length > 0) {
    const pausedFromEndedCampaignResult = await AdUnit.updateMany(
      {
        campaign: { $in: endedCampaignIds },
        status: 'active'
      },
      {
        $set: { status: 'paused' }
      }
    );

    pausedFromEndedCampaignCount = pausedFromEndedCampaignResult.modifiedCount || 0;
  }

  const expiredAdUnitResult = await AdUnit.updateMany(
    {
      status: 'active',
      endDate: { $ne: null, $lte: now }
    },
    {
      $set: { status: 'paused' }
    }
  );

  const result = {
    endedCampaigns: expiredCampaignResult.modifiedCount || 0,
    pausedAdUnitsFromEndedCampaigns: pausedFromEndedCampaignCount,
    pausedExpiredAdUnits: expiredAdUnitResult.modifiedCount || 0,
    timestamp: now.toISOString()
  };

  console.log(
    `[EndDateEnforcer] campaigns ended=${result.endedCampaigns}, ` +
    `adUnits paused from ended campaigns=${result.pausedAdUnitsFromEndedCampaigns}, ` +
    `adUnits paused by own endDate=${result.pausedExpiredAdUnits}, ts=${result.timestamp}`
  );

  return result;
};

const initializeEndDateEnforcementJob = () => {
  const schedule = process.env.STATUS_CRON_SCHEDULE || '*/5 * * * *';
  const shouldEnable = String(process.env.ENABLE_STATUS_CRON || 'true').toLowerCase() === 'true';

  if (!shouldEnable) {
    console.log('[EndDateEnforcer] Disabled via ENABLE_STATUS_CRON');
    return null;
  }

  const job = cron.schedule(schedule, async () => {
    try {
      await enforceExpiredCampaignsAndAdUnits();
    } catch (error) {
      console.error('[EndDateEnforcer] Failed:', error);
    }
  });

  console.log(`[EndDateEnforcer] Initialized with schedule "${schedule}"`);
  enforceExpiredCampaignsAndAdUnits().catch((error) => {
    console.error('[EndDateEnforcer] Startup run failed:', error);
  });

  return job;
};

module.exports = {
  enforceExpiredCampaignsAndAdUnits,
  initializeEndDateEnforcementJob
};
