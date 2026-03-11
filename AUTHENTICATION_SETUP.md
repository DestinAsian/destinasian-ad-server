# Multiple Account Authentication Setup Guide

## Overview
Your Ad Server now supports multiple user accounts with secure authentication using JWT (JSON Web Tokens). Each user can manage their own campaigns and ad units independently.

## Backend Changes

### New Dependencies Added
```
- bcryptjs: For password hashing
- jsonwebtoken: For JWT token generation and verification
```

### New Files Created

#### 1. User Model (`backend/models/User.js`)
- Email-based authentication
- Password hashing with bcrypt
- Role-based access (admin/user)
- Account status management

#### 2. Auth Controller (`backend/controllers/authController.js`)
Handles three main endpoints:
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Authenticate user and get JWT token
- `GET /api/auth/me` - Get current user info (requires authentication)

#### 3. Auth Middleware (`backend/middleware/auth.js`)
- `protect` - Verifies JWT token and attaches user to request
- `authorize` - Checks user role-based permissions

#### 4. Auth Routes (`backend/routes/auth.js`)
Public routes for registration and login

### Model Updates

#### Campaign Model
- Added `user` field (reference to User)
- Campaigns now belong to specific users
- Only users who created a campaign can access it

#### Ad Unit Model
- Added `user` field (reference to User)
- Ad units now belong to specific users
- Follows same access control as campaigns

### Controller Updates
All campaign and ad unit controllers now:
1. Filter data by the authenticated user's ID
2. Check ownership before allowing updates/deletes
3. Return 403 Forbidden if user doesn't own the resource

### Route Protection
All API routes now require authentication:
```
POST   /api/auth/register         (Public)
POST   /api/auth/login            (Public)
GET    /api/auth/me               (Protected)
GET    /api/campaigns             (Protected - filtered by user)
POST   /api/campaigns             (Protected - assigns to user)
GET    /api/campaigns/:id         (Protected - ownership check)
PUT    /api/campaigns/:id         (Protected - ownership check)
DELETE /api/campaigns/:id         (Protected - ownership check)
GET    /api/campaigns/:id/stats   (Protected - ownership check)
GET    /api/ad-units              (Protected - filtered by user)
POST   /api/ad-units              (Protected - assigns to user)
GET    /api/ad-units/:id          (Protected - ownership check)
PUT    /api/ad-units/:id          (Protected - ownership check)
DELETE /api/ad-units/:id          (Protected - ownership check)
GET    /api/ad-units/:id/stats    (Protected - ownership check)
GET    /api/ad-units/campaign/:id (Protected - filtered by user)
```

## Frontend Changes

### New Components

#### 1. Auth Context (`frontend/src/contexts/AuthContext.js`)
Provides authentication state management:
- `user` - Current authenticated user info
- `token` - JWT authentication token
- `login()` - Authenticate user
- `register()` - Create new account
- `logout()` - Clear authentication
- `isAuthenticated` - Boolean flag

#### 2. Login Page (`frontend/src/pages/Login.js`)
- Email and password input fields
- Error message display
- Redirect to signup page
- Stores authentication token in localStorage

#### 3. Signup Page (`frontend/src/pages/Signup.js`)
- Name, email, and password fields
- Password confirmation validation
- Email validation
- Minimum 6-character password requirement
- Redirect to login page

#### 4. App Component (`frontend/src/App.js`)
Main routing logic:
- Displays login/signup if not authenticated
- Shows dashboard if authenticated
- Displays user welcome message
- Provides logout button with user greeting

### Style Updates

#### Auth.css (`frontend/src/styles/Auth.css`)
- Gradient background with purple theme
- Responsive login/signup card
- Form styling with focus effects
- Error message styling
- Button and link styling

### API Service Updates

#### Axios Interceptors (`frontend/src/services/api.js`)
1. **Request Interceptor**
   - Automatically adds JWT token to every API request header
   - Format: `Authorization: Bearer {token}`

2. **Response Interceptor**
   - Handles 401 (Unauthorized) responses
   - Clears local storage and redirects to login on token expiration

### Storage Management
- Auth token stored in `localStorage.authToken`
- User info stored in `localStorage.user` (JSON)
- Auto-cleared on logout or token expiration

## Setup Instructions

### 1. Backend Setup

#### Install Dependencies
```bash
cd backend
npm install
```

#### Environment Variables
Create a `.env` file in the backend directory:
```
MONGODB_URI=mongodb://localhost:27017/ad-server
PORT=5001
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRE=7d
```

#### Database Migration
Clear existing data (optional):
```bash
# Delete the 'ad-server' database from MongoDB
# This ensures campaigns/ad-units are linked to users
```

#### Start Backend
```bash
npm run dev
```

### 2. Frontend Setup

#### Install Dependencies
```bash
cd frontend
npm install
```

#### Environment Variables
Create a `.env` file in the frontend directory:
```
> **Note:** the frontend will append `/api` automatically, so just use the base host

REACT_APP_API_URL=http://localhost:5001
```

#### Start Frontend
```bash
npm start
```

## Usage Flow

### 1. New User Registration
1. Navigate to the application (localhost:3000)
2. Click "Sign up" link
3. Enter name, email, and password
4. Password must be at least 6 characters
5. Passwords must match
6. Click "Sign Up" button
7. Account is created and you're automatically logged in

### 2. Existing User Login
1. Enter email and password
2. Click "Login" button
3. On successful login, you're redirected to dashboard
4. Dashboard now only shows your campaigns and ad units

### 3. Dashboard Usage
- Create campaigns (assigned to your account)
- Create ad units under your campaigns
- View only your own data
- Cannot access other users' resources
- Click "Logout" to exit account

## Security Features

✅ Password hashing with bcrypt (10 salt rounds)
✅ JWT token-based authentication
✅ Authorization checks on all protected routes
✅ Ownership validation for resource access
✅ Token expiration (7 days by default)
✅ Automatic token refresh capability (can be added)
✅ CORS protection
✅ Secure token storage in localStorage
✅ Auto-logout on token expiration

## API Examples

### Register
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "passwordConfirm": "password123"
  }'
```

### Login
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f123abc456...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

### Get Campaigns (Protected)
```bash
curl -X GET http://localhost:5001/api/campaigns \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Troubleshooting

### "Not authorized to access this route"
- Token may be expired
- Token not being sent in Authorization header
- Try logging in again

### "Not authorized to access this campaign"
- You're trying to access a campaign created by another user
- Users can only manage their own campaigns

### "Email already in use"
- An account with that email already exists
- Use a different email or login with existing account

### Password Hashing Issues
- Ensure bcryptjs is installed: `npm install bcryptjs`
- If passwords still appear plain, clear the database and create new accounts

### Token Not Persisting
- Check browser's localStorage (DevTools > Application > Local Storage)
- Ensure localStorage is not disabled
- Check for incognito/private mode

## Next Steps (Optional Enhancements)

1. **Email Verification**
   - Add email confirmation before account activation

2. **Password Reset**
   - Implement forgot password functionality

3. **Two-Factor Authentication**
   - Add 2FA for enhanced security

4. **OAuth Integration**
   - Allow Google/GitHub login

5. **User Profile Management**
   - Allow users to update their profile

6. **Team Sharing**
   - Allow users to share campaigns with team members

7. **Audit Logs**
   - Track who made changes and when

8. **Rate Limiting**
   - Prevent brute force login attempts

## File Structure Summary

```
backend/
├── controllers/
│   ├── authController.js (NEW)
│   ├── campaignController.js (UPDATED)
│   └── adUnitController.js (UPDATED)
├── middleware/
│   └── auth.js (NEW)
├── models/
│   ├── User.js (NEW)
│   ├── Campaign.js (UPDATED)
│   └── AdUnit.js (UPDATED)
├── routes/
│   ├── auth.js (NEW)
│   ├── campaigns.js (UPDATED)
│   └── adUnits.js (UPDATED)
└── server.js (UPDATED)

frontend/
├── src/
│   ├── contexts/
│   │   └── AuthContext.js (NEW)
│   ├── pages/
│   │   ├── App.js (NEW)
│   │   ├── Login.js (NEW)
│   │   ├── Signup.js (NEW)
│   │   └── Dashboard.js (EXISTING)
│   ├── services/
│   │   └── api.js (UPDATED)
│   ├── styles/
│   │   └── Auth.css (NEW)
│   └── index.js (UPDATED)
```

## Support
For issues or questions about the authentication system, check the API controllers and middleware files for detailed implementation details.
