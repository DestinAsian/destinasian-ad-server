const express = require('express');
const trackingController = require('../controllers/trackingController');
const { protect, requireAccountAccess } = require('../middleware/auth');
const router = express.Router();

router.post('/:adUnitId/impression', trackingController.recordImpression);
router.post('/:adUnitId/click', trackingController.recordClick);
router.get('/stats', protect, requireAccountAccess, trackingController.getTrackingStats);
router.get('/analytics', protect, requireAccountAccess, trackingController.getAnalytics);

module.exports = router;
