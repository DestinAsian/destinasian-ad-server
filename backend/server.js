const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Import scheduled jobs
const { initializeCampaignStatsJob } = require('./jobs/updateCampaignStats');

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Routes
const campaignRoutes = require('./routes/campaigns');
const adUnitRoutes = require('./routes/adUnits');
const trackingRoutes = require('./routes/tracking');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const inventoryRoutes = require('./routes/inventories');
const serveRoutes = require('./routes/serve');

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/inventories', inventoryRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/ad-units', adUnitRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/serve', serveRoutes);

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
      dashboard: 'http://localhost:3000'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Ad Server is running' });
});

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ad-server')
  .then(() => {
    console.log('MongoDB connected');
    // Initialize scheduled jobs after DB connection
    initializeCampaignStatsJob();
  })
  .catch(err => console.log('MongoDB connection error:', err));

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Ad Server backend running on port ${PORT}`);
});
