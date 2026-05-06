const mongoose = require('mongoose');
const Account = require('../models/Account');
const Campaign = require('../models/Campaign');
const AdUnit = require('../models/AdUnit');
const Inventory = require('../models/Inventory');
const AdDailyStat = require('../models/AdDailyStat');
const User = require('../models/User');

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');
const normalizeRole = (role) => {
  if (role === 'owner' || role === 'admin') return 'owner';
  return 'editor';
};
const normalizeAccessLevel = (value) => (value === 'owner' ? 'owner' : 'editor');

const toIdString = (value) => (value ? String(value) : null);

const ensureObjectId = (value) => {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(value));
};

const buildAccountAccessQuery = ({ userId, role }) => {
  if (normalizeRole(role) === 'owner') {
    return { owner: userId };
  }

  return { 'sharedUsers.user': userId };
};

const findAccessibleAccountById = async (accountId, userId, role) => {
  const objectId = ensureObjectId(accountId);
  if (!objectId) return null;

  const account = await Account.findOne({
    _id: objectId,
    isActive: true,
    ...buildAccountAccessQuery({ userId, role })
  })
    .populate('owner', 'name email')
    .populate('sharedUsers.user', 'name email role isActive');

  return account;
};

const formatSharedUsers = (sharedUsers = []) => {
  return sharedUsers.map((entry) => ({
    userId: entry.user?._id || entry.user,
    name: entry.user?.name || null,
    email: entry.email,
    role: entry.user?.role || null,
    isActive: entry.user?.isActive !== false,
    accessLevel: normalizeAccessLevel(entry.accessLevel),
    addedAt: entry.addedAt || null,
    addedBy: entry.addedBy || null
  }));
};

const formatAccount = ({ account, viewerUserId, summaryByAccountId = new Map() }) => {
  const summary = summaryByAccountId.get(toIdString(account._id)) || {
    campaignCount: 0,
    activeCampaignCount: 0,
    inventoryCount: 0,
    adUnitCount: 0,
    sharedUsersCount: Array.isArray(account.sharedUsers) ? account.sharedUsers.length : 0,
    impressions: 0,
    clicks: 0,
    revenue: 0
  };

  return {
    _id: account._id,
    name: account.name,
    owner: account.owner
      ? {
          _id: account.owner._id,
          name: account.owner.name,
          email: account.owner.email
        }
      : null,
    email: account.email,
    accessLevel: account.getAccessLevelForUser ? account.getAccessLevelForUser(viewerUserId) : 'editor',
    sharedUsers: formatSharedUsers(account.sharedUsers || []),
    summary,
    isActive: account.isActive !== false,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
};

const loadSummaryByAccountIds = async (accountIds = []) => {
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return new Map();
  }

  const [campaignStats, inventoryStats, adUnitStats, reportStats] = await Promise.all([
    Campaign.aggregate([
      { $match: { account: { $in: accountIds } } },
      {
        $group: {
          _id: '$account',
          campaignCount: { $sum: 1 },
          activeCampaignCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
            }
          }
        }
      }
    ]),
    Inventory.aggregate([
      { $match: { account: { $in: accountIds } } },
      { $group: { _id: '$account', inventoryCount: { $sum: 1 } } }
    ]),
    AdUnit.aggregate([
      { $match: { account: { $in: accountIds } } },
      { $group: { _id: '$account', adUnitCount: { $sum: 1 } } }
    ]),
    AdDailyStat.aggregate([
      { $match: { account: { $in: accountIds } } },
      {
        $group: {
          _id: '$account',
          impressions: { $sum: '$impressions' },
          clicks: { $sum: '$clicks' },
          revenue: { $sum: '$revenue' }
        }
      }
    ])
  ]);

  const summaryById = new Map();
  for (const accountId of accountIds) {
    summaryById.set(toIdString(accountId), {
      campaignCount: 0,
      activeCampaignCount: 0,
      inventoryCount: 0,
      adUnitCount: 0,
      sharedUsersCount: 0,
      impressions: 0,
      clicks: 0,
      revenue: 0
    });
  }

  const mergeRows = (rows, fields) => {
    rows.forEach((row) => {
      const key = toIdString(row._id);
      if (!summaryById.has(key)) return;
      summaryById.set(key, {
        ...summaryById.get(key),
        ...fields.reduce((acc, field) => {
          acc[field] = row[field] || 0;
          return acc;
        }, {})
      });
    });
  };

  mergeRows(campaignStats, ['campaignCount', 'activeCampaignCount']);
  mergeRows(inventoryStats, ['inventoryCount']);
  mergeRows(adUnitStats, ['adUnitCount']);
  mergeRows(reportStats, ['impressions', 'clicks', 'revenue']);

  return summaryById;
};

const getAccessibleAccounts = async (userId, role) => {
  return Account.find({
    isActive: true,
    ...buildAccountAccessQuery({ userId, role })
  })
    .sort({ updatedAt: -1 })
    .populate('owner', 'name email')
    .populate('sharedUsers.user', 'name email role isActive');
};

const ensureOwnerRole = (req, res) => {
  if (normalizeRole(req.user.role) !== 'owner') {
    res.status(403).json({ error: 'You do not have permission to perform this action.' });
    return false;
  }
  return true;
};

const ensureAccountOwnership = (account, userId, res, message = 'Not authorized to manage this account') => {
  if (!account || toIdString(account.owner?._id || account.owner) !== toIdString(userId)) {
    res.status(403).json({ error: message });
    return false;
  }
  return true;
};

// Get all accounts for user (owned or shared) with overview summary
exports.getAllAccounts = async (req, res) => {
  try {
    const accounts = await getAccessibleAccounts(req.user.id, req.user.role);
    const accountIds = accounts.map((account) => account._id);
    const summaryByAccountId = await loadSummaryByAccountIds(accountIds);

    const payload = accounts.map((account) => {
      const key = toIdString(account._id);
      const summary = summaryByAccountId.get(key) || {};
      return formatAccount({
        account,
        viewerUserId: req.user.id,
        summaryByAccountId: new Map([[key, { ...summary, sharedUsersCount: (account.sharedUsers || []).length }]])
      });
    });

    res.json({ accounts: payload });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create account (owner only)
exports.createAccount = async (req, res) => {
  try {
    if (!ensureOwnerRole(req, res)) return;

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'Account name is required' });
    }

    const duplicate = await Account.findOne({
      owner: req.user.id,
      name: name,
      isActive: true
    });
    if (duplicate) {
      return res.status(409).json({ error: 'Account name already exists for this owner' });
    }

    const owner = await User.findById(req.user.id);
    if (!owner) {
      return res.status(404).json({ error: 'Owner user not found' });
    }

    const account = await Account.create({
      name,
      owner: req.user.id,
      email: normalizeEmail(owner.email),
      sharedUsers: []
    });

    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { accounts: account._id }
    });

    const hydrated = await Account.findById(account._id).populate('owner', 'name email');
    res.status(201).json(
      formatAccount({
        account: hydrated,
        viewerUserId: req.user.id,
        summaryByAccountId: new Map([
          [
            toIdString(hydrated._id),
            {
              campaignCount: 0,
              activeCampaignCount: 0,
              inventoryCount: 0,
              adUnitCount: 0,
              sharedUsersCount: 0,
              impressions: 0,
              clicks: 0,
              revenue: 0
            }
          ]
        ])
      })
    );
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Account name already exists for this owner' });
    }
    res.status(400).json({ error: error.message });
  }
};

// Get single account
exports.getAccount = async (req, res) => {
  try {
    const account = await findAccessibleAccountById(req.params.id, req.user.id, req.user.role);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const summaryByAccountId = await loadSummaryByAccountIds([account._id]);
    const key = toIdString(account._id);
    const mergedSummary = {
      ...(summaryByAccountId.get(key) || {}),
      sharedUsersCount: (account.sharedUsers || []).length
    };

    res.json(
      formatAccount({
        account,
        viewerUserId: req.user.id,
        summaryByAccountId: new Map([[key, mergedSummary]])
      })
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update account
exports.updateAccount = async (req, res) => {
  try {
    const account = await findAccessibleAccountById(req.params.id, req.user.id, req.user.role);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const isOwnerOfAccount = toIdString(account.owner?._id || account.owner) === toIdString(req.user.id);
    const userRole = normalizeRole(req.user.role);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

    if (!name) {
      return res.status(400).json({ error: 'Account name is required' });
    }

    if (userRole !== 'owner' && !isOwnerOfAccount) {
      const disallowedFields = Object.keys(req.body).filter((field) => field !== 'name');
      if (disallowedFields.length > 0) {
        return res.status(403).json({
          error: 'Editors can only edit account name.'
        });
      }
    }

    if (userRole === 'owner' && isOwnerOfAccount) {
      if (req.body.isActive !== undefined) {
        account.isActive = Boolean(req.body.isActive);
      }
    }

    const duplicate = await Account.findOne({
      _id: { $ne: account._id },
      owner: account.owner,
      name,
      isActive: true
    });
    if (duplicate) {
      return res.status(409).json({ error: 'Account name already exists for this owner' });
    }

    account.name = name;
    await account.save();

    const refreshed = await findAccessibleAccountById(account._id, req.user.id, req.user.role);
    const summaryByAccountId = await loadSummaryByAccountIds([refreshed._id]);
    const key = toIdString(refreshed._id);
    const mergedSummary = {
      ...(summaryByAccountId.get(key) || {}),
      sharedUsersCount: (refreshed.sharedUsers || []).length
    };

    res.json(
      formatAccount({
        account: refreshed,
        viewerUserId: req.user.id,
        summaryByAccountId: new Map([[key, mergedSummary]])
      })
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete account
exports.deleteAccount = async (req, res) => {
  try {
    if (!ensureOwnerRole(req, res)) return;

    const account = await Account.findById(req.params.id);
    if (!account || account.isActive === false) return res.status(404).json({ error: 'Account not found' });
    if (!ensureAccountOwnership(account, req.user.id, res, 'Not authorized to delete this account')) return;

    const [campaignCount, inventoryCount, adUnitCount, reportCount] = await Promise.all([
      Campaign.countDocuments({ account: account._id }),
      Inventory.countDocuments({ account: account._id }),
      AdUnit.countDocuments({ account: account._id }),
      AdDailyStat.countDocuments({ account: account._id })
    ]);

    if (campaignCount > 0 || inventoryCount > 0 || adUnitCount > 0 || reportCount > 0) {
      return res.status(400).json({
        error: 'Account cannot be deleted while it still has campaigns, inventories, ad units, or reports.'
      });
    }

    await Account.findByIdAndDelete(account._id);
    await User.updateMany(
      { accounts: account._id },
      { $pull: { accounts: account._id } }
    );

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get account with stats
exports.getAccountStats = async (req, res) => {
  try {
    const account = await findAccessibleAccountById(req.params.id, req.user.id, req.user.role);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const summaryByAccountId = await loadSummaryByAccountIds([account._id]);
    const summary = summaryByAccountId.get(toIdString(account._id)) || {
      campaignCount: 0,
      activeCampaignCount: 0,
      inventoryCount: 0,
      adUnitCount: 0,
      impressions: 0,
      clicks: 0,
      revenue: 0
    };

    res.json({
      ...account.toObject(),
      stats: {
        campaigns: summary.campaignCount || 0,
        activeCampaigns: summary.activeCampaignCount || 0,
        inventories: summary.inventoryCount || 0,
        adUnits: summary.adUnitCount || 0,
        impressions: summary.impressions || 0,
        clicks: summary.clicks || 0,
        revenue: summary.revenue || 0,
        sharedUsers: (account.sharedUsers || []).length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Share account with existing user (owner only)
exports.shareAccount = async (req, res) => {
  try {
    if (!ensureOwnerRole(req, res)) return;

    const account = await Account.findById(req.params.id);
    if (!account || account.isActive === false) return res.status(404).json({ error: 'Account not found' });
    if (!ensureAccountOwnership(account, req.user.id, res, 'Not authorized to share this account')) return;

    const normalizedEmail = normalizeEmail(req.body.email);
    const accessLevel = normalizeAccessLevel(req.body.accessLevel);
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    const targetUser = await User.findOne({ email: normalizedEmail });
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user must already exist to be shared' });
    }
    if (targetUser.isActive === false) {
      return res.status(400).json({ error: 'Target user is disabled' });
    }
    if (toIdString(targetUser._id) === toIdString(account.owner)) {
      return res.status(400).json({ error: 'Account owner already has full access' });
    }

    const duplicate = (account.sharedUsers || []).some(
      (entry) => toIdString(entry.user) === toIdString(targetUser._id)
    );
    if (duplicate) {
      return res.status(409).json({ error: 'Account is already shared with this user' });
    }

    account.sharedUsers.push({
      user: targetUser._id,
      email: normalizedEmail,
      accessLevel,
      addedBy: req.user.id
    });
    await account.save();

    await User.findByIdAndUpdate(targetUser._id, {
      $addToSet: { accounts: account._id }
    });

    const refreshed = await findAccessibleAccountById(account._id, req.user.id, req.user.role);
    const summaryByAccountId = await loadSummaryByAccountIds([refreshed._id]);
    const key = toIdString(refreshed._id);
    const mergedSummary = {
      ...(summaryByAccountId.get(key) || {}),
      sharedUsersCount: (refreshed.sharedUsers || []).length
    };

    res.json(
      formatAccount({
        account: refreshed,
        viewerUserId: req.user.id,
        summaryByAccountId: new Map([[key, mergedSummary]])
      })
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Replace/sync all shared users for an account (owner only)
exports.syncAccountShares = async (req, res) => {
  try {
    if (!ensureOwnerRole(req, res)) return;

    const account = await Account.findById(req.params.id);
    if (!account || account.isActive === false) return res.status(404).json({ error: 'Account not found' });
    if (!ensureAccountOwnership(account, req.user.id, res, 'Not authorized to manage account sharing')) return;

    const rawUserIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
    const dedupedUserIdStrings = [...new Set(rawUserIds.map((value) => String(value || '').trim()).filter(Boolean))];

    if (dedupedUserIdStrings.length === 0) {
      account.sharedUsers = [];
      await account.save();
      const refreshed = await findAccessibleAccountById(account._id, req.user.id, req.user.role);
      return res.json({
        message: 'Account shared successfully',
        account: formatAccount({
          account: refreshed,
          viewerUserId: req.user.id,
          summaryByAccountId: new Map([
            [
              toIdString(refreshed._id),
              {
                campaignCount: 0,
                activeCampaignCount: 0,
                inventoryCount: 0,
                adUnitCount: 0,
                sharedUsersCount: (refreshed.sharedUsers || []).length,
                impressions: 0,
                clicks: 0,
                revenue: 0
              }
            ]
          ])
        })
      });
    }

    const objectIds = [];
    for (const userIdStr of dedupedUserIdStrings) {
      const objectId = ensureObjectId(userIdStr);
      if (!objectId) {
        return res.status(400).json({ error: `Invalid user id: ${userIdStr}` });
      }
      objectIds.push(objectId);
    }

    const candidateUsers = await User.find({
      _id: { $in: objectIds },
      isActive: true
    }).select('_id name email isActive');

    if (candidateUsers.length !== objectIds.length) {
      return res.status(400).json({ error: 'One or more users are invalid or inactive' });
    }

    const ownerIdStr = toIdString(account.owner);
    const ownerIncluded = candidateUsers.some((candidate) => toIdString(candidate._id) === ownerIdStr);
    if (ownerIncluded) {
      return res.status(400).json({ error: 'Owner cannot be added to shared users' });
    }

    const nextSharedUsers = candidateUsers.map((candidate) => ({
      user: candidate._id,
      email: normalizeEmail(candidate.email),
      accessLevel: 'editor',
      addedAt: new Date(),
      addedBy: req.user.id
    }));

    account.sharedUsers = nextSharedUsers;
    await account.save();

    await User.updateMany(
      { _id: { $in: objectIds } },
      { $addToSet: { accounts: account._id } }
    );
    await User.updateMany(
      { _id: { $nin: objectIds } },
      { $pull: { accounts: account._id } }
    );
    await User.findByIdAndUpdate(account.owner, {
      $addToSet: { accounts: account._id }
    });

    const refreshed = await findAccessibleAccountById(account._id, req.user.id, req.user.role);
    const summaryByAccountId = await loadSummaryByAccountIds([refreshed._id]);
    const key = toIdString(refreshed._id);
    const mergedSummary = {
      ...(summaryByAccountId.get(key) || {}),
      sharedUsersCount: (refreshed.sharedUsers || []).length
    };

    return res.json({
      message: 'Account shared successfully',
      account: formatAccount({
        account: refreshed,
        viewerUserId: req.user.id,
        summaryByAccountId: new Map([[key, mergedSummary]])
      })
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// Update shared user access level (owner only)
exports.updateAccountShare = async (req, res) => {
  try {
    if (!ensureOwnerRole(req, res)) return;

    const account = await Account.findById(req.params.id);
    if (!account || account.isActive === false) return res.status(404).json({ error: 'Account not found' });
    if (!ensureAccountOwnership(account, req.user.id, res, 'Not authorized to manage account sharing')) return;

    const userId = ensureObjectId(req.params.userId);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid shared user id' });
    }

    const accessLevel = normalizeAccessLevel(req.body.accessLevel);
    const shareIndex = (account.sharedUsers || []).findIndex(
      (entry) => toIdString(entry.user) === toIdString(userId)
    );
    if (shareIndex === -1) {
      return res.status(404).json({ error: 'Shared user entry not found' });
    }

    account.sharedUsers[shareIndex].accessLevel = accessLevel;
    await account.save();

    const refreshed = await findAccessibleAccountById(account._id, req.user.id, req.user.role);
    const summaryByAccountId = await loadSummaryByAccountIds([refreshed._id]);
    const key = toIdString(refreshed._id);
    const mergedSummary = {
      ...(summaryByAccountId.get(key) || {}),
      sharedUsersCount: (refreshed.sharedUsers || []).length
    };

    res.json(
      formatAccount({
        account: refreshed,
        viewerUserId: req.user.id,
        summaryByAccountId: new Map([[key, mergedSummary]])
      })
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Remove shared user from account (owner only)
exports.removeAccountShare = async (req, res) => {
  try {
    if (!ensureOwnerRole(req, res)) return;

    const account = await Account.findById(req.params.id);
    if (!account || account.isActive === false) return res.status(404).json({ error: 'Account not found' });
    if (!ensureAccountOwnership(account, req.user.id, res, 'Not authorized to manage account sharing')) return;

    const userId = ensureObjectId(req.params.userId);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid shared user id' });
    }

    const beforeLength = (account.sharedUsers || []).length;
    account.sharedUsers = (account.sharedUsers || []).filter(
      (entry) => toIdString(entry.user) !== toIdString(userId)
    );
    if (account.sharedUsers.length === beforeLength) {
      return res.status(404).json({ error: 'Shared user entry not found' });
    }

    await account.save();
    await User.findByIdAndUpdate(userId, {
      $pull: { accounts: account._id }
    });

    const refreshed = await findAccessibleAccountById(account._id, req.user.id, req.user.role);
    const summaryByAccountId = await loadSummaryByAccountIds([refreshed._id]);
    const key = toIdString(refreshed._id);
    const mergedSummary = {
      ...(summaryByAccountId.get(key) || {}),
      sharedUsersCount: (refreshed.sharedUsers || []).length
    };

    res.json(
      formatAccount({
        account: refreshed,
        viewerUserId: req.user.id,
        summaryByAccountId: new Map([[key, mergedSummary]])
      })
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
