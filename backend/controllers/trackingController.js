const Impression = require('../models/Impression');
const Click = require('../models/Click');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');
const AdImpressionEvent = require('../models/AdImpressionEvent');
const AdClickEvent = require('../models/AdClickEvent');
const AdDailyStat = require('../models/AdDailyStat');

const getUtcDayStart = (dateInput = new Date()) => {
  const date = new Date(dateInput);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const buildDateRangeMatch = (accountId, startDate, endDate) => {
  const match = { account: accountId };

  if (startDate || endDate) {
    match.statDate = {};
    if (startDate) {
      match.statDate.$gte = getUtcDayStart(startDate);
    }
    if (endDate) {
      match.statDate.$lte = getUtcDayStart(endDate);
    }
  }

  return match;
};

const buildCtrProjection = (impressionsField = '$impressions', clicksField = '$clicks') => ({
  $cond: [
    { $gt: [impressionsField, 0] },
    {
      $round: [
        {
          $multiply: [
            { $divide: [clicksField, impressionsField] },
            100
          ]
        },
        2
      ]
    },
    0
  ]
});

const updateDailyStat = async ({
  account,
  campaign,
  adUnit,
  inventory,
  adCode,
  occurredAt,
  impressions = 0,
  clicks = 0
}) => {
  const statDate = getUtcDayStart(occurredAt);
  const updated = await AdDailyStat.findOneAndUpdate(
    {
      statDate,
      account,
      campaign,
      adUnit,
      inventory: inventory || null
    },
    {
      $inc: { impressions, clicks },
      $set: {
        adCode,
        lastAggregatedAt: new Date()
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );

  const impressionTotal = typeof updated.impressions === 'number' ? updated.impressions : 0;
  const clickTotal = typeof updated.clicks === 'number' ? updated.clicks : 0;
  const ctr = impressionTotal > 0 ? Number(((clickTotal / impressionTotal) * 100).toFixed(2)) : 0;

  if (updated.ctr !== ctr) {
    updated.ctr = ctr;
    await updated.save();
  }
};

exports.recordImpression = async (req, res) => {
  try {
    const { adUnitId } = req.params;
    const userIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const referrer = req.headers['referer'];
    const occurredAt = new Date();

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

    const impressionEvent = new AdImpressionEvent({
      adUnit: adUnit._id,
      campaign: adUnit.campaign,
      account: adUnit.account,
      inventory: adUnit.inventory || null,
      adCode: adUnit.adCode,
      userIp,
      userAgent,
      referrer,
      occurredAt
    });

    await Promise.all([
      impression.save(),
      impressionEvent.save()
    ]);

    adUnit.impressions += 1;
    await adUnit.save();

    // Update campaign impressions
    await Campaign.findByIdAndUpdate(adUnit.campaign, {
      $inc: { totalImpressions: 1 }
    });

    await updateDailyStat({
      account: adUnit.account,
      campaign: adUnit.campaign,
      adUnit: adUnit._id,
      inventory: adUnit.inventory || null,
      adCode: adUnit.adCode,
      occurredAt,
      impressions: 1
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
    const occurredAt = new Date();

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

    const clickEvent = new AdClickEvent({
      adUnit: adUnit._id,
      campaign: adUnit.campaign,
      account: adUnit.account,
      inventory: adUnit.inventory || null,
      adCode: adUnit.adCode,
      clickUrl: adUnit.clickUrl,
      userIp,
      userAgent,
      referrer,
      occurredAt
    });

    await Promise.all([
      click.save(),
      clickEvent.save()
    ]);

    adUnit.clicks += 1;
    await adUnit.save();

    // Update campaign clicks
    await Campaign.findByIdAndUpdate(adUnit.campaign, {
      $inc: { totalClicks: 1 }
    });

    await updateDailyStat({
      account: adUnit.account,
      campaign: adUnit.campaign,
      adUnit: adUnit._id,
      inventory: adUnit.inventory || null,
      adCode: adUnit.adCode,
      occurredAt,
      clicks: 1
    });

    res.json({ success: true, message: 'Click recorded' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTrackingStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = buildDateRangeMatch(req.user.accountId, startDate, endDate);
    const [totals] = await AdDailyStat.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          impressions: { $sum: '$impressions' },
          clicks: { $sum: '$clicks' }
        }
      },
      {
        $project: {
          _id: 0,
          impressions: 1,
          clicks: 1,
          ctr: buildCtrProjection('$impressions', '$clicks')
        }
      }
    ]);

    res.json({
      impressions: totals?.impressions || 0,
      clicks: totals?.clicks || 0,
      ctr: totals?.ctr || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;
    const topLimit = Number(limit) > 0 ? Number(limit) : 5;
    const match = buildDateRangeMatch(req.user.accountId, startDate, endDate);

    const [totalsResult, dailySeries, topAdUnits, topCampaigns] = await Promise.all([
      AdDailyStat.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            impressions: { $sum: '$impressions' },
            clicks: { $sum: '$clicks' }
          }
        },
        {
          $project: {
            _id: 0,
            impressions: 1,
            clicks: 1,
            ctr: buildCtrProjection('$impressions', '$clicks')
          }
        }
      ]),
      AdDailyStat.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$statDate',
            impressions: { $sum: '$impressions' },
            clicks: { $sum: '$clicks' }
          }
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            date: '$_id',
            impressions: 1,
            clicks: 1,
            ctr: buildCtrProjection('$impressions', '$clicks')
          }
        }
      ]),
      AdDailyStat.aggregate([
        { $match: { ...match, adUnit: { $ne: null } } },
        {
          $group: {
            _id: '$adUnit',
            adCode: { $first: '$adCode' },
            impressions: { $sum: '$impressions' },
            clicks: { $sum: '$clicks' }
          }
        },
        {
          $lookup: {
            from: 'adunits',
            localField: '_id',
            foreignField: '_id',
            as: 'adUnit'
          }
        },
        { $unwind: { path: '$adUnit', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            adUnitId: '$_id',
            adCode: 1,
            name: '$adUnit.name',
            impressions: 1,
            clicks: 1,
            ctr: buildCtrProjection('$impressions', '$clicks')
          }
        },
        { $sort: { impressions: -1, clicks: -1 } },
        { $limit: topLimit }
      ]),
      AdDailyStat.aggregate([
        { $match: { ...match, campaign: { $ne: null } } },
        {
          $group: {
            _id: '$campaign',
            impressions: { $sum: '$impressions' },
            clicks: { $sum: '$clicks' }
          }
        },
        {
          $lookup: {
            from: 'campaigns',
            localField: '_id',
            foreignField: '_id',
            as: 'campaign'
          }
        },
        { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            campaignId: '$_id',
            name: '$campaign.name',
            status: '$campaign.status',
            impressions: 1,
            clicks: 1,
            ctr: buildCtrProjection('$impressions', '$clicks')
          }
        },
        { $sort: { impressions: -1, clicks: -1 } },
        { $limit: topLimit }
      ])
    ]);

    const totals = totalsResult[0] || { impressions: 0, clicks: 0, ctr: 0 };

    res.json({
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: totals.ctr,
      daily: dailySeries,
      topAdUnits,
      topCampaigns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
