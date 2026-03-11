const User = require('../models/User');
const Account = require('../models/Account');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Generate JWT Token
const generateToken = (id, accountId) => {
  return jwt.sign({ id, accountId }, process.env.JWT_SECRET || 'your-secret-key-change-in-production', {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, password, passwordConfirm, accountName } = req.body;

    // Validation
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

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'Email already in use'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password
    });

    // Create default account for the user
    const account = await Account.create({
      name: accountName || `${name}'s Account`,
      owner: user._id,
      email: email
    });

    // Add account to user's accounts array
    user.accounts.push(account._id);
    await user.save();

    // Generate token with first account
    const token = generateToken(user._id, account._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      currentAccount: {
        id: account._id,
        name: account.name
      },
      accounts: [
        {
          id: account._id,
          name: account.name
        }
      ]
    });
  } catch (error) {
    console.error('Register error:', error);
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

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check for user (need to add password field which is hidden by default)
    const user = await User.findOne({ email }).select('+password').populate('accounts');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is disabled'
      });
    }

    // Use first account as default
    const currentAccount = user.accounts && user.accounts.length > 0 ? user.accounts[0] : null;
    
    if (!currentAccount) {
      return res.status(500).json({
        success: false,
        message: 'No account found for user'
      });
    }

    // Generate token with current account
    const token = generateToken(user._id, currentAccount._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      currentAccount: {
        id: currentAccount._id,
        name: currentAccount.name
      },
      accounts: user.accounts.map(acc => ({
        id: acc._id,
        name: acc.name
      }))
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during login'
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('accounts');

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      currentAccount: {
        id: req.user.accountId
      },
      accounts: user.accounts.map(acc => ({
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

    // Check if user has access to this account
    const user = await User.findById(req.user.id).populate('accounts');
    const hasAccess = user.accounts.some(acc => acc._id.toString() === accountId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this account'
      });
    }

    const account = user.accounts.find(acc => acc._id.toString() === accountId);

    // Generate new token with selected account
    const token = generateToken(user._id, accountId);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      currentAccount: {
        id: account._id,
        name: account.name
      },
      accounts: user.accounts.map(acc => ({
        id: acc._id,
        name: acc.name
      }))
    });
  } catch (error) {
    console.error('Select account error:', error);
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

    // Create new account
    const account = await Account.create({
      name: accountName,
      owner: user._id,
      email: user.email
    });

    // Add to user's accounts
    user.accounts.push(account._id);
    await user.save();

    res.status(201).json({
      success: true,
      account: {
        id: account._id,
        name: account.name
      },
      accounts: user.accounts.map(acc => ({
        id: acc._id,
        name: acc.name
      }))
    });
  } catch (error) {
    console.error('Create account error:', error);
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

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email'
      });
    }

    const user = await User.findOne({ email });

    // Always respond success to avoid user enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If the account exists, a reset token has been generated'
      });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Reset token generated',
      resetToken,
      expiresInMinutes: 10
    });
  } catch (error) {
    console.error('Forgot password error:', error);
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
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};
