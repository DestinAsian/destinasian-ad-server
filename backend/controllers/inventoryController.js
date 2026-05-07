const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');

const slugifyKey = (value) => {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

const normalizeOptionalText = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
};

const resolveLegacyGroupAlias = (payload = {}) => {
  const legacyGroupValue = normalizeOptionalText(
    payload.inventoryGroup ||
    payload.inventoryGroupId ||
    payload.inventory_group_id
  );

  return legacyGroupValue;
};

const normalizeInventoryPayload = (payload = {}) => {
  const normalized = {
    name: normalizeOptionalText(payload.name),
    key: normalizeOptionalText(payload.key),
    description: normalizeOptionalText(payload.description),
    isActive: typeof payload.isActive === 'boolean' ? payload.isActive : undefined,
  };

  const groupAlias = resolveLegacyGroupAlias(payload);
  const incomingGroupName = normalizeOptionalText(payload.groupName || groupAlias);
  if (incomingGroupName !== undefined) {
    normalized.groupName = incomingGroupName;
  }

  return normalized;
};

const toObjectId = (value) => {
  const normalized = String(value || '').trim();
  if (!mongoose.Types.ObjectId.isValid(normalized)) {
    return null;
  }
  return new mongoose.Types.ObjectId(normalized);
};

const syncInventoryAdUnits = async ({ inventoryId, accountId, adUnitIds = [] }) => {
  const inventoryObjectId = toObjectId(inventoryId);
  if (!inventoryObjectId) {
    const error = new Error('Invalid inventory id');
    error.statusCode = 400;
    throw error;
  }

  const normalizedSelectedIds = [...new Set((Array.isArray(adUnitIds) ? adUnitIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean))];

  const selectedObjectIds = normalizedSelectedIds.map((id) => toObjectId(id));
  if (selectedObjectIds.some((id) => !id)) {
    const error = new Error('One or more ad unit ids are invalid');
    error.statusCode = 400;
    throw error;
  }

  const selectedAdUnits = selectedObjectIds.length > 0
    ? await AdUnit.find({
        _id: { $in: selectedObjectIds },
        account: accountId
      }).select('_id inventory inventories')
    : [];

  if (selectedAdUnits.length !== selectedObjectIds.length) {
    const error = new Error('One or more ad units are invalid for this account');
    error.statusCode = 400;
    throw error;
  }

  const selectedIdSet = new Set(selectedAdUnits.map((adUnit) => String(adUnit._id)));

  const linkedAdUnits = await AdUnit.find({
    account: accountId,
    $or: [
      { inventory: inventoryObjectId },
      { inventories: inventoryObjectId }
    ]
  }).select('_id inventory inventories');

  for (const adUnit of linkedAdUnits) {
    const adUnitId = String(adUnit._id);
    if (selectedIdSet.has(adUnitId)) {
      continue;
    }

    const remainingInventories = (Array.isArray(adUnit.inventories) ? adUnit.inventories : [])
      .map((entry) => String(entry))
      .filter((entry) => entry !== String(inventoryObjectId))
      .map((entry) => new mongoose.Types.ObjectId(entry));

    adUnit.inventories = remainingInventories;
    adUnit.inventory = remainingInventories[0] || null;
    await adUnit.save();
  }

  for (const adUnit of selectedAdUnits) {
    const existingInventoryIds = (Array.isArray(adUnit.inventories) ? adUnit.inventories : [])
      .map((entry) => String(entry));

    if (!existingInventoryIds.includes(String(inventoryObjectId))) {
      adUnit.inventories = [
        ...((Array.isArray(adUnit.inventories) ? adUnit.inventories : [])),
        inventoryObjectId
      ];
    }

    if (!adUnit.inventory) {
      adUnit.inventory = inventoryObjectId;
    }

    await adUnit.save();
  }
};

exports.createInventory = async (req, res) => {
  try {
    const normalized = normalizeInventoryPayload(req.body);
    if (!normalized.name) {
      return res.status(400).json({ error: 'Inventory name is required' });
    }

    const finalKey = normalized.key ? slugifyKey(normalized.key) : slugifyKey(normalized.name);
    if (!finalKey) {
      return res.status(400).json({ error: 'Inventory key is required' });
    }

    const nameExists = await Inventory.findOne({ account: req.user.accountId, name: normalized.name });
    if (nameExists) {
      return res.status(409).json({ error: 'Inventory name already exists' });
    }

    const inventory = await Inventory.create({
      user: req.user.id,
      account: req.user.accountId,
      name: normalized.name,
      key: finalKey,
      description: normalized.description || '',
      groupName: normalized.groupName,
      rotationMode: 'rotate'
    });

    if (Array.isArray(req.body.adUnitIds)) {
      await syncInventoryAdUnits({
        inventoryId: inventory._id,
        accountId: req.user.accountId,
        adUnitIds: req.body.adUnitIds
      });
    }

    res.status(201).json(inventory);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Inventory name or key already exists' });
    }
    res.status(400).json({ error: error.message });
  }
};

exports.getAllInventories = async (req, res) => {
  try {
    const filter = {
      account: req.user.accountId
    };

    const runningAdsOnly = String(req.query.runningAdsOnly || '').toLowerCase() === 'true';
    const inventories = await Inventory.find(filter).sort({ createdAt: -1 });

    if (!runningAdsOnly) {
      return res.json(inventories);
    }

    const activeCampaignIds = await Campaign.find({
      account: req.user.accountId,
      status: 'active'
    }).select('_id');

    if (activeCampaignIds.length === 0) {
      return res.json([]);
    }

    const activeAdUnits = await AdUnit.find({
      account: req.user.accountId,
      status: 'active',
      campaign: { $in: activeCampaignIds.map((campaignDoc) => campaignDoc._id) }
    }).select('_id inventory inventories');

    const runningInventoryIdSet = new Set();
    activeAdUnits.forEach((adUnit) => {
      if (adUnit.inventory) {
        runningInventoryIdSet.add(String(adUnit.inventory));
      }
      if (Array.isArray(adUnit.inventories)) {
        adUnit.inventories.forEach((entry) => {
          runningInventoryIdSet.add(String(entry));
        });
      }
    });

    return res.json(
      inventories.filter((inventory) => runningInventoryIdSet.has(String(inventory._id)))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getInventory = async (req, res) => {
  try {
    const inventory = await Inventory.findById(req.params.id);
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

    if (inventory.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this inventory' });
    }

    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateInventory = async (req, res) => {
  try {
    const normalized = normalizeInventoryPayload(req.body);
    const inventory = await Inventory.findById(req.params.id);
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

    if (inventory.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to update this inventory' });
    }

    if (req.body.name !== undefined) {
      if (!normalized.name) {
        return res.status(400).json({ error: 'Inventory name is required' });
      }

      const nameExists = await Inventory.findOne({
        account: req.user.accountId,
        name: normalized.name,
        _id: { $ne: req.params.id }
      });

      if (nameExists) {
        return res.status(409).json({ error: 'Inventory name already exists' });
      }

      inventory.name = normalized.name;
    }

    if (req.body.key !== undefined) {
      const nextKey = slugifyKey(normalized.key);
      if (!nextKey) {
        return res.status(400).json({ error: 'Inventory key is required' });
      }
      inventory.key = nextKey;
    }

    if (req.body.description !== undefined) {
      inventory.description = normalized.description || '';
    }

    if (normalized.groupName !== undefined || req.body.groupName !== undefined || resolveLegacyGroupAlias(req.body) !== undefined) {
      inventory.groupName = normalized.groupName;
    }

    if (normalized.isActive !== undefined) inventory.isActive = normalized.isActive;
    if (req.body.rotationMode !== undefined) inventory.rotationMode = 'rotate';

    await inventory.save();

    if (Array.isArray(req.body.adUnitIds)) {
      await syncInventoryAdUnits({
        inventoryId: inventory._id,
        accountId: req.user.accountId,
        adUnitIds: req.body.adUnitIds
      });
    }

    res.json(inventory);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Inventory name or key already exists' });
    }
    res.status(400).json({ error: error.message });
  }
};

exports.deleteInventory = async (req, res) => {
  try {
    const inventory = await Inventory.findById(req.params.id);
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

    if (inventory.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to delete this inventory' });
    }

    const adUnitCount = await AdUnit.countDocuments({
      $or: [
        { inventory: inventory._id },
        { inventories: inventory._id }
      ]
    });

    if (adUnitCount > 0) {
      return res.status(400).json({ error: 'Inventory is in use by ad units' });
    }

    await Inventory.findByIdAndDelete(inventory._id);
    res.json({ message: 'Inventory deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
