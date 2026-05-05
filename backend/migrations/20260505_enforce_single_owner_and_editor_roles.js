const mongoose = require('mongoose');
require('dotenv').config();

const migrationName = '20260505_enforce_single_owner_and_editor_roles';
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ad-server';
const ownerIndexName = 'single_owner_unique_role';

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

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const toTime = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

const sortByOldest = (a, b) => {
  const timeDiff = toTime(a.createdAt) - toTime(b.createdAt);
  if (timeDiff !== 0) return timeDiff;
  return String(a._id).localeCompare(String(b._id));
};

const ensureOwnerUniqueness = async (db) => {
  const usersCollection = db.collection('users');
  const users = await usersCollection.find({}).toArray();
  if (users.length === 0) {
    return { updated: 0, ownerId: null, demotedOwnerIds: [], skippedEmailNormalization: [] };
  }

  const sortedUsers = [...users].sort(sortByOldest);
  const ownerCandidates = sortedUsers.filter((user) => normalizeRole(user.role) === 'owner');
  const primaryOwner = ownerCandidates.length > 0 ? ownerCandidates[0] : sortedUsers[0];

  const lowercaseBuckets = new Map();
  sortedUsers.forEach((user) => {
    const normalized = normalizeEmail(user.email);
    if (!normalized) return;
    if (!lowercaseBuckets.has(normalized)) lowercaseBuckets.set(normalized, []);
    lowercaseBuckets.get(normalized).push(user._id.toString());
  });

  let updated = 0;
  const demotedOwnerIds = [];
  const skippedEmailNormalization = [];

  for (const user of sortedUsers) {
    const nextRole = user._id.toString() === primaryOwner._id.toString() ? 'owner' : 'editor';
    const updateSet = {};

    if (normalizeRole(user.role) !== nextRole) {
      updateSet.role = nextRole;
      if (nextRole === 'editor' && normalizeRole(user.role) === 'owner') {
        demotedOwnerIds.push(user._id.toString());
      }
    }

    const normalizedEmail = normalizeEmail(user.email);
    if (normalizedEmail && normalizedEmail !== user.email) {
      const bucket = lowercaseBuckets.get(normalizedEmail) || [];
      if (bucket.length === 1) {
        updateSet.email = normalizedEmail;
      } else {
        skippedEmailNormalization.push({
          userId: user._id.toString(),
          currentEmail: user.email,
          normalizedEmail
        });
      }
    }

    if (Object.keys(updateSet).length > 0) {
      const result = await usersCollection.updateOne({ _id: user._id }, { $set: updateSet });
      if (result.modifiedCount > 0) {
        updated += 1;
      }
    }
  }

  return {
    updated,
    ownerId: primaryOwner._id.toString(),
    demotedOwnerIds,
    skippedEmailNormalization
  };
};

const ensureOwnerIndex = async (db) => {
  const usersCollection = db.collection('users');
  await usersCollection.createIndex(
    { role: 1 },
    {
      name: ownerIndexName,
      unique: true,
      partialFilterExpression: { role: 'owner' }
    }
  );
};

const dropOwnerIndex = async (db) => {
  const usersCollection = db.collection('users');
  const existingIndexes = await usersCollection.indexes().catch(() => []);
  const hasIndex = existingIndexes.some((index) => index.name === ownerIndexName);
  if (hasIndex) {
    await usersCollection.dropIndex(ownerIndexName);
  }
};

const up = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  await ensureMigrationsCollection(db);

  const result = await ensureOwnerUniqueness(db);
  await ensureOwnerIndex(db);
  await markApplied(db);
  await mongoose.disconnect();

  console.log(`[${migrationName}] updated=${result.updated} owner=${result.ownerId} demotedOwners=${result.demotedOwnerIds.join(',') || 'none'}`);
  if (result.skippedEmailNormalization.length > 0) {
    console.log(`[${migrationName}] skipped email normalization due to conflicts: ${JSON.stringify(result.skippedEmailNormalization)}`);
  }
};

const down = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  await dropOwnerIndex(db);
  await unmarkApplied(db);
  await mongoose.disconnect();
  console.log(`[${migrationName}] rollback marker removed and owner index dropped`);
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
