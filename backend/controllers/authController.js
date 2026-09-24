const User = require('../models/User');
const Account = require('../models/Account');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { JWT_SECRET } = require('../config/authSecurity');
const {
  ACCESS_TOKEN_EXPIRE,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
  issueCsrfCookie,
  clearAuthCookies
} = require('../config/authCookies');
const { validatePassword } = require('../utils/passwordPolicy');
const {
  consumeAuthRateLimit,
  clearAuthRateLimit,
  getRequestIp
} = require('../services/authRateLimitService');
const { sendPasswordResetEmail } = require('../services/passwordResetEmailService');
const { logSecurityEvent } = require('../services/securityAuditService');
const {
  createAuthSession,
  rotateAuthSession,
  replaceAuthSession,
  revokeAuthSession,
  revokeAllUserSessions
} = require('../services/authSessionService');
const {
  generateTwoFactorSecret,
  verifyTotpToken,
  buildQrCodeDataUrl,
  normalizeTotpToken
} = require('../utils/twoFactor');

const OWNER_SETUP_EXPIRE = process.env.OWNER_SETUP_TOKEN_EXPIRE || '1h';
const TWO_FACTOR_CHALLENGE_EXPIRE = process.env.TWO_FACTOR_CHALLENGE_EXPIRE || '10m';
const PASSWORD_RESET_EXPIRE_MINUTES = Number(process.env.PASSWORD_RESET_EXPIRE_MINUTES || 10);

const AUTH_RATE_LIMITS = {
  login: {
    limit: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
    windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000)
  },
  twoFactor: {
    limit: Number(process.env.MAX_2FA_ATTEMPTS || 5),
    windowMs: Number(process.env.TWO_FACTOR_LOCK_WINDOW_MS || 5 * 60 * 1000)
  },
  forgotPassword: {
    limit: Number(process.env.FORGOT_PASSWORD_RATE_LIMIT_MAX || 5),
    windowMs: Number(process.env.FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000)
  },
  resetPassword: {
    limit: Number(process.env.RESET_PASSWORD_RATE_LIMIT_MAX || 10),
    windowMs: Number(process.env.RESET_PASSWORD_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000)
  }
};

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

const generateAccessToken = (id, accountId, tokenVersion, extraPayload = {}, expiresIn = ACCESS_TOKEN_EXPIRE) => {
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

const getEmailHash = (email) => crypto
  .createHash('sha256')
  .update(normalizeEmail(email))
  .digest('hex');

const enforceAuthRateLimit = async ({ req, res, scope, identifiers, config }) => {
  const result = await consumeAuthRateLimit({
    scope,
    identifiers: [`ip:${getRequestIp(req)}`, ...identifiers],
    limit: config.limit,
    windowMs: config.windowMs
  });

  if (!result.blocked) return false;

  res.set('Retry-After', String(result.retryAfterSeconds));
  res.status(429).json({
    success: false,
    message: `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`
  });
  return true;
};

const buildAuthResponse = ({ user, currentAccount, accounts, extra = {} }) => ({
  success: true,
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

const establishAuthSession = async ({ req, res, user, currentAccount, setupOnly = false }) => {
  const accountId = currentAccount?._id || currentAccount?.id;
  if (!accountId) throw new Error('Cannot create an authenticated session without an account.');

  const currentRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  const refreshToken = currentRefreshToken
    ? await replaceAuthSession({
        currentRefreshToken,
        userId: user._id,
        accountId,
        tokenVersion: user.tokenVersion,
        req
      })
    : await createAuthSession({
        userId: user._id,
        accountId,
        tokenVersion: user.tokenVersion,
        req
      });
  const accessToken = setupOnly
    ? generateOwnerSetupToken(user._id, accountId, user.tokenVersion)
    : generateAccessToken(user._id, accountId, user.tokenVersion);

  setAuthCookies(res, {
    accessToken,
    refreshToken,
    accessMaxAgeMs: setupOnly ? 60 * 60 * 1000 : ACCESS_TOKEN_MAX_AGE_MS
  });
  issueCsrfCookie(req, res);
};

const getAccessibleAccountsForUser = async (userId, role) => {
  const normalizedRole = normalizeRole(role);
  const accessQuery = normalizedRole === 'owner'
    ? { owner: userId }
    : { 'sharedUsers.user': userId };

  return Account.find({
    isActive: true,
    ...accessQuery
  })
    .select('_id name')
    .sort({ createdAt: 1, _id: 1 });
};

const getCurrentAccount = (userAccounts, preferredAccountId) => {
  const normalizedAccounts = Array.isArray(userAccounts) ? userAccounts : [];
  if (preferredAccountId) {
    const found = normalizedAccounts.find((acc) => String(acc._id || acc.id) === String(preferredAccountId));
    if (found) return found;
  }
  return normalizedAccounts.length > 0 ? normalizedAccounts[0] : null;
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

// @desc    Issue a readable CSRF token for cookie-authenticated requests
// @route   GET /api/auth/csrf-token
// @access  Public
exports.getCsrfToken = (req, res) => {
  const csrfToken = issueCsrfCookie(req, res);
  res.status(200).json({ success: true, csrfToken });
};

// @desc    Rotate refresh session and issue a short-lived access cookie
// @route   POST /api/auth/refresh
// @access  Refresh cookie
exports.refreshSession = async (req, res) => {
  const currentRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!currentRefreshToken) {
    clearAuthCookies(res);
    return res.status(401).json({ success: false, message: 'Session is not available.' });
  }

  try {
    const rotated = await rotateAuthSession({ refreshToken: currentRefreshToken, req });
    if (!rotated) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Session has expired.' });
    }

    const user = await User.findById(rotated.session.user);
    if (!user || user.isActive === false
      || Number(user.tokenVersion || 0) !== Number(rotated.session.tokenVersion || 0)) {
      await revokeAuthSession(rotated.refreshToken);
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Session has expired.' });
    }

    const accessibleAccounts = await getAccessibleAccountsForUser(user._id, user.role);
    const currentAccount = getCurrentAccount(accessibleAccounts, rotated.session.account);
    if (!currentAccount) {
      await revokeAuthSession(rotated.refreshToken);
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Account access is no longer available.' });
    }

    const setupOnly = isOwnerUser(user) && !user.twoFactorEnabled;
    const accessToken = setupOnly
      ? generateOwnerSetupToken(user._id, currentAccount._id, user.tokenVersion)
      : generateAccessToken(user._id, currentAccount._id, user.tokenVersion);
    setAuthCookies(res, {
      accessToken,
      refreshToken: rotated.refreshToken,
      accessMaxAgeMs: setupOnly ? 60 * 60 * 1000 : ACCESS_TOKEN_MAX_AGE_MS
    });
    issueCsrfCookie(req, res);

    return res.status(200).json(buildAuthResponse({
      user,
      currentAccount,
      accounts: accessibleAccounts,
      extra: { twoFactorSetupRequired: setupOnly }
    }));
  } catch (error) {
    clearAuthCookies(res);
    return res.status(401).json({ success: false, message: 'Session could not be refreshed.' });
  }
};

// @desc    Revoke current refresh session and clear authentication cookies
// @route   POST /api/auth/logout
// @access  Refresh cookie
exports.logout = async (req, res) => {
  try {
    await revokeAuthSession(req.cookies?.[REFRESH_COOKIE_NAME]);
  } finally {
    clearAuthCookies(res);
  }
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  let user;
  let account;
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

    const passwordPolicy = validatePassword(password);
    if (!passwordPolicy.valid) {
      return res.status(400).json({
        success: false,
        message: passwordPolicy.message
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

    user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: 'owner',
      twoFactorEnabled: false
    });

    account = await Account.create({
      name: accountName || `${name}'s Account`,
      owner: user._id,
      email: normalizedEmail
    });

    user.accounts.push(account._id);
    await user.save();

    await establishAuthSession({
      req,
      res,
      user,
      currentAccount: account,
      setupOnly: true
    });
    res.status(201).json(buildAuthResponse({
      user,
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

    if (account?._id) {
      await Account.deleteOne({ _id: account._id }).catch(() => {});
    }
    if (user?._id) {
      await User.deleteOne({ _id: user._id }).catch(() => {});
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration'
    });
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

    const loginIdentifiers = [`email:${normalizedEmail}`];
    if (await enforceAuthRateLimit({
      req,
      res,
      scope: 'login',
      identifiers: loginIdentifiers,
      config: AUTH_RATE_LIMITS.login
    })) return;

    const user = await User.findOne({ email: normalizedEmail })
      .select('+password +twoFactorSecret +twoFactorTempSecret');

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

    const accessibleAccounts = await getAccessibleAccountsForUser(user._id, user.role);
    const currentAccount = getCurrentAccount(accessibleAccounts);
    if (!currentAccount) {
      return res.status(500).json({
        success: false,
        message: 'No account found for user'
      });
    }

    const role = normalizeRole(user.role);
    if (role === 'owner') {
      if (user.twoFactorEnabled) {
        await clearAuthRateLimit({
          scope: 'login',
          identifiers: [`ip:${getRequestIp(req)}`, ...loginIdentifiers]
        });
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
          accounts: accessibleAccounts.map((acc) => ({ id: acc._id, name: acc.name }))
        });
      }

      await clearAuthRateLimit({
        scope: 'login',
        identifiers: [`ip:${getRequestIp(req)}`, ...loginIdentifiers]
      });
      await establishAuthSession({
        req,
        res,
        user,
        currentAccount,
        setupOnly: true
      });
      return res.status(200).json(buildAuthResponse({
        user,
        currentAccount,
        accounts: accessibleAccounts,
        extra: { twoFactorSetupRequired: true }
      }));
    }

    await clearAuthRateLimit({
      scope: 'login',
      identifiers: [`ip:${getRequestIp(req)}`, ...loginIdentifiers]
    });
    await establishAuthSession({ req, res, user, currentAccount });
    res.status(200).json(buildAuthResponse({
      user,
      currentAccount,
      accounts: accessibleAccounts
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

    const challengeIdentifier = `challenge:${crypto.createHash('sha256').update(challengeToken).digest('hex')}`;
    if (await enforceAuthRateLimit({
      req,
      res,
      scope: 'two-factor-login',
      identifiers: [challengeIdentifier],
      config: AUTH_RATE_LIMITS.twoFactor
    })) return;

    const decoded = jwt.verify(challengeToken, JWT_SECRET);
    if (decoded.purpose !== '2fa_challenge') {
      return res.status(401).json({
        success: false,
        message: 'Invalid two-factor challenge'
      });
    }

    const user = await User.findById(decoded.id).select('+twoFactorSecret');
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user session'
      });
    }

    if (Number(decoded.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: 'Two-factor challenge has expired. Please log in again.'
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
      return res.status(401).json({
        success: false,
        message: 'Invalid two-factor code.'
      });
    }

    await clearAuthRateLimit({
      scope: 'two-factor-login',
      identifiers: [`ip:${getRequestIp(req)}`, challengeIdentifier]
    });
    user.twoFactorLastVerifiedAt = new Date();
    await user.save();

    const accessibleAccounts = await getAccessibleAccountsForUser(user._id, user.role);
    const currentAccount = getCurrentAccount(accessibleAccounts, decoded.accountId);
    if (!currentAccount) {
      return res.status(500).json({
        success: false,
        message: 'No account found for user'
      });
    }

    await establishAuthSession({ req, res, user, currentAccount });
    res.status(200).json(buildAuthResponse({
      user,
      currentAccount,
      accounts: accessibleAccounts
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
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const accessibleAccounts = await getAccessibleAccountsForUser(user._id, user.role);
    const currentAccount = getCurrentAccount(accessibleAccounts, req.user.accountId);
    res.status(200).json({
      success: true,
      user: toSafeUser(user),
      currentAccount: currentAccount ? { id: currentAccount._id, name: currentAccount.name } : { id: req.user.accountId },
      accounts: accessibleAccounts.map((acc) => ({
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
      .select('+twoFactorTempSecret +twoFactorSecret');

    if (!user || !user.twoFactorTempSecret) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor setup has not been initialized.'
      });
    }

    const setupIdentifier = `user:${user._id}`;
    if (await enforceAuthRateLimit({
      req,
      res,
      scope: 'two-factor-setup',
      identifiers: [setupIdentifier],
      config: AUTH_RATE_LIMITS.twoFactor
    })) return;

    const valid = verifyTotpToken({
      secret: user.twoFactorTempSecret,
      token: normalizedToken
    });

    if (!valid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid two-factor code.'
      });
    }

    await clearAuthRateLimit({
      scope: 'two-factor-setup',
      identifiers: [`ip:${getRequestIp(req)}`, setupIdentifier]
    });
    user.twoFactorSecret = user.twoFactorTempSecret;
    user.twoFactorTempSecret = undefined;
    user.twoFactorEnabled = true;
    user.twoFactorConfirmedAt = new Date();
    user.twoFactorLastVerifiedAt = new Date();
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();

    const accessibleAccounts = await getAccessibleAccountsForUser(user._id, user.role);
    const currentAccount = getCurrentAccount(accessibleAccounts, req.user.accountId);
    await revokeAllUserSessions(user._id);
    await establishAuthSession({ req, res, user, currentAccount });

    res.status(200).json(buildAuthResponse({
      user,
      currentAccount,
      accounts: accessibleAccounts,
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

    const user = await User.findById(req.user.id);
    const accessibleAccounts = await getAccessibleAccountsForUser(user._id, user.role);
    const hasAccess = accessibleAccounts.some((acc) => acc._id.toString() === accountId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this account'
      });
    }

    const account = accessibleAccounts.find((acc) => acc._id.toString() === accountId);
    await establishAuthSession({
      req,
      res,
      user,
      currentAccount: account,
      setupOnly: isOwnerUser(user) && !user.twoFactorEnabled
    });

    res.status(200).json(buildAuthResponse({
      user,
      currentAccount: account,
      accounts: accessibleAccounts
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

    const user = await User.findById(req.user.id);
    if (normalizeRole(user.role) !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create accounts.'
      });
    }

    const trimmedName = String(accountName).trim();
    if (!trimmedName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide accountName'
      });
    }

    const duplicate = await Account.findOne({
      owner: user._id,
      name: trimmedName,
      isActive: true
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Account name already exists.'
      });
    }

    const account = await Account.create({
      name: trimmedName,
      owner: user._id,
      email: normalizeEmail(user.email)
    });

    user.accounts.push(account._id);
    await user.save();

    const accessibleAccounts = await getAccessibleAccountsForUser(user._id, user.role);

    res.status(201).json({
      success: true,
      account: { id: account._id, name: account.name },
      accounts: accessibleAccounts.map((acc) => ({ id: acc._id, name: acc.name }))
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Account name already exists.'
      });
    }
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

    if (await enforceAuthRateLimit({
      req,
      res,
      scope: 'forgot-password',
      identifiers: [`email:${normalizedEmail}`],
      config: AUTH_RATE_LIMITS.forgotPassword
    })) return;

    const genericResponse = {
      success: true,
      message: 'If the account exists, reset instructions have been sent.'
    };

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + PASSWORD_RESET_EXPIRE_MINUTES * 60 * 1000;
    await user.save();

    try {
      await sendPasswordResetEmail({
        recipient: user.email,
        resetToken,
        expiresInMinutes: PASSWORD_RESET_EXPIRE_MINUTES
      });
      logSecurityEvent('password_reset_requested', {
        userId: user._id,
        emailHash: getEmailHash(user.email)
      });
    } catch (deliveryError) {
      await User.updateOne(
        { _id: user._id, resetPasswordToken: resetTokenHash },
        { $unset: { resetPasswordToken: '', resetPasswordExpire: '' } }
      );
      logSecurityEvent('password_reset_delivery_failed', {
        userId: user._id,
        emailHash: getEmailHash(user.email),
        reason: deliveryError.code || 'delivery_failed'
      }, 'warn');
    }

    return res.status(200).json(genericResponse);
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

    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (await enforceAuthRateLimit({
      req,
      res,
      scope: 'reset-password',
      identifiers: [`token:${resetTokenHash}`],
      config: AUTH_RATE_LIMITS.resetPassword
    })) return;

    if (password !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    const passwordPolicy = validatePassword(password);
    if (!passwordPolicy.valid) {
      return res.status(400).json({
        success: false,
        message: passwordPolicy.message
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.findOneAndUpdate({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpire: { $gt: Date.now() }
    }, {
      $set: { password: passwordHash },
      $unset: { resetPasswordToken: '', resetPasswordExpire: '' },
      $inc: { tokenVersion: 1 }
    }, {
      new: true
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    await clearAuthRateLimit({
      scope: 'reset-password',
      identifiers: [`ip:${getRequestIp(req)}`, `token:${resetTokenHash}`]
    });
    await revokeAllUserSessions(user._id);
    logSecurityEvent('password_reset_succeeded', { userId: user._id });

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
