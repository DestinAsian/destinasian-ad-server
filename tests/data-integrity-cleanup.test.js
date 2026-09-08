const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('../backend/node_modules/mongoose');

const {
  HISTORY_COLLECTIONS,
  buildCleanupPlan,
  classifyAdUnits,
  countHistoryDocuments
} = require('../backend/services/dataIntegrityCleanupService');
const {
  archiveDocuments,
  assertUpDatabaseSafety,
  buildArchiveRecord,
  getRestoreCollection,
  migrationName,
  runDownAgainstDatabase,
  runDryRunAgainstDatabase,
  runUpAgainstDatabase
} = require('../backend/migrations/20260908_cleanup_legacy_orphans');

const objectId = () => new mongoose.Types.ObjectId();

const createReadOnlyDatabase = ({ campaigns, adUnits, inventoryCount, historyCounts }) => {
  let writes = 0;
  const documentsByCollection = { campaigns, adunits: adUnits };

  return {
    databaseName: 'cleanup_unit_test',
    get writes() {
      return writes;
    },
    collection(name) {
      return {
        find() {
          return { toArray: async () => documentsByCollection[name] || [] };
        },
        countDocuments: async () => (
          name === 'inventories' ? inventoryCount : Number(historyCounts[name] || 0)
        ),
        createIndex: async () => { writes += 1; },
        bulkWrite: async () => { writes += 1; },
        deleteMany: async () => { writes += 1; },
        updateOne: async () => { writes += 1; },
        replaceOne: async () => { writes += 1; }
      };
    }
  };
};

const idsEqual = (left, right) => String(left || '') === String(right || '');

const matchesFilter = (document, filter = {}) => Object.entries(filter).every(([field, expected]) => {
  const actual = document[field];
  if (expected && typeof expected === 'object' && Array.isArray(expected.$in)) {
    return expected.$in.some((candidate) => idsEqual(actual, candidate));
  }
  return idsEqual(actual, expected);
});

const createInMemoryDatabase = (seed, hooks = {}) => {
  const collections = Object.fromEntries(
    Object.entries(seed).map(([name, documents]) => [name, [...documents]])
  );
  collections.data_integrity_cleanup_archive ||= [];
  collections._migrations ||= [];

  const findCalls = new Map();
  const deleteCalls = [];
  let archiveIndexCalls = 0;

  const getCollection = (name) => {
    collections[name] ||= [];
    return collections[name];
  };

  const db = {
    databaseName: Object.prototype.hasOwnProperty.call(hooks, 'databaseName')
      ? hooks.databaseName
      : 'destinasian_adserver',
    collections,
    deleteCalls,
    get archiveIndexCalls() {
      return archiveIndexCalls;
    },
    collection(name) {
      return {
        find(filter = {}) {
          const callNumber = Number(findCalls.get(name) || 0) + 1;
          findCalls.set(name, callNumber);
          hooks.beforeFind?.({ callNumber, collections, name });
          return {
            toArray: async () => getCollection(name).filter((document) => matchesFilter(document, filter))
          };
        },
        async countDocuments(filter = {}) {
          hooks.beforeCount?.({ collections, filter, name });
          return getCollection(name).filter((document) => matchesFilter(document, filter)).length;
        },
        async createIndex() {
          assert.equal(name, 'data_integrity_cleanup_archive');
          archiveIndexCalls += 1;
          return 'migration_1_sourceCollection_1_originalId_1';
        },
        async bulkWrite(operations) {
          assert.equal(name, 'data_integrity_cleanup_archive');
          const target = getCollection(name);
          for (const operation of operations) {
            const { filter, update } = operation.updateOne;
            if (!target.some((document) => matchesFilter(document, filter))) {
              target.push({ _id: objectId(), ...update.$setOnInsert });
            }
          }
          return { acknowledged: true };
        },
        async deleteMany(filter) {
          deleteCalls.push({ collection: name, filter });
          const target = getCollection(name);
          const retained = target.filter((document) => !matchesFilter(document, filter));
          const deletedCount = target.length - retained.length;
          collections[name] = retained;
          return { deletedCount };
        },
        async updateOne(filter, update, options = {}) {
          const target = getCollection(name);
          const existing = target.find((document) => matchesFilter(document, filter));
          if (existing) {
            Object.assign(existing, update.$set || {});
          } else if (options.upsert) {
            target.push({ _id: objectId(), ...filter, ...(update.$set || {}) });
          }
          return { acknowledged: true };
        },
        async replaceOne(filter, document, options = {}) {
          const target = getCollection(name);
          const index = target.findIndex((entry) => matchesFilter(entry, filter));
          if (index >= 0) target[index] = document;
          else if (options.upsert) target.push(document);
          return { acknowledged: true };
        },
        async deleteOne(filter) {
          const target = getCollection(name);
          const index = target.findIndex((document) => matchesFilter(document, filter));
          if (index >= 0) target.splice(index, 1);
          return { deletedCount: index >= 0 ? 1 : 0 };
        }
      };
    }
  };

  return db;
};

const createFullCleanupSeed = () => {
  const campaign = { _id: objectId(), name: 'Valid Campaign' };
  const inventory = { _id: objectId(), name: 'Homepage' };
  const validAdUnit = { _id: objectId(), campaign: campaign._id, name: 'Valid Banner' };
  const orphanAdUnits = [
    { _id: objectId(), campaign: objectId(), name: 'Duplicate Orphan' },
    { _id: objectId(), campaign: objectId(), name: 'Standalone Orphan' }
  ];
  const orphanHistoryByCollection = {
    impressions: [
      { _id: objectId(), adUnit: orphanAdUnits[0]._id },
      { _id: objectId(), adUnit: orphanAdUnits[1]._id }
    ],
    clicks: [{ _id: objectId(), adUnit: orphanAdUnits[0]._id }],
    ad_impression_events: [{ _id: objectId(), adUnit: orphanAdUnits[1]._id }],
    ad_click_events: [{ _id: objectId(), adUnit: orphanAdUnits[0]._id }],
    ad_daily_stats: [
      { _id: objectId(), adUnit: orphanAdUnits[0]._id },
      { _id: objectId(), adUnit: orphanAdUnits[1]._id }
    ]
  };
  const validHistoryByCollection = Object.fromEntries(
    HISTORY_COLLECTIONS.map((name) => [name, { _id: objectId(), adUnit: validAdUnit._id }])
  );
  const seed = {
    campaigns: [campaign],
    inventories: [inventory],
    adunits: [validAdUnit, ...orphanAdUnits]
  };
  for (const name of HISTORY_COLLECTIONS) {
    seed[name] = [...orphanHistoryByCollection[name], validHistoryByCollection[name]];
  }

  return {
    campaign,
    inventory,
    orphanAdUnits,
    orphanHistoryByCollection,
    seed,
    validAdUnit,
    validHistoryByCollection
  };
};

test('duplicate and standalone orphan Ad Units both enter the exact delete plan', () => {
  const validCampaignId = objectId();
  const missingCampaignId = objectId();
  const anotherMissingCampaignId = objectId();
  const valid = { _id: objectId(), campaign: validCampaignId, name: 'Banner A' };
  const duplicateOrphan = { _id: objectId(), campaign: missingCampaignId, name: 'Banner A' };
  const standaloneOrphan = { _id: objectId(), campaign: anotherMissingCampaignId, name: 'Banner B' };

  const result = classifyAdUnits({
    campaigns: [{ _id: validCampaignId }],
    adUnits: [valid, duplicateOrphan, standaloneOrphan]
  });

  assert.deepEqual(result.validAdUnits.map((item) => item._id), [valid._id]);
  assert.deepEqual(
    result.deleteOrphanAdUnits.map((item) => item._id),
    [duplicateOrphan._id, standaloneOrphan._id]
  );
  assert.equal(result.retainedOrphanAdUnits.length, 0);
});

test('history statistics are counted per source collection for exact orphan ObjectIds', async () => {
  const orphanIds = [objectId(), objectId()];
  const expected = {
    impressions: 4,
    clicks: 2,
    ad_impression_events: 4,
    ad_click_events: 2,
    ad_daily_stats: 3
  };
  const observedFilters = [];
  const db = {
    collection(name) {
      return {
        countDocuments: async (filter) => {
          observedFilters.push({ name, filter });
          return expected[name];
        }
      };
    }
  };

  const result = await countHistoryDocuments(db, orphanIds);

  assert.deepEqual(result.byCollection, expected);
  assert.equal(result.total, 15);
  assert.equal(observedFilters.length, HISTORY_COLLECTIONS.length);
  observedFilters.forEach(({ filter }) => assert.deepEqual(filter.adUnit.$in, orphanIds));
});

test('cleanup plan never contains Campaign or Inventory deletion candidates', async () => {
  const campaignId = objectId();
  const db = createReadOnlyDatabase({
    campaigns: [{ _id: campaignId }],
    adUnits: [
      { _id: objectId(), campaign: campaignId },
      { _id: objectId(), campaign: objectId() }
    ],
    inventoryCount: 9,
    historyCounts: {}
  });

  const plan = await buildCleanupPlan(db);

  assert.equal(plan.validRelations, 1);
  assert.equal(plan.deleteOrphanAdUnits.length, 1);
  assert.equal(plan.retainedOrphanAdUnits.length, 0);
  assert.deepEqual(plan.deleteInventories, []);
  assert.deepEqual(plan.deleteCampaigns, []);
  assert.equal(plan.totalInventories, 9);
});

test('default dry-run path performs reads only and reports all required totals', async () => {
  const validCampaignId = objectId();
  const historyCounts = {
    impressions: 2,
    clicks: 1,
    ad_impression_events: 2,
    ad_click_events: 1,
    ad_daily_stats: 1
  };
  const db = createReadOnlyDatabase({
    campaigns: [{ _id: validCampaignId }],
    adUnits: [
      { _id: objectId(), campaign: validCampaignId },
      { _id: objectId(), campaign: objectId() },
      { _id: objectId(), campaign: objectId() }
    ],
    inventoryCount: 4,
    historyCounts
  });
  const messages = [];

  await runDryRunAgainstDatabase(db, { logger: (message) => messages.push(message) });
  const summary = JSON.parse(messages[0]);

  assert.equal(db.writes, 0);
  assert.equal(summary.DATABASE, 'cleanup_unit_test');
  assert.equal(summary.TOTAL_ADUNITS, 3);
  assert.equal(summary.TOTAL_CAMPAIGNS, 1);
  assert.equal(summary.VALID_ADUNIT_CAMPAIGN_RELATIONS, 1);
  assert.equal(summary.ORPHAN_ADUNITS, 2);
  assert.equal(summary.DELETE_ORPHAN_ADUNITS, 2);
  assert.equal(summary.RETAIN_ORPHAN_ADUNITS, 0);
  assert.deepEqual(summary.HISTORY_DOCUMENTS_BY_COLLECTION, historyCounts);
  assert.equal(summary.TOTAL_HISTORY_DOCUMENTS, 7);
  assert.equal(summary.DELETE_INVENTORIES, 0);
  assert.equal(summary.DELETE_CAMPAIGNS, 0);
});

test('up safety guard fails closed for empty, staging, missing, and mismatched database names', () => {
  assert.throws(
    () => assertUpDatabaseSafety({ databaseName: '' }, 'destinasian_adserver'),
    /database name is empty/
  );
  assert.throws(
    () => assertUpDatabaseSafety({ databaseName: 'destinasian_staging' }, 'destinasian_staging'),
    /explicitly protected/
  );
  assert.throws(
    () => assertUpDatabaseSafety({ databaseName: 'destinasian_adserver' }, ''),
    /CLEANUP_EXPECTED_DATABASE/
  );
  assert.throws(
    () => assertUpDatabaseSafety({ databaseName: 'ad-server' }, 'destinasian_adserver'),
    /does not match/
  );
  assert.equal(
    assertUpDatabaseSafety({ databaseName: 'destinasian_adserver' }, 'destinasian_adserver'),
    'destinasian_adserver'
  );
});

test('archive is idempotent and records sourceCollection for restore', async () => {
  const stored = new Map();
  const archiveCollection = {
    async bulkWrite(operations) {
      operations.forEach(({ updateOne }) => {
        const key = `${updateOne.filter.sourceCollection}:${updateOne.filter.originalId}`;
        if (!stored.has(key)) stored.set(key, updateOne.update.$setOnInsert);
      });
    },
    async countDocuments(filter) {
      const ids = new Set(filter.originalId.$in.map(String));
      return [...stored.values()].filter((entry) => (
        entry.migration === filter.migration
        && entry.sourceCollection === filter.sourceCollection
        && ids.has(String(entry.originalId))
      )).length;
    }
  };
  const db = {
    collection(name) {
      assert.equal(name, 'data_integrity_cleanup_archive');
      return archiveCollection;
    }
  };
  const document = { _id: objectId(), adUnit: objectId(), clicks: 1 };

  await archiveDocuments({ db, sourceCollection: 'clicks', documents: [document] });
  await archiveDocuments({ db, sourceCollection: 'clicks', documents: [document] });

  assert.equal(stored.size, 1);
  const archived = [...stored.values()][0];
  assert.equal(archived.migration, migrationName);
  assert.equal(archived.sourceCollection, 'clicks');
  assert.equal(archived.entityType, 'AdUnitHistory');
  assert.equal(archived.originalId, document._id);
  assert.deepEqual(archived.document, document);
  assert.ok(archived.archivedAt instanceof Date);
});

test('rollback restores every archived document to its sourceCollection', async () => {
  const archivedDocuments = ['adunits', ...HISTORY_COLLECTIONS].map((sourceCollection) => {
    const originalId = objectId();
    return buildArchiveRecord({
      sourceCollection,
      document: { _id: originalId, marker: sourceCollection }
    });
  }).map((entry) => ({ ...entry, _id: objectId() }));
  const restored = [];
  const db = {
    databaseName: 'destinasian_adserver',
    collection(name) {
      if (name === 'data_integrity_cleanup_archive') {
        return {
          find: () => ({ toArray: async () => archivedDocuments }),
          updateOne: async () => ({ acknowledged: true })
        };
      }
      if (name === '_migrations') {
        return { deleteOne: async () => ({ deletedCount: 1 }) };
      }
      return {
        replaceOne: async (filter, document, options) => {
          restored.push({ name, filter, document, options });
          return { upsertedCount: 1 };
        }
      };
    }
  };

  const result = await runDownAgainstDatabase(db, {
    expectedDatabase: 'destinasian_adserver'
  });

  assert.equal(result.restoredDocuments, archivedDocuments.length);
  assert.deepEqual(restored.map((entry) => entry.name), ['adunits', ...HISTORY_COLLECTIONS]);
  restored.forEach((entry) => {
    assert.equal(entry.filter._id, entry.document._id);
    assert.deepEqual(entry.options, { upsert: true });
  });
  archivedDocuments.forEach((entry) => {
    assert.equal(getRestoreCollection(entry), entry.sourceCollection);
  });
});

test('runUpAgainstDatabase archives and removes the complete exact orphan graph', async () => {
  const fixture = createFullCleanupSeed();
  const db = createInMemoryDatabase(fixture.seed);

  const result = await runUpAgainstDatabase(db, {
    expectedDatabase: 'destinasian_adserver',
    logger: () => {}
  });

  const expectedHistoryCounts = {
    impressions: 2,
    clicks: 1,
    ad_impression_events: 1,
    ad_click_events: 1,
    ad_daily_stats: 2
  };
  assert.equal(result.removal.removedAdUnits, fixture.orphanAdUnits.length);
  assert.equal(result.removal.removedHistoryDocuments, 7);
  assert.deepEqual(result.removal.removedHistoryByCollection, expectedHistoryCounts);

  const archived = db.collections.data_integrity_cleanup_archive;
  assert.equal(archived.length, 9);
  const expectedArchiveCounts = { adunits: 2, ...expectedHistoryCounts };
  for (const [sourceCollection, expectedCount] of Object.entries(expectedArchiveCounts)) {
    const sourceArchive = archived.filter((entry) => entry.sourceCollection === sourceCollection);
    assert.equal(sourceArchive.length, expectedCount);
    sourceArchive.forEach((entry) => {
      assert.equal(entry.migration, migrationName);
      assert.ok(entry.archivedAt instanceof Date);
    });
  }

  const archivedAdUnitIds = archived
    .filter((entry) => entry.sourceCollection === 'adunits')
    .map((entry) => String(entry.originalId));
  assert.deepEqual(
    new Set(archivedAdUnitIds),
    new Set(fixture.orphanAdUnits.map((document) => String(document._id)))
  );
  for (const sourceCollection of HISTORY_COLLECTIONS) {
    const archivedHistoryIds = archived
      .filter((entry) => entry.sourceCollection === sourceCollection)
      .map((entry) => String(entry.originalId));
    assert.deepEqual(
      new Set(archivedHistoryIds),
      new Set(fixture.orphanHistoryByCollection[sourceCollection]
        .map((document) => String(document._id)))
    );
  }

  assert.deepEqual(db.collections.adunits.map((entry) => entry._id), [fixture.validAdUnit._id]);
  assert.deepEqual(db.collections.campaigns, [fixture.campaign]);
  assert.deepEqual(db.collections.inventories, [fixture.inventory]);
  for (const sourceCollection of HISTORY_COLLECTIONS) {
    assert.deepEqual(
      db.collections[sourceCollection].map((entry) => entry._id),
      [fixture.validHistoryByCollection[sourceCollection]._id]
    );
  }

  const postPlan = await buildCleanupPlan(db);
  const ghostHistory = await countHistoryDocuments(
    db,
    fixture.orphanAdUnits.map((document) => document._id)
  );
  assert.equal(postPlan.validRelations, 1);
  assert.equal(postPlan.orphanAdUnits.length, 0);
  assert.equal(postPlan.totalCampaigns, 1);
  assert.equal(postPlan.totalInventories, 1);
  assert.equal(ghostHistory.total, 0);

  const migration = db.collections._migrations.find((entry) => entry.name === migrationName);
  assert.ok(migration);
  assert.equal(migration.databaseName, 'destinasian_adserver');
  assert.equal(migration.removedAdUnits, 2);
  assert.equal(migration.removedHistoryDocuments, 7);
  assert.deepEqual(migration.removedHistoryByCollection, expectedHistoryCounts);
  assert.equal(migration.removedInventories, 0);
  assert.equal(migration.retainedForManualReview, 0);

  const adUnitDelete = db.deleteCalls.find((entry) => entry.collection === 'adunits');
  assert.deepEqual(Object.keys(adUnitDelete.filter), ['_id']);
  assert.deepEqual(
    new Set(adUnitDelete.filter._id.$in.map(String)),
    new Set(fixture.orphanAdUnits.map((document) => String(document._id)))
  );
  for (const sourceCollection of HISTORY_COLLECTIONS) {
    const historyDelete = db.deleteCalls.find((entry) => entry.collection === sourceCollection);
    assert.deepEqual(Object.keys(historyDelete.filter).sort(), ['_id', 'adUnit']);
    assert.deepEqual(
      new Set(historyDelete.filter._id.$in.map(String)),
      new Set(fixture.orphanHistoryByCollection[sourceCollection]
        .map((document) => String(document._id)))
    );
    assert.deepEqual(
      new Set(historyDelete.filter.adUnit.$in.map(String)),
      new Set(fixture.orphanAdUnits.map((document) => String(document._id)))
    );
  }
  assert.equal(db.deleteCalls.some((entry) => entry.collection === 'campaigns'), false);
  assert.equal(db.deleteCalls.some((entry) => entry.collection === 'inventories'), false);
});

test('runUpAgainstDatabase fails closed when the orphan candidate set changes', async () => {
  const fixture = createFullCleanupSeed();
  const db = createInMemoryDatabase(fixture.seed, {
    beforeFind({ callNumber, collections, name }) {
      if (name === 'adunits' && callNumber === 2) {
        collections.adunits[1].campaign = fixture.campaign._id;
      }
    }
  });

  await assert.rejects(
    runUpAgainstDatabase(db, {
      expectedDatabase: 'destinasian_adserver',
      logger: () => {}
    }),
    /exact orphan candidate set changed|orphan count changed/
  );
  assert.equal(db.deleteCalls.length, 0);
  assert.equal(db.collections.data_integrity_cleanup_archive.length, 0);
  assert.equal(db.collections._migrations.length, 0);
});

test('runUpAgainstDatabase fails closed when orphan history changes before archive', async () => {
  const fixture = createFullCleanupSeed();
  const db = createInMemoryDatabase(fixture.seed, {
    beforeFind({ callNumber, collections, name }) {
      if (name === 'impressions' && callNumber === 1) {
        collections.impressions.push({
          _id: objectId(),
          adUnit: fixture.orphanAdUnits[0]._id
        });
      }
    }
  });

  await assert.rejects(
    runUpAgainstDatabase(db, {
      expectedDatabase: 'destinasian_adserver',
      logger: () => {}
    }),
    /impressions changed from 2 to 3 documents before archive/
  );
  assert.equal(db.deleteCalls.length, 0);
  assert.equal(db.collections.data_integrity_cleanup_archive.length, 0);
  assert.equal(db.collections._migrations.length, 0);
});

test('runUpAgainstDatabase database guards fail before archive or destructive delete', async () => {
  const cases = [
    {
      databaseName: 'destinasian_staging',
      expectedDatabase: 'destinasian_staging',
      error: /explicitly protected/
    },
    {
      databaseName: 'destinasian_adserver',
      expectedDatabase: '',
      error: /CLEANUP_EXPECTED_DATABASE/
    },
    {
      databaseName: 'ad-server',
      expectedDatabase: 'destinasian_adserver',
      error: /does not match/
    }
  ];

  for (const scenario of cases) {
    const fixture = createFullCleanupSeed();
    const db = createInMemoryDatabase(fixture.seed, {
      databaseName: scenario.databaseName
    });
    await assert.rejects(
      runUpAgainstDatabase(db, {
        expectedDatabase: scenario.expectedDatabase,
        logger: () => {}
      }),
      scenario.error
    );
    assert.equal(db.archiveIndexCalls, 0);
    assert.equal(db.deleteCalls.length, 0);
    assert.equal(db.collections.data_integrity_cleanup_archive.length, 0);
    assert.equal(db.collections._migrations.length, 0);
  }
});
