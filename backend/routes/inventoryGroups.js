const express = require('express');
const inventoryGroupController = require('../controllers/inventoryGroupController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, inventoryGroupController.getAllInventoryGroups);
router.post('/', protect, inventoryGroupController.createInventoryGroup);
router.put('/:id', protect, inventoryGroupController.updateInventoryGroup);
router.delete('/:id', protect, inventoryGroupController.deleteInventoryGroup);

module.exports = router;
