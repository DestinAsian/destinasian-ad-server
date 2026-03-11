# Ad Server Architecture & System Design

## System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                        CLIENT WEBSITES                         │
│  ┌───────────────────┐  ┌──────────────────--─┐                │
│  │   Website 1       │  │   Website 2         │                │
│  │ ┌──────────────┐  │  │ ┌──────────────--┐  │                │
│  │ │ Ad Container │  │  │ │ Ad Container   │  │                │
│  │ │ (100% x 1:1) │  │  │ │(Flexible x 1:1)│  │                │
│  │ └──────────────┘  │  │ └──────────────--┘  │                │
│  └─────────┬─────────┘  └─────────┬────────--─┘                │
│            │                      │                            │
│    ┌───────┴───────┐      ┌───────┴───────┐                    │
│    │ ad-client.js  │      │ ad-client.js  │                    │
│    └───────┬───────┘      └───────┬───────┘                    │
└────────────┼──────────────────────┼────────────────────────────┘
             │                      │
             │   HTTP/JSON          │   HTTP/JSON
             │   Requests           │   Requests
             └──────────┬───────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼──────────────────────────────▼─────────┐
│           EXPRESS.JS BACKEND API               │
│         (http://localhost:5001)                │
│                                                │
│  ┌──────────────┬──────────────┬─────────────┐ │
│  │  Campaigns   │   Ad Units   │  Tracking   │ │
│  │  Routes      │   Routes     │   Routes    │ │
│  └──────────────┴──────────────┴─────────────┘ │
│                      │                         │
│  ┌──────────────┬────┴────┬──────────────────┐ │
│  │ Campaign     │ Ad Unit │ Tracking         │ │
│  │ Controller   │Controller│Controller       │ │
│  └──────────────┴────┬────┴──────────────────┘ │
│                      │                         │
└──────────────────────┼─────────────────────────┘
                       │
                       │ Mongoose ODM
                       │
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼───────────────────────────▼──────┐
│         MONGODB DATABASE                 │
│     (mongodb://localhost:27017)          │
│                                          │
│  ┌──────────┐  ┌─────────┐  ┌─────────┐  │
│  │Campaigns │  │Ad Units │  │ Records │  │
│  │ • name   │  │ • name  │  │         │  │
│  │ • status │  │ • code  │  │-Impress-│  │
│  │ • budget │  │ • width │  │-Clicks  │  │
│  │ • adUnits│  │ • image │  │-User IP │  │
│  │ • clicks │  │ • clicks│  │-Referer │  │
│  └──────────┘  └─────────┘  └─────────┘  │
│                                          │
└──────────────────────────────────────────┘
        ▲
        │ Data
        │ Queries
        │
┌───────┴───────────────────────────────────┐
│         REACT DASHBOARD                   │
│      (http://localhost:3000)              │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ Dashboard Component                 │  │
│  │  ┌──────────┐  ┌────────────────┐   │  │
│  │  │ Sidebar  │  │ Main Content   │   │  │
│  │  │(Campaign │  │ • Campaign     │   │  │
│  │  │  List)   │  │   Stats        │   │  │
│  │  │          │  │ • Ad Unit      │   │  │
│  │  │ • Spring │  │   Cards        │   │  │
│  │  │ • Summer │  │ • Real-time    │   │  │
│  │  │ • Holiday│  │   Updates      │   │  │
│  │  └──────────┘  └────────────────┘   │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  Updates Every 5 Seconds                  │
└───────────────────────────────────────────┘
```

## Data Flow Diagram

### Ad Serving & Tracking Flow

```
┌─────────────────────┐
│  User visits site   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Browser loads ad-client.js         │
│  (ad SDK from backend)              │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  SDK finds [data-ad-code] elements  │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  SDK calls AdServer.loadAd()        │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────┐
│  API: GET /api/ad-units?adCode={code}          │
│  Returns: { imageUrl, clickUrl, width, ... }   │
└──────────┬──────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  SDK inserts image into DOM         │
│  Creates click event listener       │
└──────────┬──────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│  API: POST /api/tracking/{adCode}/impression        │
│  Records: IP, UserAgent, Referrer, Timestamp        │
│  Updates: adUnit.impressions++                      │
└──────────┬───────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  Ad displayed to user                │
│  Waiting for user interaction        │
└──────────┬───────────────────────────┘
           │
           │  (if user clicks)
           ▼
┌───────────────────────────────────────────────────────┐
│  Event: User clicks ad                               │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│  API: POST /api/tracking/{adCode}/click                │
│  Records: IP, UserAgent, Referrer, Timestamp           │
│  Updates: adUnit.clicks++                              │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  SDK opens ad link in new tab        │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  Dashboard auto-refreshes (5s)       │
│  Shows updated stats in real-time    │
└──────────────────────────────────────┘
```

## Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                          │
│                                                              │
│  ┌───────────────┐            ┌──────────────────────┐     │
│  │  Dashboard.js │◄───────────┤  Campaign Selection  │     │
│  │               │            │  (onChange)          │     │
│  └──────┬────────┘            └──────────────────────┘     │
│         │                                                    │
│         ├──► CampaignChart.js ──► API.campaignAPI.getStats()
│         │                                                    │
│         ├──► AdUnitChart.js ──────► Displays Metrics      │
│         │                                                    │
│         └──► AdUnit.js ────────────► Rendering Logic      │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  services/api.js                                      │ │
│  │  • campaignAPI.getAll()                               │ │
│  │  • campaignAPI.getStats()                             │ │
│  │  • adUnitAPI.getByCampaign()                           │ │
│  └───────────────────────────────────────────────────────┘ │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │ Axios HTTP Calls
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
┌───────▼──────────────────────────────────────▼──────┐
│            BACKEND (Express.js)                     │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │  routes/campaigns.js                         │   │
│ │  routes/adUnits.js                           │   │
│ │  routes/tracking.js                          │   │
│ └──────┬───────────────────┬────────────────────┘   │
│        │                   │                         │
│  ┌─────▼────┐        ┌─────▼─────┐          ┌──────┴────┐
│  │ Campaign  │        │  Ad Unit  │          │ Tracking  │
│  │ Controller│        │ Controller│          │Controller │
│  └─────┬────┘        └─────┬─────┘          └──────┬────┘
│        │                   │                       │
│        └───────────────────┼───────────────────────┘
│                            │
└────────────────────────────┼────────────────────────┘
                             │ Mongoose
                             │
            ┌────────────────┴─────────────────┐
            │                                  │
        ┌───▼────────────────────────────────▼──┐
        │     MONGODB                           │
        │  Collections:                         │
        │  • campaigns                          │
        │  • adunits                            │
        │  • impressions                        │
        │  • clicks                             │
        └───────────────────────────────────────┘
```

## Database Schema Relationships

```
┌──────────────────────────┐
│     CAMPAIGNS            │
├──────────────────────────┤
│ _id: ObjectId            │
│ name: String             │
│ description: String      │
│ status: 'active'|...     │
│ startDate: Date          │
│ endDate: Date            │
│ budget: Number           │
│ spent: Number            │
│ adUnits: [ObjectId]◄─────┼─────┐
│ totalImpressions: Number │     │ references
│ totalClicks: Number      │     │
└──────────────────────────┘     │
                                 │
         ┌───────────────────────┘
         │
         ▼
┌──────────────────────────┐
│     AD_UNITS             │
├──────────────────────────┤
│ _id: ObjectId            │
│ name: String             │
│ campaign: ObjectId◄──────┼─────┐ references
│ adCode: String (unique)  │     │
│ width: '100%'|'flexible'  │     │
│ imageUrl: String         │     │
│ clickUrl: String         │     │
│ impressions: Number      │     │
│ clicks: Number           │     │
└──────────────────────────┘     │
         ▲                        │
         │ references            │
         │                       │
         ├───────────────────────┘
         │
┌────────┴──────────────────────────┐
│                                   │
│      ┌──────────────────────┐     │
│      │  IMPRESSIONS         │     │
│      ├──────────────────────┤     │
│      │ _id: ObjectId        │     │
│      │ adUnit: ObjectId ────┼─────┤
│      │ campaign: ObjectId   │     │
│      │ userIp: String       │     │
│      │ userAgent: String    │     │
│      │ referrer: String     │     │
│      │ timestamp: Date      │     │
│      └──────────────────────┘     │
│                                   │
│      ┌──────────────────────┐     │
│      │  CLICKS              │     │
│      ├──────────────────────┤     │
│      │ _id: ObjectId        │     │
│      │ adUnit: ObjectId ────┼─────┘
│      │ campaign: ObjectId   │
│      │ userIp: String       │
│      │ userAgent: String    │
│      │ referrer: String     │
│      │ timestamp: Date      │
│      └──────────────────────┘
└───────────────────────────────────┘
```

## Request/Response Flow Examples

### Creating a Campaign

```
CLIENT BROWSER                  BACKEND API              DATABASE
       │                             │                      │
       ├─ POST /api/campaigns ────►  │                      │
       │  {                          │                      │
       │    "name": "Spring Sale",   │                      │
       │    "budget": 5001           │  save() ────────────►│
       │  }                          │                      │
       │                             │  ◄─────── ObjectId   │
       │                             │                      │
       │  ◄─ 201 Created ────────────┤                      │
       │  {                          │                      │
       │    "_id": "abc123",         │                      │
       │    "name": "Spring Sale",   │                      │
       │    ...                      │                      │
       │  }                          │                      │
       │                             │                      │
```

### Tracking an Impression

```
WEBSITE                        BACKEND                  DATABASE
    │                             │                        │
    ├─ POST /tracking/ad-1/      │                        │
    │   impression ────────────► │                        │
    │                            │ ┌──────────────────┐  │
    │                            │ │ Create record:   │  │
    │                            │ │ • adUnit         │  │
    │                            │ │ • campaign       │  │
    │                            │ │ • IP, UA, ref    │  │
    │                            │ │ • timestamp      │  │
    │                            │ └────────┬─────────┘  │
    │                            │ insert() ────────────►│
    │                            │ ◄───── success        │
    │                            │                       │
    │  ◄──── { success: true } ──┤                       │
    │                            │ increment() ─────────►│
    │                            │ adUnit.impressions++  │
    │                            │                       │
```

## Scalability Architecture (Future)

```
┌────────────────────────────────────────────────┐
│        Load Balancer (Nginx)                   │
└────────────────────────────────────────────────┘
         │              │              │
    ┌────▼─┐        ┌───▼──┐       ┌──▼───┐
    │ API  │        │ API  │       │ API  │
    │ Node │        │ Node │       │ Node │
    │  #1  │        │  #2  │       │  #3  │
    └─┬──┬─┘        └──┬───┘       └──┬───┘
      │  │             │              │
      └──┼─────┬───────┼──────────────┘
         │     │       │
    ┌────▼─────▼───────▼────┐
    │  Redis Cache Layer     │
    │  (Campaign/AdUnit)     │
    └────────┬────────────────┘
             │
    ┌────────▼──────────────┐
    │ MongoDB Replica Set   │
    │ (Primary + Secondaries)
    └───────────────────────┘
```

## Performance Metrics

### Expected Performance
- **Impression Tracking**: < 50ms
- **Click Tracking**: < 50ms
- **Campaign Stats**: < 200ms
- **Dashboard Load**: < 1s
- **Ad Load Time**: < 100ms

### Database Indexes
- `campaigns._id`
- `adunits._id`
- `impressions.timestamp`
- `impressions.adUnit`
- `clicks.timestamp`
- `clicks.adUnit`

---

This comprehensive architecture supports:
- ✅ Real-time ad serving
- ✅ Accurate tracking
- ✅ Fast analytics dashboard
- ✅ Horizontal scaling
- ✅ High availability
- ✅ Distributed load balancing
