const mongoose = require('mongoose');
require('dotenv').config();

const { connectDatabase } = require('../config/database');
const {
  HISTORY_COLLECTIONS,
  buildCleanupPlan,
  getIdSet,
  idSetsMatch,
  summarizeCleanupPlan
} = require('../services/dataIntegrityCleanupService');

const migrationName = '20260908_cleanup_legacy_orphans';
const archiveCollectionName = 'data_integrity_cleanup_archive';
const allowedSourceCollections = new Set(['adunits', ...HISTORY_COLLECTIONS]);

const getEntityType = (sourceCollection) => (
  sourceCollection === 'adunits' ? 'AdUnit' : 'AdUnitHistory'
);

const assertUpDatabaseSafety = (db, expectedDatabase = process.env.CLEANUP_EXPECTED_DATABASE) => {
  const actualDatabase = String(db?.databaseName || '').trim();
  const normalizedExpected = String(expectedDatabase || '').trim();

  if (!actualDatabase) {
    throw new Error('Cleanup refused: connected database name is empty.');
  }
  if (actualDatabase.toLowerCase() === 'destinasian_staging') {
    throw new Error('Cleanup refused: destinasian_staging is explicitly protected.');
  }
  if (!normalizedExpected) {
    throw new Error('Cleanup refused: CLEANUP_EXPECTED_DATABASE must explicitly name the target database.');
  }
  if (actualDatabase !== normalizedExpected) {
    throw new Error(
      `Cleanup refused: connected database "${actualDatabase}" does not match CLEANUP_EXPECTED_DATABASE "${normalizedExpected}".`
    );
  }

  return actualDatabase;
};

const buildArchiveRecord = ({ sourceCollection, document, archivedAt = new Date() }) => ({
  migration: migrationName,
  sourceCollection,
  entityType: getEntityType(sourceCollection),
  originalId: document._id,
  document,
  archivedAt
});

const getRestoreCollection = (archivedDocument) => {
  const sourceCollection = String(archivedDocument?.sourceCollection || '');
  if (!allowedSourceCollections.has(sourceCollection)) {
    throw new Error(`Rollback refused: unsupported sourceCollection "${sourceCollection}".`);
  }
  return sourceCollection;
};

const findDocumentsSafely = async (db, sourceCollection, filter) => {
  try {
    return await db.collection(sourceCollection).find(filter).toArray();
  } catch (error) {
    if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) return [];
    throw error;
  }
};

const loadHistoryDocuments = async (db, orphanIds) => {
  const documentsByCollection = {};
  for (const sourceCollection of HISTORY_COLLECTIONS) {
    documentsByCollection[sourceCollection] = orphanIds.length > 0
      ? await findDocumentsSafely(db, sourceCollection, { adUnit: { $in: orphanIds } })
      : [];
  }
  return documentsByCollection;
};

const assertPlansMatch = (initialPlan, validationPlan) => {
  const initialIds = getIdSet(initialPlan.deleteOrphanAdUnits);
  const validationIds = getIdSet(validationPlan.deleteOrphanAdUnits);

  if (!idSetsMatch(initialIds, validationIds)) {
    throw new Error('Cleanup refused: exact orphan candidate set changed during pre-delete validation.');
  }
  if (initialPlan.deleteOrphanAdUnits.length !== validationPlan.deleteOrphanAdUnits.length) {
    throw new Error('Cleanup refused: orphan count changed during pre-delete validation.');
  }
  if (initialPlan.validRelations !== validationPlan.validRelations) {
    throw new Error('Cleanup refused: valid Ad Unit to Campaign relation count changed.');
  }
  if (initialPlan.totalCampaigns !== validationPlan.totalCampaigns) {
    throw new Error('Cleanup refused: Campaign count changed.');
  }
  if (initialPlan.totalInventories !== validationPlan.totalInventories) {
    throw new Error('Cleanup refused: Inventory count changed.');
  }

  for (const candidate of validationPlan.deleteOrphanAdUnits) {
    if (!initialIds.has(String(candidate._id))) {
      throw new Error(`Cleanup refused: candidate ${candidate._id} is outside the exact orphan plan.`);
    }
  }
};

const assertHistoryMatchesPlan = (plan, documentsByCollection) => {
  for (const sourceCollection of HISTORY_COLLECTIONS) {
    const expected = Number(plan.historyByCollection[sourceCollection] || 0);
    const actual = documentsByCollection[sourceCollection]?.length || 0;
    if (actual !== expected) {
      throw new Error(
        `Cleanup refused: ${sourceCollection} changed from ${expected} to ${actual} documents before archive.`
      );
    }
  }
};

const ensureArchiveIdentityIndex = async (db) => {
  await db.collection(archiveCollectionName).createIndex(
    { migration: 1, sourceCollection: 1, originalId: 1 },
    { name: 'migration_1_sourceCollection_1_originalId_1', unique: true }
  );
};

const archiveDocuments = async ({ db, sourceCollection, documents }) => {
  if (!allowedSourceCollections.has(sourceCollection)) {
    throw new Error(`Archive refused: unsupported sourceCollection "${sourceCollection}".`);
  }
  if (documents.length === 0) return 0;

  const archive = db.collection(archiveCollectionName);
  const archivedAt = new Date();
  await archive.bulkWrite(
    documents.map((document) => ({
      updateOne: {
        filter: {
          migration: migrationName,
          sourceCollection,
          originalId: document._id
        },
        update: {
          $setOnInsert: buildArchiveRecord({ sourceCollection, document, archivedAt })
        },
        upsert: true
      }
    })),
    { ordered: true }
  );

  const archivedCount = await archive.countDocuments({
    migration: migrationName,
    sourceCollection,
    originalId: { $in: documents.map((document) => document._id) }
  });
  if (archivedCount !== documents.length) {
    throw new Error(
      `Cleanup refused: ${sourceCollection} archive count ${archivedCount} does not match ${documents.length} documents.`
    );
  }
  return archivedCount;
};

const assertArchivedDocumentsStillExact = async ({ db, plan, documentsByCollection }) => {
  const validationPlan = await buildCleanupPlan(db);
  assertPlansMatch(plan, validationPlan);

  const currentHistory = await loadHistoryDocuments(db, plan.orphanIds);
  for (const sourceCollection of HISTORY_COLLECTIONS) {
    const archivedIds = getIdSet(documentsByCollection[sourceCollection]);
    const currentIds = getIdSet(currentHistory[sourceCollection]);
    if (!idSetsMatch(archivedIds, currentIds)) {
      throw new Error(
        `Cleanup refused: ${sourceCollection} changed after archive and before delete.`
      );
    }
  }
};

const deleteArchivedDocuments = async ({ db, plan, documentsByCollection }) => {
  const removedHistoryByCollection = {};

  for (const sourceCollection of HISTORY_COLLECTIONS) {
    const documents = documentsByCollection[sourceCollection];
    if (documents.length === 0) {
      removedHistoryByCollection[sourceCollection] = 0;
      continue;
    }

    const result = await db.collection(sourceCollection).deleteMany({
      _id: { $in: documents.map((document) => document._id) },
      adUnit: { $in: plan.orphanIds }
    });
    if (result.deletedCount !== documents.length) {
      throw new Error(
        `Cleanup failed closed: removed ${result.deletedCount} of ${documents.length} ${sourceCollection} documents.`
      );
    }
    removedHistoryByCollection[sourceCollection] = result.deletedCount;
  }

  const adUnitResult = plan.orphanIds.length > 0
    ? await db.collection('adunits').deleteMany({ _id: { $in: plan.orphanIds } })
    : { deletedCount: 0 };
  if (adUnitResult.deletedCount !== plan.orphanIds.length) {
    throw new Error(
      `Cleanup failed closed: removed ${adUnitResult.deletedCount} of ${plan.orphanIds.length} orphan Ad Units.`
    );
  }

  return {
    removedAdUnits: adUnitResult.deletedCount,
    removedHistoryByCollection,
    removedHistoryDocuments: Object.values(removedHistoryByCollection)
      .reduce((sum, count) => sum + Number(count || 0), 0)
  };
};

const assertPostValidation = async ({ db, initialPlan, removal }) => {
  const postPlan = await buildCleanupPlan(db);
  if (postPlan.orphanAdUnits.length !== 0) {
    throw new Error(`Post-validation failed: ${postPlan.orphanAdUnits.length} orphan Ad Units remain.`);
  }
  if (postPlan.validRelations !== initialPlan.validRelations) {
    throw new Error('Post-validation failed: valid Ad Unit to Campaign relations decreased.');
  }
  if (postPlan.totalCampaigns !== initialPlan.totalCampaigns) {
    throw new Error('Post-validation failed: Campaign count changed.');
  }
  if (postPlan.totalInventories !== initialPlan.totalInventories) {
    throw new Error('Post-validation failed: Inventory count changed.');
  }

  const remainingHistory = await loadHistoryDocuments(db, initialPlan.orphanIds);
  const remainingHistoryCount = Object.values(remainingHistory)
    .reduce((sum, documents) => sum + documents.length, 0);
  if (remainingHistoryCount !== 0) {
    throw new Error(
      `Post-validation failed: ${remainingHistoryCount} history documents still reference deleted Ad Units.`
    );
  }
  if (removal.removedAdUnits !== initialPlan.deleteOrphanAdUnits.length) {
    throw new Error('Post-validation failed: removed Ad Unit count does not match the exact plan.');
  }

  return postPlan;
};

const printPlan = (plan, logger = console.log) => {
  logger(JSON.stringify(summarizeCleanupPlan(plan), null, 2));
  plan.deleteOrphanAdUnits.forEach((adUnit) => {
    logger(JSON.stringify({
      type: 'orphan-ad-unit',
      id: String(adUnit._id),
      campaignId: String(adUnit.campaign || ''),
      name: adUnit.name,
      action: 'archive-history-and-delete'
    }));
  });
};

const runDryRunAgainstDatabase = async (db, { logger = console.log } = {}) => {
  const plan = await buildCleanupPlan(db);
  printPlan(plan, logger);
  return plan;
};

const runUpAgainstDatabase = async (
  db,
  { expectedDatabase = process.env.CLEANUP_EXPECTED_DATABASE, logger = console.log } = {}
) => {
  assertUpDatabaseSafety(db, expectedDatabase);
  const initialPlan = await buildCleanupPlan(db);
  printPlan(initialPlan, logger);

  const preDeletePlan = await buildCleanupPlan(db);
  assertPlansMatch(initialPlan, preDeletePlan);
  const historyDocuments = await loadHistoryDocuments(db, initialPlan.orphanIds);
  assertHistoryMatchesPlan(initialPlan, historyDocuments);

  await ensureArchiveIdentityIndex(db);
  await archiveDocuments({
    db,
    sourceCollection: 'adunits',
    documents: initialPlan.deleteOrphanAdUnits
  });
  for (const sourceCollection of HISTORY_COLLECTIONS) {
    await archiveDocuments({
      db,
      sourceCollection,
      documents: historyDocuments[sourceCollection]
    });
  }

  await assertArchivedDocumentsStillExact({
    db,
    plan: initialPlan,
    documentsByCollection: historyDocuments
  });
  const removal = await deleteArchivedDocuments({
    db,
    plan: initialPlan,
    documentsByCollection: historyDocuments
  });
  await assertPostValidation({ db, initialPlan, removal });

  await db.collection('_migrations').updateOne(
    { name: migrationName },
    {
      $set: {
        name: migrationName,
        appliedAt: new Date(),
        databaseName: initialPlan.databaseName,
        removedAdUnits: removal.removedAdUnits,
        removedHistoryDocuments: removal.removedHistoryDocuments,
        removedHistoryByCollection: removal.removedHistoryByCollection,
        removedInventories: 0,
        retainedForManualReview: 0
      }
    },
    { upsert: true }
  );

  return { initialPlan, removal };
};

const runDownAgainstDatabase = async (
  db,
  { expectedDatabase = process.env.CLEANUP_EXPECTED_DATABASE } = {}
) => {
  assertUpDatabaseSafety(db, expectedDatabase);
  const archivedDocuments = await db.collection(archiveCollectionName)
    .find({ migration: migrationName })
    .toArray();

  for (const archived of archivedDocuments) {
    const sourceCollection = getRestoreCollection(archived);
    await db.collection(sourceCollection).replaceOne(
      { _id: archived.originalId },
      archived.document,
      { upsert: true }
    );
    await db.collection(archiveCollectionName).updateOne(
      { _id: archived._id },
      { $set: { restoredAt: new Date() } }
    );
  }

  await db.collection('_migrations').deleteOne({ name: migrationName });
  return { restoredDocuments: archivedDocuments.length };
};

const withDatabaseConnection = async (action) => {
  await connectDatabase();
  try {
    return await action(mongoose.connection.db);
  } finally {
    await mongoose.disconnect();
  }
};

const dryRun = () => withDatabaseConnection((db) => runDryRunAgainstDatabase(db));
const up = () => withDatabaseConnection((db) => runUpAgainstDatabase(db));
const down = () => withDatabaseConnection((db) => runDownAgainstDatabase(db));

const actions = { 'dry-run': dryRun, up, down };

if (require.main === module) {
  const direction = process.argv[2] || 'dry-run';
  const action = actions[direction];
  if (!action) {
    console.error(`Usage: node migrations/${migrationName}.js [dry-run|up|down]`);
    process.exit(1);
  }

  action()
    .then(() => console.log(`Completed ${direction}: ${migrationName}`))
    .catch((error) => {
      console.error(`Failed ${direction} ${migrationName}:`, error);
      process.exit(1);
    });
}

module.exports = {
  allowedSourceCollections,
  archiveCollectionName,
  archiveDocuments,
  assertHistoryMatchesPlan,
  assertPlansMatch,
  assertPostValidation,
  assertUpDatabaseSafety,
  buildArchiveRecord,
  deleteArchivedDocuments,
  down,
  dryRun,
  getEntityType,
  getRestoreCollection,
  loadHistoryDocuments,
  migrationName,
  printPlan,
  runDownAgainstDatabase,
  runDryRunAgainstDatabase,
  runUpAgainstDatabase,
  up
};
