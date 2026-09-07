const AdUnit = require('../models/AdUnit');

const AD_UNIT_SUMMARY_PROJECTION = '-imageUrl -htmlCreative -iframeUrl';

const isAdUnitSummaryView = (value) => (
  String(value || '').trim().toLowerCase() === 'summary'
);

const applyAdUnitSummaryProjection = (query, enabled) => (
  enabled ? query.select(AD_UNIT_SUMMARY_PROJECTION) : query
);

const getImageCreativeIdSet = async ({ accountId, adUnitIds = [] }) => {
  if (!Array.isArray(adUnitIds) || adUnitIds.length === 0) {
    return new Set();
  }

  const rows = await AdUnit.find({
    account: accountId,
    _id: { $in: adUnitIds },
    imageUrl: { $exists: true, $ne: '' }
  }).select('_id').lean();

  return new Set(rows.map((row) => String(row._id)));
};

module.exports = {
  AD_UNIT_SUMMARY_PROJECTION,
  applyAdUnitSummaryProjection,
  getImageCreativeIdSet,
  isAdUnitSummaryView
};
