const { v4: uuidv4 } = require('uuid');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const Impression = require('../models/Impression');
const Click = require('../models/Click');

/**
 * Calculate ad unit stats from tracking data
 */
const calculateAdUnitStats = async (adUnitId) => {
  try {
    const impressionCount = await Impression.countDocuments({ adUnit: adUnitId });
    const clickCount = await Click.countDocuments({ adUnit: adUnitId });
    return {
      impressions: impressionCount,
      clicks: clickCount,
      ctr: impressionCount > 0 ? ((clickCount / impressionCount) * 100).toFixed(2) : 0
    };
  } catch (error) {
    console.error(`Error calculating stats for ad unit ${adUnitId}:`, error);
    return { impressions: 0, clicks: 0, ctr: 0 };
  }
};

exports.createAdUnit = async (req, res) => {
  try {
    const { name, description, campaign, inventory, startDate, endDate, imageUrl, clickUrl, width } = req.body;
    const adCode = `ad-${uuidv4()}`;

    const campaignDoc = await Campaign.findById(campaign);
    if (!campaignDoc) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaignDoc.user.toString() !== req.user.id || campaignDoc.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to use this campaign' });
    }

    let inventoryDoc = null;
    if (inventory) {
      inventoryDoc = await Inventory.findById(inventory);
      if (!inventoryDoc) {
        return res.status(404).json({ error: 'Inventory not found' });
      }

      if (inventoryDoc.user.toString() !== req.user.id || inventoryDoc.account.toString() !== req.user.accountId) {
        return res.status(403).json({ error: 'Not authorized to use this inventory' });
      }
    }

    const adUnit = new AdUnit({
      user: req.user.id,
      account: req.user.accountId,
      name,
      description,
      campaign,
      inventory: inventoryDoc ? inventoryDoc._id : undefined,
      startDate,
      endDate,
      adCode,
      imageUrl,
      clickUrl,
      width: width || '100%'
    });

    await adUnit.save();

    // Add ad unit to campaign
    await Campaign.findByIdAndUpdate(campaignDoc._id, {
      $push: { adUnits: adUnit._id }
    });

    res.status(201).json(adUnit);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getAllAdUnits = async (req, res) => {
  try {
    const adUnits = await AdUnit.find({ user: req.user.id, account: req.user.accountId }).populate('campaign');
    
    // Enrich ad units with real-time stats from tracking data
    const enrichedAdUnits = await Promise.all(
      adUnits.map(async (adUnit) => {
        const stats = await calculateAdUnitStats(adUnit._id);
        const adUnitObj = adUnit.toObject();
        return {
          ...adUnitObj,
          impressions: stats.impressions,
          clicks: stats.clicks,
          ctr: stats.ctr
        };
      })
    );
    
    res.json(enrichedAdUnits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAdUnit = async (req, res) => {
  try {
    const adUnit = await AdUnit.findById(req.params.id).populate('campaign');
    if (!adUnit) return res.status(404).json({ error: 'Ad unit not found' });
    
    // Check if user owns this ad unit and it belongs to their account
    if (adUnit.user.toString() !== req.user.id || adUnit.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this ad unit' });
    }
    
    // Enrich with real-time stats
    const stats = await calculateAdUnitStats(adUnit._id);
    const adUnitObj = adUnit.toObject();
    
    res.json({
      ...adUnitObj,
      impressions: stats.impressions,
      clicks: stats.clicks,
      ctr: stats.ctr
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateAdUnit = async (req, res) => {
  try {
    let adUnit = await AdUnit.findById(req.params.id);
    if (!adUnit) return res.status(404).json({ error: 'Ad unit not found' });
    
    // Check if user owns this ad unit and it belongs to their account
    if (adUnit.user.toString() !== req.user.id || adUnit.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to update this ad unit' });
    }
    
    if (req.body.inventory) {
      const inventoryDoc = await Inventory.findById(req.body.inventory);
      if (!inventoryDoc) {
        return res.status(404).json({ error: 'Inventory not found' });
      }
      if (inventoryDoc.user.toString() !== req.user.id || inventoryDoc.account.toString() !== req.user.accountId) {
        return res.status(403).json({ error: 'Not authorized to use this inventory' });
      }
    }

    adUnit = await AdUnit.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('campaign');
    res.json(adUnit);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteAdUnit = async (req, res) => {
  try {
    const adUnit = await AdUnit.findById(req.params.id);
    if (!adUnit) return res.status(404).json({ error: 'Ad unit not found' });
    
    // Check if user owns this ad unit and it belongs to their account
    if (adUnit.user.toString() !== req.user.id || adUnit.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to delete this ad unit' });
    }
    
    await AdUnit.findByIdAndDelete(req.params.id);
    await Campaign.findByIdAndUpdate(adUnit.campaign, {
      $pull: { adUnits: adUnit._id }
    });
    res.json({ message: 'Ad unit deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAdUnitStats = async (req, res) => {
  try {
    const adUnit = await AdUnit.findById(req.params.id);
    if (!adUnit) return res.status(404).json({ error: 'Ad unit not found' });
    
    // Check if user owns this ad unit and it belongs to their account
    if (adUnit.user.toString() !== req.user.id || adUnit.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this ad unit' });
    }

    const stats = await calculateAdUnitStats(req.params.id);
    
    res.json({
      adUnitId: adUnit._id,
      adUnitName: adUnit.name,
      impressions: stats.impressions,
      clicks: stats.clicks,
      ctr: `${stats.ctr}%`,
      lastUpdated: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAdUnitByCampaign = async (req, res) => {
  try {
    const adUnits = await AdUnit.find({ user: req.user.id, account: req.user.accountId, campaign: req.params.campaignId });
    
    // Enrich ad units with real-time stats from tracking data
    const enrichedAdUnits = await Promise.all(
      adUnits.map(async (adUnit) => {
        const stats = await calculateAdUnitStats(adUnit._id);
        const adUnitObj = adUnit.toObject();
        return {
          ...adUnitObj,
          impressions: stats.impressions,
          clicks: stats.clicks,
          ctr: stats.ctr
        };
      })
    );
    
    res.json(enrichedAdUnits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Public ad serving endpoint by inventory key or ad code
 * GET /api/serve?inventory=homepage-top
 * GET /api/serve?adCode=ad-xxxx
 */
exports.serveAd = async (req, res) => {
  try {
    const { inventory, adCode } = req.query;

    if (!inventory && !adCode) {
      return res.status(400).json({ error: 'inventory or adCode is required' });
    }

    let adUnit;
    const now = new Date();

    if (adCode) {
      adUnit = await AdUnit.findOne({
        adCode,
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now }
      }).populate('campaign');
    } else {
      const inventoryDoc = await Inventory.findOne({ key: inventory.toLowerCase(), isActive: true });
      if (!inventoryDoc) {
        return res.status(404).json({ error: 'Inventory not found' });
      }

      const activeCampaignIds = await Campaign.find({
        account: inventoryDoc.account,
        status: 'active',
        startDate: { $lte: now },
        $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }]
      }).select('_id');

      adUnit = await AdUnit.findOne({
        inventory: inventoryDoc._id,
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now },
        campaign: { $in: activeCampaignIds.map(c => c._id) }
      }).populate('campaign');
    }

    if (!adUnit) {
      return res.status(404).json({ error: 'No active ad available' });
    }

    res.json({
      adCode: adUnit.adCode,
      name: adUnit.name,
      imageUrl: adUnit.imageUrl,
      clickUrl: adUnit.clickUrl,
      width: adUnit.width,
      aspectRatio: adUnit.aspectRatio,
      campaignId: adUnit.campaign?._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
