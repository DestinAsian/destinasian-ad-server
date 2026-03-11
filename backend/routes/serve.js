const express = require('express');
const { serveAd } = require('../controllers/adUnitController');
const router = express.Router();

router.get('/', serveAd);

module.exports = router;
