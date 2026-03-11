# Ad Server - Complete Documentation

## Overview
A full-stack ad server similar to Google Ad Manager with a dashboard for tracking impressions and clicks. Features flexible/100% width ad units with 1:1 aspect ratio.

## Project Structure

```
destinasian-ad-server/
├── backend/                 # Node.js/Express API
│   ├── models/             # MongoDB schemas
│   ├── controllers/        # Route controllers
│   ├── routes/            # API routes
│   ├── server.js          # Main server file
│   └── package.json
├── frontend/              # React Dashboard
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API services
│   │   ├── styles/      # CSS styles
│   │   └── index.js
│   └── package.json
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js (v14+)
- MongoDB (running locally or cloud)
- npm or yarn

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backend
   npm install
   ```

2. Create `.env` file:
   ```
   PORT=5001
   MONGODB_URI=mongodb://localhost:27017/ad-server
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:3000
   ```

3. Start the backend:
   ```bash
   npm run dev
   ```
   Backend runs on `http://localhost:5001`

### Frontend Setup

1. Navigate to frontend directory:
   ```bash
   cd frontend
   npm install
   ```

2. Create `.env` file:
   ```
   REACT_APP_API_URL=http://localhost:5001/api
   ```

3. Start the frontend:
   ```bash
   npm start
   ```
   Dashboard runs on `http://localhost:3000`

## API Endpoints

### Campaigns
- `GET /api/campaigns` - Get all campaigns
- `POST /api/campaigns` - Create campaign
- `GET /api/campaigns/:id` - Get campaign
- `PUT /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete campaign
- `GET /api/campaigns/:id/stats` - Get campaign stats

### Ad Units
- `GET /api/ad-units` - Get all ad units
- `POST /api/ad-units` - Create ad unit
- `GET /api/ad-units/:id` - Get ad unit
- `PUT /api/ad-units/:id` - Update ad unit
- `DELETE /api/ad-units/:id` - Delete ad unit
- `GET /api/ad-units/:id/stats` - Get ad unit stats
- `GET /api/ad-units/campaign/:campaignId` - Get ad units by campaign

### Tracking
- `POST /api/tracking/:adUnitId/impression` - Record impression
- `POST /api/tracking/:adUnitId/click` - Record click
- `GET /api/tracking/stats` - Get tracking stats

## Database Models

### Campaign
```javascript
{
  name: String,
  description: String,
  status: 'active' | 'paused' | 'ended',
  startDate: Date,
  endDate: Date,
  budget: Number,
  spent: Number,
  adUnits: [ObjectId],
  totalImpressions: Number,
  totalClicks: Number
}
```

### AdUnit
```javascript
{
  name: String,
  description: String,
  campaign: ObjectId,
  adCode: String (unique),
  width: 'flexible' | '100%',
  aspectRatio: '1:1',
  imageUrl: String,
  clickUrl: String,
  status: 'active' | 'paused',
  impressions: Number,
  clicks: Number
}
```

### Impression
```javascript
{
  adUnit: ObjectId,
  campaign: ObjectId,
  userIp: String,
  userAgent: String,
  referrer: String,
  timestamp: Date
}
```

### Click
```javascript
{
  adUnit: ObjectId,
  campaign: ObjectId,
  userIp: String,
  userAgent: String,
  referrer: String,
  timestamp: Date
}
```

## Dashboard Features

1. **Campaign Overview**
   - List of all campaigns with status
   - Real-time impressions and clicks tracking
   - CTR calculation

2. **Ad Unit Analytics**
   - Individual ad unit performance
   - Impressions and clicks per ad unit
   - Click-through rate (CTR) per ad unit

3. **Responsive Design**
   - Mobile-friendly interface
   - Real-time stat updates (5-second refresh)
   - Sidebar navigation

## Ad Unit Integration

### Embedding Ad Units in Your Website

Include the ad unit component in your website:

```html
<script>
  async function loadAd(adUnitId) {
    // Record impression
    await fetch(`http://localhost:5001/api/tracking/${adUnitId}/impression`, {
      method: 'POST'
    });

    // Display ad with click tracking
    const adImage = document.querySelector(`[data-ad-unit="${adUnitId}"]`);
    if (adImage) {
      adImage.addEventListener('click', async () => {
        await fetch(`http://localhost:5001/api/tracking/${adUnitId}/click`, {
          method: 'POST'
        });
      });
    }
  }
</script>

<div data-ad-unit="ad-code-here" style="width: 100%; aspect-ratio: 1;">
  <img id="ad-image" src="..." />
</div>

<script>
  loadAd('ad-code-here');
</script>
```

## Ad Unit Sizes
- **Width**: Flexible (100%) or 100% of container
- **Aspect Ratio**: 1:1 (Square)
- **Responsive**: Maintains aspect ratio on all screen sizes

## Features

✅ Campaign Management
✅ Ad Unit Creation & Management
✅ Real-time Impression Tracking
✅ Real-time Click Tracking
✅ Analytics Dashboard
✅ CTR Calculation
✅ Responsive Design
✅ Ad Unit Code Generation
✅ Campaign Statistics
✅ Ad Unit Statistics

## Running the Project

### Terminal 1 - Backend
```bash
cd backend
npm install
npm run dev
```

### Terminal 2 - Frontend
```bash
cd frontend
npm install
npm start
```

### Terminal 3 - MongoDB (if running locally)
```bash
mongod
```

## Example Usage

### Creating a Campaign
```bash
curl -X POST http://localhost:5001/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Spring Sale 2024",
    "description": "Spring promotion campaign",
    "startDate": "2024-01-01",
    "endDate": "2024-03-31",
    "budget": 5001
  }'
```

### Creating an Ad Unit
```bash
curl -X POST http://localhost:5001/api/ad-units \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Banner Ad 1",
    "campaign": "campaign-id-here",
    "imageUrl": "https://example.com/banner.jpg",
    "clickUrl": "https://example.com/offer",
    "width": "100%"
  }'
```

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running: `mongod`
- Check MONGODB_URI in .env

### CORS Error
- Verify CORS_ORIGIN matches frontend URL
- Check backend is running on correct port

### Dashboard Not Loading Data
- Verify backend API is running
- Check browser console for errors
- Confirm campaigns exist in database

## Future Enhancements

- User authentication & authorization
- Multiple publisher support
- Advanced reporting & analytics
- Ad creative management
- Budget tracking & alerts
- A/B testing framework
- Contextual ad targeting
- Real-time bidding integration
