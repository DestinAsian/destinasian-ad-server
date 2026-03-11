const cron = require('node-cron');
const Campaign = require('../models/Campaign');
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
    
    const campaigns = await Campaign.find({ user: { $exists: true } });
    let updated = 0;

    for (const campaign of campaigns) {
      const stats = await calculateCampaignStats(campaign._id);
      if (stats) {
        await Campaign.findByIdAndUpdate(campaign._id, {
          totalImpressions: stats.totalImpressions,
          totalClicks: stats.totalClicks
        });
        updated++;
      }
    }

    console.log(`[Campaign Stats Job] ✓ Updated ${updated} campaigns at ${new Date().toISOString()}`);
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
  
  // Also run once on startup
  updateAllCampaignStats();
  
  return job;
};

module.exports = {
  calculateCampaignStats,
  updateAllCampaignStats,
  initializeCampaignStatsJob
};
