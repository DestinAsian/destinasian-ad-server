const express = require('express');
const adUnitController = require('../controllers/adUnitController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.post('/', protect, adUnitController.createAdUnit);
router.get('/', protect, adUnitController.getAllAdUnits);
router.get('/:id', protect, adUnitController.getAdUnit);
router.put('/:id', protect, adUnitController.updateAdUnit);
router.delete('/:id', protect, adUnitController.deleteAdUnit);
router.get('/:id/stats', protect, adUnitController.getAdUnitStats);
router.get('/campaign/:campaignId', protect, adUnitController.getAdUnitByCampaign);

module.exports = router;
