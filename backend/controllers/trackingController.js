const Impression = require('../models/Impression');
const Click = require('../models/Click');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');

exports.recordImpression = async (req, res) => {
  try {
    const { adUnitId } = req.params;
    const userIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const referrer = req.headers['referer'];

    const adUnit = await AdUnit.findOne({ adCode: adUnitId });
    if (!adUnit) return res.status(404).json({ error: 'Ad unit not found' });

    const impression = new Impression({
      adUnit: adUnit._id,
      campaign: adUnit.campaign,
      account: adUnit.account,
      userIp,
      userAgent,
      referrer
    });

    await impression.save();
    adUnit.impressions += 1;
    await adUnit.save();

    // Update campaign impressions
    await Campaign.findByIdAndUpdate(adUnit.campaign, {
      $inc: { totalImpressions: 1 }
    });

    res.json({ success: true, message: 'Impression recorded' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.recordClick = async (req, res) => {
  try {
    const { adUnitId } = req.params;
    const userIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const referrer = req.headers['referer'];

    const adUnit = await AdUnit.findOne({ adCode: adUnitId });
    if (!adUnit) return res.status(404).json({ error: 'Ad unit not found' });

    const click = new Click({
      adUnit: adUnit._id,
      campaign: adUnit.campaign,
      account: adUnit.account,
      userIp,
      userAgent,
      referrer
    });

    await click.save();
    adUnit.clicks += 1;
    await adUnit.save();

    // Update campaign clicks
    await Campaign.findByIdAndUpdate(adUnit.campaign, {
      $inc: { totalClicks: 1 }
    });

    res.json({ success: true, message: 'Click recorded' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTrackingStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { account: req.user.accountId };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const impressions = await Impression.countDocuments(query);
    const clicks = await Click.countDocuments(query);

    res.json({
      impressions,
      clicks,
      ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
