const mongoose = require('mongoose');
require('dotenv').config();

const { connectDatabase } = require('../config/database');

const migrationName = '20260902_optimize_statistics_indexes';

const collectionSpecs = [
  {
    name: 'impressions',
    indexes: [
      { key: { account: 1, campaign: 1, timestamp: 1 }, name: 'account_1_campaign_1_timestamp_1' },
      { key: { account: 1, adUnit: 1, timestamp: 1 }, name: 'account_1_adUnit_1_timestamp_1' }
    ]
  },
  {
    name: 'clicks',
    indexes: [
      { key: { account: 1, campaign: 1, timestamp: 1 }, name: 'account_1_campaign_1_timestamp_1' },
      { key: { account: 1, adUnit: 1, timestamp: 1 }, name: 'account_1_adUnit_1_timestamp_1' }
    ]
  },
  {
    name: 'ad_daily_stats',
    indexes: [
      { key: { account: 1, statDate: 1 }, name: 'account_1_statDate_1' },
      { key: { account: 1, campaign: 1, statDate: 1 }, name: 'account_1_campaign_1_statDate_1' },
      { key: { account: 1, adUnit: 1, statDate: 1 }, name: 'account_1_adUnit_1_statDate_1' },
      { key: { account: 1, inventory: 1, statDate: 1 }, name: 'account_1_inventory_1_statDate_1' }
    ]
  },
  {
    name: 'adunits',
    indexes: [
      { key: { account: 1, campaign: 1 }, name: 'account_1_campaign_1' },
      {
        key: { inventory: 1, status: 1, startDate: 1, endDate: 1, campaign: 1 },
        name: 'inventory_1_status_1_startDate_1_endDate_1_campaign_1'
      },
      {
        key: { inventories: 1, status: 1, startDate: 1, endDate: 1, campaign: 1 },
        name: 'inventories_1_status_1_startDate_1_endDate_1_campaign_1'
      }
    ]
  }
];

const ensureMigrationsCollection = async (db) => {
  const existing = await db.listCollections({ name: '_migrations' }).toArray();
  if (existing.length === 0) await db.createCollection('_migrations');
};

const up = async () => {
  await connectDatabase();
  const db = mongoose.connection.db;
  await ensureMigrationsCollection(db);

  for (const spec of collectionSpecs) {
    const collection = db.collection(spec.name);
    const existing = new Set((await collection.indexes()).map((index) => index.name));
    for (const index of spec.indexes) {
      if (!existing.has(index.name)) {
        await collection.createIndex(index.key, { name: index.name });
      }
    }
  }

  await db.collection('_migrations').updateOne(
    { name: migrationName },
    { $set: { name: migrationName, appliedAt: new Date() } },
    { upsert: true }
  );
  await mongoose.disconnect();
};

const down = async () => {
  await connectDatabase();
  const db = mongoose.connection.db;

  for (const spec of collectionSpecs) {
    const collection = db.collection(spec.name);
    const existing = new Set((await collection.indexes().catch(() => [])).map((index) => index.name));
    for (const index of spec.indexes) {
      if (existing.has(index.name)) await collection.dropIndex(index.name);
    }
  }

  await db.collection('_migrations').deleteOne({ name: migrationName });
  await mongoose.disconnect();
};

const direction = process.argv[2] || 'up';
const action = direction === 'up' ? up : direction === 'down' ? down : null;

if (!action) {
  console.error(`Usage: node migrations/${migrationName}.js [up|down]`);
  process.exit(1);
}

action()
  .then(() => console.log(`${direction === 'up' ? 'Applied' : 'Rolled back'} migration: ${migrationName}`))
  .catch(async (error) => {
    console.error(`Failed migration ${migrationName}:`, error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
