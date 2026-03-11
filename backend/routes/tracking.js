const express = require('express');
const trackingController = require('../controllers/trackingController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.post('/:adUnitId/impression', trackingController.recordImpression);
router.post('/:adUnitId/click', trackingController.recordClick);
router.get('/stats', protect, trackingController.getTrackingStats);

module.exports = router;
