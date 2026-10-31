# Decentralized Trust Network for Open Source Contributions — Backend

Node.js + Express.js + PostgreSQL + Prisma backend for a transparent, portable
trust and reputation network for open-source contributions.

The system records developer profiles, GitHub-verified repositories and
contributions, evidence-backed verification, AI quality assessments, community
reviews, disputes, and an explainable reputation score.

> "Decentralized" is a product goal. The backend is intentionally a single
> centralized, auditable service for now; the data model keeps every score
> decomposition and history row so it can be exported or federated later. No
> blockchain is used.

---

## 1. Status

| Module | Scope | Status |
|---|---|---|
| 1 | Foundation, PostgreSQL, Prisma, health check, error handling | Done |
| 2 | Auth (register/login/JWT/RBAC), user management | Done |
| 3 | Developer profiles + contribution statistics | Done |
| 4 | GitHub client + repository management & members | Done |
| 5 | Contribution submission, history, status state machine | Done |
| 6 | Verification: PR/commit evidence, identity & repo checks | Done |
| 7 | AI integration: request, validate, store, retries, timeouts | Done |
| 8 | Trust & reputation engine (explainable, auditable, idempotent) | Done |
| 9 | Trust relationships between developers | Done |
| 10 | Community reviews | Done |
| 11 | Disputes and resolution | Done |
| 12 | Dashboard APIs, OpenAPI docs | Done |

**Tests:** 173 automated tests across 13 suites (`npm test`), plus a live
end-to-end smoke run against PostgreSQL (18/18 checks).

---

## 2. Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env     # then set DATABASE_URL and JWT_SECRET

# 3. Create the database (example)
createdb trust_network_dev

# 4. Apply migrations and generate the client
npm run prisma:migrate:deploy
npm run prisma:generate

# 5. Run
npm run dev              # nodemon
npm start                # plain node
```

Health check: `GET http://localhost:3000/api/v1/health`

> `prisma migrate dev` is interactive and needs a TTY. In non-interactive shells
> use `prisma migrate deploy` (also the deployment command).

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | no | `development` \| `test` \| `production` |
| `PORT` | no | HTTP port (default 3000) |
| `DATABASE_URL` | **yes** | PostgreSQL connection string |
| `JWT_SECRET` | **yes in production** | Token signing key |
| `JWT_EXPIRES_IN` | no | Default `24h` |
| `GITHUB_TOKEN` | no | **Optional.** Only used for anonymous public reads. User-specific actions always use each user's own token. |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | **yes** | AES-256-GCM key for per-user GitHub tokens. `openssl rand -hex 32` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | no | Enable the optional GitHub OAuth flow |
| `GITHUB_CALLBACK_URL` | no | Default `http://localhost:3000/api/v1/github/oauth/callback` |
| `FRONTEND_URL` | no | Where the OAuth callback redirects, default `http://localhost:5173` |
| `GITHUB_API_BASE_URL` | no | Default `https://api.github.com` |
| `GITHUB_TIMEOUT_MS` | no | Default 10000 |
| `AI_SERVICE_URL` | yes for Module 7 | Base URL of the AI service (`…/analyze` is appended) |
| `AI_SERVICE_TIMEOUT` | no | Per-attempt timeout, default 30000 ms |
| `AI_MAX_RETRIES` | no | Default 2 |
| `AI_RETRY_BASE_DELAY_MS` | no | Exponential backoff base, default 500 |
| `AI_MAX_COMMITS` | no | Commits sent per analysis, default 100 |
| `CORS_ORIGIN` | no | Frontend origin, default `http://localhost:5173` |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | no | Global limiter, default 15 min / 100 |
| `LOG_LEVEL` | no | Winston level |

Never commit `.env`. `.gitignore` already excludes it.

### Seed data (no GitHub token needed)

```bash
npm run prisma:seed      # prisma db seed -> node prisma/seed.js
```

[prisma/seed.js](prisma/seed.js) writes a small but realistic dataset directly,
so nothing depends on GitHub, the AI service or the network: 3 repositories,
10 contributions across every status, 7 AI analyses, 34 evidence rows, review
history, 2 disputes and 5 trust relationships. Reputation is **not** hard-coded —
each developer's score and history rows are produced by the real
`ReputationService`, so they match [docs/REPUTATION.md](docs/REPUTATION.md).

| Account | Password | Role | Seeded activity |
|---|---|---|---|
| `ada@trustnet.dev` | `Password123` | DEVELOPER | 3 contributions (approved, verified, rejected) |
| `linus@trustnet.dev` | `Password123` | DEVELOPER | 3 contributions, filed a dispute |
| `grace@trustnet.dev` | `Password123` | DEVELOPER | 4 contributions incl. a live contribution with no evidence yet |
| `maya@trustnet.dev` | `Password123` | MAINTAINER | owns two repositories, reviews |
| `raj@trustnet.dev` | `Password123` | REVIEWER | reviews and a resolved dispute |
| `admin@trustnet.dev` | `Password123` | ADMIN | admin dashboard |

The script is idempotent: it deletes and recreates only the six seed accounts and
the three seeded repositories, then recalculates. Safe to re-run at any time; it
never touches other users' data. Use it for the testing frontend or manual API
testing, not for production.

### Per-user GitHub connection

There is **no shared or hard-coded user token**. Every account connects its own
GitHub credentials from **Profile → GitHub connection** in the UI, and that
account's token is used for every user-specific GitHub call (registering a
repository, checking collaborator permission, verifying a pull request).

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/v1/github/connection` | user | Connection status, live token check, remaining API quota |
| `POST /api/v1/github/connection` | user | Connect/rotate a personal access token (`{ "token": "…" }`) |
| `DELETE /api/v1/github/connection` | user | Delete the stored credentials |
| `GET /api/v1/github/oauth/start` | user | GitHub OAuth authorize URL (only when OAuth env vars are set) |
| `GET /api/v1/github/oauth/callback` | public | OAuth callback, redirects to `FRONTEND_URL/profile?github=…` |

How a token is stored:

1. The backend validates it with `GET https://api.github.com/user`.
2. It is encrypted with **AES-256-GCM** (`v1.<iv>.<tag>.<ciphertext>`) using
   `GITHUB_TOKEN_ENCRYPTION_KEY` and written to `github_accounts`.
3. Responses only ever contain the login, avatar, scopes, timestamps and quota —
   never the token. Tokens are never written to localStorage or logs.
4. A GitHub account can belong to exactly one DTN user (`github_username` is unique).

Registering a repository now requires a connected account: the backend fetches
the repository with *your* token, treats you as `OWNER` when you are the
repository owner, and asks GitHub for your collaborator permission otherwise.
Users without a connection get a clear `Connect your GitHub account in Profile →
GitHub connection…` error instead of a misleading authorization failure.

---

## 3. Architecture

```
backend/
├── prisma/                 schema.prisma, migrations/
├── src/
│   ├── server.js           bootstrap + graceful shutdown
│   ├── app.js              express app + route mounting
│   ├── config/             env, database (Prisma), github
│   ├── middleware/         auth, error handler, rate limiting, param validation
│   ├── validators/         shared query validation
│   ├── utils/              AppError, ApiResponse, logger, pagination, status machine
│   ├── integrations/
│   │   ├── github/         REST client, normalizers, error mapping
│   │   └── ai/             HTTP client, response schema
│   └── modules/<domain>/
│       ├── routes/         endpoints
│       ├── controllers/    HTTP only
│       ├── services/       business logic
│       └── validators/     Zod schemas
└── tests/                  unit/ and integration/ (Jest + Supertest)
```

Layering rules used throughout:

- **Routes** declare endpoints and middleware chains.
- **Controllers** translate HTTP ↔ service calls; no business logic.
- **Services** own business rules, transactions, and cross-module orchestration.
- **Integrations** isolate external systems (GitHub, AI) behind typed errors.
- **Prisma** is the only database access path.

`src/repositories/` exists for future query abstraction but is unused: Prisma
already provides a clean data-access layer, and introducing a second abstraction
would add indirection without a requirement.

### Error contract

Every failure returns the same envelope:

```json
{ "success": false, "message": "Validation failed", "errors": [{ "field": "email", "message": "Invalid email format" }] }
```

Prisma `P2002`/`P2025` map to 409/404; Zod errors map to 400; operational
`AppError`s keep their status; unknown errors return 500 and never leak stack
traces in production.

---

## 4. Integration guides

- **Frontend:** [`docs/API.md`](docs/API.md) — endpoint-by-endpoint contracts.
- **OpenAPI:** [`docs/openapi.yaml`](docs/openapi.yaml) (OpenAPI 3.1).
- **AI developer:** [`docs/AI_CONTRACT.md`](docs/AI_CONTRACT.md) — request/response
  schema, timeouts, retries, validation, error handling.
- **Reputation:** [`docs/REPUTATION.md`](docs/REPUTATION.md) — formula, weights,
  anti-abuse rules, worked examples.

### The contribution workflow implemented

1. Register → 2. Login → 3. Link GitHub username in profile → 4. Register a
GitHub repository (verified against GitHub, ownership checked) → 5. Submit a PR
URL/number → 6. Verify against GitHub (evidence stored) → 7. AI analysis →
8. Community review → 9. Maintainer decision → 10. Reputation recalculated with
an audit row in `reputation_history`.

Reputation is never changed directly by AI output, a dispute being filed, or a
contributor's own action. Only verified evidence, authorized review outcomes and
documented dispute resolutions feed the engine.

---

## 5. Security notes

- bcrypt password hashing; hashes never leave the service (`select` projections).
- JWT auth; `authenticate` re-loads the user and rejects inactive accounts.
- Role based access control plus **resource-level** checks (repository
  ownership/maintainer membership, review authorship, dispute involvement).
- Zod validation on bodies, queries and route params (malformed UUIDs → 400).
- Helmet, CORS allow-list, global + auth rate limiting.
- Parameterized queries via Prisma (no string-built SQL).
- External calls have hard timeouts; GitHub/AI failures are surfaced as 503/502
  and never fabricate data.
- Multi-record writes run in `prisma.$transaction`.
- Duplicate protection at the database level: unique `(repository_id,
  github_pr_number)`, `(contribution_id, reviewer_id)`, `(source_user_id,
  target_user_id)`, `(contribution_id, evidence_type, external_reference)`.

---

## 6. Testing

```bash
npm test                  # all suites
npm run test:unit         # reputation engine (pure functions)
npm run test:integration  # API tests with a mocked Prisma client
```

Integration tests never touch a real database: `tests/helpers/mockPrisma.js`
provides a deep Prisma mock, and `tests/helpers/auth.js` issues real JWTs. No
destructive test can reach the development database.

For a live database with data, run `npm run prisma:seed` (see
[Seed data](#seed-data-no-github-token-needed)).

---

## 7. Known limitations / next steps

- **Each user must connect their own GitHub account** before registering
  repositories (`Profile → GitHub connection`). Anonymous public reads fall back
  to the optional `GITHUB_TOKEN` (60 req/h without it); authenticated user reads
  use the caller's token and get that user's 5000 req/h quota.
- Tokens are stateless JWTs: logout is client-side. Add a revocation list if
  server-side logout is required.
- GitHub **OAuth** is implemented but only enabled when `GITHUB_CLIENT_ID` and
  `GITHUB_CLIENT_SECRET` are configured; otherwise the personal-access-token flow
  is used. Either way the token is validated against `GET /user` before storage.
- `diff` sent to the AI service contains aggregate stats only (no source code),
  keeping storage and privacy footprint small.
- Notifications table exists but no notification endpoints are exposed yet.
- No OpenAPI UI is served; the spec file is provided for Swagger UI/Redoc.
