const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const AdUnit = require('../models/AdUnit');
const Inventory = require('../models/Inventory');
const { calculateCampaignStats } = require('../jobs/updateCampaignStats');

const normalizeString = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const toObjectId = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value !== null) {
    if (value._id) return toObjectId(value._id);
    if (value.id) return toObjectId(value.id);
  }
  const normalized = String(value).trim();
  return mongoose.Types.ObjectId.isValid(normalized) ? new mongoose.Types.ObjectId(normalized) : null;
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

const resolveInventoryFilterIds = async ({ accountId, query = {} }) => {
  const inventoryTokens = [];
  const pushToken = (value) => {
    const normalized = normalizeString(value);
    if (normalized) inventoryTokens.push(normalized);
  };

  pushToken(query.inventory);
  pushToken(query.inventoryId);
  pushToken(query.inventoryGroup);
  pushToken(query.groupName);
  pushToken(query.inventoryGroupId);
  pushToken(query.inventory_group_id);

  if (inventoryTokens.length === 0) {
    return null;
  }

  const orConditions = [];
  inventoryTokens.forEach((token) => {
    const objectId = toObjectId(token);
    if (objectId) {
      orConditions.push({ _id: objectId });
    }
    orConditions.push({ key: token.toLowerCase() });
    orConditions.push({ name: token });
    orConditions.push({ groupName: token });
  });

  const inventories = await Inventory.find({
    account: accountId,
    $or: orConditions
  }).select('_id');

  return inventories.map((inventory) => inventory._id);
};

const normalizeAdUnitInventoryIds = (adUnit) => {
  const ids = [];
  if (Array.isArray(adUnit.inventories)) {
    adUnit.inventories.forEach((value) => {
      const objectId = toObjectId(value);
      if (objectId) ids.push(objectId.toString());
    });
  }

  if (ids.length === 0 && adUnit.inventory) {
    const objectId = toObjectId(adUnit.inventory);
    if (objectId) ids.push(objectId.toString());
  }

  return [...new Set(ids)];
};

const validateCampaignCreateDates = (payload = {}) => {
  const startDate = parseDateInput(payload.startDate);
  const endDate = parseDateInput(payload.endDate);

  if (!startDate.provided || !startDate.value) {
    return { valid: false, statusCode: 400, error: 'Start date is required' };
  }
  if (!endDate.provided || !endDate.value) {
    return { valid: false, statusCode: 400, error: 'End date is required' };
  }
  if (endDate.value <= startDate.value) {
    return { valid: false, statusCode: 400, error: 'End date must be after start date' };
  }

  return { valid: true, startDate: startDate.value, endDate: endDate.value };
};

const validateCampaignUpdateDates = ({ payload = {}, campaign }) => {
  const startDate = parseDateInput(payload.startDate);
  const endDate = parseDateInput(payload.endDate);

  if (startDate.error) {
    return { valid: false, statusCode: 400, error: 'Invalid start date' };
  }
  if (endDate.error) {
    return { valid: false, statusCode: 400, error: 'Invalid end date' };
  }

  if (campaign.status === 'active' && startDate.provided && startDate.value) {
    const isChanged = new Date(campaign.startDate).getTime() !== startDate.value.getTime();
    if (isChanged) {
      return {
        valid: false,
        statusCode: 400,
        error: 'Active campaigns cannot change start date. Pause the campaign first.'
      };
    }
  }

  const effectiveStart = startDate.provided ? startDate.value : campaign.startDate;
  const effectiveEnd = endDate.provided ? endDate.value : campaign.endDate;

  if (!effectiveStart || !effectiveEnd) {
    return { valid: false, statusCode: 400, error: 'Start date and end date are required' };
  }

  if (new Date(effectiveEnd).getTime() <= new Date(effectiveStart).getTime()) {
    return { valid: false, statusCode: 400, error: 'End date must be after start date' };
  }

  return { valid: true, startDate: effectiveStart, endDate: effectiveEnd };
};

const applyAdUnitInventoryMappings = async ({ accountId, campaignId, mappings }) => {
  if (!Array.isArray(mappings)) {
    return;
  }

  const adUnits = await AdUnit.find({
    account: accountId,
    campaign: campaignId
  }).select('_id name');

  const adUnitById = new Map(adUnits.map((adUnit) => [adUnit._id.toString(), adUnit]));
  const requestedAdUnitIds = mappings.map((mapping) => String(mapping.adUnitId || '').trim()).filter(Boolean);

  const invalidAdUnits = requestedAdUnitIds.filter((adUnitId) => !adUnitById.has(adUnitId));
  if (invalidAdUnits.length > 0) {
    const error = new Error(`Ad unit not found in campaign: ${invalidAdUnits.join(', ')}`);
    error.statusCode = 404;
    throw error;
  }

  for (const mapping of mappings) {
    const adUnitId = String(mapping.adUnitId || '').trim();
    if (!adUnitId) continue;

    const rawInventoryIds = Array.isArray(mapping.inventoryIds)
      ? mapping.inventoryIds
      : (mapping.inventories || []);

    const normalizedInventoryObjectIds = rawInventoryIds
      .map((inventoryId) => toObjectId(inventoryId))
      .filter(Boolean);

    if (normalizedInventoryObjectIds.length === 0) {
      await AdUnit.findByIdAndUpdate(adUnitId, {
        $set: { inventories: [] },
        $unset: { inventory: '' }
      });
      continue;
    }

    const inventories = await Inventory.find({
      account: accountId,
      _id: { $in: normalizedInventoryObjectIds }
    }).select('_id');

    if (inventories.length !== normalizedInventoryObjectIds.length) {
      const error = new Error(`One or more inventories are invalid for ad unit ${adUnitId}`);
      error.statusCode = 400;
      throw error;
    }

    const deduped = [...new Set(inventories.map((inventory) => inventory._id.toString()))].map((id) => new mongoose.Types.ObjectId(id));

    await AdUnit.findByIdAndUpdate(adUnitId, {
      inventories: deduped,
      inventory: deduped[0]
    });
  }
};

const requireAdUnitInventoryAssignmentsForActiveCampaign = async ({ campaignId }) => {
  const adUnits = await AdUnit.find({ campaign: campaignId }).select('_id inventory inventories');
  const unassigned = adUnits.filter((adUnit) => normalizeAdUnitInventoryIds(adUnit).length === 0);
  if (unassigned.length > 0) {
    const error = new Error('Active campaigns cannot have ad units without inventory assignments');
    error.statusCode = 400;
    throw error;
  }
};

exports.createCampaign = async (req, res) => {
  try {
    const { name, description } = req.body;
    const dateValidation = validateCampaignCreateDates(req.body);
    if (!dateValidation.valid) {
      return res.status(dateValidation.statusCode).json({ error: dateValidation.error });
    }

    const campaign = new Campaign({
      user: req.user.id,
      account: req.user.accountId,
      name,
      description,
      startDate: dateValidation.startDate,
      endDate: dateValidation.endDate
    });

    await campaign.save();
    res.status(201).json(campaign);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Campaign name already exists' });
    }
    res.status(error.statusCode || 400).json({ error: error.message });
  }
};

exports.getAllCampaigns = async (req, res) => {
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

      const groupedAdUnits = await AdUnit.find({
        account: req.user.accountId,
        $or: [
          { inventory: { $in: inventoryFilterIds } },
          { inventories: { $in: inventoryFilterIds } }
        ]
      }).select('campaign');

      const campaignIds = [...new Set(groupedAdUnits.map((adUnit) => adUnit.campaign?.toString()).filter(Boolean))];
      if (campaignIds.length === 0) {
        return res.json([]);
      }

      filter._id = { $in: campaignIds };
    }

    const campaigns = await Campaign.find(filter).populate({
      path: 'adUnits',
      populate: [{ path: 'inventory' }, { path: 'inventories' }]
    });

    const enrichedCampaigns = await Promise.all(
      campaigns.map(async (campaign) => {
        const stats = await calculateCampaignStats(campaign._id);
        const campaignObj = campaign.toObject();
        return {
          ...campaignObj,
          totalImpressions: stats.totalImpressions,
          totalClicks: stats.totalClicks,
          ctr: stats.ctr
        };
      })
    );

    res.json(enrichedCampaigns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).populate({
      path: 'adUnits',
      populate: [{ path: 'inventory' }, { path: 'inventories' }]
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this campaign' });
    }

    const stats = await calculateCampaignStats(campaign._id);
    const campaignObj = campaign.toObject();

    res.json({
      ...campaignObj,
      totalImpressions: stats.totalImpressions,
      totalClicks: stats.totalClicks,
      ctr: stats.ctr
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to update this campaign' });
    }

    const dateValidation = validateCampaignUpdateDates({ payload: req.body, campaign });
    if (!dateValidation.valid) {
      return res.status(dateValidation.statusCode).json({ error: dateValidation.error });
    }

    const updatePayload = { ...req.body };
    updatePayload.startDate = dateValidation.startDate;
    updatePayload.endDate = dateValidation.endDate;

    delete updatePayload.adUnitInventoryMappings;

    const updatedCampaign = await Campaign.findByIdAndUpdate(req.params.id, updatePayload, { new: true }).populate({
      path: 'adUnits',
      populate: [{ path: 'inventory' }, { path: 'inventories' }]
    });

    if (Array.isArray(req.body.adUnitInventoryMappings)) {
      await applyAdUnitInventoryMappings({
        accountId: req.user.accountId,
        campaignId: updatedCampaign._id,
        mappings: req.body.adUnitInventoryMappings
      });
    }

    const effectiveStatus = updatePayload.status || campaign.status;
    if (effectiveStatus === 'active') {
      await requireAdUnitInventoryAssignmentsForActiveCampaign({ campaignId: updatedCampaign._id });
    }

    const refreshedCampaign = await Campaign.findById(updatedCampaign._id).populate({
      path: 'adUnits',
      populate: [{ path: 'inventory' }, { path: 'inventories' }]
    });

    res.json(refreshedCampaign);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Campaign name already exists' });
    }
    res.status(error.statusCode || 400).json({ error: error.message });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to delete this campaign' });
    }

    await Campaign.findByIdAndDelete(req.params.id);
    res.json({ message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCampaignStats = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this campaign' });
    }

    const stats = await calculateCampaignStats(req.params.id);

    res.json({
      campaignId: campaign._id,
      campaignName: campaign.name,
      impressions: stats.totalImpressions,
      clicks: stats.totalClicks,
      ctr: `${stats.ctr}%`,
      lastUpdated: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCampaignAdUnitInventories = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this campaign' });
    }

    const adUnits = await AdUnit.find({
      account: req.user.accountId,
      campaign: campaign._id
    }).populate('inventories').populate('inventory');

    const mappings = adUnits.map((adUnit) => ({
      adUnitId: adUnit._id,
      adUnitName: adUnit.name,
      inventoryIds: normalizeAdUnitInventoryIds(adUnit),
      inventories: Array.isArray(adUnit.inventories) ? adUnit.inventories : []
    }));

    res.json({ mappings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateCampaignAdUnitInventories = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    if (campaign.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to update this campaign' });
    }

    const mappings = Array.isArray(req.body.mappings) ? req.body.mappings : [];
    await applyAdUnitInventoryMappings({
      accountId: req.user.accountId,
      campaignId: campaign._id,
      mappings
    });

    if (campaign.status === 'active') {
      await requireAdUnitInventoryAssignmentsForActiveCampaign({ campaignId: campaign._id });
    }

    const adUnits = await AdUnit.find({
      account: req.user.accountId,
      campaign: campaign._id
    }).populate('inventories').populate('inventory');

    res.json({
      message: 'Ad unit inventory mappings updated',
      mappings: adUnits.map((adUnit) => ({
        adUnitId: adUnit._id,
        adUnitName: adUnit.name,
        inventoryIds: normalizeAdUnitInventoryIds(adUnit)
      }))
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
};
