const Account = require('../models/Account');
const Campaign = require('../models/Campaign');
const AdUnit = require('../models/AdUnit');
const User = require('../models/User');

// Get all accounts for user
exports.getAllAccounts = async (req, res) => {
  try {
    const accounts = await Account.find({ owner: req.user.id });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get single account
exports.getAccount = async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Check if user owns this account
    if (account.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to access this account' });
    }

    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update account
exports.updateAccount = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Account name is required' });
    }

    let account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Check if user owns this account
    if (account.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this account' });
    }

    account.name = name.trim();
    await account.save();

    res.json(account);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete account
exports.deleteAccount = async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Check if user owns this account
    if (account.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this account' });
    }

    // Prevent deletion if it's the only account
    const userAccounts = await Account.find({ owner: req.user.id });
    if (userAccounts.length === 1) {
      return res.status(400).json({ 
        error: 'Cannot delete your only account. Create another account first.' 
      });
    }

    // Delete all campaigns and ad units in this account
    const campaigns = await Campaign.find({ account: req.params.id });
    const campaignIds = campaigns.map(c => c._id);

    // Delete all ad units
    await AdUnit.deleteMany({ account: req.params.id });

    // Delete all campaigns
    await Campaign.deleteMany({ account: req.params.id });

    // Remove account from user's accounts array
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { accounts: req.params.id }
    });

    // Delete the account
    await Account.findByIdAndDelete(req.params.id);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get account with stats
exports.getAccountStats = async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Check if user owns this account
    if (account.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to access this account' });
    }

    const campaignCount = await Campaign.countDocuments({ account: req.params.id });
    const adUnitCount = await AdUnit.countDocuments({ account: req.params.id });

    res.json({
      ...account.toObject(),
      stats: {
        campaigns: campaignCount,
        adUnits: adUnitCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
