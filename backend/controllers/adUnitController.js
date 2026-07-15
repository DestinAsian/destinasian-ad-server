const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');
const Inventory = require('../models/Inventory');
const Impression = require('../models/Impression');
const Click = require('../models/Click');
const { assignCrmAdIdToAdUnit } = require('../utils/crmAdIdAssignment');

const toObjectIdString = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'object' && value !== null) {
    if (value._id) return toObjectIdString(value._id);
    if (value.id) return toObjectIdString(value.id);
  }

  const stringValue = String(value).trim();
  return mongoose.Types.ObjectId.isValid(stringValue) ? stringValue : null;
};

const normalizeString = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const parseDateInput = (value) => {
  if (value === undefined) {
    return { provided: false, value: null, error: null };
  }

  if (value === null || value === '') {
    return { provided: true, value: null, error: 'Date is required' };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { provided: true, value: null, error: 'Invalid date format' };
  }

  return { provided: true, value: parsed, error: null };
};

const normalizeInventoryInputList = (payload = {}) => {
  const ids = [];
  const aliases = [];

  const pushValue = (value) => {
    if (value === null || value === undefined || value === '') return;

    const objectId = toObjectIdString(value);
    if (objectId) {
      ids.push(objectId);
      return;
    }

    const normalized = normalizeString(value);
    if (normalized) {
      aliases.push(normalized);
    }
  };

  const pushList = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => pushValue(item));
  };

  pushList(payload.inventoryIds);
  pushList(payload.inventories);
  pushValue(payload.inventory);
  pushValue(payload.inventoryId);
  pushValue(payload.inventoryGroupId);
  pushValue(payload.inventory_group_id);
  pushValue(payload.inventoryGroup);

  return {
    idList: [...new Set(ids)],
    aliasList: [...new Set(aliases)]
  };
};

const resolveInventoryDocs = async ({ accountId, payload = {} }) => {
  const { idList, aliasList } = normalizeInventoryInputList(payload);
  if (idList.length === 0 && aliasList.length === 0) {
    return [];
  }

  const aliasKeyList = aliasList.map((value) => value.toLowerCase());
  const match = {
    account: accountId
  };

  const orConditions = [];
  if (idList.length > 0) {
    orConditions.push({
      _id: { $in: idList.map((id) => new mongoose.Types.ObjectId(id)) }
    });
  }
  if (aliasList.length > 0) {
    orConditions.push({ key: { $in: aliasKeyList } });
    orConditions.push({ name: { $in: aliasList } });
    orConditions.push({ groupName: { $in: aliasList } });
  }

  if (orConditions.length > 0) {
    match.$or = orConditions;
  }

  const inventories = await Inventory.find(match);
  const inventoryById = new Map(inventories.map((inventory) => [inventory._id.toString(), inventory]));
  const inventoryByKey = new Map(inventories.map((inventory) => [inventory.key, inventory]));
  const inventoryByName = new Map(inventories.map((inventory) => [inventory.name, inventory]));
  const inventoryByGroupName = new Map(
    inventories
      .filter((inventory) => normalizeString(inventory.groupName))
      .map((inventory) => [inventory.groupName, inventory])
  );

  const resolved = [];
  const seen = new Set();
  const unresolved = [];

  idList.forEach((id) => {
    const inventory = inventoryById.get(id);
    if (!inventory) {
      unresolved.push(id);
      return;
    }
    if (!seen.has(inventory._id.toString())) {
      seen.add(inventory._id.toString());
      resolved.push(inventory);
    }
  });

  aliasList.forEach((alias) => {
    const inventory = inventoryByKey.get(alias.toLowerCase()) || inventoryByName.get(alias) || inventoryByGroupName.get(alias);
    if (!inventory) {
      unresolved.push(alias);
      return;
    }
    if (!seen.has(inventory._id.toString())) {
      seen.add(inventory._id.toString());
      resolved.push(inventory);
    }
  });

  if (unresolved.length > 0) {
    const error = new Error(`Inventory not found: ${unresolved.join(', ')}`);
    error.statusCode = 404;
    throw error;
  }

  return resolved;
};

const resolveInventoryFilterIds = async ({ accountId, query = {} }) => {
  const payload = {
    inventoryIds: query.inventoryIds,
    inventories: query.inventories,
    inventory: query.inventory || query.inventoryId,
    inventoryGroup: query.inventoryGroup || query.groupName,
    inventoryGroupId: query.inventoryGroupId,
    inventory_group_id: query.inventory_group_id
  };

  const { idList, aliasList } = normalizeInventoryInputList(payload);
  if (idList.length === 0 && aliasList.length === 0) {
    return null;
  }

  const inventories = await resolveInventoryDocs({ accountId, payload });
  return inventories.map((inventory) => inventory._id);
};

const normalizeAdUnitInventories = (adUnit) => {
  const inventoryIds = [];
  if (Array.isArray(adUnit.inventories)) {
    adUnit.inventories.forEach((inventoryId) => {
      const normalized = toObjectIdString(inventoryId);
      if (normalized) {
        inventoryIds.push(normalized);
      }
    });
  }

  if (inventoryIds.length === 0 && adUnit.inventory) {
    const normalizedLegacy = toObjectIdString(adUnit.inventory);
    if (normalizedLegacy) {
      inventoryIds.push(normalizedLegacy);
    }
  }

  return [...new Set(inventoryIds)];
};

/**
 * Calculate ad unit stats from tracking data
 */
const calculateAdUnitStats = async (adUnitId) => {
  try {
    const impressionCount = await Impression.countDocuments({ adUnit: adUnitId });
    const clickCount = await Click.countDocuments({ adUnit: adUnitId });
    return {
      impressions: impressionCount,
      clicks: clickCount,
      ctr: impressionCount > 0 ? ((clickCount / impressionCount) * 100).toFixed(2) : 0
    };
  } catch (error) {
    console.error(`Error calculating stats for ad unit ${adUnitId}:`, error);
    return { impressions: 0, clicks: 0, ctr: 0 };
  }
};

const validateDateWindowForCreate = (payload = {}) => {
  const startDate = parseDateInput(payload.startDate);
  const endDate = parseDateInput(payload.endDate);
  const now = new Date();
  const oldStartCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  if (!endDate.provided || !endDate.value) {
    return { valid: false, statusCode: 400, error: 'End date is required' };
  }

  if (startDate.provided && startDate.error) {
    return { valid: false, statusCode: 400, error: 'Invalid start date' };
  }

  if (startDate.value && startDate.value < oldStartCutoff) {
    return { valid: false, statusCode: 400, error: 'Start date cannot be more than 1 day in the past for new ad units' };
  }

  const normalizedStartDate = (!startDate.value || startDate.value < now)
    ? now
    : startDate.value;

  if (endDate.value <= normalizedStartDate) {
    return { valid: false, statusCode: 400, error: 'End date must be after start date' };
  }

  return { valid: true, startDate: normalizedStartDate, endDate: endDate.value };
};

const validateDateWindowForUpdate = ({ payload = {}, adUnit }) => {
  const nextStart = parseDateInput(payload.startDate);
  const nextEnd = parseDateInput(payload.endDate);

  if (nextStart.error) {
    return { valid: false, statusCode: 400, error: 'Invalid start date' };
  }

  if (nextEnd.error) {
    return { valid: false, statusCode: 400, error: 'Invalid end date' };
  }

  if (adUnit.status === 'active' && nextStart.provided && nextStart.value) {
    const isChanged = new Date(adUnit.startDate).getTime() !== nextStart.value.getTime();
    if (isChanged) {
      return {
        valid: false,
        statusCode: 400,
        error: 'Active ad units cannot change start date. Pause the ad unit first.'
      };
    }
  }

  const effectiveStart = nextStart.provided ? nextStart.value : adUnit.startDate;
  const effectiveEnd = nextEnd.provided ? nextEnd.value : adUnit.endDate;

  if (!effectiveStart || !effectiveEnd) {
    return { valid: false, statusCode: 400, error: 'Start date and end date are required' };
  }

  if (new Date(effectiveEnd).getTime() <= new Date(effectiveStart).getTime()) {
    return { valid: false, statusCode: 400, error: 'End date must be after start date' };
  }

  return { valid: true, startDate: effectiveStart, endDate: effectiveEnd };
};

exports.createAdUnit = async (req, res) => {
  try {
    const { name, description, campaign, imageUrl, htmlCreative, iframeUrl, clickUrl, width } = req.body;
    const dateValidation = validateDateWindowForCreate(req.body);
    if (!dateValidation.valid) {
      return res.status(dateValidation.statusCode).json({ error: dateValidation.error });
    }

    const campaignDoc = await Campaign.findById(campaign);
    if (!campaignDoc) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaignDoc.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to use this campaign' });
    }

    const inventoryDocs = await resolveInventoryDocs({
      accountId: req.user.accountId,
      payload: req.body
    });

    if (inventoryDocs.length === 0) {
      return res.status(400).json({ error: 'At least one inventory is required' });
    }

    const adUnit = new AdUnit({
      user: req.user.id,
      account: req.user.accountId,
      name,
      description,
      campaign,
      inventory: inventoryDocs[0]._id,
      inventories: inventoryDocs.map((inventoryDoc) => inventoryDoc._id),
      startDate: dateValidation.startDate,
      endDate: dateValidation.endDate,
      adCode: `ad-${uuidv4()}`,
      imageUrl,
      htmlCreative,
      iframeUrl,
      clickUrl,
      width: width || '100%'
    });

    await assignCrmAdIdToAdUnit(adUnit, {
      campaignDoc,
      inventoryDoc: inventoryDocs[0]
    });
    await adUnit.save();

    await Campaign.findByIdAndUpdate(campaignDoc._id, {
      $addToSet: { adUnits: adUnit._id }
    });

    const populated = await AdUnit.findById(adUnit._id)
      .populate('campaign')
      .populate('inventory')
      .populate('inventories');

    res.status(201).json(populated);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
};

exports.getAllAdUnits = async (req, res) => {
  try {
    const filter = { account: req.user.accountId };
    const inventoryFilterIds = await resolveInventoryFilterIds({
      accountId: req.user.accountId,
      query: req.query
    });

    if (inventoryFilterIds) {
      if (inventoryFilterIds.length === 0) {
        return res.json([]);
      }

      filter.$or = [
        { inventory: { $in: inventoryFilterIds } },
        { inventories: { $in: inventoryFilterIds } }
      ];
    }

    const adUnits = await AdUnit.find(filter)
      .populate('campaign')
      .populate('inventory')
      .populate('inventories');

    const enrichedAdUnits = await Promise.all(
      adUnits.map(async (adUnit) => {
        const stats = await calculateAdUnitStats(adUnit._id);
        const adUnitObj = adUnit.toObject();
        return {
          ...adUnitObj,
          impressions: stats.impressions,
          clicks: stats.clicks,
          ctr: stats.ctr
        };
      })
    );

    res.json(enrichedAdUnits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAdUnit = async (req, res) => {
  try {
    const adUnit = await AdUnit.findById(req.params.id)
      .populate('campaign')
      .populate('inventory')
      .populate('inventories');
    if (!adUnit) return res.status(404).json({ error: 'Ad unit not found' });

    if (adUnit.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this ad unit' });
    }

    const stats = await calculateAdUnitStats(adUnit._id);
    const adUnitObj = adUnit.toObject();

    res.json({
      ...adUnitObj,
      impressions: stats.impressions,
      clicks: stats.clicks,
      ctr: stats.ctr
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateAdUnit = async (req, res) => {
  try {
    const adUnit = await AdUnit.findById(req.params.id);
    if (!adUnit) return res.status(404).json({ error: 'Ad unit not found' });

    if (adUnit.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to update this ad unit' });
    }

    const dateValidation = validateDateWindowForUpdate({ payload: req.body, adUnit });
    if (!dateValidation.valid) {
      return res.status(dateValidation.statusCode).json({ error: dateValidation.error });
    }

    const updatePayload = { ...req.body };
    const previousInventoryId = adUnit.inventory;
    const previousCampaignId = adUnit.campaign;
    const hasInventoryInput = [
      req.body.inventory,
      req.body.inventoryId,
      req.body.inventoryGroup,
      req.body.inventoryGroupId,
      req.body.inventory_group_id,
      req.body.inventoryIds,
      req.body.inventories
    ].some((value) => value !== undefined);

    if (hasInventoryInput) {
      const inventoryDocs = await resolveInventoryDocs({
        accountId: req.user.accountId,
        payload: req.body
      });

      if (inventoryDocs.length === 0) {
        return res.status(400).json({ error: 'At least one inventory is required' });
      }

      updatePayload.inventories = inventoryDocs.map((inventoryDoc) => inventoryDoc._id);
      updatePayload.inventory = inventoryDocs[0]._id;
    }

    let nextCampaignDoc = null;
    if (updatePayload.campaign !== undefined) {
      nextCampaignDoc = await Campaign.findById(updatePayload.campaign);
      if (!nextCampaignDoc) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      if (nextCampaignDoc.account.toString() !== req.user.accountId) {
        return res.status(403).json({ error: 'Not authorized to use this campaign' });
      }
    }

    const parentCampaignDoc = nextCampaignDoc || await Campaign.findById(adUnit.campaign);
    if (!parentCampaignDoc) {
      return res.status(404).json({ error: 'Parent campaign not found' });
    }

    if (parentCampaignDoc.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to update parent campaign' });
    }

    if (
      parentCampaignDoc.endDate &&
      new Date(dateValidation.endDate).getTime() > new Date(parentCampaignDoc.endDate).getTime()
    ) {
      parentCampaignDoc.endDate = dateValidation.endDate;
      await parentCampaignDoc.save();
    }

    updatePayload.startDate = dateValidation.startDate;
    updatePayload.endDate = dateValidation.endDate;

    delete updatePayload.crmAdId;
    delete updatePayload.sourceCode;
    delete updatePayload.inventoryCode;
    delete updatePayload.campaignCode;
    delete updatePayload.adUnitCode;
    delete updatePayload.inventoryId;
    delete updatePayload.inventoryIds;
    delete updatePayload.inventoryGroup;
    delete updatePayload.inventoryGroupId;
    delete updatePayload.inventory_group_id;

    Object.entries(updatePayload).forEach(([key, value]) => {
      if (value !== undefined) {
        adUnit[key] = value;
      }
    });

    await assignCrmAdIdToAdUnit(adUnit, {
      campaignDoc: nextCampaignDoc,
      previousCampaignId,
      previousInventoryId
    });
    await adUnit.save();

    const updated = await AdUnit.findById(adUnit._id)
      .populate('campaign')
      .populate('inventory')
      .populate('inventories');

    res.json(updated);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
};

exports.deleteAdUnit = async (req, res) => {
  try {
    const adUnit = await AdUnit.findById(req.params.id);
    if (!adUnit) return res.status(404).json({ error: 'Ad unit not found' });

    if (adUnit.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to delete this ad unit' });
    }

    await AdUnit.findByIdAndDelete(req.params.id);
    await Campaign.findByIdAndUpdate(adUnit.campaign, {
      $pull: { adUnits: adUnit._id }
    });
    res.json({ message: 'Ad unit deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAdUnitStats = async (req, res) => {
  try {
    const adUnit = await AdUnit.findById(req.params.id);
    if (!adUnit) return res.status(404).json({ error: 'Ad unit not found' });

    if (adUnit.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this ad unit' });
    }

    const stats = await calculateAdUnitStats(req.params.id);

    res.json({
      adUnitId: adUnit._id,
      crmAdId: adUnit.crmAdId,
      adUnitName: adUnit.name,
      impressions: stats.impressions,
      clicks: stats.clicks,
      ctr: `${stats.ctr}%`,
      lastUpdated: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAdUnitByCampaign = async (req, res) => {
  try {
    const filter = {
      account: req.user.accountId,
      campaign: req.params.campaignId
    };

    const inventoryFilterIds = await resolveInventoryFilterIds({
      accountId: req.user.accountId,
      query: req.query
    });

    if (inventoryFilterIds) {
      if (inventoryFilterIds.length === 0) {
        return res.json([]);
      }

      filter.$or = [
        { inventory: { $in: inventoryFilterIds } },
        { inventories: { $in: inventoryFilterIds } }
      ];
    }

    const adUnits = await AdUnit.find(filter)
      .populate('inventory')
      .populate('inventories');

    const enrichedAdUnits = await Promise.all(
      adUnits.map(async (adUnit) => {
        const stats = await calculateAdUnitStats(adUnit._id);
        const adUnitObj = adUnit.toObject();
        return {
          ...adUnitObj,
          impressions: stats.impressions,
          clicks: stats.clicks,
          ctr: stats.ctr
        };
      })
    );

    res.json(enrichedAdUnits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Public ad serving endpoint by inventory key or ad code
 * GET /api/serve?inventory=homepage-top
 * GET /api/serve?adCode=ad-xxxx
 */
exports.serveAd = async (req, res) => {
  try {
    const { inventory, adCode } = req.query;

    if (!inventory && !adCode) {
      return res.status(400).json({ error: 'inventory or adCode is required' });
    }

    let adUnit;
    const now = new Date();

    if (adCode) {
      adUnit = await AdUnit.findOne({
        adCode,
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now }
      }).populate('campaign');
    } else {
      const inventoryDoc = await Inventory.findOne({ key: String(inventory).toLowerCase(), isActive: true });
      if (!inventoryDoc) {
        return res.status(404).json({ error: 'Inventory not found' });
      }

      const activeCampaignIds = await Campaign.find({
        account: inventoryDoc.account,
        status: 'active',
        startDate: { $lte: now },
        $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }]
      }).select('_id');

      const adQuery = {
        $or: [
          { inventory: inventoryDoc._id },
          { inventories: inventoryDoc._id }
        ],
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now },
        campaign: { $in: activeCampaignIds.map((campaignDoc) => campaignDoc._id) }
      };

      const candidates = await AdUnit.find(adQuery).populate('campaign');
      if (candidates.length > 0) {
        adUnit = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    if (!adUnit) {
      return res.status(404).json({ error: 'No active ad available' });
    }

    res.json({
      adCode: adUnit.adCode,
      crmAdId: adUnit.crmAdId,
      name: adUnit.name,
      imageUrl: adUnit.imageUrl,
      htmlCreative: adUnit.htmlCreative,
      iframeUrl: adUnit.iframeUrl,
      clickUrl: adUnit.clickUrl,
      width: adUnit.width,
      aspectRatio: adUnit.aspectRatio,
      campaignId: adUnit.campaign?._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
