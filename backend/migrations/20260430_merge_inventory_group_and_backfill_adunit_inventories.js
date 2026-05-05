const mongoose = require('mongoose');
require('dotenv').config();

const migrationName = '20260430_merge_inventory_group_and_backfill_adunit_inventories';
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ad-server';

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

const toObjectId = (value) => {
  if (!value) return null;
  const raw = typeof value === 'object' && value !== null ? (value._id || value.id || value) : value;
  const normalized = String(raw).trim();
  return mongoose.Types.ObjectId.isValid(normalized) ? new mongoose.Types.ObjectId(normalized) : null;
};

const normalizeText = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const findInventoryIdByAlias = async (inventoriesCollection, accountId, alias) => {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return null;

  const objectId = toObjectId(normalizedAlias);
  const query = { account: accountId };
  if (objectId) {
    query.$or = [
      { _id: objectId },
      { key: normalizedAlias.toLowerCase() },
      { name: normalizedAlias },
      { groupName: normalizedAlias }
    ];
  } else {
    query.$or = [
      { key: normalizedAlias.toLowerCase() },
      { name: normalizedAlias },
      { groupName: normalizedAlias }
    ];
  }

  const inventory = await inventoriesCollection.findOne(query, { projection: { _id: 1 } });
  return inventory?._id || null;
};

const migrateAdUnits = async (db) => {
  const adUnitsCollection = db.collection('adunits');
  const inventoriesCollection = db.collection('inventories');

  const cursor = adUnitsCollection.find({});
  let updated = 0;

  while (await cursor.hasNext()) {
    const adUnit = await cursor.next();
    const nextInventories = [];

    if (Array.isArray(adUnit.inventories)) {
      adUnit.inventories.forEach((value) => {
        const objectId = toObjectId(value);
        if (objectId) nextInventories.push(objectId);
      });
    }

    const legacyInventoryId = toObjectId(adUnit.inventory);
    if (legacyInventoryId) {
      nextInventories.push(legacyInventoryId);
    }

    const legacyAliases = [
      adUnit.inventoryGroup,
      adUnit.inventoryGroupId,
      adUnit.inventory_group_id
    ];

    for (const alias of legacyAliases) {
      const resolvedId = await findInventoryIdByAlias(inventoriesCollection, adUnit.account, alias);
      if (resolvedId) {
        nextInventories.push(resolvedId);
      }
    }

    const uniqueInventoryIds = [...new Set(nextInventories.map((value) => String(value)))].map((value) => new mongoose.Types.ObjectId(value));

    const updatePayload = {
      $unset: {
        inventoryGroup: '',
        inventoryGroupId: '',
        inventory_group_id: ''
      }
    };

    if (uniqueInventoryIds.length > 0) {
      updatePayload.$set = {
        inventories: uniqueInventoryIds,
        inventory: uniqueInventoryIds[0]
      };
    }

    const result = await adUnitsCollection.updateOne(
      { _id: adUnit._id },
      updatePayload
    );

    if (result.modifiedCount > 0) {
      updated += 1;
    }
  }

  return updated;
};

const migrateCampaigns = async (db) => {
  const campaignsCollection = db.collection('campaigns');
  const result = await campaignsCollection.updateMany(
    {},
    {
      $unset: {
        inventoryGroup: '',
        inventoryGroupId: '',
        inventory_group_id: ''
      }
    }
  );

  return result.modifiedCount || 0;
};

const up = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  await ensureMigrationsCollection(db);

  const [adUnitUpdates, campaignUpdates] = await Promise.all([
    migrateAdUnits(db),
    migrateCampaigns(db)
  ]);

  await markApplied(db);
  await mongoose.disconnect();

  console.log(`[${migrationName}] adUnits updated=${adUnitUpdates}, campaigns normalized=${campaignUpdates}`);
};

const down = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  await unmarkApplied(db);
  await mongoose.disconnect();
  console.log(`[${migrationName}] rollback marker removed (data unchanged)`);
};

const direction = process.argv[2] || 'up';

if (direction === 'up') {
  up().catch(async (error) => {
    console.error(`Failed migration ${migrationName}:`, error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
} else if (direction === 'down') {
  down().catch(async (error) => {
    console.error(`Failed rollback ${migrationName}:`, error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
} else {
  console.error(`Usage: node migrations/20260430_merge_inventory_group_and_backfill_adunit_inventories.js [up|down]`);
  process.exit(1);
}
