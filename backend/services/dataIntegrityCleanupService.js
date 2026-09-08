const DELETE_CHANNEL_NAME_PATTERN = /^delete(?:[\s_-]*\d+)?$/i;

const HISTORY_COLLECTIONS = [
  'impressions',
  'clicks',
  'ad_impression_events',
  'ad_click_events',
  'ad_daily_stats'
];

const normalizeName = (value) => String(value || '').trim().toLocaleLowerCase();

const buildScopedNameKey = (document) => (
  `${String(document?.account || '')}:${normalizeName(document?.name)}`
);

const isDeleteChannelName = (value) => DELETE_CHANNEL_NAME_PATTERN.test(String(value || '').trim());

const classifyAdUnits = ({
  adUnits = [],
  campaigns = [],
  historyUsageById = new Map(),
  campaignBackReferenceIds = new Set()
}) => {
  const campaignIds = new Set(campaigns.map((campaign) => String(campaign._id)));
  const validAdUnits = adUnits.filter((adUnit) => campaignIds.has(String(adUnit.campaign)));
  const validByScopedName = new Map();

  validAdUnits.forEach((adUnit) => {
    const key = buildScopedNameKey(adUnit);
    if (!validByScopedName.has(key)) validByScopedName.set(key, []);
    validByScopedName.get(key).push(adUnit);
  });

  const orphanAdUnits = adUnits.filter((adUnit) => !campaignIds.has(String(adUnit.campaign)));
  const duplicateOrphans = [];
  const standaloneOrphans = [];

  orphanAdUnits.forEach((adUnit) => {
    const validDuplicates = validByScopedName.get(buildScopedNameKey(adUnit)) || [];
    if (validDuplicates.length === 0) {
      standaloneOrphans.push({ document: adUnit });
      return;
    }

    const id = String(adUnit._id);
    const historyRows = Number(historyUsageById.get(id) || 0);
    const hasCampaignBackReference = campaignBackReferenceIds.has(id);
    duplicateOrphans.push({
      document: adUnit,
      validDuplicateIds: validDuplicates.map((duplicate) => duplicate._id),
      historyRows,
      hasCampaignBackReference,
      historyPreserved: true,
      safeToRemove: !hasCampaignBackReference
    });
  });

  return { duplicateOrphans, standaloneOrphans };
};

const classifyDeleteChannels = ({ inventories = [], linkedCountsById = new Map() }) => (
  inventories
    .filter((inventory) => isDeleteChannelName(inventory.name) || isDeleteChannelName(inventory.key))
    .map((inventory) => {
      const linkedAdUnits = Number(linkedCountsById.get(String(inventory._id)) || 0);
      return {
        document: inventory,
        linkedAdUnits,
        safeToRemove: linkedAdUnits === 0
      };
    })
);

const aggregateUsageCounts = async (db, adUnitIds) => {
  const counts = new Map(adUnitIds.map((id) => [String(id), 0]));
  if (adUnitIds.length === 0) return counts;

  for (const collectionName of HISTORY_COLLECTIONS) {
    const rows = await db.collection(collectionName).aggregate([
      { $match: { adUnit: { $in: adUnitIds } } },
      { $group: { _id: '$adUnit', count: { $sum: 1 } } }
    ]).toArray().catch((error) => {
      if (error?.codeName === 'NamespaceNotFound') return [];
      throw error;
    });

    rows.forEach((row) => {
      const id = String(row._id);
      counts.set(id, Number(counts.get(id) || 0) + Number(row.count || 0));
    });
  }

  return counts;
};

const buildCleanupPlan = async (db) => {
  const [campaigns, adUnits, inventories] = await Promise.all([
    db.collection('campaigns').find({}, { projection: { _id: 1, adUnits: 1 } }).toArray(),
    db.collection('adunits').find({}).toArray(),
    db.collection('inventories').find({}).toArray()
  ]);

  const campaignIds = new Set(campaigns.map((campaign) => String(campaign._id)));
  const orphanIds = adUnits
    .filter((adUnit) => !campaignIds.has(String(adUnit.campaign)))
    .map((adUnit) => adUnit._id);
  const historyUsageById = await aggregateUsageCounts(db, orphanIds);
  const campaignBackReferenceIds = new Set(
    campaigns.flatMap((campaign) => (
      Array.isArray(campaign.adUnits) ? campaign.adUnits.map(String) : []
    ))
  );

  const inventoryIds = inventories.map((inventory) => inventory._id);
  const linkedCountsById = new Map(inventoryIds.map((id) => [String(id), 0]));
  if (inventoryIds.length > 0) {
    const linkedRows = await db.collection('adunits').aggregate([
      {
        $project: {
          linkedInventoryIds: {
            $setUnion: [
              { $cond: [{ $ne: ['$inventory', null] }, ['$inventory'], []] },
              { $ifNull: ['$inventories', []] }
            ]
          }
        }
      },
      { $unwind: '$linkedInventoryIds' },
      { $match: { linkedInventoryIds: { $in: inventoryIds } } },
      { $group: { _id: '$linkedInventoryIds', count: { $sum: 1 } } }
    ]).toArray();
    linkedRows.forEach((row) => linkedCountsById.set(String(row._id), Number(row.count || 0)));
  }

  const adUnitPlan = classifyAdUnits({
    adUnits,
    campaigns,
    historyUsageById,
    campaignBackReferenceIds
  });

  return {
    ...adUnitPlan,
    deleteChannels: classifyDeleteChannels({ inventories, linkedCountsById })
  };
};

const summarizeCleanupPlan = (plan) => ({
  orphanAdUnits: plan.duplicateOrphans.length + plan.standaloneOrphans.length,
  duplicateOrphans: plan.duplicateOrphans.length,
  safeDuplicateOrphans: plan.duplicateOrphans.filter((entry) => entry.safeToRemove).length,
  retainedDuplicateOrphans: plan.duplicateOrphans.filter((entry) => !entry.safeToRemove).length,
  standaloneOrphans: plan.standaloneOrphans.length,
  deleteNamedChannels: plan.deleteChannels.length,
  safeDeleteNamedChannels: plan.deleteChannels.filter((entry) => entry.safeToRemove).length,
  retainedLinkedDeleteChannels: plan.deleteChannels.filter((entry) => !entry.safeToRemove).length
});

module.exports = {
  HISTORY_COLLECTIONS,
  aggregateUsageCounts,
  buildCleanupPlan,
  buildScopedNameKey,
  classifyAdUnits,
  classifyDeleteChannels,
  isDeleteChannelName,
  normalizeName,
  summarizeCleanupPlan
};
