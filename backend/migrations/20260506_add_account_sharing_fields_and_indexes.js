const mongoose = require('mongoose');
require('dotenv').config();

const migrationName = '20260506_add_account_sharing_fields_and_indexes';
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

const ensureIndexes = async (db) => {
  const accountsCollection = db.collection('accounts');
  await accountsCollection.createIndex({ owner: 1, name: 1 }, { name: 'owner_1_name_1_unique', unique: true });
  await accountsCollection.createIndex({ 'sharedUsers.user': 1 }, { name: 'sharedUsers.user_1' });
  await accountsCollection.createIndex({ 'sharedUsers.email': 1 }, { name: 'sharedUsers.email_1' });
};

const normalizeSharedUsers = async (db) => {
  const accountsCollection = db.collection('accounts');
  const cursor = accountsCollection.find({});
  let updated = 0;

  while (await cursor.hasNext()) {
    const account = await cursor.next();
    const entries = Array.isArray(account.sharedUsers) ? account.sharedUsers : [];

    const deduped = [];
    const seen = new Set();
    for (const entry of entries) {
      if (!entry || !entry.user) continue;
      const userKey = String(entry.user);
      if (seen.has(userKey)) continue;
      seen.add(userKey);

      deduped.push({
        ...entry,
        email: typeof entry.email === 'string' ? entry.email.trim().toLowerCase() : '',
        accessLevel: entry.accessLevel === 'owner' ? 'owner' : 'editor',
        addedAt: entry.addedAt || new Date(account.updatedAt || Date.now()),
        addedBy: entry.addedBy || account.owner
      });
    }

    const updatePayload = {
      $set: {
        sharedUsers: deduped,
        isActive: account.isActive !== false
      }
    };

    const result = await accountsCollection.updateOne({ _id: account._id }, updatePayload);
    if (result.modifiedCount > 0) {
      updated += 1;
    }
  }

  return updated;
};

const up = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  await ensureMigrationsCollection(db);

  const normalized = await normalizeSharedUsers(db);
  await ensureIndexes(db);
  await markApplied(db);
  await mongoose.disconnect();

  console.log(`[${migrationName}] accounts normalized=${normalized}`);
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
  console.error(`Usage: node migrations/${migrationName}.js [up|down]`);
  process.exit(1);
}
