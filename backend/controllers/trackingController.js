const mongoose = require('mongoose');
const Impression = require('../models/Impression');
const Click = require('../models/Click');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const AdImpressionEvent = require('../models/AdImpressionEvent');
const AdClickEvent = require('../models/AdClickEvent');
const AdDailyStat = require('../models/AdDailyStat');
const { isAdUnitDeliverable } = require('../services/deliveryEligibilityService');
const { applySession, runAtomicMutation } = require('../services/transactionService');

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
  const explicitPrimary = resolveInventoryIdFromValue(adUnit?.inventory);
  if (explicitPrimary) {
    return explicitPrimary;
  }

  if (Array.isArray(adUnit?.inventories) && adUnit.inventories.length > 0) {
    return resolveInventoryIdFromValue(adUnit.inventories[0]);
  }
  return null;
};

const resolveTrackingInventoryId = (adUnit, requestedInventoryId) => {
  const normalizedRequest = normalizeString(requestedInventoryId);
  if (!normalizedRequest) {
    return getPrimaryInventoryId(adUnit);
  }

  const requestedObjectId = resolveInventoryIdFromValue(normalizedRequest);
  if (!requestedObjectId) {
    const error = new Error('Invalid inventory tracking context');
    error.statusCode = 400;
    throw error;
  }

  const assignedInventoryIds = new Set();
  const primaryInventoryId = resolveInventoryIdFromValue(adUnit?.inventory);
  if (primaryInventoryId) assignedInventoryIds.add(String(primaryInventoryId));
  (Array.isArray(adUnit?.inventories) ? adUnit.inventories : []).forEach((inventory) => {
    const inventoryId = resolveInventoryIdFromValue(inventory);
    if (inventoryId) assignedInventoryIds.add(String(inventoryId));
  });

  if (!assignedInventoryIds.has(String(requestedObjectId))) {
    const error = new Error('Ad unit is not assigned to this inventory');
    error.statusCode = 400;
    throw error;
  }

  return requestedObjectId;
};

exports.resolveTrackingInventoryId = resolveTrackingInventoryId;

const toObjectId = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }

  return new mongoose.Types.ObjectId(value);
};

const buildDateRangeMatch = (accountId, startDate, endDate) => {
  validateReportDates(startDate, endDate);
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
  validateReportDates(startDate, endDate);
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

const validateReportDates = (start, end) => {
  if ((start && !Number.isFinite(new Date(start).getTime()))
    || (end && !Number.isFinite(new Date(end).getTime()))
    || (start && end && new Date(start) > new Date(end))) {
    const error = new Error('Invalid report date range. Start date must be on or before end date.');
    error.statusCode = 400;
    throw error;
  }
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
  const adUnitId = normalizeString(query.adUnitId);
  const searchTerm = normalizeString(query.search);
  const searchScope = String(query.searchScope || 'all').trim().toLowerCase();
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

  if (adUnitId) {
    const adUnitObjectId = toObjectId(adUnitId);
    if (!adUnitObjectId) {
      return { dailyMatch, eventMatch, noResults: true };
    }

    const adUnitExists = await AdUnit.exists({
      _id: adUnitObjectId,
      account: accountId
    });
    if (!adUnitExists) {
      return { dailyMatch, eventMatch, noResults: true };
    }

    dailyMatch.adUnit = adUnitObjectId;
    eventMatch.adUnit = adUnitObjectId;
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
    searchScope === 'all' || searchScope === 'campaign'
      ? Campaign.find({
          account: accountId,
          name: searchRegex
        }).select('_id')
      : [],
    searchScope === 'all' || searchScope === 'adunit'
      ? AdUnit.find({
          account: accountId,
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { adCode: searchRegex }
          ]
        }).select('_id')
      : [],
    searchScope === 'all' || searchScope === 'adchannel'
      ? Inventory.find({
          account: accountId,
          $or: [
            { name: searchRegex },
            { key: searchRegex },
            { groupName: searchRegex }
          ]
        }).select('_id')
      : []
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
  clickRevenue = 0,
  session = null
}) => {
  const statDate = getUtcDayStart(occurredAt);
  const totalRevenue = getNumericValue(impressionRevenue) + getNumericValue(clickRevenue);
  const filter = {
    statDate, account, campaign, adUnit, inventory: inventory || null,
  };
  const increment = (field, value) => ({ $add: [{ $ifNull: [`$${field}`, 0] }, value] });
  const pipeline = [
    { $set: {
      impressions: increment('impressions', impressions),
      clicks: increment('clicks', clicks),
      impressionRevenue: increment('impressionRevenue', getNumericValue(impressionRevenue)),
      clickRevenue: increment('clickRevenue', getNumericValue(clickRevenue)),
      revenue: increment('revenue', totalRevenue),
      adCode: { $literal: adCode }, lastAggregatedAt: new Date(),
      createdAt: { $ifNull: ['$createdAt', new Date()] },
    } },
    { $set: { ctr: buildCtrProjection() } },
  ];
  const update = (upsert) => AdDailyStat.findOneAndUpdate(
    filter, pipeline,
    { upsert, new: true, setDefaultsOnInsert: false, ...(session ? { session } : {}) }
  );
  try {
    await update(true);
  } catch (error) {
    if (session || error.code !== 11000 || !/ad_daily_stats_rollup_key/.test(String(error.message))) throw error;
    await update(false);
  }
};

exports.updateDailyStat = updateDailyStat;

/*
 * Tracking writes use atomic increments (not a stale document save), and all
 * records are constructed inside the transaction callback so a retry cannot
 * reuse a Mongoose document marked as already persisted by a rolled-back save.
 */
const recordTrackingEvent = async (req, kind) => {
  const isClick = kind === 'click';
  const occurredAt = new Date();
  const preliminary = await AdUnit.findOne({ adCode: req.params.adUnitId }).populate('campaign');
  if (preliminary && !isAdUnitDeliverable(preliminary, occurredAt)) return false;
  return runAtomicMutation(async (session) => {
    const adUnit = await applySession(AdUnit.findOne({ adCode: req.params.adUnitId }).populate('campaign'), session);
    if (!adUnit) {
      const error = new Error('Ad unit not found');
      error.statusCode = 404;
      throw error;
    }
    if (!isAdUnitDeliverable(adUnit, occurredAt)) return false;
    const campaignId = adUnit.campaign?._id || adUnit.campaign;
    const trackingInventoryId = resolveTrackingInventoryId(adUnit, req.body?.inventoryId);
    const metadata = {
      adUnit: adUnit._id, campaign: campaignId, account: adUnit.account,
      userIp: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'], referrer: req.headers.referer,
    };
    const RawEvent = isClick ? Click : Impression;
    const DetailedEvent = isClick ? AdClickEvent : AdImpressionEvent;
    const revenue = getNumericValue(req.body?.revenue);
    await new RawEvent(metadata).save(session ? { session } : undefined);
    await new DetailedEvent({
      ...metadata, inventory: trackingInventoryId, adCode: adUnit.adCode,
      ...(isClick ? { clickUrl: adUnit.clickUrl } : {}),
      occurredAt, meta: getEventMeta(req.body, revenue),
    }).save(session ? { session } : undefined);
    const result = await AdUnit.updateOne(
      { _id: adUnit._id, account: adUnit.account, campaign: campaignId, status: 'active' },
      { $inc: { [isClick ? 'clicks' : 'impressions']: 1 } },
      { timestamps: false, ...(session ? { session } : {}) }
    );
    if (result.matchedCount !== 1) {
      const error = new Error('Ad Unit changed while recording tracking. Retry the request.');
      error.statusCode = 409;
      throw error;
    }
    const campaignResult = await Campaign.updateOne(
      { _id: campaignId, account: adUnit.account, status: 'active' },
      { $inc: { [isClick ? 'totalClicks' : 'totalImpressions']: 1 } },
      { timestamps: false, ...(session ? { session } : {}) }
    );
    if (campaignResult.matchedCount !== 1) {
      const error = new Error('Campaign changed while recording tracking. Retry the request.');
      error.statusCode = 409;
      throw error;
    }
    await updateDailyStat({
      account: adUnit.account, campaign: campaignId, adUnit: adUnit._id,
      inventory: trackingInventoryId, adCode: adUnit.adCode, occurredAt,
      impressions: isClick ? 0 : 1, clicks: isClick ? 1 : 0,
      impressionRevenue: isClick ? 0 : revenue, clickRevenue: isClick ? revenue : 0,
      session,
    });
    return true;
  }, { requireTransaction: true });
};

const trackingHandler = (kind) => async (req, res) => {
  try {
    const recorded = await recordTrackingEvent(req, kind);
    if (!recorded) return res.status(204).end();
    return res.json({ success: true, message: `${kind === 'click' ? 'Click' : 'Impression'} recorded`, revenue: getNumericValue(req.body?.revenue) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

exports.recordImpression = trackingHandler('impression');
exports.recordClick = trackingHandler('click');


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
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { limit } = req.query;
    const topLimit = Number(limit) > 0 ? Math.min(Number(limit), 500) : 5;
    // The dashboard's channel report needs every historical relation, not just
    // a top-N ranking. The default ranking contract remains unchanged.
    const includeReportItems = ['1', 'true'].includes(
      String(req.query.includeReportItems || '').trim().toLowerCase()
    );
    const includeAdUnitDaily = Boolean(normalizeString(req.query.campaignId))
      && ['1', 'true'].includes(
        String(req.query.includeAdUnitDaily || '').trim().toLowerCase()
      );
    const { dailyMatch, eventMatch, noResults } = await buildScopedMatches(req.user.accountId, req.query);

    if (noResults) {
      return res.json({
        impressions: 0,
        clicks: 0,
        ctr: 0,
        revenue: 0,
        daily: [],
        adUnitDaily: [],
        topAdUnits: [],
        topCampaigns: []
      });
    }

    const [totalsResult, dailySeries, impressionRevenueDaily, clickRevenueDaily, impressionRevenueTotal, clickRevenueTotal, topAdUnits, topCampaigns, adUnitDaily] = await Promise.all([
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
        { $match: dailyMatch },
        { $match: { adUnit: { $ne: null } } },
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
        { $match: { 'adUnit._id': { $exists: true } } },
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
        ...(includeReportItems ? [] : [{ $limit: topLimit }])
      ]),
      AdDailyStat.aggregate([
        { $match: dailyMatch },
        { $match: { campaign: { $ne: null } } },
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
        { $match: { 'campaign._id': { $exists: true } } },
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
        ...(includeReportItems ? [] : [{ $limit: topLimit }])
      ]),
      includeAdUnitDaily
        ? AdDailyStat.aggregate([
            { $match: dailyMatch },
            { $match: { adUnit: { $ne: null } } },
            {
              $group: {
                _id: {
                  adUnit: '$adUnit',
                  date: '$statDate'
                },
                impressions: { $sum: '$impressions' },
                clicks: { $sum: '$clicks' }
              }
            },
            { $sort: { '_id.adUnit': 1, '_id.date': 1 } },
            {
              $project: {
                _id: 0,
                adUnitId: '$_id.adUnit',
                date: '$_id.date',
                impressions: 1,
                clicks: 1,
                ctr: buildCtrProjection('$impressions', '$clicks')
              }
            }
          ])
        : Promise.resolve([])
    ]);

    const totals = totalsResult[0] || { impressions: 0, clicks: 0, ctr: 0, revenue: 0 };
    const mergedDailySeries = mergeRevenueDailySeries(dailySeries, impressionRevenueDaily, clickRevenueDaily);

    res.json({
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: totals.ctr,
      revenue: getMergedRevenueTotal(totals.revenue, impressionRevenueTotal, clickRevenueTotal),
      daily: mergedDailySeries,
      adUnitDaily,
      topAdUnits,
      topCampaigns
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

exports.buildScopedMatches = buildScopedMatches;
