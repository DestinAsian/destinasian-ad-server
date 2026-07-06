const Account = require('../models/Account');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const { formatCrmAdId, inferSourceCodeFromAccount } = require('./crmAdId');

const getNextCode = async (Model, filter, fieldName) => {
  const latest = await Model.findOne({
    ...filter,
    [fieldName]: { $type: 'number' }
  })
    .sort({ [fieldName]: -1 })
    .select(fieldName);

  return Number(latest?.[fieldName] || 0) + 1;
};

const ensureInventoryCode = async (inventoryDoc) => {
  if (!inventoryDoc) {
    throw new Error('Primary Ad Channel is required to generate CRM AD ID');
  }

  if (inventoryDoc.inventoryCode) {
    return inventoryDoc.inventoryCode;
  }

  inventoryDoc.inventoryCode = await getNextCode(
    Inventory,
    { account: inventoryDoc.account },
    'inventoryCode'
  );
  await inventoryDoc.save();
  return inventoryDoc.inventoryCode;
};

const ensureCampaignCode = async (campaignDoc) => {
  if (!campaignDoc) {
    throw new Error('Campaign is required to generate CRM AD ID');
  }

  if (campaignDoc.campaignCode) {
    return campaignDoc.campaignCode;
  }

  campaignDoc.campaignCode = await getNextCode(
    Campaign,
    { account: campaignDoc.account },
    'campaignCode'
  );
  await campaignDoc.save();
  return campaignDoc.campaignCode;
};

const getPrimaryInventoryDoc = async (adUnit, providedInventoryDoc) => {
  if (providedInventoryDoc) return providedInventoryDoc;
  if (!adUnit.inventory) return null;
  return Inventory.findOne({
    _id: adUnit.inventory,
    account: adUnit.account
  });
};

const getCampaignDoc = async (adUnit, providedCampaignDoc) => {
  if (providedCampaignDoc) return providedCampaignDoc;
  if (!adUnit.campaign) return null;
  return Campaign.findOne({
    _id: adUnit.campaign,
    account: adUnit.account
  });
};

const getNextAdUnitCode = async ({ accountId, campaignId, inventoryId }) => {
  return getNextCode(
    AdUnit,
    {
      account: accountId,
      campaign: campaignId,
      inventory: inventoryId
    },
    'adUnitCode'
  );
};

const findCrmAdIdConflict = async ({ crmAdId, adUnitId }) => {
  if (!crmAdId) return null;
  return AdUnit.findOne({
    crmAdId,
    _id: { $ne: adUnitId }
  }).select('_id crmAdId');
};

const assignCrmAdIdToAdUnit = async (adUnit, options = {}) => {
  const inventoryDoc = await getPrimaryInventoryDoc(adUnit, options.inventoryDoc);
  const campaignDoc = await getCampaignDoc(adUnit, options.campaignDoc);
  const accountDoc = await Account.findById(adUnit.account).select('name sourceCode');
  if (!accountDoc) {
    throw new Error('Account source is required to generate CRM AD ID');
  }

  const sourceCode = inferSourceCodeFromAccount(accountDoc);
  const inventoryCode = await ensureInventoryCode(inventoryDoc);
  const campaignCode = await ensureCampaignCode(campaignDoc);
  const inventoryChanged = String(adUnit.inventory || '') !== String(options.previousInventoryId || adUnit.inventory || '');
  const campaignChanged = String(adUnit.campaign || '') !== String(options.previousCampaignId || adUnit.campaign || '');

  if (!adUnit.adUnitCode || inventoryChanged || campaignChanged) {
    adUnit.adUnitCode = adUnit.adUnitCode || await getNextAdUnitCode({
      accountId: adUnit.account,
      campaignId: campaignDoc._id,
      inventoryId: inventoryDoc._id
    });
  }

  let crmAdId = formatCrmAdId({
    sourceCode,
    inventoryCode,
    campaignCode,
    adUnitCode: adUnit.adUnitCode
  });

  const conflict = await findCrmAdIdConflict({ crmAdId, adUnitId: adUnit._id });
  if (conflict) {
    adUnit.adUnitCode = await getNextAdUnitCode({
      accountId: adUnit.account,
      campaignId: campaignDoc._id,
      inventoryId: inventoryDoc._id
    });

    crmAdId = formatCrmAdId({
      sourceCode,
      inventoryCode,
      campaignCode,
      adUnitCode: adUnit.adUnitCode
    });

    const retryConflict = await findCrmAdIdConflict({ crmAdId, adUnitId: adUnit._id });
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
