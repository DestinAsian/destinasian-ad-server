const InventoryGroup = require('../models/InventoryGroup');
const Inventory = require('../models/Inventory');

const EXAMPLE_GROUP_NAME = 'Singapore Banner';

const normalizeGroupName = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const ensureExampleGroup = async (userId, accountId) => {
  let exampleGroup = await InventoryGroup.findOne({ user: userId, account: accountId }).sort({ sortOrder: 1, createdAt: 1 });

  if (!exampleGroup) {
    exampleGroup = await InventoryGroup.create({
      user: userId,
      account: accountId,
      name: EXAMPLE_GROUP_NAME,
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

  const distinctInventoryGroups = await Inventory.distinct('groupName', {
    user: userId,
    account: accountId,
    groupName: { $exists: true, $ne: null, $ne: '' }
  });

  for (const groupName of distinctInventoryGroups) {
    const normalizedName = normalizeGroupName(groupName);
    if (!normalizedName) {
      continue;
    }

    const exists = await InventoryGroup.findOne({ user: userId, account: accountId, name: normalizedName });
    if (!exists) {
      const lastGroup = await InventoryGroup.findOne({ user: userId, account: accountId }).sort({ sortOrder: -1, createdAt: -1 });
      await InventoryGroup.create({
        user: userId,
        account: accountId,
        name: normalizedName,
        sortOrder: (lastGroup?.sortOrder || 0) + 1
      });
    }
  }
};

exports.getAllInventoryGroups = async (req, res) => {
  try {
    await ensureExampleGroup(req.user.id, req.user.accountId);

    const groups = await InventoryGroup.find({
      user: req.user.id,
      account: req.user.accountId
    }).sort({ sortOrder: 1, name: 1, createdAt: 1 });

    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createInventoryGroup = async (req, res) => {
  try {
    const name = normalizeGroupName(req.body.name);
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    const sortOrder = Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : undefined;

    if (!name) {
      return res.status(400).json({ error: 'Inventory group name is required' });
    }

    const inventoryGroup = await InventoryGroup.create({
      user: req.user.id,
      account: req.user.accountId,
      name,
      description,
      sortOrder: sortOrder !== undefined ? sortOrder : undefined
    });

    res.status(201).json(inventoryGroup);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Inventory group name already exists' });
    }

    res.status(400).json({ error: error.message });
  }
};

exports.updateInventoryGroup = async (req, res) => {
  try {
    const inventoryGroup = await InventoryGroup.findById(req.params.id);
    if (!inventoryGroup) {
      return res.status(404).json({ error: 'Inventory group not found' });
    }

    if (inventoryGroup.user.toString() !== req.user.id || inventoryGroup.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to update this inventory group' });
    }

    const previousName = inventoryGroup.name;
    const nextName = req.body.name !== undefined ? normalizeGroupName(req.body.name) : previousName;
    if (!nextName) {
      return res.status(400).json({ error: 'Inventory group name is required' });
    }

    inventoryGroup.name = nextName;

    if (req.body.description !== undefined) {
      inventoryGroup.description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    }

    if (req.body.sortOrder !== undefined) {
      const numericSortOrder = Number(req.body.sortOrder);
      inventoryGroup.sortOrder = Number.isFinite(numericSortOrder) ? numericSortOrder : inventoryGroup.sortOrder;
    }

    await inventoryGroup.save();

    if (previousName !== inventoryGroup.name) {
      await Inventory.updateMany(
        {
          user: req.user.id,
          account: req.user.accountId,
          groupName: previousName
        },
        {
          $set: { groupName: inventoryGroup.name }
        }
      );
    }

    res.json(inventoryGroup);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Inventory group name already exists' });
    }

    res.status(400).json({ error: error.message });
  }
};

exports.deleteInventoryGroup = async (req, res) => {
  try {
    const inventoryGroup = await InventoryGroup.findById(req.params.id);
    if (!inventoryGroup) {
      return res.status(404).json({ error: 'Inventory group not found' });
    }

    if (inventoryGroup.user.toString() !== req.user.id || inventoryGroup.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to delete this inventory group' });
    }

    const assignedInventoryCount = await Inventory.countDocuments({
      user: req.user.id,
      account: req.user.accountId,
      groupName: inventoryGroup.name
    });

    if (assignedInventoryCount > 0) {
      return res.status(400).json({ error: 'Move inventories out of this group before deleting it' });
    }

    await InventoryGroup.findByIdAndDelete(inventoryGroup._id);
    res.json({ message: 'Inventory group deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
