# 📂 Project File Structure & Reference

## Complete File Tree

```
destinasian-ad-server/
│
├── 📄 README.md                    # Main documentation
├── 📄 QUICKSTART.md               # Quick start guide (START HERE!)
├── 📄 SETUP_SUMMARY.md            # What was built summary
├── 📄 INSTALLATION_GUIDE.md       # Detailed setup & deployment
├── 📄 ARCHITECTURE.md             # System design & diagrams
├── 📄 TEST_ADS.html               # Interactive testing page
├── 📄 INTEGRATION_EXAMPLE.html    # Integration code examples
├── 📄 ad-client.js                # Client SDK for website embedding
├── 📄 .gitignore                  # Git ignore patterns
│
├── 📁 backend/                    # Express.js Backend
│   ├── 📄 server.js               # Main server & middleware setup
│   ├── 📄 seed.js                 # Database seeding script
│   ├── 📄 package.json            # Backend dependencies
│   ├── 📄 .env.example            # Environment variables template
│   │
│   ├── 📁 models/                 # MongoDB Schemas
│   │   ├── 📄 Campaign.js         # Campaign schema
│   │   ├── 📄 AdUnit.js           # Ad unit schema
│   │   ├── 📄 Impression.js       # Impression tracking schema
│   │   └── 📄 Click.js            # Click tracking schema
│   │
│   ├── 📁 controllers/            # Route Handlers
│   │   ├── 📄 campaignController.js  # Campaign logic
│   │   ├── 📄 adUnitController.js    # Ad unit logic
│   │   └── 📄 trackingController.js  # Tracking logic
│   │
│   ├── 📁 routes/                 # API Routes
│   │   ├── 📄 campaigns.js        # Campaign endpoints
│   │   ├── 📄 adUnits.js          # Ad unit endpoints
│   │   └── 📄 tracking.js         # Tracking endpoints
│   │
│   └── 📁 middleware/             # Custom Middleware (for future)
│
├── 📁 frontend/                   # React Dashboard
│   ├── 📄 package.json            # Frontend dependencies
│   │
│   ├── 📁 public/                 # Static files
│   │   └── 📄 index.html          # HTML entry point
│   │
│   └── 📁 src/                    # React source code
│       ├── 📄 index.js            # React entry point
│       ├── 📄 index.css           # Global styles
│       │
│       ├── 📁 pages/              # Page Components
│       │   └── 📄 Dashboard.js    # Main dashboard page
│       │
│       ├── 📁 components/         # Reusable Components
│       │   ├── 📄 CampaignChart.js   # Campaign stats display
│       │   ├── 📄 AdUnitChart.js     # Ad unit stats display
│       │   └── 📄 AdUnit.js          # Ad display component
│       │
│       ├── 📁 services/           # API Communication
│       │   └── 📄 api.js          # API client (Axios)
│       │
│       └── 📁 styles/             # CSS Styles
│           └── 📄 Dashboard.css   # Dashboard styles
│
└── 📁 node_modules/               # Dependencies (auto-created)
```

## File Descriptions

### Root Level Documentation

| File | Purpose | When to Read |
|------|---------|-------------|
| **QUICKSTART.md** | 3-step quick start | First time setup |
| **README.md** | Complete documentation | Need full reference |
| **SETUP_SUMMARY.md** | What was built overview | Understand project |
| **INSTALLATION_GUIDE.md** | Detailed setup & deployment | Advanced setup |
| **ARCHITECTURE.md** | System design diagrams | Understand architecture |

### Root Level Code Files

| File | Purpose | Usage |
|------|---------|-------|
| **ad-client.js** | Client SDK for websites | Include in your websites |
| **TEST_ADS.html** | Interactive testing | Test locally during dev |
| **INTEGRATION_EXAMPLE.html** | Integration examples | Reference for integration |

### Backend Files

#### Core Files
| File | Purpose | Key Functions |
|------|---------|----------------|
| **server.js** | Express app setup | Database connection, middleware, routes |
| **seed.js** | Sample data creation | `node seed.js` to populate DB |
| **package.json** | Dependencies | npm install, npm run dev |

#### Models (Database Schemas)

| File | Schema | Key Fields |
|------|--------|-----------|
| **Campaign.js** | Campaigns | name, status, budget, adUnits, totalImpressions, totalClicks |
| **AdUnit.js** | Ad Units | name, campaign, adCode, width, imageUrl, clickUrl, impressions, clicks |
| **Impression.js** | Impressions | adUnit, campaign, userIp, userAgent, referrer, timestamp |
| **Click.js** | Clicks | adUnit, campaign, userIp, userAgent, referrer, timestamp |

#### Controllers (Business Logic)

| File | Endpoints | Functions |
|------|-----------|-----------|
| **campaignController.js** | /api/campaigns/* | CRUD operations, stats calculation |
| **adUnitController.js** | /api/ad-units/* | CRUD operations, campaign filtering |
| **trackingController.js** | /api/tracking/* | Record impressions, record clicks, get stats |

#### Routes (API Endpoints)

| File | Base Path | Methods |
|------|-----------|---------|
| **campaigns.js** | /api/campaigns | POST, GET, PUT, DELETE |
| **adUnits.js** | /api/ad-units | POST, GET, PUT, DELETE |
| **tracking.js** | /api/tracking | POST impression, POST click |

### Frontend Files

#### Core Files
| File | Purpose | Key Components |
|------|---------|-----------------|
| **index.js** | React entry point | ReactDOM.render() |
| **index.css** | Global styles | Base font, colors, box-sizing |

#### Pages
| File | Purpose | Features |
|------|---------|----------|
| **Dashboard.js** | Main dashboard | Campaign selection, live stats, ad unit grid |

#### Components
| File | Purpose | Props |
|------|---------|-------|
| **CampaignChart.js** | Campaign stats | campaignId |
| **AdUnitChart.js** | Ad unit stats | adUnit object |
| **AdUnit.js** | Ad display | adUnit, onImpression, onClick |

#### Services
| File | Purpose | Methods |
|------|---------|---------|
| **api.js** | API client | campaignAPI, adUnitAPI, trackingAPI |

#### Styles
| File | Purpose | Classes |
|------|---------|---------|
| **Dashboard.css** | Dashboard styling | dashboard, sidebar, stat-card, etc |

## How Files Work Together

### User Views Dashboard
```
Dashboard.js
  ├── Fetches campaigns from api.js
  ├── Renders CampaignChart.js
  ├── Renders AdUnitChart.js for each ad
  └── Uses Dashboard.css for styling
```

### Website Displays Ad
```
ad-client.js (on website)
  ├── Loads from ad server
  ├── Calls POST /api/tracking/AD_CODE/impression
  ├── Renders image in div
  ├── On click: POST /api/tracking/AD_CODE/click
  └── Opens clickUrl
```

### Backend Processes Request
```
server.js
  ├── Receives request
  ├── Routes to routes/tracking.js
  ├── Calls trackingController.js
  ├── Creates Impression/Click record in Impression.js/Click.js
  ├── Updates AdUnit in models/AdUnit.js
  └── Returns JSON response
```

## File Dependencies

### Backend Dependencies
```
server.js
  ├── requires: express, cors, mongoose
  ├── imports: routes/campaigns.js
  ├── imports: routes/adUnits.js
  └── imports: routes/tracking.js
    
routes/campaigns.js
  └── imports: controllers/campaignController.js
    
controllers/campaignController.js
  ├── imports: models/Campaign.js
  ├── imports: models/Impression.js
  └── imports: models/Click.js
```

### Frontend Dependencies
```
index.js
  └── imports: pages/Dashboard.js

Dashboard.js
  ├── imports: components/CampaignChart.js
  ├── imports: components/AdUnitChart.js
  ├── imports: services/api.js
  └── imports: styles/Dashboard.css

CampaignChart.js
  └── calls: api.js campaignAPI.getStats()

AdUnitChart.js
  └── displays: adUnit prop data
```

## Configuration Files

### .env Files

**backend/.env**
```
PORT=5001
MONGODB_URI=mongodb://localhost:27017/ad-server
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

**frontend/.env**
```
REACT_APP_API_URL=http://localhost:5001/api
```

### package.json Files

**backend/package.json**
- Scripts: `start`, `dev`
- Dependencies: express, mongoose, cors, uuid, dotenv

**frontend/package.json**
- Scripts: `start`, `build`, `test`, `eject`
- Dependencies: react, react-dom, react-router-dom, axios

## Database Files

No physical files - all data stored in MongoDB:
- **Database**: `ad-server`
- **Collections**: `campaigns`, `adunits`, `impressions`, `clicks`

View with: `mongosh` → `use ad-server` → `db.campaigns.find()`

## File Modification Guide

### To Add Campaign Feature
1. Update `backend/models/Campaign.js` - add field
2. Update `backend/controllers/campaignController.js` - add logic
3. Update `frontend/src/components/CampaignChart.js` - display field
4. Update `frontend/src/styles/Dashboard.css` - style if needed

### To Add API Endpoint
1. Create method in `backend/controllers/`
2. Add route in `backend/routes/`
3. Mount route in `backend/server.js`
4. Call from frontend via `frontend/src/services/api.js`

### To Change UI
1. Update `frontend/src/pages/Dashboard.js` - layout
2. Update `frontend/src/components/` - components
3. Update `frontend/src/styles/Dashboard.css` - styles

## Important Paths

| Path | Runs on | Purpose |
|------|---------|---------|
| `backend/server.js` | Node.js | Backend server |
| `frontend/src/index.js` | React | Frontend app |
| `backend/seed.js` | Node.js | Seed database |
| `backend/models/*` | MongoDB | Data schemas |
| `backend/routes/*` | Express | API routes |
| `frontend/src/pages/Dashboard.js` | React | Main UI |

## Testing Files

| File | Purpose | Usage |
|------|---------|-------|
| **TEST_ADS.html** | Manual testing | Open in browser, test locally |
| **INTEGRATION_EXAMPLE.html** | Integration testing | Shows real-world usage |
| **backend/seed.js** | Data seeding | `node seed.js` |

---

**Pro Tip**: Use this reference when:
- Adding new features
- Debugging issues
- Understanding data flow
- Modifying existing code
- Onboarding new developers
