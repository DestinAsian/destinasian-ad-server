const mongoose = require('mongoose');
const AdDailyStat = require('../models/AdDailyStat');
const Impression = require('../models/Impression');
const Click = require('../models/Click');

const ALLOWED_DIMENSIONS = new Set(['campaign', 'adUnit']);

const toObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  const normalized = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(normalized)
    ? new mongoose.Types.ObjectId(normalized)
    : null;
};

const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const getTableStatsByIds = async ({ accountId, dimension, ids = [] }) => {
  if (!ALLOWED_DIMENSIONS.has(dimension)) {
    throw new Error(`Unsupported statistics dimension: ${dimension}`);
  }

  const accountObjectId = toObjectId(accountId);
  const objectIds = [...new Map(
    ids
      .map((id) => toObjectId(id))
      .filter(Boolean)
      .map((id) => [String(id), id])
  ).values()];

  if (!accountObjectId || objectIds.length === 0) {
    return new Map();
  }

  const { start, end } = getTodayRange();
  const dimensionMatch = { [dimension]: { $in: objectIds } };
  const rawEventMatch = {
    account: accountObjectId,
    ...dimensionMatch,
    timestamp: { $gte: start, $lt: end }
  };

  const [dailyTotals, impressionTodayTotals, clickTodayTotals] = await Promise.all([
    AdDailyStat.aggregate([
      { $match: { account: accountObjectId, ...dimensionMatch } },
      {
        $group: {
          _id: `$${dimension}`,
          impressions: { $sum: '$impressions' },
          clicks: { $sum: '$clicks' }
        }
      }
    ]),
    Impression.aggregate([
      { $match: rawEventMatch },
      { $group: { _id: `$${dimension}`, count: { $sum: 1 } } }
    ]),
    Click.aggregate([
      { $match: rawEventMatch },
      { $group: { _id: `$${dimension}`, count: { $sum: 1 } } }
    ])
  ]);

  const statsById = new Map(objectIds.map((id) => [
    String(id),
    {
      impressions: 0,
      impressionsToday: 0,
      clicks: 0,
      clicksToday: 0,
      ctr: 0
    }
  ]));

  dailyTotals.forEach((row) => {
    const stats = statsById.get(String(row._id));
    if (!stats) return;
    stats.impressions = Number(row.impressions || 0);
    stats.clicks = Number(row.clicks || 0);
  });

  impressionTodayTotals.forEach((row) => {
    const stats = statsById.get(String(row._id));
    if (stats) stats.impressionsToday = Number(row.count || 0);
  });

  clickTodayTotals.forEach((row) => {
    const stats = statsById.get(String(row._id));
    if (stats) stats.clicksToday = Number(row.count || 0);
  });

  statsById.forEach((stats) => {
    stats.ctr = stats.impressions > 0
      ? ((stats.clicks / stats.impressions) * 100).toFixed(2)
      : 0;
  });

  return statsById;
};

module.exports = {
  getTableStatsByIds
};
