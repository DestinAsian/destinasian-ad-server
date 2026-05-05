const User = require('../models/User');
const Account = require('../models/Account');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  generateTwoFactorSecret,
  verifyTotpToken,
  buildQrCodeDataUrl,
  normalizeTotpToken
} = require('../utils/twoFactor');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';
const OWNER_SETUP_EXPIRE = process.env.OWNER_SETUP_TOKEN_EXPIRE || '1h';
const TWO_FACTOR_CHALLENGE_EXPIRE = process.env.TWO_FACTOR_CHALLENGE_EXPIRE || '10m';

const MAX_2FA_ATTEMPTS = Number(process.env.MAX_2FA_ATTEMPTS || 5);
const TWO_FACTOR_LOCK_WINDOW_MS = Number(process.env.TWO_FACTOR_LOCK_WINDOW_MS || 5 * 60 * 1000);
const twoFactorAttempts = new Map();

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');
const ownerRoleQuery = { role: { $in: ['owner', 'admin'] } };
const normalizeRole = (role) => {
  if (role === 'owner' || role === 'admin') return 'owner';
  return 'editor';
};

const isOwnerUser = (user) => normalizeRole(user.role) === 'owner';

const toSafeUser = (user) => {
  const role = normalizeRole(user.role);
  const twoFactorEnabled = Boolean(user.twoFactorEnabled);
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role,
    twoFactorEnabled,
    twoFactorSetupRequired: role === 'owner' && !twoFactorEnabled
  };
};

const generateAccessToken = (id, accountId, tokenVersion, extraPayload = {}, expiresIn = JWT_EXPIRE) => {
  return jwt.sign(
    { id, accountId, tokenVersion: Number(tokenVersion || 0), ...extraPayload },
    JWT_SECRET,
    { expiresIn }
  );
};

const generateOwnerSetupToken = (id, accountId, tokenVersion) => {
  return generateAccessToken(
    id,
    accountId,
    tokenVersion,
    { setupOnly: true },
    OWNER_SETUP_EXPIRE
  );
};

const generateTwoFactorChallengeToken = (id, accountId, tokenVersion) => {
  return generateAccessToken(
    id,
    accountId,
    tokenVersion,
    { purpose: '2fa_challenge' },
    TWO_FACTOR_CHALLENGE_EXPIRE
  );
};

const recordTwoFactorAttempt = ({ userId, success }) => {
  const key = String(userId);
  const now = Date.now();
  const attempts = twoFactorAttempts.get(key) || { count: 0, resetAt: now + TWO_FACTOR_LOCK_WINDOW_MS };

  if (now > attempts.resetAt) {
    attempts.count = 0;
    attempts.resetAt = now + TWO_FACTOR_LOCK_WINDOW_MS;
  }

  if (success) {
    twoFactorAttempts.delete(key);
    return { blocked: false };
  }

  attempts.count += 1;
  twoFactorAttempts.set(key, attempts);

  return {
    blocked: attempts.count >= MAX_2FA_ATTEMPTS,
    retryAfterMs: Math.max(0, attempts.resetAt - now)
  };
};

const ensureTwoFactorNotLocked = (userId) => {
  const key = String(userId);
  const now = Date.now();
  const attempts = twoFactorAttempts.get(key);
  if (!attempts) return null;
  if (now > attempts.resetAt) {
    twoFactorAttempts.delete(key);
    return null;
  }
  if (attempts.count >= MAX_2FA_ATTEMPTS) {
    return Math.ceil((attempts.resetAt - now) / 1000);
  }
  return null;
};

const buildAuthResponse = ({ user, token, currentAccount, accounts, extra = {} }) => ({
  success: true,
  token,
  user: toSafeUser(user),
  currentAccount: currentAccount
    ? { id: currentAccount._id || currentAccount.id, name: currentAccount.name }
    : null,
  accounts: (accounts || []).map((acc) => ({
    id: acc._id || acc.id,
    name: acc.name
  })),
  ...extra
});

const getCurrentAccount = (user, preferredAccountId) => {
  const userAccounts = Array.isArray(user.accounts) ? user.accounts : [];
  if (preferredAccountId) {
    const found = userAccounts.find((acc) => String(acc._id || acc.id) === String(preferredAccountId));
    if (found) return found;
  }
  return userAccounts.length > 0 ? userAccounts[0] : null;
};

// @desc    Get owner setup status
// @route   GET /api/auth/setup-status
// @access  Public
exports.getSetupStatus = async (req, res) => {
  try {
    const ownerExists = !!(await User.exists(ownerRoleQuery));
    res.status(200).json({ ownerExists });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load setup status'
    });
  }
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { name, email, password, passwordConfirm, accountName } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!name || !email || !password || !passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
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

    const ownerExists = !!(await User.exists(ownerRoleQuery));
    const totalUsers = await User.countDocuments();
    if (ownerExists || totalUsers > 0) {
      return res.status(403).json({
        success: false,
        message: 'Registration is closed. Please ask the owner to grant access.'
      });
    }

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'Email already in use'
      });
    }

    let user;
    let account;
    await session.withTransaction(async () => {
      const users = await User.create(
        [{
          name,
          email: normalizedEmail,
          password,
          role: 'owner',
          twoFactorEnabled: false
        }],
        { session }
      );
      user = users[0];

      const accounts = await Account.create(
        [{
          name: accountName || `${name}'s Account`,
          owner: user._id,
          email: normalizedEmail
        }],
        { session }
      );
      account = accounts[0];

      user.accounts.push(account._id);
      await user.save({ session });
    });

    const token = generateOwnerSetupToken(user._id, account._id, user.tokenVersion);
    res.status(201).json(buildAuthResponse({
      user,
      token,
      currentAccount: account,
      accounts: [account],
      extra: { twoFactorSetupRequired: true }
    }));
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern?.role) {
        return res.status(403).json({
          success: false,
          message: 'Owner account already exists. Registration is closed.'
        });
      }
      if (error.keyPattern?.email) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration'
    });
  } finally {
    await session.endSession();
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const user = await User.findOne({ email: normalizedEmail })
      .select('+password +twoFactorSecret +twoFactorTempSecret')
      .populate('accounts');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is disabled'
      });
    }

    const currentAccount = getCurrentAccount(user);
    if (!currentAccount) {
      return res.status(500).json({
        success: false,
        message: 'No account found for user'
      });
    }

    const role = normalizeRole(user.role);
    if (role === 'owner') {
      if (user.twoFactorEnabled) {
        const lockedForSeconds = ensureTwoFactorNotLocked(user._id);
        if (lockedForSeconds) {
          return res.status(429).json({
            success: false,
            message: `Too many invalid 2FA attempts. Try again in ${lockedForSeconds} seconds.`
          });
        }

        const challengeToken = generateTwoFactorChallengeToken(
          user._id,
          currentAccount._id,
          user.tokenVersion
        );
        return res.status(200).json({
          success: true,
          requiresTwoFactor: true,
          challengeToken,
          user: toSafeUser(user),
          currentAccount: { id: currentAccount._id, name: currentAccount.name },
          accounts: user.accounts.map((acc) => ({ id: acc._id, name: acc.name }))
        });
      }

      const setupToken = generateOwnerSetupToken(user._id, currentAccount._id, user.tokenVersion);
      return res.status(200).json(buildAuthResponse({
        user,
        token: setupToken,
        currentAccount,
        accounts: user.accounts,
        extra: { twoFactorSetupRequired: true }
      }));
    }

    const token = generateAccessToken(user._id, currentAccount._id, user.tokenVersion);
    res.status(200).json(buildAuthResponse({
      user,
      token,
      currentAccount,
      accounts: user.accounts
    }));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during login'
    });
  }
};

// @desc    Verify login 2FA challenge
// @route   POST /api/auth/2fa/verify-login
// @access  Public
exports.verifyTwoFactorLogin = async (req, res) => {
  try {
    const { challengeToken, token } = req.body;
    const normalizedToken = normalizeTotpToken(token);
    if (!challengeToken || !normalizedToken) {
      return res.status(400).json({
        success: false,
        message: 'Challenge token and valid 6-digit code are required'
      });
    }

    const decoded = jwt.verify(challengeToken, JWT_SECRET);
    if (decoded.purpose !== '2fa_challenge') {
      return res.status(401).json({
        success: false,
        message: 'Invalid two-factor challenge'
      });
    }

    const user = await User.findById(decoded.id)
      .select('+twoFactorSecret')
      .populate('accounts');
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user session'
      });
    }

    if (!isOwnerUser(user) || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(403).json({
        success: false,
        message: 'Two-factor login is not available for this user.'
      });
    }

    const valid = verifyTotpToken({
      secret: user.twoFactorSecret,
      token: normalizedToken
    });

    if (!valid) {
      const attempt = recordTwoFactorAttempt({ userId: user._id, success: false });
      if (attempt.blocked) {
        return res.status(429).json({
          success: false,
          message: `Too many invalid 2FA attempts. Try again in ${Math.ceil(attempt.retryAfterMs / 1000)} seconds.`
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid two-factor code.'
      });
    }

    recordTwoFactorAttempt({ userId: user._id, success: true });
    user.twoFactorLastVerifiedAt = new Date();
    await user.save();

    const currentAccount = getCurrentAccount(user, decoded.accountId);
    if (!currentAccount) {
      return res.status(500).json({
        success: false,
        message: 'No account found for user'
      });
    }

    const fullToken = generateAccessToken(user._id, currentAccount._id, user.tokenVersion);
    res.status(200).json(buildAuthResponse({
      user,
      token: fullToken,
      currentAccount,
      accounts: user.accounts
    }));
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired two-factor challenge'
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('accounts');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentAccount = getCurrentAccount(user, req.user.accountId);
    res.status(200).json({
      success: true,
      user: toSafeUser(user),
      currentAccount: currentAccount ? { id: currentAccount._id, name: currentAccount.name } : { id: req.user.accountId },
      accounts: user.accounts.map((acc) => ({
        id: acc._id,
        name: acc.name
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get 2FA status for current user
// @route   GET /api/auth/2fa/status
// @access  Private
exports.getTwoFactorStatus = async (req, res) => {
  const required = req.user.role === 'owner';
  const enabled = Boolean(req.user.twoFactorEnabled);
  res.status(200).json({
    required,
    enabled,
    setupRequired: required && !enabled
  });
};

// @desc    Start owner 2FA setup
// @route   POST /api/auth/2fa/setup
// @access  Private (Owner only)
exports.setupTwoFactor = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.'
      });
    }

    const user = await User.findById(req.user.id).select('+twoFactorTempSecret +twoFactorSecret');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const secret = generateTwoFactorSecret({ email: user.email });
    user.twoFactorTempSecret = secret.base32;
    await user.save();

    const qrCodeDataUrl = await buildQrCodeDataUrl({ otpauthUrl: secret.otpauth_url });

    res.status(200).json({
      success: true,
      otpauthUrl: secret.otpauth_url,
      qrCodeDataUrl,
      manualEntryKey: secret.base32
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to initialize 2FA setup'
    });
  }
};

// @desc    Verify owner 2FA setup token and enable
// @route   POST /api/auth/2fa/verify-setup
// @access  Private (Owner only)
exports.verifyTwoFactorSetup = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.'
      });
    }

    const normalizedToken = normalizeTotpToken(req.body?.token);
    if (!normalizedToken) {
      return res.status(400).json({
        success: false,
        message: 'A valid 6-digit token is required'
      });
    }

    const user = await User.findById(req.user.id)
      .select('+twoFactorTempSecret +twoFactorSecret')
      .populate('accounts');

    if (!user || !user.twoFactorTempSecret) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor setup has not been initialized.'
      });
    }

    const valid = verifyTotpToken({
      secret: user.twoFactorTempSecret,
      token: normalizedToken
    });

    if (!valid) {
      const attempt = recordTwoFactorAttempt({ userId: user._id, success: false });
      if (attempt.blocked) {
        return res.status(429).json({
          success: false,
          message: `Too many invalid 2FA attempts. Try again in ${Math.ceil(attempt.retryAfterMs / 1000)} seconds.`
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid two-factor code.'
      });
    }

    recordTwoFactorAttempt({ userId: user._id, success: true });
    user.twoFactorSecret = user.twoFactorTempSecret;
    user.twoFactorTempSecret = undefined;
    user.twoFactorEnabled = true;
    user.twoFactorConfirmedAt = new Date();
    user.twoFactorLastVerifiedAt = new Date();
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();

    const currentAccount = getCurrentAccount(user, req.user.accountId);
    const token = generateAccessToken(user._id, currentAccount?._id, user.tokenVersion);

    res.status(200).json(buildAuthResponse({
      user,
      token,
      currentAccount,
      accounts: user.accounts,
      extra: { message: 'Two-factor authentication enabled successfully.' }
    }));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to verify two-factor setup'
    });
  }
};

// @desc    Select/Switch to different account
// @route   POST /api/auth/select-account
// @access  Private
exports.selectAccount = async (req, res) => {
  try {
    const { accountId } = req.body;
    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide accountId'
      });
    }

    const user = await User.findById(req.user.id).populate('accounts');
    const hasAccess = user.accounts.some((acc) => acc._id.toString() === accountId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this account'
      });
    }

    const account = user.accounts.find((acc) => acc._id.toString() === accountId);
    const token = isOwnerUser(user) && !user.twoFactorEnabled
      ? generateOwnerSetupToken(user._id, accountId, user.tokenVersion)
      : generateAccessToken(user._id, accountId, user.tokenVersion);

    res.status(200).json(buildAuthResponse({
      user,
      token,
      currentAccount: account,
      accounts: user.accounts
    }));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};

// @desc    Create new account for user
// @route   POST /api/auth/create-account
// @access  Private
exports.createAccount = async (req, res) => {
  try {
    const { accountName } = req.body;
    if (!accountName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide accountName'
      });
    }

    const user = await User.findById(req.user.id).populate('accounts');
    const account = await Account.create({
      name: accountName,
      owner: user._id,
      email: user.email
    });

    user.accounts.push(account._id);
    await user.save();

    res.status(201).json({
      success: true,
      account: { id: account._id, name: account.name },
      accounts: user.accounts.map((acc) => ({ id: acc._id, name: acc.name }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};

// @desc    Request password reset
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email'
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If the account exists, a reset token has been generated'
      });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Reset token generated',
      resetToken,
      expiresInMinutes: 10
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};

// @desc    Reset password with token
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { token, password, passwordConfirm } = req.body;

    if (!token || !password || !passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Please provide token and passwords'
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

    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpire: { $gt: Date.now() }
    }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};
