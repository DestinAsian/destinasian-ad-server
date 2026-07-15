const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();

// Import scheduled jobs
const { initializeCampaignStatsJob } = require('./jobs/updateCampaignStats');
const { initializeEndDateEnforcementJob } = require('./jobs/enforceEndDates');

const corsOriginHandler = (origin, callback) => {
  callback(null, true);
};

// Middleware
app.use(cors({
  origin: corsOriginHandler,
  credentials: false
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

app.get('/ad-client.js', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'ad-client.js'));
});

// Routes
const campaignRoutes = require('./routes/campaigns');
const adUnitRoutes = require('./routes/adUnits');
const trackingRoutes = require('./routes/tracking');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const inventoryRoutes = require('./routes/inventories');
const serveRoutes = require('./routes/serve');
const userRoutes = require('./routes/users');

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/inventories', inventoryRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/ad-units', adUnitRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/serve', serveRoutes);
app.use('/api/users', userRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Ad Server API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      campaigns: '/api/campaigns',
      adUnits: '/api/ad-units',
      tracking: '/api/tracking',
      dashboard: process.env.DASHBOARD_URL || 'http://localhost:3000'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Ad Server is running' });
});

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Upload payload is too large. GIF files must be 10MB or smaller; PNG, JPG, JPEG, and WebP files must be 1MB or smaller.'
    });
  }

  return next(error);
});

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ad-server')
  .then(() => {
    console.log('MongoDB connected');

    // Initialize scheduled jobs after DB connection
    initializeCampaignStatsJob();
    initializeEndDateEnforcementJob();
  })
  .catch(err => console.log('MongoDB connection error:', err));

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`Ad Server backend running on ${HOST}:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing backend process or set PORT to another value.`);
    process.exit(1);
  }

  throw error;
});
