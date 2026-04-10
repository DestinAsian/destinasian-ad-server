const Inventory = require('../models/Inventory');
const AdUnit = require('../models/AdUnit');
const InventoryGroup = require('../models/InventoryGroup');

const slugifyKey = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

const normalizeGroupName = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
};

const ensureExampleGroup = async (userId, accountId) => {
  let exampleGroup = await InventoryGroup.findOne({ user: userId, account: accountId }).sort({ sortOrder: 1, createdAt: 1 });

  if (!exampleGroup) {
    exampleGroup = await InventoryGroup.create({
      user: userId,
      account: accountId,
      name: 'Singapore Banner',
      description: 'Example inventory group',
      sortOrder: 1
    });
  }

  await Inventory.updateMany(
    {
      user: userId,
      account: accountId,
      $or: [
        { groupName: { $exists: false } },
        { groupName: null },
        { groupName: '' }
      ]
    },
    {
      $set: { groupName: exampleGroup.name }
    }
  );

  return exampleGroup;
};

const validateInventoryGroup = async (userId, accountId, groupName) => {
  const normalizedGroupName = normalizeGroupName(groupName);
  if (!normalizedGroupName) {
    return null;
  }

  return InventoryGroup.findOne({
    user: userId,
    account: accountId,
    name: normalizedGroupName
  });
};

exports.createInventory = async (req, res) => {
  try {
    const { name, key, description, rotationMode, groupName } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Inventory name is required' });
    }

    const finalKey = key && key.trim() ? slugifyKey(key) : slugifyKey(name);
    const normalizedGroupName = normalizeGroupName(groupName);

    if (!normalizedGroupName) {
      return res.status(400).json({ error: 'Inventory group is required' });
    }

    const inventoryGroup = await validateInventoryGroup(req.user.id, req.user.accountId, normalizedGroupName);
    if (!inventoryGroup) {
      return res.status(404).json({ error: 'Inventory group not found' });
    }

    const nameExists = await Inventory.findOne({ account: req.user.accountId, name: name.trim() });
    if (nameExists) {
      return res.status(409).json({ error: 'Inventory name already exists' });
    }

    const inventory = await Inventory.create({
      user: req.user.id,
      account: req.user.accountId,
      name: name.trim(),
      key: finalKey,
      description: description ? description.trim() : '',
      groupName: inventoryGroup.name,
      rotationMode: rotationMode === 'rotate' ? 'rotate' : 'single'
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
    await ensureExampleGroup(req.user.id, req.user.accountId);

    const filter = {
      user: req.user.id,
      account: req.user.accountId
    };
    const groupName = normalizeGroupName(req.query.groupName);

    if (groupName) {
      filter.groupName = groupName;
    }

    const inventories = await Inventory.find(filter).sort({ groupName: 1, createdAt: -1 });
    res.json(inventories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getInventory = async (req, res) => {
  try {
    const inventory = await Inventory.findById(req.params.id);
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

    if (inventory.user.toString() !== req.user.id || inventory.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to access this inventory' });
    }

    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateInventory = async (req, res) => {
  try {
    const { name, key, description, isActive, rotationMode, groupName } = req.body;
    let inventory = await Inventory.findById(req.params.id);
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

    if (inventory.user.toString() !== req.user.id || inventory.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to update this inventory' });
    }

    if (name !== undefined) {
      const trimmed = name.trim();
      const nameExists = await Inventory.findOne({ account: req.user.accountId, name: trimmed, _id: { $ne: req.params.id } });
      if (nameExists) {
        return res.status(409).json({ error: 'Inventory name already exists' });
      }
      inventory.name = trimmed;
    }
    if (key !== undefined) inventory.key = slugifyKey(key);
    if (description !== undefined) inventory.description = description ? description.trim() : '';
    if (groupName !== undefined) {
      const normalizedGroupName = normalizeGroupName(groupName);
      if (!normalizedGroupName) {
        return res.status(400).json({ error: 'Inventory group is required' });
      }

      const inventoryGroup = await validateInventoryGroup(req.user.id, req.user.accountId, normalizedGroupName);
      if (!inventoryGroup) {
        return res.status(404).json({ error: 'Inventory group not found' });
      }

      inventory.groupName = inventoryGroup.name;
    }
    if (isActive !== undefined) inventory.isActive = !!isActive;
    if (rotationMode !== undefined) {
      inventory.rotationMode = rotationMode === 'rotate' ? 'rotate' : 'single';
    }

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

    if (inventory.user.toString() !== req.user.id || inventory.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to delete this inventory' });
    }

    const adUnitCount = await AdUnit.countDocuments({ inventory: inventory._id });
    if (adUnitCount > 0) {
      return res.status(400).json({ error: 'Inventory is in use by ad units' });
    }

    await Inventory.findByIdAndDelete(inventory._id);
    res.json({ message: 'Inventory deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
