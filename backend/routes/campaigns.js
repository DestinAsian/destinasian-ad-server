const express = require('express');
const campaignController = require('../controllers/campaignController');
const { protect, requireAccountAccess } = require('../middleware/auth');
const router = express.Router();

router.post('/', protect, requireAccountAccess, campaignController.createCampaign);
router.get('/', protect, requireAccountAccess, campaignController.getAllCampaigns);
router.get('/:id/ad-unit-inventories', protect, requireAccountAccess, campaignController.getCampaignAdUnitInventories);
router.put('/:id/ad-unit-inventories', protect, requireAccountAccess, campaignController.updateCampaignAdUnitInventories);
router.get('/:id', protect, requireAccountAccess, campaignController.getCampaign);
router.put('/:id', protect, requireAccountAccess, campaignController.updateCampaign);
router.delete('/:id', protect, requireAccountAccess, campaignController.deleteCampaign);
router.get('/:id/stats', protect, requireAccountAccess, campaignController.getCampaignStats);

module.exports = router;
