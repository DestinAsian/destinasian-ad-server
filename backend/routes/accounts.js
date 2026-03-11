const express = require('express');
const router = express.Router();
const {
  getAllAccounts,
  getAccount,
  updateAccount,
  deleteAccount,
  getAccountStats
} = require('../controllers/accountController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Get all accounts and stats
router.get('/', getAllAccounts);
router.get('/:id/stats', getAccountStats);

// Get, update, delete single account
router.get('/:id', getAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);

module.exports = router;
