const express = require('express');
const router = express.Router();
const {
  getAllAccounts,
  createAccount,
  getAccount,
  updateAccount,
  deleteAccount,
  getAccountStats,
  shareAccount,
  syncAccountShares,
  updateAccountShare,
  removeAccountShare
} = require('../controllers/accountController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Get all accounts and stats
router.get('/', getAllAccounts);
router.post('/', createAccount);
router.get('/:id/stats', getAccountStats);

// Get, update, delete single account
router.get('/:id', getAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);
router.post('/:id/share', shareAccount);
router.put('/:id/share', syncAccountShares);
router.patch('/:id/share/:userId', updateAccountShare);
router.delete('/:id/share/:userId', removeAccountShare);

module.exports = router;
