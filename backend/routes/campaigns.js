const express = require('express');
const campaignController = require('../controllers/campaignController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.post('/', protect, campaignController.createCampaign);
router.get('/', protect, campaignController.getAllCampaigns);
router.get('/:id/ad-unit-inventories', protect, campaignController.getCampaignAdUnitInventories);
router.put('/:id/ad-unit-inventories', protect, campaignController.updateCampaignAdUnitInventories);
router.get('/:id', protect, campaignController.getCampaign);
router.put('/:id', protect, campaignController.updateCampaign);
router.delete('/:id', protect, campaignController.deleteCampaign);
router.get('/:id/stats', protect, campaignController.getCampaignStats);

module.exports = router;
