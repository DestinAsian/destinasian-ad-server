const mongoose = require('mongoose');
require('dotenv').config();

const migrationName = '20260402_add_ad_event_and_daily_stat_collections';
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ad-server';

const collectionSpecs = [
  {
    name: 'ad_impression_events',
    indexes: [
      { key: { account: 1, occurredAt: -1 }, name: 'account_1_occurredAt_-1' },
      { key: { campaign: 1, occurredAt: -1 }, name: 'campaign_1_occurredAt_-1' },
      { key: { adUnit: 1, occurredAt: -1 }, name: 'adUnit_1_occurredAt_-1' },
      { key: { inventory: 1, occurredAt: -1 }, name: 'inventory_1_occurredAt_-1' },
      { key: { adCode: 1, occurredAt: -1 }, name: 'adCode_1_occurredAt_-1' }
    ]
  },
  {
    name: 'ad_click_events',
    indexes: [
      { key: { account: 1, occurredAt: -1 }, name: 'account_1_occurredAt_-1' },
      { key: { campaign: 1, occurredAt: -1 }, name: 'campaign_1_occurredAt_-1' },
      { key: { adUnit: 1, occurredAt: -1 }, name: 'adUnit_1_occurredAt_-1' },
      { key: { inventory: 1, occurredAt: -1 }, name: 'inventory_1_occurredAt_-1' },
      { key: { adCode: 1, occurredAt: -1 }, name: 'adCode_1_occurredAt_-1' }
    ]
  },
  {
    name: 'ad_daily_stats',
    indexes: [
      { key: { statDate: 1, account: 1 }, name: 'statDate_1_account_1' },
      { key: { statDate: 1, campaign: 1 }, name: 'statDate_1_campaign_1' },
      { key: { statDate: 1, adUnit: 1 }, name: 'statDate_1_adUnit_1' },
      { key: { statDate: 1, inventory: 1 }, name: 'statDate_1_inventory_1' },
      {
        key: { statDate: 1, account: 1, campaign: 1, adUnit: 1, inventory: 1 },
        name: 'ad_daily_stats_rollup_key',
        unique: true
      }
    ]
  }
];

const ensureMigrationsCollection = async (db) => {
  const existing = await db.listCollections({ name: '_migrations' }).toArray();
  if (existing.length === 0) {
    await db.createCollection('_migrations');
  }
};

const markApplied = async (db) => {
  await db.collection('_migrations').updateOne(
    { name: migrationName },
    { $set: { name: migrationName, appliedAt: new Date() } },
    { upsert: true }
  );
};

const unmarkApplied = async (db) => {
  await db.collection('_migrations').deleteOne({ name: migrationName });
};

const ensureCollection = async (db, name) => {
  const existing = await db.listCollections({ name }).toArray();
  if (existing.length === 0) {
    await db.createCollection(name);
  }
};

const ensureIndexes = async (db, spec) => {
  const collection = db.collection(spec.name);
  const existingIndexes = await collection.indexes();
  const existingNames = new Set(existingIndexes.map((index) => index.name));

  for (const index of spec.indexes) {
    if (!existingNames.has(index.name)) {
      await collection.createIndex(index.key, { name: index.name, unique: !!index.unique });
    }
  }
};

const dropManagedIndexes = async (db, spec) => {
  const collection = db.collection(spec.name);
  const existingIndexes = await collection.indexes().catch(() => []);
  const existingNames = new Set(existingIndexes.map((index) => index.name));

  for (const index of spec.indexes) {
    if (existingNames.has(index.name)) {
      await collection.dropIndex(index.name);
    }
  }
};

const up = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  await ensureMigrationsCollection(db);

  for (const spec of collectionSpecs) {
    await ensureCollection(db, spec.name);
    await ensureIndexes(db, spec);
  }

  await markApplied(db);
  await mongoose.disconnect();
};

const down = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  for (const spec of collectionSpecs) {
    await dropManagedIndexes(db, spec);
  }

  await unmarkApplied(db);
  await mongoose.disconnect();
};

const direction = process.argv[2] || 'up';

if (direction === 'up') {
  up()
    .then(() => {
      console.log(`Applied migration: ${migrationName}`);
    })
    .catch(async (error) => {
      console.error(`Failed to apply migration: ${migrationName}`, error);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    });
} else if (direction === 'down') {
  down()
    .then(() => {
      console.log(`Rolled back managed indexes for migration: ${migrationName}`);
    })
    .catch(async (error) => {
      console.error(`Failed to roll back migration: ${migrationName}`, error);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    });
} else {
  console.error('Usage: node migrations/20260402_add_ad_event_and_daily_stat_collections.js [up|down]');
  process.exit(1);
}
