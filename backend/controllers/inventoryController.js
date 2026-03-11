const Inventory = require('../models/Inventory');
const AdUnit = require('../models/AdUnit');

const slugifyKey = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

exports.createInventory = async (req, res) => {
  try {
    const { name, key, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Inventory name is required' });
    }

    const finalKey = key && key.trim() ? slugifyKey(key) : slugifyKey(name);

    const inventory = await Inventory.create({
      user: req.user.id,
      account: req.user.accountId,
      name: name.trim(),
      key: finalKey,
      description: description ? description.trim() : ''
    });

    res.status(201).json(inventory);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Inventory key already exists' });
    }
    res.status(400).json({ error: error.message });
  }
};

exports.getAllInventories = async (req, res) => {
  try {
    const inventories = await Inventory.find({
      user: req.user.id,
      account: req.user.accountId
    }).sort({ createdAt: -1 });
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
    const { name, key, description, isActive } = req.body;
    let inventory = await Inventory.findById(req.params.id);
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

    if (inventory.user.toString() !== req.user.id || inventory.account.toString() !== req.user.accountId) {
      return res.status(403).json({ error: 'Not authorized to update this inventory' });
    }

    if (name !== undefined) inventory.name = name.trim();
    if (key !== undefined) inventory.key = slugifyKey(key);
    if (description !== undefined) inventory.description = description ? description.trim() : '';
    if (isActive !== undefined) inventory.isActive = !!isActive;

    await inventory.save();
    res.json(inventory);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Inventory key already exists' });
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
