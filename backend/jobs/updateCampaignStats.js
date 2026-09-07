const cron = require('node-cron');
const Campaign = require('../models/Campaign');
const AdDailyStat = require('../models/AdDailyStat');
const Impression = require('../models/Impression');
const Click = require('../models/Click');

/**
 * Calculate campaign stats from all impressions and clicks
 * for the ad units in that campaign
 */
const calculateCampaignStats = async (campaignId) => {
  try {
    const impressionCount = await Impression.countDocuments({ campaign: campaignId });
    const clickCount = await Click.countDocuments({ campaign: campaignId });

    return {
      totalImpressions: impressionCount,
      totalClicks: clickCount,
      ctr: impressionCount > 0 ? ((clickCount / impressionCount) * 100).toFixed(2) : 0
    };
  } catch (error) {
    console.error(`Error calculating stats for campaign ${campaignId}:`, error);
    return null;
  }
};

/**
 * Update all campaign stats from tracking data
 * This runs daily at midnight
 */
const updateAllCampaignStats = async () => {
  try {
    console.log('[Campaign Stats Job] Starting daily campaign stats update...');

    const [campaigns, groupedStats] = await Promise.all([
      Campaign.find({ user: { $exists: true } }).select('_id'),
      AdDailyStat.aggregate([
        { $match: { campaign: { $ne: null } } },
        {
          $group: {
            _id: '$campaign',
            totalImpressions: { $sum: '$impressions' },
            totalClicks: { $sum: '$clicks' }
          }
        }
      ])
    ]);

    const statsByCampaignId = new Map(groupedStats.map((row) => [String(row._id), row]));
    const operations = campaigns.map((campaign) => {
      const stats = statsByCampaignId.get(String(campaign._id));
      return {
        updateOne: {
          filter: { _id: campaign._id },
          update: {
            $set: {
              totalImpressions: Number(stats?.totalImpressions || 0),
              totalClicks: Number(stats?.totalClicks || 0)
            }
          }
        }
      };
    });

    if (operations.length > 0) {
      await Campaign.bulkWrite(operations, { ordered: false });
    }

    console.log(`[Campaign Stats Job] ✓ Updated ${operations.length} campaigns at ${new Date().toISOString()}`);
  } catch (error) {
    console.error('[Campaign Stats Job] Error updating campaign stats:', error);
  }
};

/**
 * Initialize the scheduled job
 * Runs daily at 12:00 AM (midnight)
 */
const initializeCampaignStatsJob = () => {
  // Schedule: '0 0 * * *' = every day at 00:00 (midnight)
  const job = cron.schedule('0 0 * * *', updateAllCampaignStats);
  
  console.log('[Campaign Stats Job] Initialized - runs daily at midnight');
  
  return job;
};

module.exports = {
  calculateCampaignStats,
  updateAllCampaignStats,
  initializeCampaignStatsJob
};
