const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Account = require('../models/Account');
const { verifyTotpToken, normalizeTotpToken } = require('../utils/twoFactor');

const normalizeRole = (role) => {
  if (role === 'owner' || role === 'admin') return 'owner';
  return 'editor';
};

const OWNER_2FA_ALLOWED_AUTH_PATHS = new Set([
  '/me',
  '/select-account',
  '/2fa/status',
  '/2fa/setup',
  '/2fa/verify-setup'
]);

const isAllowedOwnerSetupPath = (req) => {
  if (req.baseUrl !== '/api/auth') {
    return false;
  }

  return OWNER_2FA_ALLOWED_AUTH_PATHS.has(req.path);
};

// Protect routes - verify JWT
exports.protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled'
      });
    }

    req.user.role = normalizeRole(req.user.role);
    req.user.accountId = decoded.accountId;
    req.auth = {
      setupOnly: Boolean(decoded.setupOnly),
      purpose: decoded.purpose || null
    };

    const tokenVersion = Number(decoded.tokenVersion || 0);
    const userTokenVersion = Number(req.user.tokenVersion || 0);
    if (tokenVersion !== userTokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.'
      });
    }

    const ownerNeedsSetup = req.user.role === 'owner' && req.user.twoFactorEnabled !== true;
    if (ownerNeedsSetup && !isAllowedOwnerSetupPath(req)) {
      return res.status(403).json({
        success: false,
        code: 'OWNER_2FA_SETUP_REQUIRED',
        message: 'Owner must complete 2FA setup before accessing this route.'
      });
    }

    if (req.auth.setupOnly && !isAllowedOwnerSetupPath(req)) {
      return res.status(403).json({
        success: false,
        code: 'OWNER_2FA_SETUP_REQUIRED',
        message: '2FA setup is required before accessing this route.'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

exports.requireOwner = (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.'
    });
  }

  next();
};

exports.requireOwnerWith2FA = (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.'
    });
  }

  if (!req.user.twoFactorEnabled) {
    return res.status(403).json({
      success: false,
      code: 'OWNER_2FA_SETUP_REQUIRED',
      message: 'Owner must complete 2FA setup before accessing this route.'
    });
  }

  next();
};

exports.requireFreshOwnerTwoFactor = async (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.'
    });
  }

  const normalizedToken = normalizeTotpToken(req.body?.twoFactorToken || req.headers['x-2fa-token']);
  if (!normalizedToken) {
    return res.status(403).json({
      success: false,
      message: 'Two-factor verification is required for this action.'
    });
  }

  const owner = await User.findById(req.user.id).select('+twoFactorSecret twoFactorEnabled');
  if (!owner || owner.twoFactorEnabled !== true || !owner.twoFactorSecret) {
    return res.status(403).json({
      success: false,
      code: 'OWNER_2FA_SETUP_REQUIRED',
      message: 'Owner must complete 2FA setup before accessing this route.'
    });
  }

  const valid = verifyTotpToken({
    secret: owner.twoFactorSecret,
    token: normalizedToken
  });

  if (!valid) {
    return res.status(403).json({
      success: false,
      message: 'Invalid two-factor code.'
    });
  }

  await User.updateOne(
    { _id: owner._id },
    { $set: { twoFactorLastVerifiedAt: new Date() } }
  );

  next();
};

exports.allowOwnerOrSelf = (idParam = 'id') => {
  return (req, res, next) => {
    if (req.user.role === 'owner') {
      return next();
    }

    if (String(req.user._id) === String(req.params[idParam])) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.'
    });
  };
};

exports.requireAccountAccess = async (req, res, next) => {
  try {
    if (!req.user?.accountId) {
      return res.status(403).json({
        success: false,
        message: 'No account has been selected.'
      });
    }

    const accountFilter = req.user.role === 'owner'
      ? { _id: req.user.accountId, owner: req.user.id, isActive: true }
      : { _id: req.user.accountId, 'sharedUsers.user': req.user.id, isActive: true };

    const account = await Account.findOne(accountFilter).select('_id name owner');
    if (!account) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this account.'
      });
    }

    req.currentAccount = account;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to verify account access.'
    });
  }
};
