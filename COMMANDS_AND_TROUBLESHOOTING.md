# 🛠️ Common Commands & Troubleshooting

## Quick Command Reference

### Starting the Project

```bash
# Terminal 1 - MongoDB
mongod

# Terminal 2 - Backend
cd backend
npm install  # First time only
npm run dev

# Terminal 3 - Frontend
cd frontend
npm install  # First time only
npm start
```

### Database Commands

```bash
# Connect to MongoDB
mongosh

# Select database
use ad-server

# View collections
show collections

# View all campaigns
db.campaigns.find().pretty()

# View all ad units
db.adunits.find().pretty()

# Count impressions
db.impressions.countDocuments()

# Count clicks
db.clicks.countDocuments()

# Find campaign by name
db.campaigns.findOne({ name: "Spring Sale 2024" })

# Delete all data
db.campaigns.deleteMany({})
db.adunits.deleteMany({})
db.impressions.deleteMany({})
db.clicks.deleteMany({})

# Exit
exit
```

### Backend Commands

```bash
# Install dependencies
cd backend
npm install

# Run in development mode (with auto-restart)
npm run dev

# Run in production mode
npm start

# Seed sample data
node seed.js

# Check if backend is running
curl http://localhost:5001/health

# View logs
tail -f backend.log
```

### Frontend Commands

```bash
# Install dependencies
cd frontend
npm install

# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test

# Clear cache
rm -rf node_modules package-lock.json
npm install
```

### API Testing with cURL

```bash
# Get all campaigns
curl http://localhost:5001/api/campaigns

# Get specific campaign
curl http://localhost:5001/api/campaigns/CAMPAIGN_ID

# Create campaign
curl -X POST http://localhost:5001/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Campaign",
    "startDate": "2024-01-01",
    "budget": 1000
  }'

# Update campaign
curl -X PUT http://localhost:5001/api/campaigns/CAMPAIGN_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'

# Delete campaign
curl -X DELETE http://localhost:5001/api/campaigns/CAMPAIGN_ID

# Get all ad units
curl http://localhost:5001/api/ad-units

# Create ad unit
curl -X POST http://localhost:5001/api/ad-units \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Banner Ad",
    "campaign": "CAMPAIGN_ID",
    "imageUrl": "https://via.placeholder.com/200",
    "clickUrl": "https://example.com",
    "width": "100%"
  }'

# Record impression
curl -X POST http://localhost:5001/api/tracking/AD_CODE/impression

# Record click
curl -X POST http://localhost:5001/api/tracking/AD_CODE/click

# Get tracking stats
curl "http://localhost:5001/api/tracking/stats?startDate=2024-01-01&endDate=2024-12-31"

# Get campaign stats
curl http://localhost:5001/api/campaigns/CAMPAIGN_ID/stats

# Health check
curl http://localhost:5001/health
```

### Port Management

```bash
# Check what's using port 5001
lsof -i :5001

# Kill process on port 5001
kill -9 PID

# Check what's using port 3000
lsof -i :3000

# Check what's using port 27017 (MongoDB)
lsof -i :27017
```

## 🐛 Troubleshooting Guide

### Issue: "Cannot connect to MongoDB"

**Error**: `MongooseError: Cannot connect to mongodb://localhost:27017/ad-server`

**Solutions**:
```bash
# Check if MongoDB is running
ps aux | grep mongod

# Start MongoDB
mongod

# Or if using Homebrew on Mac
brew services start mongodb-community

# Check MongoDB is listening
lsof -i :27017

# Test connection
mongosh
```

### Issue: "Port 5001 already in use"

**Error**: `Error: listen EADDRINUSE: address already in use :::5001`

**Solutions**:
```bash
# Find what's using port 5001
lsof -i :5001

# Kill the process
kill -9 <PID>

# Or change port in backend/.env
PORT=5001

# Or find and kill by name
killall node
```

### Issue: "Port 3000 already in use"

**Error**: `Something is already running on port 3000`

**Solutions**:
```bash
# Check what's using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use different port
PORT=3001 npm start
```

### Issue: "npm dependencies won't install"

**Error**: `npm ERR! code ERESOLVE, unable to resolve dependency`

**Solutions**:
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and lock file
rm -rf node_modules package-lock.json

# Reinstall
npm install

# Or force resolution
npm install --force
```

### Issue: "Dashboard shows blank page"

**Error**: Dashboard loads but no data shows

**Solutions**:
```bash
# Check backend is running
curl http://localhost:5001/health

# Check frontend environment variable
echo $REACT_APP_API_URL

# Check browser console for errors
# Right-click → Inspect → Console tab

# Check backend logs for errors
# Look at Terminal 2 output

# Verify MongoDB has data
mongosh
use ad-server
db.campaigns.count()
```

### Issue: "Ads not tracking impressions/clicks"

**Error**: Stats not updating

**Solutions**:
```bash
# Check ad code exists
curl http://localhost:5001/api/ad-units | grep adCode

# Try recording impression manually
curl -X POST http://localhost:5001/api/tracking/your-ad-code/impression

# Check MongoDB has records
mongosh
use ad-server
db.impressions.find().limit(1).pretty()

# Check backend logs for errors
```

### Issue: "CORS error when loading ads"

**Error**: `Access to XMLHttpRequest blocked by CORS policy`

**Solutions**:
```bash
# Check CORS_ORIGIN in backend/.env
cat backend/.env | grep CORS

# For local development, should be:
CORS_ORIGIN=http://localhost:3000

# After changing, restart backend:
npm run dev
```

### Issue: "Can't connect to MongoDB cloud"

**Error**: `MongooseError: Cannot connect to mongodb+srv://...`

**Solutions**:
```bash
# Check connection string
cat backend/.env | grep MONGODB

# Verify credentials are correct
# Check MongoDB Atlas IP whitelist
# Allow your IP address

# Test connection locally
mongosh "mongodb+srv://user:pass@cluster.mongodb.net/ad-server"
```

### Issue: "Ad client SDK not loading"

**Error**: Ads show "not found" or 404

**Solutions**:
```bash
# Check SDK is accessible
curl http://localhost:5001/ad-client.js

# Check ad-client.js exists
ls -la ad-client.js

# Add CORS origin for your website domain
curl -X POST http://localhost:5001/api/cors \
  -H "Content-Type: application/json" \
  -d '{"origin": "http://your-website.com"}'

# Or update CORS_ORIGIN in .env
CORS_ORIGIN=http://your-website.com
```

### Issue: "Slow dashboard performance"

**Solutions**:
```bash
# Check MongoDB indexes
mongosh
use ad-server
db.impressions.getIndexes()
db.clicks.getIndexes()

# Rebuild indexes if needed
db.impressions.reIndex()
db.clicks.reIndex()

# Check database size
db.stats()

# Optimize queries - add pagination
# See INSTALLATION_GUIDE.md Performance section
```

## 📊 Monitoring Commands

### Backend Health

```bash
# Check if backend is responsive
curl -i http://localhost:5001/health

# Check API response time
time curl http://localhost:5001/api/campaigns

# Watch backend logs
tail -f backend.log

# Real-time process monitor
top | grep node
```

### Database Health

```bash
# Connect to MongoDB
mongosh

# Check database stats
db.stats()

# Check collection sizes
db.campaigns.stats()
db.adunits.stats()
db.impressions.stats()
db.clicks.stats()

# Check performance
db.setProfilingLevel(1)
db.system.profile.find({millis: {$gt: 100}}).pretty()
```

### Frontend Debugging

```bash
# Check if frontend is running
curl http://localhost:3000

# View source map errors
# Open DevTools → Console → check for errors

# Check React profiling
# Use React DevTools extension

# Monitor network requests
# DevTools → Network tab → check API calls
```

## 🔧 Configuration Troubleshooting

### Verify Configuration

```bash
# Backend configuration
echo "=== Backend Config ==="
cat backend/.env
echo ""
echo "=== Backend Dependencies ==="
cat backend/package.json | grep -A 10 '"dependencies"'

# Frontend configuration
echo "=== Frontend Config ==="
cat frontend/.env
echo ""
echo "=== Frontend Dependencies ==="
cat frontend/package.json | grep -A 10 '"dependencies"'
```

### Reset Everything

```bash
# Stop all services (Ctrl+C in each terminal)

# Clear all data
rm -rf backend/node_modules frontend/node_modules
rm backend/package-lock.json frontend/package-lock.json

# Restart databases
mongosh
db.dropDatabase()
exit

# Reinstall dependencies
cd backend && npm install
cd ../frontend && npm install

# Seed fresh data
cd ../backend && node seed.js

# Start fresh
npm run dev (in backend)
npm start (in frontend)
```

## 📝 Logs to Check

### Backend Logs (Terminal 2)
```
✓ MongoDB connected
✓ Ad Server backend running on port 5001
GET /api/campaigns 200
POST /api/tracking/ad-code/impression 200
```

### Frontend Logs (Terminal 3)
```
Compiled successfully!
webpack compiled
Loaded campaigns: 3
```

### MongoDB Logs
```
mongosh
use ad-server
db.stats()
```

## 🎯 Quick Debugging Checklist

- [ ] MongoDB running? `mongosh` should connect
- [ ] Backend running? `curl localhost:5001/health` returns 200
- [ ] Frontend running? `curl localhost:3000` returns HTML
- [ ] CORS configured? Check `CORS_ORIGIN` in backend/.env
- [ ] Environment vars set? Check `REACT_APP_API_URL` in frontend/.env
- [ ] Data in database? `mongosh → use ad-server → db.campaigns.count()`
- [ ] API responding? `curl http://localhost:5001/api/campaigns`
- [ ] Dashboard loads? Check http://localhost:3000
- [ ] Stats updating? Refresh dashboard, check real-time numbers
- [ ] Ads tracking? Click buttons in TEST_ADS.html, check dashboard

## 💡 Performance Optimization Tips

```bash
# Database query optimization
# Add indexes for frequently queried fields
mongosh
use ad-server
db.impressions.createIndex({ timestamp: -1 })
db.clicks.createIndex({ timestamp: -1 })

# Frontend performance
# Build for production
cd frontend
npm run build

# Backend caching
# Implement Redis for campaign/adunit caching
npm install redis

# Monitor performance
# Check response times
curl -w "@curl-format.txt" http://localhost:5001/api/campaigns
```

## 📞 Getting Help

1. Check this file first
2. Read relevant documentation:
   - README.md - Full reference
   - INSTALLATION_GUIDE.md - Setup details
   - ARCHITECTURE.md - System design
3. Check error messages in terminal
4. Review browser console (F12)
5. Test with cURL before testing in UI
6. Check MongoDB directly: `mongosh`

---

**Most Common Issues**:
1. MongoDB not running - Start with `mongod`
2. Wrong port - Change in `.env` file
3. API not responding - Check backend is running
4. CORS errors - Update `CORS_ORIGIN` in backend/.env
5. Dashboard blank - Check browser console for errors

**Quick Fix Most Issues**:
```bash
# Kill everything
killall node mongod

# Start fresh
mongod &
cd backend && npm run dev &
cd frontend && npm start
```

Good luck! 🚀
