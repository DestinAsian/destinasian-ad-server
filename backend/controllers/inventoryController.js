const Inventory = require('../models/Inventory');
const AdUnit = require('../models/AdUnit');

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

    const inventories = await Inventory.find(filter).sort({ createdAt: -1 });
    res.json(inventories);
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
