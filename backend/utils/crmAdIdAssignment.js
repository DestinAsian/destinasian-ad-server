const Account = require('../models/Account');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const { formatCrmAdId, inferSourceCodeFromAccount } = require('./crmAdId');
const { applySession } = require('../services/transactionService');
const mongoose = require('mongoose');

const getNextCode = async (Model, filter, fieldName, session) => {
  const query = Model.findOne({
    ...filter,
    [fieldName]: { $type: 'number' }
  })
    .sort({ [fieldName]: -1 })
    .select(fieldName);
  const latest = await applySession(query, session);

  const minimum = Number(latest?.[fieldName] || 0);
  const scope = Object.entries(filter).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${String(value)}`).join('|');
  const sequenceId = `${Model.modelName}:${fieldName}:${scope}`;
  const sequences = mongoose.connection.collection('crm_code_sequences');
  const allocate = (upsert) => sequences.findOneAndUpdate(
    { _id: sequenceId },
    [{ $set: { value: { $add: [{ $max: [{ $ifNull: ['$value', 0] }, minimum] }, 1] } } }],
    { upsert, returnDocument: 'after', ...(session ? { session } : {}) }
  );
  let result;
  try {
    result = await allocate(true);
  } catch (error) {
    // Concurrent first allocation can collide on the sequence's built-in _id
    // index. A transaction must be retried by MongoDB rather than reused.
    if (error.code !== 11000 || session) throw error;
    result = await allocate(false);
  }
  const value = Number(result?.value?.value ?? result?.value);
  const maximum = { inventoryCode: 999, campaignCode: 9999, adUnitCode: 99 }[fieldName];
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    const error = new Error(`No ${fieldName} identifiers remain in this assignment scope`);
    error.statusCode = 409;
    throw error;
  }
  return value;
};

const ensureEntityCode = async (Model, doc, field, session) => {
  if (doc[field]) return doc[field];
  const code = await getNextCode(Model, { account: doc.account }, field, session);
  const assigned = await applySession(Model.findOneAndUpdate(
    { _id: doc._id, account: doc.account, [field]: { $exists: false } },
    { $set: { [field]: code } },
    { new: true, runValidators: true, timestamps: false }
  ), session);
  const persisted = assigned || await applySession(Model.findOne({ _id: doc._id, account: doc.account }).select(field), session);
  if (!persisted?.[field]) {
    const error = new Error('The parent record changed during identifier allocation. Refresh and retry.');
    error.statusCode = 409;
    throw error;
  }
  doc[field] = persisted[field];
  return doc[field];
};

const ensureInventoryCode = async (inventoryDoc, options = {}) => {
  if (!inventoryDoc) {
    throw new Error('Primary Ad Channel is required to generate CRM AD ID');
  }

  if (inventoryDoc.inventoryCode) {
    return inventoryDoc.inventoryCode;
  }

  return ensureEntityCode(Inventory, inventoryDoc, 'inventoryCode', options.session);
};

const ensureCampaignCode = async (campaignDoc, options = {}) => {
  if (!campaignDoc) {
    throw new Error('Campaign is required to generate CRM AD ID');
  }

  if (campaignDoc.campaignCode) {
    return campaignDoc.campaignCode;
  }

  return ensureEntityCode(Campaign, campaignDoc, 'campaignCode', options.session);
};

const getPrimaryInventoryDoc = async (adUnit, providedInventoryDoc, session) => {
  if (providedInventoryDoc) return providedInventoryDoc;
  if (!adUnit.inventory) return null;
  return applySession(Inventory.findOne({
    _id: adUnit.inventory,
    account: adUnit.account
  }), session);
};

const getCampaignDoc = async (adUnit, providedCampaignDoc, session) => {
  if (providedCampaignDoc) return providedCampaignDoc;
  if (!adUnit.campaign) return null;
  return applySession(Campaign.findOne({
    _id: adUnit.campaign,
    account: adUnit.account
  }), session);
};

const getNextAdUnitCode = async ({ accountId, campaignId, inventoryId, session }) => {
  return getNextCode(
    AdUnit,
    {
      account: accountId,
      campaign: campaignId,
      inventory: inventoryId
    },
    'adUnitCode',
    session
  );
};

const findCrmAdIdConflict = async ({ crmAdId, adUnitId, session }) => {
  if (!crmAdId) return null;
  return applySession(AdUnit.findOne({
    crmAdId,
    _id: { $ne: adUnitId }
  }).select('_id crmAdId'), session);
};

const assignCrmAdIdToAdUnit = async (adUnit, options = {}) => {
  const inventoryDoc = await getPrimaryInventoryDoc(adUnit, options.inventoryDoc, options.session);
  const campaignDoc = await getCampaignDoc(adUnit, options.campaignDoc, options.session);
  const accountDoc = await applySession(
    Account.findById(adUnit.account).select('name sourceCode'),
    options.session
  );
  if (!accountDoc) {
    throw new Error('Account source is required to generate CRM AD ID');
  }

  const sourceCode = inferSourceCodeFromAccount(accountDoc);
  const inventoryCode = await ensureInventoryCode(inventoryDoc, options);
  const inventoryIds = [...new Set([...(adUnit.inventories || []), adUnit.inventory].filter(Boolean).map(String))];
  const touched = await Inventory.updateMany(
    { _id: { $in: inventoryIds }, account: adUnit.account },
    { $inc: { assignmentRevision: 1 } },
    { timestamps: false, ...(options.session ? { session: options.session } : {}) }
  );
  if (touched.matchedCount !== inventoryIds.length) {
    const error = new Error('An Ad Channel changed during assignment. Refresh and retry.');
    error.statusCode = 409;
    throw error;
  }
  const campaignCode = campaignDoc
    ? await ensureCampaignCode(campaignDoc, options)
    : options.allowStoredCampaignCode && adUnit.campaignCode
      ? adUnit.campaignCode
      : await ensureCampaignCode(campaignDoc, options);
  const campaignId = campaignDoc?._id || (options.allowStoredCampaignCode ? adUnit.campaign : null);
  const inventoryChanged = String(adUnit.inventory || '') !== String(options.previousInventoryId === undefined ? adUnit.inventory || '' : options.previousInventoryId || '');
  const campaignChanged = String(adUnit.campaign || '') !== String(options.previousCampaignId === undefined ? adUnit.campaign || '' : options.previousCampaignId || '');

  if (!adUnit.adUnitCode || inventoryChanged || campaignChanged) {
    if (!campaignId) {
      throw new Error('Campaign is required to generate CRM AD ID');
    }
    adUnit.adUnitCode = adUnit.adUnitCode || await getNextAdUnitCode({
      accountId: adUnit.account,
      campaignId,
      inventoryId: inventoryDoc._id,
      session: options.session
    });
  }

  let crmAdId = formatCrmAdId({
    sourceCode,
    inventoryCode,
    campaignCode,
    adUnitCode: adUnit.adUnitCode
  });

  const conflict = await findCrmAdIdConflict({
    crmAdId,
    adUnitId: adUnit._id,
    session: options.session
  });
  if (conflict) {
    if (!campaignId) {
      throw new Error('Campaign is required to generate CRM AD ID');
    }
    adUnit.adUnitCode = await getNextAdUnitCode({
      accountId: adUnit.account,
      campaignId,
      inventoryId: inventoryDoc._id,
      session: options.session
    });

    crmAdId = formatCrmAdId({
      sourceCode,
      inventoryCode,
      campaignCode,
      adUnitCode: adUnit.adUnitCode
    });

    const retryConflict = await findCrmAdIdConflict({
      crmAdId,
      adUnitId: adUnit._id,
      session: options.session
    });
    if (retryConflict) {
      const error = new Error('Generated CRM AD ID already exists');
      error.statusCode = 409;
      throw error;
    }
  }

  adUnit.sourceCode = sourceCode;
  adUnit.inventoryCode = inventoryCode;
  adUnit.campaignCode = campaignCode;
  adUnit.crmAdId = crmAdId;

  return adUnit;
};

module.exports = {
  assignCrmAdIdToAdUnit,
  ensureCampaignCode,
  ensureInventoryCode,
  formatCrmAdId,
  inferSourceCodeFromAccount
};
