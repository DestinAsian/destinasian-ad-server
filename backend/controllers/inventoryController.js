const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const AdUnit = require('../models/AdUnit');
const Campaign = require('../models/Campaign');
const AdDailyStat = require('../models/AdDailyStat');
const { assignCrmAdIdToAdUnit, ensureInventoryCode } = require('../utils/crmAdIdAssignment');
const { applySession, runAtomicMutation } = require('../services/transactionService');
const { duplicateKeyMessage } = require('../utils/mutationPayload');
const { isAdUnitDeliverable } = require('../services/deliveryEligibilityService');
const { assertExpectedRevision, scopedRevisionFilter } = require('../utils/mutationGuards');

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

const buildAdUnitAssignmentUpdate = (adUnit) => {
  const fieldsToSet = {
    inventory: adUnit.inventory,
    inventories: adUnit.inventories
  };

  ['sourceCode', 'inventoryCode', 'campaignCode', 'adUnitCode', 'crmAdId'].forEach((field) => {
    if (adUnit[field] !== undefined) {
      fieldsToSet[field] = adUnit[field];
    }
  });

  const update = { $set: fieldsToSet };

  // A CRM Ad ID and its inventory/ad-unit codes identify an assignment to a
  // primary Ad Channel. Once every channel is removed, keeping those values
  // would leave a stale identity and make multiple unassigned Ad Units collide
  // in the compound unique index where inventory is null.
  if (!adUnit.inventory) {
    delete fieldsToSet.inventoryCode;
    delete fieldsToSet.adUnitCode;
    delete fieldsToSet.crmAdId;
    update.$unset = {
      inventoryCode: '',
      adUnitCode: '',
      crmAdId: ''
    };
  }

  return update;
};

const syncInventoryAdUnits = async ({ inventoryId, accountId, adUnitIds = [], expectedAdUnitIds, session = null }) => {
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
    ? await applySession(AdUnit.find({
        _id: { $in: selectedObjectIds },
        account: accountId
      }).select('_id account campaign inventory inventories crmAdId sourceCode inventoryCode campaignCode adUnitCode updatedAt'), session)
    : [];

  if (selectedAdUnits.length !== selectedObjectIds.length) {
    const error = new Error('One or more ad units are invalid for this account');
    error.statusCode = 400;
    throw error;
  }

  const selectedIdSet = new Set(selectedAdUnits.map((adUnit) => String(adUnit._id)));

  const linkedAdUnits = await applySession(AdUnit.find({
    account: accountId,
    $or: [
      { inventory: inventoryObjectId },
      { inventories: inventoryObjectId }
    ]
  }).select('_id account campaign inventory inventories crmAdId sourceCode inventoryCode campaignCode adUnitCode updatedAt'), session);
  if (expectedAdUnitIds !== undefined && (!Array.isArray(expectedAdUnitIds)
    || JSON.stringify([...expectedAdUnitIds].map(String).sort()) !== JSON.stringify(linkedAdUnits.map((unit) => String(unit._id)).sort()))) {
    const error = new Error('Ad Channel assignments changed since you opened this editor. Reopen it to review the latest data.');
    error.statusCode = 409;
    throw error;
  }

  const unlinkOperations = [];
  for (const adUnit of linkedAdUnits) {
    const adUnitId = String(adUnit._id);
    if (selectedIdSet.has(adUnitId)) {
      continue;
    }

    const remainingInventories = (Array.isArray(adUnit.inventories) ? adUnit.inventories : [])
      .map((entry) => String(entry))
      .filter((entry) => entry !== String(inventoryObjectId))
      .map((entry) => new mongoose.Types.ObjectId(entry));

    const previousInventoryId = adUnit.inventory;
    adUnit.inventories = remainingInventories;
    adUnit.inventory = remainingInventories[0] || null;
    const primaryInventoryChanged = String(previousInventoryId || '') !== String(adUnit.inventory || '');
    if (adUnit.inventory && primaryInventoryChanged) {
      await assignCrmAdIdToAdUnit(adUnit, {
        previousInventoryId,
        allowStoredCampaignCode: true,
        session
      });
    }
    unlinkOperations.push({
      updateOne: {
        filter: scopedRevisionFilter(adUnit, { account: accountId, campaign: adUnit.campaign }),
        update: buildAdUnitAssignmentUpdate(adUnit)
      }
    });
  }

  for (const adUnit of selectedAdUnits) {
    const existingInventoryIds = (Array.isArray(adUnit.inventories) ? adUnit.inventories : [])
      .map((entry) => String(entry));

    const previousInventoryId = adUnit.inventory;
    if (!existingInventoryIds.includes(String(inventoryObjectId))) {
      adUnit.inventories = [
        ...((Array.isArray(adUnit.inventories) ? adUnit.inventories : [])),
        inventoryObjectId
      ];
    }

    if (!adUnit.inventory) {
      adUnit.inventory = inventoryObjectId;
    }

    const primaryInventoryChanged = String(previousInventoryId || '') !== String(adUnit.inventory || '');
    if (primaryInventoryChanged || !adUnit.crmAdId) {
      await assignCrmAdIdToAdUnit(adUnit, {
        previousInventoryId,
        allowStoredCampaignCode: true,
        session
      });
    }
    unlinkOperations.push({ updateOne: {
      filter: scopedRevisionFilter(adUnit, { account: accountId, campaign: adUnit.campaign }),
      update: buildAdUnitAssignmentUpdate(adUnit),
    } });
  }
  // Prepare every identifier and validate every relationship before the first
  // assignment write. A transaction rolls the whole bulk back on any conflict.
  if (unlinkOperations.length > 0) {
    const result = await AdUnit.bulkWrite(unlinkOperations, { ordered: true, ...(session ? { session } : {}) });
    if (result.matchedCount !== unlinkOperations.length) {
      const error = new Error('Ad Unit relationships changed during Ad Channel update. Reopen the editor and retry.');
      error.statusCode = 409;
      throw error;
    }
  }
};

// Exported for focused regression tests. Inventory routes remain the only
// production caller, so this does not change the public API surface.
exports.syncInventoryAdUnits = syncInventoryAdUnits;

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

    const inventory = await runAtomicMutation(async (session) => {
      const createdInventory = new Inventory({
        user: req.user.id,
        account: req.user.accountId,
        name: normalized.name,
        key: finalKey,
        description: normalized.description || '',
        groupName: normalized.groupName,
        rotationMode: 'rotate'
      });
      await createdInventory.save(session ? { session } : undefined);
      await ensureInventoryCode(createdInventory, { session });

      if (Array.isArray(req.body.adUnitIds)) {
        await syncInventoryAdUnits({
          inventoryId: createdInventory._id,
          accountId: req.user.accountId,
          adUnitIds: req.body.adUnitIds,
          session
        });
      }
      return createdInventory;
    }, { requireTransaction: true });

    res.status(201).json(inventory);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: duplicateKeyMessage(error, 'Inventory') });
    }
    res.status(error.statusCode || 400).json({ error: error.message });
  }
};

exports.getAllInventories = async (req, res) => {
  try {
    const filter = {
      account: req.user.accountId
    };

    const runningAdsOnly = String(req.query.runningAdsOnly || '').toLowerCase() === 'true';
    const inventories = await Inventory.find(filter).sort({ createdAt: -1 });
    const includeStats = String(req.query.includeStats || '').toLowerCase() === 'true';
    let statsById = new Map();
    if (includeStats) {
      const rows = await AdDailyStat.aggregate([
        { $match: { account: new mongoose.Types.ObjectId(req.user.accountId), inventory: { $in: inventories.map((item) => item._id) } } },
        { $group: { _id: '$inventory', impressions: { $sum: '$impressions' }, clicks: { $sum: '$clicks' } } },
      ]);
      statsById = new Map(rows.map((row) => [String(row._id), row]));
    }
    const withStats = (inventory) => {
      if (!includeStats) return inventory;
      const stats = statsById.get(String(inventory._id)) || { impressions: 0, clicks: 0 };
      return { ...inventory.toObject(), deliveryStats: {
        impressions: stats.impressions, clicks: stats.clicks,
        ctr: stats.impressions > 0 ? stats.clicks / stats.impressions * 100 : 0,
      } };
    };

    if (!runningAdsOnly) {
      return res.json(inventories.map(withStats));
    }

    const activeCampaignIds = await Campaign.find({
      account: req.user.accountId,
      status: 'active', startDate: { $lte: new Date() },
      $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: new Date() } }]
    }).select('_id');

    if (activeCampaignIds.length === 0) {
      return res.json([]);
    }

    const activeAdUnits = await AdUnit.find({
      account: req.user.accountId,
      status: 'active',
      startDate: { $lte: new Date() }, endDate: { $gte: new Date() },
      campaign: { $in: activeCampaignIds.map((campaignDoc) => campaignDoc._id) }
    }).select('_id status startDate endDate campaign inventory inventories').populate('campaign', 'status startDate endDate');

    const runningInventoryIdSet = new Set();
    activeAdUnits.filter((unit) => isAdUnitDeliverable(unit)).forEach((adUnit) => {
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
      inventories.filter((inventory) => inventory.isActive && runningInventoryIdSet.has(String(inventory._id))).map(withStats)
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
    assertExpectedRevision(inventory, req.body._expectedUpdatedAt);

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

    await runAtomicMutation(async (session) => {
      if (Array.isArray(req.body.adUnitIds)) {
        await syncInventoryAdUnits({
          inventoryId: inventory._id,
          accountId: req.user.accountId,
          adUnitIds: req.body.adUnitIds,
          expectedAdUnitIds: req.body._expectedAdUnitIds,
          session
        });
        await Inventory.updateOne(
          { _id: inventory._id, account: req.user.accountId },
          { $inc: { assignmentRevision: 1 } },
          { timestamps: false, ...(session ? { session } : {}) }
        );
      }
      await inventory.validate();
      const saved = await Inventory.updateOne(
        scopedRevisionFilter(inventory, { account: req.user.accountId }),
        inventory.getChanges(),
        { runValidators: true, ...(session ? { session } : {}) }
      );
      if (saved.matchedCount !== 1) {
        const error = new Error('Ad Channel changed during update. Reopen the editor and retry.');
        error.statusCode = 409;
        throw error;
      }
    }, { requireTransaction: Array.isArray(req.body.adUnitIds) });

    res.json(await Inventory.findOne({ _id: inventory._id, account: req.user.accountId }));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: duplicateKeyMessage(error, 'Inventory') });
    }
    res.status(error.statusCode || 400).json({ error: error.message });
  }
};

exports.deleteInventory = async (req, res) => {
  try {
    const inventory = await Inventory.findById(req.params.id);
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

    if (inventory.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to delete this inventory' });
    }

    const linkedAdUnitFilter = {
      account: req.user.accountId,
      $or: [
        { inventory: inventory._id },
        { inventories: inventory._id }
      ]
    };
    const [linkedAdUnitCount, activeAdUnitCount] = await Promise.all([
      AdUnit.countDocuments(linkedAdUnitFilter),
      AdUnit.countDocuments({
        ...linkedAdUnitFilter,
        status: 'active'
      })
    ]);

    if (linkedAdUnitCount > 0) {
      const activeDetail = activeAdUnitCount > 0
        ? `${activeAdUnitCount} active Ad Unit${activeAdUnitCount === 1 ? '' : 's'} still linked.`
        : `${linkedAdUnitCount} Ad Unit${linkedAdUnitCount === 1 ? '' : 's'} still linked.`;
      return res.status(409).json({
        error: `Ad Channel cannot be deleted while it has linked Ad Units. ${activeDetail} Edit the Ad Channel, uncheck all Ad Units, and save before deleting it.`,
        linkedAdUnitCount,
        activeAdUnitCount
      });
    }

    await runAtomicMutation(async (session) => {
      const remaining = await applySession(AdUnit.countDocuments(linkedAdUnitFilter), session);
      if (remaining > 0) {
        const error = new Error('Ad Units were linked before deletion. Unlink them first. No data was deleted.');
        error.statusCode = 409;
        throw error;
      }
      const deleted = await Inventory.deleteOne(
        scopedRevisionFilter(inventory, { account: req.user.accountId }),
        session ? { session } : undefined
      );
      if (deleted.deletedCount !== 1) {
        const error = new Error('Ad Channel changed before deletion. Refresh and retry.');
        error.statusCode = 409;
        throw error;
      }
    }, { requireTransaction: true });
    res.json({ message: 'Inventory deleted' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};
