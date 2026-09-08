const HISTORY_COLLECTIONS = [
  'impressions',
  'clicks',
  'ad_impression_events',
  'ad_click_events',
  'ad_daily_stats'
];

const normalizeId = (value) => String(value || '');

const isNamespaceMissing = (error) => (
  error?.codeName === 'NamespaceNotFound' || error?.code === 26
);

const classifyAdUnits = ({ adUnits = [], campaigns = [] }) => {
  const campaignIds = new Set(campaigns.map((campaign) => normalizeId(campaign._id)));
  const validAdUnits = [];
  const orphanAdUnits = [];

  for (const adUnit of adUnits) {
    if (campaignIds.has(normalizeId(adUnit.campaign))) {
      validAdUnits.push(adUnit);
    } else {
      orphanAdUnits.push(adUnit);
    }
  }

  return {
    validAdUnits,
    orphanAdUnits,
    deleteOrphanAdUnits: orphanAdUnits,
    retainedOrphanAdUnits: []
  };
};

const countDocumentsSafely = async (collection, filter) => {
  try {
    return await collection.countDocuments(filter);
  } catch (error) {
    if (isNamespaceMissing(error)) return 0;
    throw error;
  }
};

const countHistoryDocuments = async (db, adUnitIds) => {
  const byCollection = {};
  let total = 0;

  for (const collectionName of HISTORY_COLLECTIONS) {
    const count = adUnitIds.length > 0
      ? await countDocumentsSafely(
          db.collection(collectionName),
          { adUnit: { $in: adUnitIds } }
        )
      : 0;
    byCollection[collectionName] = count;
    total += count;
  }

  return { byCollection, total };
};

const buildCleanupPlan = async (db) => {
  const [campaigns, adUnits, inventoryCount] = await Promise.all([
    db.collection('campaigns').find({}, { projection: { _id: 1 } }).toArray(),
    db.collection('adunits').find({}).toArray(),
    countDocumentsSafely(db.collection('inventories'), {})
  ]);

  const classified = classifyAdUnits({ adUnits, campaigns });
  const orphanIds = classified.deleteOrphanAdUnits.map((adUnit) => adUnit._id);
  const history = await countHistoryDocuments(db, orphanIds);

  return {
    databaseName: String(db.databaseName || ''),
    totalAdUnits: adUnits.length,
    totalCampaigns: campaigns.length,
    totalInventories: inventoryCount,
    validRelations: classified.validAdUnits.length,
    ...classified,
    orphanIds,
    historyByCollection: history.byCollection,
    totalHistoryDocuments: history.total,
    deleteInventories: [],
    deleteCampaigns: []
  };
};

const summarizeCleanupPlan = (plan) => ({
  DATABASE: plan.databaseName,
  TOTAL_ADUNITS: plan.totalAdUnits,
  TOTAL_CAMPAIGNS: plan.totalCampaigns,
  VALID_ADUNIT_CAMPAIGN_RELATIONS: plan.validRelations,
  ORPHAN_ADUNITS: plan.orphanAdUnits.length,
  DELETE_ORPHAN_ADUNITS: plan.deleteOrphanAdUnits.length,
  RETAIN_ORPHAN_ADUNITS: plan.retainedOrphanAdUnits.length,
  HISTORY_DOCUMENTS_BY_COLLECTION: plan.historyByCollection,
  TOTAL_HISTORY_DOCUMENTS: plan.totalHistoryDocuments,
  DELETE_INVENTORIES: plan.deleteInventories.length,
  DELETE_CAMPAIGNS: plan.deleteCampaigns.length
});

const getIdSet = (documents = []) => new Set(documents.map((document) => normalizeId(document._id)));

const idSetsMatch = (left, right) => {
  if (left.size !== right.size) return false;
  return [...left].every((id) => right.has(id));
};

module.exports = {
  HISTORY_COLLECTIONS,
  buildCleanupPlan,
  classifyAdUnits,
  countDocumentsSafely,
  countHistoryDocuments,
  getIdSet,
  idSetsMatch,
  isNamespaceMissing,
  normalizeId,
  summarizeCleanupPlan
};
