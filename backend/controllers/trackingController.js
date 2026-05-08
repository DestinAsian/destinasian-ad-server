const mongoose = require('mongoose');
const Impression = require('../models/Impression');
const Click = require('../models/Click');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const AdImpressionEvent = require('../models/AdImpressionEvent');
const AdClickEvent = require('../models/AdClickEvent');
const AdDailyStat = require('../models/AdDailyStat');

const getUtcDayStart = (dateInput = new Date()) => {
  const date = new Date(dateInput);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const getUtcNextDayStart = (dateInput = new Date()) => {
  const dayStart = getUtcDayStart(dateInput);
  dayStart.setUTCDate(dayStart.getUTCDate() + 1);
  return dayStart;
};

const normalizeString = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getNumericValue = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const resolveInventoryIdFromValue = (value) => {
  if (!value) return null;
  const raw = typeof value === 'object' && value !== null ? (value._id || value.id || value) : value;
  const normalized = String(raw).trim();
  return mongoose.Types.ObjectId.isValid(normalized) ? new mongoose.Types.ObjectId(normalized) : null;
};

const getPrimaryInventoryId = (adUnit) => {
  if (Array.isArray(adUnit?.inventories) && adUnit.inventories.length > 0) {
    return resolveInventoryIdFromValue(adUnit.inventories[0]);
  }

  return resolveInventoryIdFromValue(adUnit?.inventory);
};

const toObjectId = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }

  return new mongoose.Types.ObjectId(value);
};

const buildDateRangeMatch = (accountId, startDate, endDate) => {
  const match = { account: toObjectId(accountId) || accountId };

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

const buildEventDateRangeMatch = (accountId, startDate, endDate) => {
  const match = { account: toObjectId(accountId) || accountId };

  if (startDate || endDate) {
    match.occurredAt = {};
    if (startDate) {
      match.occurredAt.$gte = getUtcDayStart(startDate);
    }
    if (endDate) {
      match.occurredAt.$lt = getUtcNextDayStart(endDate);
    }
  }

  return match;
};

const toDoubleExpression = (path) => ({
  $convert: {
    input: path,
    to: 'double',
    onError: 0,
    onNull: 0
  }
});

const buildRevenueExpression = (paths) => {
  const pathList = Array.isArray(paths) ? paths : [paths];
  if (pathList.length === 1) {
    return toDoubleExpression(pathList[0]);
  }

  return {
    $add: pathList.map((path) => toDoubleExpression(path))
  };
};

const buildDailyRevenueExpression = () => ({
  $cond: [
    { $gt: [toDoubleExpression('$revenue'), 0] },
    toDoubleExpression('$revenue'),
    buildRevenueExpression(['$impressionRevenue', '$clickRevenue'])
  ]
});

const getEventMeta = (body, revenue) => {
  const bodyMeta = body && typeof body.meta === 'object' && !Array.isArray(body.meta)
    ? { ...body.meta }
    : {};

  if (revenue > 0) {
    bodyMeta.revenue = revenue;
  }

  return Object.keys(bodyMeta).length > 0 ? bodyMeta : undefined;
};

const buildScopedMatches = async (accountId, query = {}) => {
  const inventoryGroup = normalizeString(query.inventoryGroup || query.groupName);
  const inventoryQuery = normalizeString(query.inventory || query.inventoryId || query.inventoryGroupId || query.inventory_group_id);
  const campaignId = normalizeString(query.campaignId);
  const searchTerm = normalizeString(query.search);
  const dailyMatch = buildDateRangeMatch(accountId, query.startDate, query.endDate);
  const eventMatch = buildEventDateRangeMatch(accountId, query.startDate, query.endDate);

  if (campaignId) {
    const campaignObjectId = toObjectId(campaignId);
    if (!campaignObjectId) {
      return { dailyMatch, eventMatch, noResults: true };
    }

    dailyMatch.campaign = campaignObjectId;
    eventMatch.campaign = campaignObjectId;
  }

  if (!inventoryGroup && !inventoryQuery) {
    if (!searchTerm) {
      return { dailyMatch, eventMatch, noResults: false };
    }
  } else {
    const inventorySearch = { account: accountId };
    const inventoryOr = [];

    if (inventoryGroup) {
      inventoryOr.push({ groupName: inventoryGroup });
      inventoryOr.push({ name: inventoryGroup });
      inventoryOr.push({ key: inventoryGroup.toLowerCase() });
    }

    if (inventoryQuery) {
      if (mongoose.Types.ObjectId.isValid(inventoryQuery)) {
        inventoryOr.push({ _id: new mongoose.Types.ObjectId(inventoryQuery) });
      }
      inventoryOr.push({ name: inventoryQuery });
      inventoryOr.push({ key: inventoryQuery.toLowerCase() });
    }

    if (inventoryOr.length > 0) {
      inventorySearch.$or = inventoryOr;
    }

    const inventories = await Inventory.find(inventorySearch).select('_id');

    if (inventories.length === 0) {
      return { dailyMatch, eventMatch, noResults: true };
    }

    const inventoryIds = inventories.map((inventory) => inventory._id);
    dailyMatch.inventory = { $in: inventoryIds };
    eventMatch.inventory = { $in: inventoryIds };
  }

  if (!searchTerm) {
    return { dailyMatch, eventMatch, noResults: false };
  }

  const searchRegex = new RegExp(escapeRegex(searchTerm), 'i');
  const [campaignMatches, adUnitMatches, inventoryMatches] = await Promise.all([
    Campaign.find({
      account: accountId,
      name: searchRegex
    }).select('_id'),
    AdUnit.find({
      account: accountId,
      $or: [
        { name: searchRegex },
        { description: searchRegex },
        { adCode: searchRegex }
      ]
    }).select('_id'),
    Inventory.find({
      account: accountId,
      $or: [
        { name: searchRegex },
        { key: searchRegex },
        { groupName: searchRegex }
      ]
    }).select('_id')
  ]);

  const searchCampaignIds = campaignMatches.map((campaign) => campaign._id);
  const searchAdUnitIds = adUnitMatches.map((adUnit) => adUnit._id);
  const searchInventoryIds = inventoryMatches.map((inventory) => inventory._id);

  const dailySearchOr = [];
  const eventSearchOr = [];

  if (searchCampaignIds.length > 0) {
    dailySearchOr.push({ campaign: { $in: searchCampaignIds } });
    eventSearchOr.push({ campaign: { $in: searchCampaignIds } });
  }

  if (searchAdUnitIds.length > 0) {
    dailySearchOr.push({ adUnit: { $in: searchAdUnitIds } });
    eventSearchOr.push({ adUnit: { $in: searchAdUnitIds } });
  }

  if (searchInventoryIds.length > 0) {
    dailySearchOr.push({ inventory: { $in: searchInventoryIds } });
    eventSearchOr.push({ inventory: { $in: searchInventoryIds } });
  }

  if (dailySearchOr.length === 0) {
    return { dailyMatch, eventMatch, noResults: true };
  }

  dailyMatch.$or = dailySearchOr;
  eventMatch.$or = eventSearchOr;

  return { dailyMatch, eventMatch, noResults: false };
};

const mergeRevenueDailySeries = (dailySeries, impressionRevenueSeries, clickRevenueSeries) => {
  const revenueByDate = new Map();

  const appendRevenue = (items) => {
    items.forEach((item) => {
      const key = new Date(item.date).toISOString();
      const currentValue = revenueByDate.get(key) || 0;
      revenueByDate.set(key, currentValue + getNumericValue(item.revenue));
    });
  };

  appendRevenue(impressionRevenueSeries);
  appendRevenue(clickRevenueSeries);

  return dailySeries.map((item) => {
    const dailyRevenue = getNumericValue(item.revenue);
    const eventRevenue = revenueByDate.get(new Date(item.date).toISOString()) || 0;

    return {
      ...item,
      revenue: dailyRevenue !== 0 ? dailyRevenue : eventRevenue
    };
  });
};

const getMergedRevenueTotal = (dailyRevenue, impressionRevenue, clickRevenue) => {
  const normalizedDailyRevenue = getNumericValue(dailyRevenue);
  if (normalizedDailyRevenue !== 0) {
    return normalizedDailyRevenue;
  }

  return getNumericValue(impressionRevenue) + getNumericValue(clickRevenue);
};

const aggregateEventRevenueTotal = async (Model, eventMatch) => {
  const [result] = await Model.aggregate([
    { $match: eventMatch },
    {
      $group: {
        _id: null,
        revenue: { $sum: buildRevenueExpression('$meta.revenue') }
      }
    }
  ]);

  return getNumericValue(result?.revenue);
};

const aggregateEventRevenueDaily = async (Model, eventMatch) => {
  return Model.aggregate([
    { $match: eventMatch },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$occurredAt'
          }
        },
        revenue: { $sum: buildRevenueExpression('$meta.revenue') }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        date: '$_id',
        revenue: 1
      }
    }
  ]);
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
  clicks = 0,
  impressionRevenue = 0,
  clickRevenue = 0
}) => {
  const statDate = getUtcDayStart(occurredAt);
  const totalRevenue = getNumericValue(impressionRevenue) + getNumericValue(clickRevenue);
  const updated = await AdDailyStat.findOneAndUpdate(
    {
      statDate,
      account,
      campaign,
      adUnit,
      inventory: inventory || null
    },
    {
      $inc: {
        impressions,
        clicks,
        impressionRevenue: getNumericValue(impressionRevenue),
        clickRevenue: getNumericValue(clickRevenue),
        revenue: totalRevenue
      },
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
    const impressionRevenue = getNumericValue(req.body?.revenue);
    const eventMeta = getEventMeta(req.body, impressionRevenue);

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
      inventory: getPrimaryInventoryId(adUnit),
      adCode: adUnit.adCode,
      userIp,
      userAgent,
      referrer,
      occurredAt,
      meta: eventMeta
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
      inventory: getPrimaryInventoryId(adUnit),
      adCode: adUnit.adCode,
      occurredAt,
      impressions: 1,
      impressionRevenue
    });

    res.json({ success: true, message: 'Impression recorded', revenue: impressionRevenue });
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
    const clickRevenue = getNumericValue(req.body?.revenue);
    const eventMeta = getEventMeta(req.body, clickRevenue);

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
      inventory: getPrimaryInventoryId(adUnit),
      adCode: adUnit.adCode,
      clickUrl: adUnit.clickUrl,
      userIp,
      userAgent,
      referrer,
      occurredAt,
      meta: eventMeta
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
      inventory: getPrimaryInventoryId(adUnit),
      adCode: adUnit.adCode,
      occurredAt,
      clicks: 1,
      clickRevenue
    });

    res.json({ success: true, message: 'Click recorded', revenue: clickRevenue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTrackingStats = async (req, res) => {
  try {
    const { dailyMatch, eventMatch, noResults } = await buildScopedMatches(req.user.accountId, req.query);

    if (noResults) {
      return res.json({
        impressions: 0,
        clicks: 0,
        ctr: 0,
        revenue: 0
      });
    }

    const [totals, impressionRevenue, clickRevenue] = await Promise.all([
      AdDailyStat.aggregate([
        { $match: dailyMatch },
        {
          $group: {
            _id: null,
            impressions: { $sum: '$impressions' },
            clicks: { $sum: '$clicks' },
            revenue: { $sum: buildDailyRevenueExpression() }
          }
        },
        {
          $project: {
            _id: 0,
            impressions: 1,
            clicks: 1,
            ctr: buildCtrProjection('$impressions', '$clicks'),
            revenue: 1
          }
        }
      ]).then((results) => results[0]),
      aggregateEventRevenueTotal(AdImpressionEvent, eventMatch),
      aggregateEventRevenueTotal(AdClickEvent, eventMatch)
    ]);

    res.json({
      impressions: totals?.impressions || 0,
      clicks: totals?.clicks || 0,
      ctr: totals?.ctr || 0,
      revenue: getMergedRevenueTotal(totals?.revenue, impressionRevenue, clickRevenue)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { limit } = req.query;
    const topLimit = Number(limit) > 0 ? Number(limit) : 5;
    const { dailyMatch, eventMatch, noResults } = await buildScopedMatches(req.user.accountId, req.query);

    if (noResults) {
      return res.json({
        impressions: 0,
        clicks: 0,
        ctr: 0,
        revenue: 0,
        daily: [],
        topAdUnits: [],
        topCampaigns: []
      });
    }

    const [totalsResult, dailySeries, impressionRevenueDaily, clickRevenueDaily, impressionRevenueTotal, clickRevenueTotal, topAdUnits, topCampaigns] = await Promise.all([
      AdDailyStat.aggregate([
        { $match: dailyMatch },
        {
          $group: {
            _id: null,
            impressions: { $sum: '$impressions' },
            clicks: { $sum: '$clicks' },
            revenue: { $sum: buildDailyRevenueExpression() }
          }
        },
        {
          $project: {
            _id: 0,
            impressions: 1,
            clicks: 1,
            ctr: buildCtrProjection('$impressions', '$clicks'),
            revenue: 1
          }
        }
      ]),
      AdDailyStat.aggregate([
        { $match: dailyMatch },
        {
          $group: {
            _id: '$statDate',
            impressions: { $sum: '$impressions' },
            clicks: { $sum: '$clicks' },
            revenue: { $sum: buildDailyRevenueExpression() }
          }
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            date: '$_id',
            impressions: 1,
            clicks: 1,
            ctr: buildCtrProjection('$impressions', '$clicks'),
            revenue: 1
          }
        }
      ]),
      aggregateEventRevenueDaily(AdImpressionEvent, eventMatch),
      aggregateEventRevenueDaily(AdClickEvent, eventMatch),
      aggregateEventRevenueTotal(AdImpressionEvent, eventMatch),
      aggregateEventRevenueTotal(AdClickEvent, eventMatch),
      AdDailyStat.aggregate([
        { $match: { ...dailyMatch, adUnit: { $ne: null } } },
        {
          $group: {
            _id: '$adUnit',
            adCode: { $first: '$adCode' },
            impressions: { $sum: '$impressions' },
            clicks: { $sum: '$clicks' },
            revenue: { $sum: buildDailyRevenueExpression() }
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
            ctr: buildCtrProjection('$impressions', '$clicks'),
            revenue: 1
          }
        },
        { $sort: { impressions: -1, clicks: -1 } },
        { $limit: topLimit }
      ]),
      AdDailyStat.aggregate([
        { $match: { ...dailyMatch, campaign: { $ne: null } } },
        {
          $group: {
            _id: '$campaign',
            impressions: { $sum: '$impressions' },
            clicks: { $sum: '$clicks' },
            revenue: { $sum: buildDailyRevenueExpression() }
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
            ctr: buildCtrProjection('$impressions', '$clicks'),
            revenue: 1
          }
        },
        { $sort: { impressions: -1, clicks: -1 } },
        { $limit: topLimit }
      ])
    ]);

    const totals = totalsResult[0] || { impressions: 0, clicks: 0, ctr: 0, revenue: 0 };
    const mergedDailySeries = mergeRevenueDailySeries(dailySeries, impressionRevenueDaily, clickRevenueDaily);

    res.json({
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: totals.ctr,
      revenue: getMergedRevenueTotal(totals.revenue, impressionRevenueTotal, clickRevenueTotal),
      daily: mergedDailySeries,
      topAdUnits,
      topCampaigns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
