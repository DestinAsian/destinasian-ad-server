const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const { protect, requireAccountAccess } = require('../middleware/auth');
const router = express.Router();

router.post('/', protect, requireAccountAccess, inventoryController.createInventory);
router.get('/', protect, requireAccountAccess, inventoryController.getAllInventories);
router.get('/:id', protect, requireAccountAccess, inventoryController.getInventory);
router.put('/:id', protect, requireAccountAccess, inventoryController.updateInventory);
router.delete('/:id', protect, requireAccountAccess, inventoryController.deleteInventory);

module.exports = router;
