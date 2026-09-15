const Account = require('../models/Account');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const { formatCrmAdId, inferSourceCodeFromAccount } = require('./crmAdId');
const { applySession } = require('../services/transactionService');

const getNextCode = async (Model, filter, fieldName, session) => {
  const query = Model.findOne({
    ...filter,
    [fieldName]: { $type: 'number' }
  })
    .sort({ [fieldName]: -1 })
    .select(fieldName);
  const latest = await applySession(query, session);

  return Number(latest?.[fieldName] || 0) + 1;
};

const ensureInventoryCode = async (inventoryDoc, options = {}) => {
  if (!inventoryDoc) {
    throw new Error('Primary Ad Channel is required to generate CRM AD ID');
  }

  if (inventoryDoc.inventoryCode) {
    return inventoryDoc.inventoryCode;
  }

  inventoryDoc.inventoryCode = await getNextCode(
    Inventory,
    { account: inventoryDoc.account },
    'inventoryCode',
    options.session
  );
  await inventoryDoc.save(options.session ? { session: options.session } : undefined);
  return inventoryDoc.inventoryCode;
};

const ensureCampaignCode = async (campaignDoc, options = {}) => {
  if (!campaignDoc) {
    throw new Error('Campaign is required to generate CRM AD ID');
  }

  if (campaignDoc.campaignCode) {
    return campaignDoc.campaignCode;
  }

  campaignDoc.campaignCode = await getNextCode(
    Campaign,
    { account: campaignDoc.account },
    'campaignCode',
    options.session
  );
  await campaignDoc.save(options.session ? { session: options.session } : undefined);
  return campaignDoc.campaignCode;
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
  const campaignCode = campaignDoc
    ? await ensureCampaignCode(campaignDoc, options)
    : options.allowStoredCampaignCode && adUnit.campaignCode
      ? adUnit.campaignCode
      : await ensureCampaignCode(campaignDoc, options);
  const campaignId = campaignDoc?._id || (options.allowStoredCampaignCode ? adUnit.campaign : null);
  const inventoryChanged = String(adUnit.inventory || '') !== String(options.previousInventoryId || adUnit.inventory || '');
  const campaignChanged = String(adUnit.campaign || '') !== String(options.previousCampaignId || adUnit.campaign || '');

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
