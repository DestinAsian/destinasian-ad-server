# Ad Server Setup - Quick Start

## What You Just Built

A complete ad server system similar to Google Ad Manager with:

✅ **Backend API** - Node.js/Express with MongoDB
✅ **Analytics Dashboard** - React frontend with real-time stats
✅ **Ad Unit System** - 100% width or flexible, 1:1 aspect ratio
✅ **Tracking System** - Impressions & clicks tracking
✅ **Campaign Management** - Create, manage, track campaigns
✅ **Ad Unit Management** - Create, manage individual ad units

## Quick Start (3 Steps)

### 1. Terminal 1 - Start MongoDB
```bash
mongod
```

### 2. Terminal 2 - Start Backend
```bash
cd backend
npm install
npm run dev
```
Backend: http://localhost:5001

### 3. Terminal 3 - Start Frontend
```bash
cd frontend
npm install
npm start
```
Dashboard: http://localhost:3000

## First Steps

1. **Open Dashboard** at http://localhost:3000
2. **Test Ad Integration** at [TEST_ADS.html](TEST_ADS.html)
   - Open in browser to see ad units
   - Click buttons to record impressions/clicks
   - Watch stats update in real-time

3. **Create Your First Campaign**
   - Use API or dashboard
   - Dashboard will auto-refresh

## API Examples

### Create Campaign
```bash
curl -X POST http://localhost:5001/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Campaign",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "budget": 1000
  }'
```

### Create Ad Unit
```bash
curl -X POST http://localhost:5001/api/ad-units \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Banner Ad",
    "campaign": "CAMPAIGN_ID_HERE",
    "imageUrl": "https://via.placeholder.com/200",
    "clickUrl": "https://example.com",
    "width": "100%"
  }'
```

### Track Impression
```bash
curl -X POST http://localhost:5001/api/tracking/AD_CODE_HERE/impression
```

### Track Click
```bash
curl -X POST http://localhost:5001/api/tracking/AD_CODE_HERE/click
```

## Dashboard Features

- **Campaign Sidebar** - Select and switch between campaigns
- **Real-time Stats** - Impressions, clicks, CTR updates every 5 seconds
- **Ad Unit Cards** - See performance of each ad unit
- **Responsive Design** - Works on desktop, tablet, mobile

## Project Structure

```
backend/
  ├── models/         # MongoDB schemas
  ├── controllers/    # Business logic
  ├── routes/         # API routes
  ├── server.js       # Main server
  └── package.json

frontend/
  ├── src/
  │   ├── components/  # React components
  │   ├── pages/      # Pages
  │   ├── services/   # API calls
  │   └── styles/     # CSS
  ├── public/
  └── package.json
```

## Key Files

- **Backend Entry**: `backend/server.js`
- **Frontend Entry**: `frontend/src/index.js`
- **Database Models**: `backend/models/`
- **API Routes**: `backend/routes/`
- **Dashboard Page**: `frontend/src/pages/Dashboard.js`

## Configuration

### Backend (.env)
```
PORT=5001
MONGODB_URI=mongodb://localhost:27017/ad-server
CORS_ORIGIN=http://localhost:3000
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:5001/api
```

## Troubleshooting

**MongoDB Error**: Make sure `mongod` is running
**Port Already in Use**: Change PORT in .env
**CORS Error**: Check CORS_ORIGIN matches frontend URL
**Dashboard Not Loading**: Verify backend is running

## Next Steps

1. ✅ Set up and run the project
2. ✅ Test with TEST_ADS.html
3. ✅ Create campaigns in dashboard
4. ✅ Create ad units
5. ✅ Integrate ads into your website
6. ✅ Monitor impressions and clicks in dashboard

## Support

Check [README.md](README.md) for complete documentation
See [TEST_ADS.html](TEST_ADS.html) for integration examples
