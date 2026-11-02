# Project Overview

## What Is the Decentralized Trust Network?

The **Decentralized Trust Network** is a platform that evaluates open-source developers based on verified contributions, contribution quality, reliability, consistency, community reviews, and trust relationships. It addresses the growing problem of AI-generated code, pull requests, and issues making it difficult to identify genuine, reliable contributors.

### The Problem

AI-powered development tools have made it easy to generate code, pull requests, issues, and other contributions. This creates a flood of content that is difficult to verify for authenticity, quality, or reliability. Open-source projects struggle to distinguish between:

- Real, meaningful contributions
- AI-generated noise
- Low-effort submissions
- Potentially harmful or suspicious code

### The Solution

A trust and reputation platform that evaluates developers based on:

- **Verified contributions** — Pull requests validated against GitHub
- **Contribution quality** — AI-powered analysis of code changes
- **Reliability** — Consistent contribution patterns over time
- **Consistency** — Active participation across multiple months
- **Community validation** — Reviews from other developers or maintainers
- **Trust relationships** — Endorsements from peers who have worked together

### Who Should Use This Platform

- **Open-source maintainers** — Who want to identify reliable contributors
- **Developers** — Who want to showcase their verified contributions and build reputation
- **Reviewers** — Who want to evaluate and review contributions
- **Community members** — Who want to endorse trusted collaborators

---

## System Architecture

```text
Frontend (React + Vite + Tailwind)
        │
        ▼
Express Backend (Node.js + PostgreSQL)
        │
        ├──┬─────────────────────────────────────┐
        ││                                        ││
        ││  API Routes ( /api/v1/ )              ││
        ││  Auth, Users, Profiles, Repos, Contribs││
        ││  Verification, AI, Reputation, Trust   ││
        ││  Reviews, Disputes, Dashboard          ││
        ││                                        ││
        └────▼────────────────────────────────────┘
                │
                ▼
PostgreSQL (Prisma ORM)
        │
        ├──┬────────────────────────────────────┐
        ││  17 Database Models                    ││
        ││  User, Profile, Repository, Contribution││
        ││  Evidence, Verification, AI Analysis   ││
        ││  Reputation, History, Trust, Review    ││
        ││  Dispute, Notification                 ││
        ││                                        ││
        └────────────────────────────────────────┘

┌─────────────────┐      ┌─────────────────┐
│ GitHub API      │      │ AI Service      │
│ (Repository, PR │      │ (Quality/Risk    │
│  metadata, Commits)│   │  Score analysis) │
└─────────────────┘      └─────────────────┘
```

### Data Flow

1. **User registers** → Creates account with username/email/password (bcrypt hashed)
2. **User logs in** → Receives JWT token stored in browser localStorage
3. **User connects GitHub** → Personal access token encrypted and stored per-user
4. **User registers repository** → Backend queries GitHub API to verify repository exists
5. **User submits contribution** → PR URL validated, contribution recorded with status
6. **Verification runs** → GitHub API checks: PR exists, repo matches, contributor identity, PR status, commits
7. **AI analyzes contribution** → Quality score, risk score, similarity/suspicious indicators
8. **Reputation calculated** → Weighted score from quality, reliability, consistency, community, impact
9. **Reviews and disputes** → Community can review or flag contributions
10. **Dashboard displays** → All aggregated statistics and recent activity

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite 5, Tailwind CSS 3, React Router 6, Axios, Lucide React |
| **Backend** | Node.js, Express.js 5, JavaScript ES modules |
| **Database** | PostgreSQL, Prisma ORM |
| **Auth** | JWT (jsonwebtoken), bcrypt password hashing |
| **GitHub** | GitHub REST API, per-user token encryption (AES-256-GCM) |
| **AI** | External AI service via HTTP POST/JSON |
| **Utilities** | Zod validation, Express rate limiting, Helmet security, Winston logging |

### Main Workflows

| Workflow | Steps |
|----------|-------|
| **Register & Login** | Register → Receive JWT → Store token → Authenticated requests |
| **Profile Setup** | Create profile → Add GitHub username → Link contributions |
| **Repository Onboarding** | Register repo → GitHub API verification → Set member roles |
| **Contribution Submission** | Submit PR URL → Status: SUBMITTED → Verification → AI Analysis |
| **Verification** | GitHub checks: PR exists, repo match, contributor identity, PR status, commits |
| **AI Analysis** | Quality score (0-100), risk score (0-100), indicators, explanation |
| **Reputation Calculation** | Weighted: quality 35% + reliability 25% + consistency 15% + community 15% + impact 10% |
| **Trust Network** | Users endorse each other → Requires interaction evidence |
| **Reviews** | Review contributions → Approve/Request changes/Reject → Affects reputation |
| **Disputes** | Report issues → Status: OPEN → UNDER_REVIEW → RESOLVED/REJECTED/APPEALED |

### Current Implementation Status

| Feature | Status |
|---------|--------|
| User registration & login | ✅ Fully implemented |
| Developer profiles | ✅ Fully implemented |
| Repository registration | ✅ Implemented (requires GitHub connection) |
| Contribution submission | ✅ Implemented (requires registered repo) |
| GitHub verification | ✅ Implemented (PR exists, repo match, identity, status, commits) |
| AI analysis | ✅ Implemented (graceful unavailability handling) |
| Reputation engine | ✅ Fully implemented (deterministic, explainable) |
| Trust relationships | ✅ Fully implemented (with interaction evidence) |
| Community reviews | ✅ Fully implemented (self-review prevention) |
| Disputes | ✅ Fully implemented (5-status lifecycle) |
| Dashboard | ✅ Fully implemented (all aggregate stats) |
| Health endpoint | ✅ Fully implemented |

---

## Getting Started

### Prerequisites

| Requirement | Version/Notes |
|-------------|---------------|
| Node.js | Latest LTS version |
| npm | Comes with Node.js |
| PostgreSQL | Running locally or accessible |
| Git | For cloning/forking |

### Quick Clone

```bash
# Clone the repository
git clone https://github.com/your-organization/trust-network.git
cd trust-network

# Or open the existing project
cd /path/to/existing/project
```

### Backend Setup

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Create .env file
cp .env.example .env
# Edit .env with your configuration

# 3. Install PostgreSQL and create database
#    CREATE DATABASE trust_network_dev;

# 4. Generate Prisma client
npx prisma generate

# 5. Run database migrations
npx prisma migrate dev --name init

# 6. Start the backend
npm start
# or: npm run dev
```

### Frontend Setup

```bash
# 1. Install frontend dependencies
cd testing-frontend
npm install

# 2. Configure API base URL
# The .env already has: VITE_API_BASE_URL=http://localhost:3000/api/v1
# Edit if your backend runs on a different port

# 3. Start the frontend
npm run dev
```

### Running Both Servers

```bash
# Terminal 1: Start the backend
cd backend
npm start

# Terminal 2: Start the frontend  
cd testing-frontend
npm run dev
```

### Default URLs

| Service | URL |
|---------|-----|
| Backend API | http://localhost:3000 |
| Backend Health | http://localhost:3000/api/v1/health |
| Frontend | http://localhost:5173 |
| Frontend API Base | http://localhost:3000/api/v1 |

### First-Time Test Flow

1. Start PostgreSQL
2. Start the backend (`cd backend && npm start`)
3. Check health: `curl http://localhost:3000/api/v1/health`
4. Start the frontend (`cd testing-frontend && npm run dev`)
5. Open http://localhost:5173/ in browser
6. Register a new account
7. Log in
8. Navigate dashboard and test available features

---

## API Documentation Summary

The platform exposes REST APIs under `/api/v1/`:

| Module | Key Endpoints |
|----------|--------------|
| **Auth** | POST /register, POST /login, GET /me, POST /logout |
| **Profiles** | POST /, GET /me, GET /:userId, PUT /me |
| **Repositories** | GET /, POST /, GET /:id, PUT /:id, DELETE /:id |
| **Contributions** | GET /, POST /, GET /me, GET /:id, PATCH /:id/status |
| **Verification** | POST /:contributionId, GET /:contributionId |
| **AI** | POST /analyze/:contributionId, GET /results/:contributionId |
| **Reputation** | GET /me, GET /:userId, GET /:userId/breakdown, GET /:userId/history, POST /recalculate/:userId |
| **Trust** | POST /, GET /me, GET /:userId, PATCH /:relationshipId, DELETE /:relationshipId |
| **Reviews** | POST /, GET /me, GET /contribution/:contributionId, PATCH /:reviewId |
| **Disputes** | POST /, GET /me, GET /contribution/:contributionId, PATCH /:id/status |
| **Dashboard** | GET /developer, GET /maintainer, GET /admin, GET /statistics |

Authentication: All private routes require `Authorization: Bearer <jwt>` header.

---

## Project Structure

```
trust-network/
├── backend/                    # Node.js/Express backend
│   ├── src/                    # Source code
│   │   ├── app.js              # Express app setup
│   │   ├── server.js           # Server startup + DB connect
│   │   ├── config/             # Environment, database, GitHub config
│   │   ├── middleware/           # Auth, error handler, rate limiter
│   │   ├── routes/               # All API routes (~30 routes)
│   │   ├── modules/              # Feature modules (auth, profiles, repos, etc.)
│   │   │   ├── auth/             # Registration, login
│   │   │   ├── profiles/         # Profile CRUD
│   │   │   ├── repositories/     # GitHub repo registration
│   │   │   ├── contributions/    # PR submission & lifecycle
│   │   │   ├── verification/     # GitHub evidence checks
│   │   │   ├── ai/               # AI analysis integration
│   │   │   ├── reputation/       # Scoring engine
│   │   │   ├── trust/            # Trust relationships
│   │   │   ├── reviews/          # Community reviews
│   │   │   ├── disputes/         # Issue reporting
│   │   │   ├── users/            # User management
│   │   │   ├── dashboard/        # Aggregated stats
│   │   │   ├── ai/               # AI service client
│   │   │   ├── verification/     # Verification service
│   │   │   ├── trust/            # Trust service
│   │   │   ├── reviews/          # Review service
│   │   │   └── disputes/         # Dispute service
│   │   ├── integrations/         # GitHub client, AI client
│   │   ├── services/             # Business logic
│   │   ├── controllers/          # HTTP layer
│   │   ├── routes/               # Route definitions
│   │   ├── validators/           # Zod validation schemas
│   │   ├── utils/                # Pagination, status utils
│   │   └── prisma/               # Prisma schema + migrations
│   ├── prisma/
│   │   ├── schema.prisma         # 17 database models
│   │   └── migrations/           # 4 applied migrations
│   └── package.json
│
├── testing-frontend/           # React/Vite/Tailwind dashboard
│   ├── src/                    # React components & pages
│   ├── vite.config.js
│   ├── package.json
│   └── .env                    # VITE_API_BASE_URL
│
├── docs/                       # This folder — generated documentation
│   ├── PROJECT_OVERVIEW.md
│   ├── USER_GUIDE.md
│   ├── INSTALLATION_GUIDE.md
│   ├── BACKEND_GUIDE.md
│   ├── DATABASE_GUIDE.md
│   ├── API_DOCUMENTATION.md
│   ├── TROUBLESHOOTING.md
│   └── PROJECT_OVERVIEW.md
│
├── README.md                   # Root project page (create)
├── HACKATHON.md                # Hackathon metadata
├── package.json                # Root package.json
└── .env.example               # Backend environment template
```