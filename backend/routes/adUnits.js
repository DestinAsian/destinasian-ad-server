const express = require('express');
const adUnitController = require('../controllers/adUnitController');
const { protect, requireAccountAccess } = require('../middleware/auth');
const router = express.Router();

router.post('/', protect, requireAccountAccess, adUnitController.createAdUnit);
router.get('/', protect, requireAccountAccess, adUnitController.getAllAdUnits);
router.get('/:id', protect, requireAccountAccess, adUnitController.getAdUnit);
router.put('/:id', protect, requireAccountAccess, adUnitController.updateAdUnit);
router.delete('/:id', protect, requireAccountAccess, adUnitController.deleteAdUnit);
router.get('/:id/stats', protect, requireAccountAccess, adUnitController.getAdUnitStats);
router.get('/campaign/:campaignId', protect, requireAccountAccess, adUnitController.getAdUnitByCampaign);

module.exports = router;
