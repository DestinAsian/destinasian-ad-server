const Campaign = require('../models/Campaign');
const AdUnit = require('../models/AdUnit');
const Impression = require('../models/Impression');
const Click = require('../models/Click');
const { calculateCampaignStats } = require('../jobs/updateCampaignStats');

exports.createCampaign = async (req, res) => {
  try {
    const { name, description, startDate, endDate } = req.body;
    const campaign = new Campaign({
      user: req.user.id,
      account: req.user.accountId,
      name,
      description,
      startDate,
      endDate
    });
    await campaign.save();
    res.status(201).json(campaign);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getAllCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find({ user: req.user.id, account: req.user.accountId }).populate('adUnits');
    
    // Enrich campaigns with real-time stats from tracking data
    const enrichedCampaigns = await Promise.all(
      campaigns.map(async (campaign) => {
        const stats = await calculateCampaignStats(campaign._id);
        const campaignObj = campaign.toObject();
        return {
          ...campaignObj,
          totalImpressions: stats.totalImpressions,
          totalClicks: stats.totalClicks,
          ctr: stats.ctr
        };
      })
    );
    
    res.json(enrichedCampaigns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).populate('adUnits');
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    // Check if user owns this campaign and it belongs to their account
    if (campaign.user.toString() !== req.user.id || campaign.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this campaign' });
    }
    
    // Enrich with real-time stats
    const stats = await calculateCampaignStats(campaign._id);
    const campaignObj = campaign.toObject();
    
    res.json({
      ...campaignObj,
      totalImpressions: stats.totalImpressions,
      totalClicks: stats.totalClicks,
      ctr: stats.ctr
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateCampaign = async (req, res) => {
  try {
    let campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    // Check if user owns this campaign and it belongs to their account
    if (campaign.user.toString() !== req.user.id || campaign.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to update this campaign' });
    }
    
    campaign = await Campaign.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('adUnits');
    res.json(campaign);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    // Check if user owns this campaign and it belongs to their account
    if (campaign.user.toString() !== req.user.id || campaign.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to delete this campaign' });
    }
    
    await Campaign.findByIdAndDelete(req.params.id);
    res.json({ message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCampaignStats = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Check if user owns this campaign and it belongs to their account
    if (campaign.user.toString() !== req.user.id || campaign.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this campaign' });
    }

    const stats = await calculateCampaignStats(req.params.id);

    res.json({
      campaignId: campaign._id,
      campaignName: campaign.name,
      impressions: stats.totalImpressions,
      clicks: stats.totalClicks,
      ctr: `${stats.ctr}%`,
      lastUpdated: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
