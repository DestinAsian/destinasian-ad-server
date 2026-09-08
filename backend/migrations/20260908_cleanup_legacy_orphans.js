const mongoose = require('mongoose');
require('dotenv').config();

const { connectDatabase } = require('../config/database');
const {
  buildCleanupPlan,
  summarizeCleanupPlan
} = require('../services/dataIntegrityCleanupService');

const migrationName = '20260908_cleanup_legacy_orphans';
const archiveCollectionName = 'data_integrity_cleanup_archive';

const ensureMigrationsCollection = async (db) => {
  const existing = await db.listCollections({ name: '_migrations' }).toArray();
  if (existing.length === 0) await db.createCollection('_migrations');
};

const archiveAndDelete = async ({ db, collectionName, entityType, document }) => {
  const originalId = document._id;
  await db.collection(archiveCollectionName).updateOne(
    { migration: migrationName, entityType, originalId },
    {
      $setOnInsert: {
        migration: migrationName,
        entityType,
        originalId,
        document,
        archivedAt: new Date()
      }
    },
    { upsert: true }
  );
  return db.collection(collectionName).deleteOne({ _id: originalId });
};

const printPlan = (plan) => {
  console.log(JSON.stringify(summarizeCleanupPlan(plan), null, 2));

  plan.duplicateOrphans.forEach((entry) => {
    console.log(JSON.stringify({
      type: 'duplicate-orphan-ad-unit',
      id: String(entry.document._id),
      name: entry.document.name,
      historyRows: entry.historyRows,
      historyAction: 'preserve-existing-statistics',
      hasCampaignBackReference: entry.hasCampaignBackReference,
      action: entry.safeToRemove ? 'archive-and-delete' : 'retain-for-manual-review'
    }));
  });

  plan.standaloneOrphans.forEach((entry) => {
    console.log(JSON.stringify({
      type: 'standalone-orphan-ad-unit',
      id: String(entry.document._id),
      name: entry.document.name,
      action: 'retain-for-manual-review'
    }));
  });

  plan.deleteChannels.forEach((entry) => {
    console.log(JSON.stringify({
      type: 'delete-named-ad-channel',
      id: String(entry.document._id),
      name: entry.document.name,
      linkedAdUnits: entry.linkedAdUnits,
      action: entry.safeToRemove ? 'archive-and-delete' : 'retain-until-unlinked'
    }));
  });
};

const dryRun = async () => {
  await connectDatabase();
  const plan = await buildCleanupPlan(mongoose.connection.db);
  printPlan(plan);
  await mongoose.disconnect();
};

const up = async () => {
  await connectDatabase();
  const db = mongoose.connection.db;
  const plan = await buildCleanupPlan(db);
  const safeAdUnits = plan.duplicateOrphans.filter((entry) => entry.safeToRemove);
  const safeChannels = plan.deleteChannels.filter((entry) => entry.safeToRemove);

  for (const entry of safeAdUnits) {
    await archiveAndDelete({
      db,
      collectionName: 'adunits',
      entityType: 'AdUnit',
      document: entry.document
    });
  }

  for (const entry of safeChannels) {
    await archiveAndDelete({
      db,
      collectionName: 'inventories',
      entityType: 'Inventory',
      document: entry.document
    });
  }

  const [archivedAdUnits, archivedInventories] = await Promise.all([
    db.collection(archiveCollectionName).countDocuments({
      migration: migrationName,
      entityType: 'AdUnit'
    }),
    db.collection(archiveCollectionName).countDocuments({
      migration: migrationName,
      entityType: 'Inventory'
    })
  ]);

  await ensureMigrationsCollection(db);
  await db.collection('_migrations').updateOne(
    { name: migrationName },
    {
      $set: {
        name: migrationName,
        appliedAt: new Date(),
        removedAdUnits: archivedAdUnits,
        removedInventories: archivedInventories,
        retainedForManualReview: (
          plan.duplicateOrphans.length - safeAdUnits.length + plan.standaloneOrphans.length
        )
      }
    },
    { upsert: true }
  );

  printPlan(plan);
  await mongoose.disconnect();
};

const down = async () => {
  await connectDatabase();
  const db = mongoose.connection.db;
  const archivedDocuments = await db.collection(archiveCollectionName)
    .find({ migration: migrationName })
    .toArray();

  for (const archived of archivedDocuments) {
    const collectionName = archived.entityType === 'Inventory' ? 'inventories' : 'adunits';
    await db.collection(collectionName).replaceOne(
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
  await mongoose.disconnect();
};

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
    .catch(async (error) => {
      console.error(`Failed ${direction} ${migrationName}:`, error);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    });
}

module.exports = { archiveAndDelete, down, dryRun, migrationName, printPlan, up };
