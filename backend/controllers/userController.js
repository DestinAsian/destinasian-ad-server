const User = require('../models/User');
const Account = require('../models/Account');
const Campaign = require('../models/Campaign');
const AdUnit = require('../models/AdUnit');
const Inventory = require('../models/Inventory');
const mongoose = require('mongoose');
const { verifyTotpToken, normalizeTotpToken } = require('../utils/twoFactor');

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');
const normalizeRole = (role) => {
  if (role === 'owner' || role === 'admin') return 'owner';
  return 'editor';
};

const toSafeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: normalizeRole(user.role),
  twoFactorEnabled: Boolean(user.twoFactorEnabled),
  twoFactorSetupRequired: normalizeRole(user.role) === 'owner' && !user.twoFactorEnabled,
  status: user.isActive === false ? 'disabled' : 'active',
  isActive: user.isActive !== false,
  accounts: Array.isArray(user.accounts)
    ? user.accounts.map((account) => ({
        id: account._id || account.id || account,
        name: account.name
      }))
    : [],
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const ensureEditorRole = (user) => normalizeRole(user.role) === 'editor';

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .sort({ createdAt: 1 })
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .populate('accounts', '_id name');

    res.json({
      success: true,
      users: users.map(toSafeUser)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, passwordConfirm, accountName } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!name || !normalizedEmail || !password || !passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, password, and password confirmation'
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Email is already in use.'
      });
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: 'editor',
      isActive: true
    });

    const account = await Account.create({
      name: accountName || `${name}'s Account`,
      owner: user._id,
      email: normalizedEmail
    });

    user.accounts.push(account._id);
    await user.save();

    const withAccounts = await User.findById(user._id).populate('accounts', '_id name');

    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: toSafeUser(withAccounts)
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(400).json({
        success: false,
        message: 'Email is already in use.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .populate('accounts', '_id name');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: toSafeUser(user)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

exports.updateMe = async (req, res) => {
  try {
    if (req.body.role !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'Owner role cannot be changed.'
      });
    }

    const updatePayload = {};

    if (typeof req.body.name === 'string') {
      updatePayload.name = req.body.name.trim();
    }

    if (req.body.email !== undefined) {
      const normalizedEmail = normalizeEmail(req.body.email);
      if (!normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      const existing = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: req.user.id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Email is already in use.'
        });
      }

      updatePayload.email = normalizedEmail;
    }

    const user = await User.findByIdAndUpdate(req.user.id, updatePayload, {
      new: true,
      runValidators: true
    })
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .populate('accounts', '_id name');

    res.json({
      success: true,
      message: 'User updated successfully.',
      user: toSafeUser(user)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update profile'
    });
  }
};

exports.updateMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, passwordConfirm } = req.body;
    if (!currentPassword || !newPassword || !passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current password, new password, and password confirmation'
      });
    }

    if (newPassword !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update password'
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const requesterIsOwner = req.user.role === 'owner';
    const isSelf = String(targetUser._id) === String(req.user.id);

    if (!requesterIsOwner && !isSelf) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.'
      });
    }

    if (!requesterIsOwner && req.body.role !== undefined) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.'
      });
    }

    if (req.body.role !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'Owner role cannot be changed.'
      });
    }

    const updatePayload = {};
    if (typeof req.body.name === 'string') {
      updatePayload.name = req.body.name.trim();
    }

    if (req.body.email !== undefined) {
      const normalizedEmail = normalizeEmail(req.body.email);
      if (!normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      const existing = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: targetUser._id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Email is already in use.'
        });
      }

      updatePayload.email = normalizedEmail;
    }

    const updated = await User.findByIdAndUpdate(targetUser._id, updatePayload, {
      new: true,
      runValidators: true
    })
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .populate('accounts', '_id name');

    res.json({
      success: true,
      message: 'User updated successfully.',
      user: toSafeUser(updated)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update user'
    });
  }
};

exports.updateUserPassword = async (req, res) => {
  try {
    const { newPassword, passwordConfirm } = req.body;
    if (!newPassword || !passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Please provide new password and password confirmation'
      });
    }

    if (newPassword !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const targetUser = await User.findById(req.params.id).select('+password');
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!ensureEditorRole(targetUser)) {
      return res.status(400).json({
        success: false,
        message: 'Owner role cannot be changed.'
      });
    }

    targetUser.password = newPassword;
    await targetUser.save();

    res.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update password'
    });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { status, isActive } = req.body;
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const nextStatus = status || (isActive === false ? 'disabled' : 'active');
    const nextActive = nextStatus === 'active';

    if (!ensureEditorRole(targetUser)) {
      return res.status(400).json({
        success: false,
        message: 'Owner account cannot be disabled.'
      });
    }

    targetUser.isActive = nextActive;
    await targetUser.save();

    const refreshed = await User.findById(targetUser._id)
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .populate('accounts', '_id name');

    res.json({
      success: true,
      message: 'User updated successfully.',
      user: toSafeUser(refreshed)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update user status'
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!ensureEditorRole(targetUser)) {
      return res.status(400).json({
        success: false,
        message: 'Owner account cannot be deleted.'
      });
    }

    const accounts = await Account.find({ owner: targetUser._id }).select('_id');
    const accountIds = accounts.map((account) => account._id);

    if (accountIds.length > 0) {
      await AdUnit.deleteMany({ account: { $in: accountIds } });
      await Campaign.deleteMany({ account: { $in: accountIds } });
      await Inventory.deleteMany({ account: { $in: accountIds } });
      await Account.deleteMany({ _id: { $in: accountIds } });
    }

    await User.findByIdAndDelete(targetUser._id);

    res.json({
      success: true,
      message: 'User deleted successfully.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

exports.reassignOwner = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { targetEmail, currentPassword, twoFactorToken, confirmationText } = req.body;
    const normalizedTargetEmail = normalizeEmail(targetEmail);
    const normalizedTwoFactorToken = normalizeTotpToken(twoFactorToken);

    if (!normalizedTargetEmail || !currentPassword || !normalizedTwoFactorToken || !confirmationText) {
      return res.status(400).json({
        success: false,
        message: 'Target email, current password, two-factor code, and confirmation text are required.'
      });
    }

    if (confirmationText !== 'TRANSFER OWNERSHIP') {
      return res.status(400).json({
        success: false,
        message: 'Confirmation text must be exactly TRANSFER OWNERSHIP'
      });
    }

    const currentOwner = await User.findById(req.user.id).select('+password +twoFactorSecret');
    if (!currentOwner) {
      return res.status(404).json({
        success: false,
        message: 'Owner account not found'
      });
    }

    if (normalizeRole(currentOwner.role) !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.'
      });
    }

    if (normalizeEmail(currentOwner.email) === normalizedTargetEmail) {
      return res.status(400).json({
        success: false,
        message: 'Target email must be different from the current owner email.'
      });
    }

    const passwordValid = await currentOwner.matchPassword(currentPassword);
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    if (!currentOwner.twoFactorEnabled || !currentOwner.twoFactorSecret) {
      return res.status(403).json({
        success: false,
        message: 'Owner two-factor authentication must be enabled before ownership transfer.'
      });
    }

    const twoFactorValid = verifyTotpToken({
      secret: currentOwner.twoFactorSecret,
      token: normalizedTwoFactorToken
    });
    if (!twoFactorValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid two-factor code.'
      });
    }

    const targetUser = await User.findOne({ email: normalizedTargetEmail });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Target user must exist before ownership can be transferred'
      });
    }

    if (targetUser.isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Target user is disabled.'
      });
    }

    if (normalizeRole(targetUser.role) !== 'editor') {
      return res.status(400).json({
        success: false,
        message: 'Target user must be an active editor.'
      });
    }

    await session.withTransaction(async () => {
      await User.updateOne(
        { _id: currentOwner._id },
        {
          $set: {
            role: 'editor',
            twoFactorLastVerifiedAt: new Date()
          },
          $inc: { tokenVersion: 1 }
        },
        { session }
      );

      await User.updateOne(
        { _id: targetUser._id },
        {
          $set: {
            role: 'owner'
          },
          $unset: {
            twoFactorLastVerifiedAt: ''
          },
          $inc: { tokenVersion: 1 }
        },
        { session }
      );
    });

    const [updatedPreviousOwner, updatedNewOwner] = await Promise.all([
      User.findById(currentOwner._id).select('-password -resetPasswordToken -resetPasswordExpire').populate('accounts', '_id name'),
      User.findById(targetUser._id).select('-password -resetPasswordToken -resetPasswordExpire').populate('accounts', '_id name')
    ]);

    console.info(
      `[ownership-transfer] previousOwner=${currentOwner._id} newOwner=${targetUser._id} targetEmail=${normalizedTargetEmail}`
    );

    res.json({
      success: true,
      message: 'Ownership transferred successfully.',
      previousOwner: toSafeUser(updatedPreviousOwner),
      newOwner: toSafeUser(updatedNewOwner)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Ownership transfer failed because another owner already exists.'
      });
    }

    res.status(400).json({
      success: false,
      message: error.message || 'Failed to transfer ownership'
    });
  } finally {
    await session.endSession();
  }
};
