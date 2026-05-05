const express = require('express');
const router = express.Router();
const {
  register,
  getSetupStatus,
  login,
  verifyTwoFactorLogin,
  getMe,
  getTwoFactorStatus,
  setupTwoFactor,
  verifyTwoFactorSetup,
  selectAccount,
  createAccount,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.get('/setup-status', getSetupStatus);
router.post('/login', login);
router.post('/2fa/verify-login', verifyTwoFactorLogin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', protect, getMe);
router.get('/2fa/status', protect, getTwoFactorStatus);
router.post('/2fa/setup', protect, setupTwoFactor);
router.post('/2fa/verify-setup', protect, verifyTwoFactorSetup);
router.post('/select-account', protect, selectAccount);
router.post('/create-account', protect, createAccount);

module.exports = router;
