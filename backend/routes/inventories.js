const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.post('/', protect, inventoryController.createInventory);
router.get('/', protect, inventoryController.getAllInventories);
router.get('/:id', protect, inventoryController.getInventory);
router.put('/:id', protect, inventoryController.updateInventory);
router.delete('/:id', protect, inventoryController.deleteInventory);

module.exports = router;
