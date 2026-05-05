const express = require('express');
const router = express.Router();
const {
  getUsers,
  createUser,
  getMe,
  updateMe,
  updateMyPassword,
  updateUser,
  updateUserPassword,
  updateUserStatus,
  deleteUser,
  reassignOwner
} = require('../controllers/userController');
const {
  protect,
  requireOwner,
  requireOwnerWith2FA,
  requireFreshOwnerTwoFactor,
  allowOwnerOrSelf
} = require('../middleware/auth');

router.use(protect);

router.get('/', getUsers);
router.post('/', requireOwner, createUser);

router.get('/me', getMe);
router.patch('/me', updateMe);
router.patch('/me/password', updateMyPassword);
router.post('/reassign-owner', requireOwnerWith2FA, reassignOwner);

router.patch('/:id', allowOwnerOrSelf('id'), updateUser);
router.patch('/:id/password', requireOwnerWith2FA, requireFreshOwnerTwoFactor, updateUserPassword);
router.patch('/:id/status', requireOwnerWith2FA, requireFreshOwnerTwoFactor, updateUserStatus);
router.delete('/:id', requireOwnerWith2FA, requireFreshOwnerTwoFactor, deleteUser);

module.exports = router;
