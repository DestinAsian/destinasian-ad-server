const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  selectAccount,
  createAccount,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', protect, getMe);
router.post('/select-account', protect, selectAccount);
router.post('/create-account', protect, createAccount);

module.exports = router;
