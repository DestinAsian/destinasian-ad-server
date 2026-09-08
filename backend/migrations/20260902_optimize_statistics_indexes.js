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

const indexKeysMatch = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const collectPlanStages = (value, stages = new Set()) => {
  if (!value || typeof value !== 'object') return stages;
  if (typeof value.stage === 'string') stages.add(value.stage);
  Object.values(value).forEach((child) => {
    if (Array.isArray(child)) {
      child.forEach((entry) => collectPlanStages(entry, stages));
    } else if (child && typeof child === 'object') {
      collectPlanStages(child, stages);
    }
  });
  return stages;
};

const buildVerificationFilter = (index, sample = {}) => (
  Object.keys(index.key).reduce((filter, field) => {
    const value = sample[field];
    filter[field] = value === undefined || value === null ? { $exists: true } : value;
    return filter;
  }, {})
);

const verifyIndexes = async (db) => {
  const results = [];

  for (const spec of collectionSpecs) {
    const collection = db.collection(spec.name);
    const existing = await collection.indexes();
    const existingByName = new Map(existing.map((index) => [index.name, index]));
    const projection = spec.indexes.reduce((fields, index) => {
      Object.keys(index.key).forEach((field) => { fields[field] = 1; });
      return fields;
    }, {});
    const sample = await collection.findOne({}, { projection }) || {};

    for (const index of spec.indexes) {
      const actual = existingByName.get(index.name);
      if (!actual) throw new Error(`Missing required index ${spec.name}.${index.name}`);
      if (!indexKeysMatch(actual.key, index.key)) {
        throw new Error(`Index key mismatch for ${spec.name}.${index.name}`);
      }

      const filter = buildVerificationFilter(index, sample);
      const explanation = await collection
        .find(filter)
        .hint(index.name)
        .limit(25)
        .explain('executionStats');
      const stages = [...collectPlanStages(explanation.queryPlanner?.winningPlan)];
      if (!stages.includes('IXSCAN')) {
        throw new Error(`Expected IXSCAN for ${spec.name}.${index.name}; received ${stages.join(', ')}`);
      }

      results.push({
        collection: spec.name,
        index: index.name,
        stages,
        totalKeysExamined: explanation.executionStats?.totalKeysExamined ?? null,
        totalDocsExamined: explanation.executionStats?.totalDocsExamined ?? null,
        returned: explanation.executionStats?.nReturned ?? null
      });
    }
  }

  return results;
};

const up = async () => {
  await connectDatabase();
  const db = mongoose.connection.db;
  await ensureMigrationsCollection(db);

  for (const spec of collectionSpecs) {
    const collection = db.collection(spec.name);
    const existing = new Map((await collection.indexes()).map((index) => [index.name, index]));
    for (const index of spec.indexes) {
      if (!existing.has(index.name)) {
        await collection.createIndex(index.key, { name: index.name });
      } else if (!indexKeysMatch(existing.get(index.name).key, index.key)) {
        throw new Error(`Index key mismatch for ${spec.name}.${index.name}`);
      }
    }
  }

  const verificationResults = await verifyIndexes(db);
  verificationResults.forEach((result) => console.log(JSON.stringify(result)));

  await db.collection('_migrations').updateOne(
    { name: migrationName },
    { $set: { name: migrationName, appliedAt: new Date() } },
    { upsert: true }
  );
  await mongoose.disconnect();
};

const verify = async () => {
  await connectDatabase();
  const results = await verifyIndexes(mongoose.connection.db);
  results.forEach((result) => console.log(JSON.stringify(result)));
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

if (require.main === module) {
  const direction = process.argv[2] || 'up';
  const actions = { up, down, verify };
  const action = actions[direction];

  if (!action) {
    console.error(`Usage: node migrations/${migrationName}.js [up|down|verify]`);
    process.exit(1);
  }

  action()
    .then(() => console.log(`${direction === 'up' ? 'Applied' : direction === 'down' ? 'Rolled back' : 'Verified'} migration: ${migrationName}`))
    .catch(async (error) => {
      console.error(`Failed migration ${migrationName}:`, error);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    });
}

module.exports = {
  buildVerificationFilter,
  collectPlanStages,
  collectionSpecs,
  indexKeysMatch,
  up,
  down,
  verify,
  verifyIndexes
};
