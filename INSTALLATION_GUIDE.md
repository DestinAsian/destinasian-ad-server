# Ad Server Deployment & Advanced Usage Guide

## 📦 Installation & Setup

### Step 1: Clone/Navigate to Project
```bash
cd /Users/web1/Sites/destinasian-ad-server
```

### Step 2: Install Backend Dependencies
```bash
cd backend
npm install
# Creates node_modules and installs all packages
```

### Step 3: Install Frontend Dependencies
```bash
cd ../frontend
npm install
# Creates node_modules and installs all packages
```

### Step 4: Configure Environment

**Backend - Create backend/.env:**
```bash
cd ../backend
cp .env.example .env
# Edit .env if needed - defaults work for local development
```

**Frontend - Create frontend/.env:**
> ⚠️ _Make sure the URL does **not** already include `/api` at the end. The client code appends the `/api` segment automatically._
```bash
cd ../frontend
# point to the backend host (base URL only)
echo "REACT_APP_API_URL=http://localhost:5001" > .env
```

### Step 5: Start Services

**Terminal 1 - MongoDB:**
```bash
mongod
```
Runs on `mongodb://localhost:27017`

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
```
Runs on `http://localhost:5001`
Auto-restarts on file changes (via nodemon)

**Terminal 3 - Frontend:**
```bash
cd frontend
npm start
```
Runs on `http://localhost:3000`
Opens browser automatically

### Step 6: Seed Sample Data (Optional)
```bash
cd backend
node seed.js
```
Creates 3 sample campaigns and 5 ad units with test data

## 🎯 Using the Dashboard

### Dashboard Overview
- **URL**: http://localhost:3000
- **Purpose**: View campaigns, ad units, impressions, clicks, and CTR metrics
- **Real-time**: Stats update every 5 seconds automatically

### Navigation
1. **Select Campaign** - Click campaign name in left sidebar
2. **View Stats** - See impressions, clicks, CTR in main area
3. **Browse Ad Units** - See all ads in selected campaign below
4. **Monitor Performance** - Stats update in real-time

### Dashboard Actions
- Click any campaign to switch focus
- Stats automatically refresh every 5 seconds
- Grid layout adapts to screen size
- Mobile responsive on tablets and phones

## 🧪 Testing

### Option 1: Use TEST_ADS.html
```bash
# Open in browser
open TEST_ADS.html
# or visit file:///Users/web1/Sites/destinasian-ad-server/TEST_ADS.html
```

Features:
- 100% width ad examples
- Flexible width ad examples
- Manual impression/click buttons
- Real-time stat updates
- Integration code snippets

### Option 2: Use INTEGRATION_EXAMPLE.html
```bash
open INTEGRATION_EXAMPLE.html
```

Shows:
- Practical integration examples
- Multiple ad placements
- Client SDK usage
- JavaScript API reference

### Option 3: Use cURL
```bash
# Get all campaigns
curl http://localhost:5001/api/campaigns

# Create campaign
curl -X POST http://localhost:5001/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Campaign",
    "startDate": "2024-01-01",
    "budget": 1000
  }'

# Record impression
curl -X POST http://localhost:5001/api/tracking/ad-spring-banner-001/impression

# Record click
curl -X POST http://localhost:5001/api/tracking/ad-spring-banner-001/click

# Get campaign stats
curl http://localhost:5001/api/campaigns/CAMPAIGN_ID/stats
```

## 🔗 API Usage Examples

### Create Campaign
```javascript
const response = await fetch('http://localhost:5001/api/campaigns', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Campaign',
    description: 'Campaign description',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    budget: 5001
  })
});
const campaign = await response.json();
```

### Create Ad Unit
```javascript
const response = await fetch('http://localhost:5001/api/ad-units', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Banner Ad',
    campaign: 'CAMPAIGN_ID_HERE',
    imageUrl: 'https://example.com/ad.jpg',
    clickUrl: 'https://example.com/offer',
    width: '100%'
  })
});
const adUnit = await response.json();
```

### Record Impression & Click
```javascript
// Record impression
fetch('http://localhost:5001/api/tracking/AD_CODE/impression', {
  method: 'POST'
});

// Record click
fetch('http://localhost:5001/api/tracking/AD_CODE/click', {
  method: 'POST'
});
```

### Get Statistics
```javascript
// Campaign stats
const response = await fetch('http://localhost:5001/api/campaigns/CAMPAIGN_ID/stats');
const stats = await response.json();
// { impressions: 1000, clicks: 50, ctr: "5%" }

// Ad unit stats
const response = await fetch('http://localhost:5001/api/ad-units/AD_UNIT_ID/stats');
const stats = await response.json();
// { impressions: 500, clicks: 25, ctr: "5%" }
```

## 🌐 Website Integration

### Simple Integration
```html
<!-- 1. Include SDK -->
<script src="http://localhost:5001/ad-client.js"></script>

<!-- 2. Add ad container -->
<div id="my-ad" data-ad-code="ad-code-here" data-width="100%"></div>

<!-- 3. Load ad -->
<script>
  AdServer.loadAd('my-ad');
</script>
```

### Multiple Ads
```html
<script src="http://localhost:5001/ad-client.js"></script>

<!-- Auto-load all ads with data-ad-code -->
<div data-ad-code="ad-unit-1" data-width="100%"></div>
<div data-ad-code="ad-unit-2" data-width="flexible"></div>
<div data-ad-code="ad-unit-3" data-width="100%"></div>

<script>
  // Runs automatically on page load
  // Or manually call: AdServer.autoLoad();
</script>
```

### Advanced Integration
```html
<script src="http://localhost:5001/ad-client.js"></script>

<div id="ad1"></div>

<script>
  // Load specific ad
  AdServer.loadAd('ad1');

  // Get stats
  const stats = await AdServer.getAdStats('ad-code');
  console.log(stats);
  // { impressions: 100, clicks: 5, ctr: "5%" }

  // Manual impression tracking
  AdServer.recordImpression('ad-code');

  // Manual click tracking
  AdServer.recordClick('ad-code');
</script>
```

## 📊 Database

### MongoDB Connection
- Default: `mongodb://localhost:27017/ad-server`
- Database name: `ad-server`
- Collections: `campaigns`, `adunits`, `impressions`, `clicks`

### View Data in MongoDB
```bash
# Connect to MongoDB
mongo

# Select database
use ad-server

# View collections
show collections

# View campaigns
db.campaigns.find()

# View ad units
db.adunits.find()

# Count impressions
db.impressions.count()

# Count clicks
db.clicks.count()
```

## 🔧 Development

### Project Structure
```
backend/
  ├── models/              # Mongoose schemas
  ├── controllers/         # Route handlers
  ├── routes/             # Express routes
  ├── middleware/         # Custom middleware
  ├── server.js           # Express app
  ├── seed.js            # Database seeding
  └── package.json

frontend/
  ├── src/
  │   ├── components/    # React components
  │   ├── pages/        # Page components
  │   ├── services/     # API calls
  │   ├── styles/       # CSS files
  │   ├── index.js      # Entry point
  │   └── index.css
  ├── public/
  │   └── index.html
  └── package.json
```

### Adding New Features

**Add API Endpoint:**
1. Create controller method in `backend/controllers/`
2. Add route in `backend/routes/`
3. Mount route in `backend/server.js`

**Add Dashboard Component:**
1. Create component in `frontend/src/components/`
2. Import in page component
3. Add styles to `frontend/src/styles/Dashboard.css`

### Code Examples

**Create New Model (e.g., Publisher):**
```javascript
// backend/models/Publisher.js
const publisherSchema = new mongoose.Schema({
  name: String,
  email: String,
  domains: [String],
  campaigns: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' }]
});

module.exports = mongoose.model('Publisher', publisherSchema);
```

**Create New Controller:**
```javascript
// backend/controllers/publisherController.js
const Publisher = require('../models/Publisher');

exports.getAllPublishers = async (req, res) => {
  try {
    const publishers = await Publisher.find();
    res.json(publishers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

## 🚀 Production Deployment

### Environment Variables
Create `.env` file in backend root:
```
PORT=5001
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ad-server
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
```

### Deploy Backend
```bash
# Build
npm install

# Start
npm start
```

### Deploy Frontend
```bash
# Build
npm run build

# Outputs to frontend/build/
# Deploy to: Vercel, Netlify, AWS S3, etc.
```

### Update CORS
Update `CORS_ORIGIN` in backend `.env` to match production domain

### Update API URL
Update `REACT_APP_API_URL` in frontend `.env` to production backend

## 📈 Performance Optimization

### Database Indexing
Already optimized:
- `campaigns._id`
- `adunits._id`
- `impressions.timestamp`
- `clicks.timestamp`

### Caching
- Implement Redis for campaign/adunit caching
- Cache stats for 5-10 seconds
- Clear cache on update

### Frontend Optimization
- Lazy load components
- Implement pagination for large datasets
- Compress images
- Minify CSS/JS

## 🐛 Troubleshooting

### Backend Won't Start
```bash
# Check port 5001 is free
lsof -i :5001

# Check MongoDB
mongod --version
```

### Frontend Won't Load
```bash
# Clear cache
rm -rf node_modules package-lock.json
npm install

# Check API URL
echo $REACT_APP_API_URL
```

### Ads Not Tracking
```bash
# Check ad code exists
curl http://localhost:5001/api/ad-units

# Check tracking endpoint
curl -X POST http://localhost:5001/api/tracking/AD_CODE/impression

# Check MongoDB has data
mongosh
use ad-server
db.impressions.count()
```

## 📝 Logging

### Backend Logs
```bash
# View in terminal where you ran npm run dev
# Includes:
# - API requests
# - Database queries
# - Errors
```

### Database Logs
```bash
# Monitor MongoDB
mongod --logpath /path/to/logfile.log

# Watch collections
watch -n 1 'mongo ad-server --eval "db.impressions.count(); db.clicks.count()"'
```

## 📚 Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [React Documentation](https://react.dev/)
- [Mongoose Documentation](https://mongoosejs.com/)

## 🎓 Learning Resources

- Review `backend/controllers/` for API logic patterns
- Review `frontend/src/pages/Dashboard.js` for React patterns
- Check `backend/models/` for database schema examples
- See `ad-client.js` for JavaScript SDK patterns

## 💬 Support

For issues:
1. Check error messages in terminal
2. Review browser console for client errors
3. Check MongoDB logs
4. Test API endpoints with curl
5. Review README.md and QUICKSTART.md

## ✅ Checklist

- [ ] MongoDB running on port 27017
- [ ] Backend running on port 5001
- [ ] Frontend running on port 3000
- [ ] Dashboard loads at http://localhost:3000
- [ ] Sample data seeded with `node seed.js`
- [ ] TEST_ADS.html tests work
- [ ] API endpoints respond to curl requests
- [ ] Dashboard shows real-time stats
- [ ] Ad clicks/impressions tracking

---

**Ready to go!** Your ad server is fully functional and ready for production.
