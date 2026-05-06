const mongoose = require('mongoose');
require('dotenv').config();

const migrationName = '20260506_cleanup_auto_created_editor_accounts';
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

const normalizeRole = (role) => {
  if (role === 'owner' || role === 'admin') return 'owner';
  return 'editor';
};

const countAccountData = async (db, accountId) => {
  const [campaignCount, inventoryCount, adUnitCount, reportCount] = await Promise.all([
    db.collection('campaigns').countDocuments({ account: accountId }),
    db.collection('inventories').countDocuments({ account: accountId }),
    db.collection('adunits').countDocuments({ account: accountId }),
    db.collection('addailystats').countDocuments({ account: accountId })
  ]);

  return {
    campaignCount,
    inventoryCount,
    adUnitCount,
    reportCount,
    hasData: campaignCount > 0 || inventoryCount > 0 || adUnitCount > 0 || reportCount > 0
  };
};

const up = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  await ensureMigrationsCollection(db);

  const usersCollection = db.collection('users');
  const accountsCollection = db.collection('accounts');

  const editorUsers = await usersCollection
    .find({}, { projection: { _id: 1, role: 1, email: 1 } })
    .toArray();

  const editorUserIds = editorUsers
    .filter((user) => normalizeRole(user.role) === 'editor')
    .map((user) => user._id);

  if (editorUserIds.length === 0) {
    await markApplied(db);
    await mongoose.disconnect();
    console.log(`[${migrationName}] no editor users found`);
    return;
  }

  const editorOwnedAccounts = await accountsCollection.find({
    owner: { $in: editorUserIds }
  }).toArray();

  let removedCount = 0;
  const manualReview = [];

  for (const account of editorOwnedAccounts) {
    const dataStatus = await countAccountData(db, account._id);

    if (dataStatus.hasData) {
      manualReview.push({
        accountId: String(account._id),
        ownerId: String(account.owner),
        name: account.name || '',
        ...dataStatus
      });
      continue;
    }

    await accountsCollection.deleteOne({ _id: account._id });
    await usersCollection.updateMany(
      { accounts: account._id },
      { $pull: { accounts: account._id } }
    );
    removedCount += 1;
  }

  await markApplied(db);
  await mongoose.disconnect();

  console.log(`[${migrationName}] removed_empty_editor_owned_accounts=${removedCount}`);
  if (manualReview.length > 0) {
    console.log(`[${migrationName}] manual_review_required=${manualReview.length}`);
    console.log(JSON.stringify(manualReview, null, 2));
  }
};

const down = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  await unmarkApplied(db);
  await mongoose.disconnect();
  console.log(`[${migrationName}] rollback marker removed (data not restored)`);
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
