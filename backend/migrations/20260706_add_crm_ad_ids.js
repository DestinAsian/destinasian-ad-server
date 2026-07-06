const mongoose = require('mongoose');
require('dotenv').config();

const Account = require('../models/Account');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const { assignCrmAdIdToAdUnit } = require('../utils/crmAdIdAssignment');

const migrationName = '20260706_add_crm_ad_ids';
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

const findDuplicateCrmAdIds = async () => {
  return AdUnit.aggregate([
    { $match: { crmAdId: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$crmAdId', count: { $sum: 1 }, adUnitIds: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  ]);
};

const buildDryRunReport = async () => {
  const [
    accountCount,
    inventoriesMissingCode,
    campaignsMissingCode,
    adUnitsMissingCrmAdId,
    adUnitsMissingInventory,
    adUnitsMissingCampaign,
    duplicates
  ] = await Promise.all([
    Account.countDocuments({}),
    Inventory.countDocuments({ inventoryCode: { $exists: false } }),
    Campaign.countDocuments({ campaignCode: { $exists: false } }),
    AdUnit.countDocuments({
      $or: [
        { crmAdId: { $exists: false } },
        { crmAdId: null },
        { crmAdId: '' }
      ]
    }),
    AdUnit.countDocuments({
      $or: [
        { inventory: { $exists: false } },
        { inventory: null }
      ]
    }),
    AdUnit.countDocuments({
      $or: [
        { campaign: { $exists: false } },
        { campaign: null }
      ]
    }),
    findDuplicateCrmAdIds()
  ]);

  return {
    accountCount,
    inventoriesMissingCode,
    campaignsMissingCode,
    adUnitsMissingCrmAdId,
    adUnitsMissingInventory,
    adUnitsMissingCampaign,
    duplicateCrmAdIds: duplicates
  };
};

const dryRun = async () => {
  await mongoose.connect(mongoUri);
  const report = await buildDryRunReport();
  await mongoose.disconnect();

  console.log(`[${migrationName}] dry-run report`);
  console.log(JSON.stringify(report, null, 2));
};

const up = async () => {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  await ensureMigrationsCollection(db);

  const beforeReport = await buildDryRunReport();
  if (beforeReport.duplicateCrmAdIds.length > 0) {
    console.log(JSON.stringify(beforeReport, null, 2));
    throw new Error('Duplicate CRM AD IDs already exist. Resolve conflicts before running this migration.');
  }

  const adUnits = await AdUnit.find({})
    .populate('campaign')
    .populate('inventory');

  let updated = 0;
  const skipped = [];

  for (const adUnit of adUnits) {
    if (!adUnit.inventory || !adUnit.campaign) {
      skipped.push({
        adUnitId: adUnit._id,
        name: adUnit.name,
        reason: !adUnit.inventory ? 'missing primary inventory' : 'missing campaign'
      });
      continue;
    }

    await assignCrmAdIdToAdUnit(adUnit, {
      campaignDoc: adUnit.campaign,
      inventoryDoc: adUnit.inventory
    });
    await adUnit.save();
    updated += 1;
  }

  await markApplied(db);
  await mongoose.disconnect();

  console.log(`[${migrationName}] adUnits updated=${updated}, skipped=${skipped.length}`);
  if (skipped.length > 0) {
    console.log(JSON.stringify({ skipped }, null, 2));
  }
};

const direction = process.argv[2] || 'dry-run';

if (direction === 'dry-run') {
  dryRun().catch(async (error) => {
    console.error(`Failed dry run ${migrationName}:`, error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
} else if (direction === 'up') {
  up().catch(async (error) => {
    console.error(`Failed migration ${migrationName}:`, error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
} else {
  console.error(`Usage: node migrations/20260706_add_crm_ad_ids.js [dry-run|up]`);
  process.exit(1);
}
