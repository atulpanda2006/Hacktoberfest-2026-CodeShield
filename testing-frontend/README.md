# Decentralized Trust Network - Testing Frontend

A React + Vite frontend for testing the Decentralized Trust Network backend APIs.

## 📋 Project Overview

This is a **temporary testing frontend** for the Decentralized Trust Network (DTN) backend. It provides a complete user interface for testing all backend APIs including:

- Authentication (login/register)
- Repository management
- Contribution submission and tracking
- Reputation calculation
- Vouch and denouncement system
- Dispute resolution
- Dashboard views

**Important**: This frontend is temporary and will be replaced by a teammate's production frontend. It is fully independent from the backend source code.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/pnpm
- Backend running on `http://localhost:3000/api/v1`
- PostgreSQL database configured for the backend

### Installation

```bash
# 1. Install dependencies
cd testing-frontend
npm install

# 2. Configure environment variables
# The .env file should already exist with:
# VITE_API_BASE_URL=http://localhost:3000/api/v1

# 3. Start the development server
npm run dev
```

### Environment Variables

Create or verify `.env` contains:

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

## 🔐 Authentication

The frontend uses JWT authentication with the `ttn_access_token` stored in `localStorage`.

### Login

- Navigate to `/login`
- Enter email and password
- Use credentials from seeded accounts (password: `Password123`):
  - `ada@trustnet.dev` / `ada` (Developer)
  - `linus@trustnet.dev` / `linus` (Developer)
  - `grace@trustnet.dev` / `grace` (Developer)
  - `maya@trustnet.dev` / `maya` (Maintainer)
  - `raj@trustnet.dev` / `raj` (Reviewer)
  - `admin@trustnet.dev` / `admin` (Admin)

### Registration

- Navigate to `/register`
- Provide username, email, and password
- New accounts start as Developer role

### Session Persistence

- Token is stored in `localStorage` under key `ttn_access_token`
- User profile stored under key `ttn_user`
- Token is automatically attached to all API requests via Axios interceptor
- 401 responses clear the session and redirect to `/login`

## 📱 Pages and Functionality

### Dashboard (`/`)

Displays:
- Reputation score / 100
- Contribution counts (total, verified, pending)
- Active repositories
- Recent contributions
- Trust relationships (given/received)
- Quick links to other pages

### Login (`/login`)

- Email and password fields
- Login button
- Validation and server error handling
- Redirect to dashboard on success

### Register (`/register`)

- Username, email, and password fields
- Client-side validation
- Calls `/api/v1/auth/register` endpoint
- Redirect to dashboard on success

### Profile (`/profile`)

- Developer profile display (fullName, bio, GitHub username)
- Edit profile functionality
- GitHub profile link
- Skills and experience level display
- Contribution statistics

### Repositories (`/repositories`)

- List registered repositories with pagination
- Search and filter by language/visibility
- Repository details view
- Register new repository (requires GitHub connection)
- View repository members and contributions

### Contributions (`/contributions`)

- List contributions with filters by status and type
- Submit new contribution (requires linked GitHub username)
- View contribution details including evidence, reviews, AI analysis
- Filter by status: SUBMITTED, VERIFIED, REJECTED, DISPUTED, etc.
- View contributions by repository or by user

### Reputation (`/reputation`)

- Overall reputation score / 100
- Score breakdown: quality, reliability, consistency, community
- Reputation history/timeline
- Recalculate button to trigger reputation recalculation
- Evidence summary

### Reviews (`/reviews`)

- List reviews written by the authenticated user
- View reviews for specific contributions
- Submit a review (requires REVIEWER/MAINTAINER/ADMIN role)
- Update own review

### Disputes (`/disputes`)

- List disputes filed by the authenticated user
- View disputes for specific contributions
- File a dispute (contributor cannot dispute their own contribution)
- View dispute details and status
- Statuses: OPEN, UNDER_REVIEW, RESOLVED, REJECTED

## 🧪 Testing the Backend Integration

All API calls go through the centralized Axios instance at `src/services/api.js`. The base URL is configured via `VITE_API_BASE_URL` environment variable.

### API Contract

The backend follows this contract:

- **Base path**: `/api/v1`
- **Auth**: `Authorization: Bearer <jwt>` header
- **Success response**: `{ success: true, message, data }`
- **Error response**: `{ success: false, message, errors?: [{ field, message }] }`

### Key API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/auth/register` | POST | Register new user |
| `/auth/login` | POST | Authenticate and get JWT |
| `/auth/me` | GET | Get current user |
| `/repositories` | GET/POST | List/create repositories |
| `/contributions` | GET/POST | List/create contributions |
| `/reputation/me` | GET | Get own reputation |
| `/dashboard/developer` | GET | Developer dashboard |
| `/dashboard/maintainer` | GET | Maintainer dashboard |
| `/dashboard/admin` | GET | Admin dashboard |
| `/vouch/check` | POST | Check vouch status |
| `/vouch/add` | POST | Add a vouch |
| `/vouch/remove` | POST | Denounce a user |
| `/disputes` | GET/POST | List/create disputes |
| `/reviews` | GET/POST | List/create reviews |
| `/trust` | GET/POST | Trust relationships |

## 👥 User Roles

The system supports these roles with different capabilities:

- **Developer**: Submit contributions, view reputation, manage profile
- **Maintainer**: Manage repositories, review contributions
- **Reviewer**: Write reviews, check vouch status
- **Admin**: Full platform access, manage all data

## 🔧 Development

### Running the Frontend

```bash
cd testing-frontend
npm run dev
```

### Running the Backend

```bash
cd backend
node src/server.js
```

### Testing API Endpoints

Use the provided test scripts or `curl` commands:

```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@trustnet.dev","password":"Password123"}'

# Get reputation
TOKEN=$(curl -s -X POST ... | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/reputation/me
```

### Seed Data

The backend seed data is already populated. To reset:

```bash
cd backend
npm run prisma:seed
```

## 📦 Frontend Structure

```
testing-frontend/
├── public/                    # Static assets
├── src/
│   ├── components/            # Reusable UI components
│   │   ├── Navbar.jsx         # Top navigation with auth state
│   │   ├── Sidebar.jsx        # Left sidebar navigation
│   │   ├── Loading.jsx        # Loading spinner component
│   │   └── ui.jsx            # UI primitives (Alert, Field, Spinner, etc.)
│   │
│   ├── context/               # React Context (AuthContext)
│   │   └── AuthContext.jsx    # JWT auth state management
│   │
│   ├── pages/                 # Page components
│   │   ├── Login.jsx          # Authentication login
│   │   ├── Register.jsx       # User registration
│   │   ├── Dashboard.jsx      # Main dashboard
│   │   ├── Profile.jsx        # Developer profile
│   │   ├── Repositories.jsx   # Repository management
│   │   ├── Contributions.jsx  # Contribution tracking
│   │   ├── Reputation.jsx     # Reputation dashboard
│   │   ├── Reviews.jsx        # Review management
│   │   └── Disputes.jsx       # Dispute resolution
│   │
│   ├── services/              # API services
│   │   └── api.js             # Centralized Axios instance
│   │
│   ├── App.jsx                # Root component with routing
│   ├── main.jsx               # Application entry point
│   └── index.css              # Tailwind CSS base styles
│
├── .env.example               # Environment variable template
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## 🛠️ Technology Stack

- **React** - UI library
- **Vite** - Development server and build tool
- **React Router DOM** - Client-side routing
- **Axios** - HTTP client for API calls
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library
- **Recharts** - Data visualization (used in reputation dashboard)

## 🔒 Security Notes

- Never store GitHub PATs or AI API keys in the frontend
- All authentication is JWT-based; tokens are stored in `localStorage`
- 401 responses automatically clear the session and redirect to login
- Role-based access is enforced by the backend; frontend should not trust client-side role checks
- CORS is configured to allow `http://localhost:5173`

## 🐛 Known Issues and Limitations

1. **GitHub API rate limits**: Without a valid PAT, GitHub limits unauthenticated requests to 60/hr. The backend gracefully degrades when the token is unavailable.

2. **Repository registration**: Users must have a linked GitHub username in their developer profile and must own or maintain the repository on GitHub.

3. **AI analysis**: Requires an AI service running at the configured URL. Graceful error state displayed if unavailable.

4. **Dispute system**: Contributors cannot dispute their own contributions; must use an appeal mechanism instead.

5. **Vouch system**: Uses flat `.td` file format for trust records. File persistence is a setup task.

## 📄 License

This project is part of the Decentralized Trust Network platform. See the backend README for full licensing information.