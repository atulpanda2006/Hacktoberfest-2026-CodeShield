# API Reference (v1)

Base URL: `http://localhost:3000/api/v1`
Machine-readable spec: [`openapi.yaml`](openapi.yaml)

## Conventions

**Authentication** — `Authorization: Bearer <jwt>` for private endpoints.

**Success envelope**

```json
{ "success": true, "message": "…", "data": { } }
```

Paginated lists add a `pagination` object:

```json
{ "success": true, "message": "…", "data": [ ],
  "pagination": { "page": 1, "limit": 10, "total": 42,
                  "totalPages": 5, "hasNextPage": true, "hasPrevPage": false } }
```

**Error envelope**

```json
{ "success": false, "message": "Validation failed",
  "errors": [{ "field": "email", "message": "Invalid email format" }] }
```

**Common status codes** — 200 OK, 201 Created, 204 No Content (empty body),
400 validation, 401 missing/invalid token, 403 permission, 404 missing resource,
409 conflict/duplicate/invalid transition, 429 rate limited, 502 bad upstream
response, 503 upstream unavailable (GitHub/AI).

All `:id` params are UUIDs; malformed UUIDs return 400. Lists accept
`page` (default 1) and `limit` (default 10, max 100).

**Roles** — `DEVELOPER`, `MAINTAINER`, `REVIEWER`, `ADMIN`.

---

## Health

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | – | 200 healthy (includes DB ping) / 503 unhealthy |

---

## Auth

### POST `/auth/register`
Body: `{ username (3–50, [A-Za-z0-9_-]), email, password (6–128), role? }`
→ 201 `{ data: { user, token } }`. 409 duplicate email/username; 400 invalid.

### POST `/auth/login`
Body: `{ email, password }` → 200 `{ data: { user, token } }`.
401 wrong credentials; 403 inactive account.

### GET `/auth/me` · private
→ 200 `{ data: { user } }` (no `passwordHash`).

### POST `/auth/logout` · private
→ 200 message only. JWTs are stateless: the client discards the token.

---

## Users

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| GET | `/users/:id` | – | 200 `{ data: { user } }`, 404 |
| PUT | `/users/:id` | owner or ADMIN | `{ username?, email?, role?, accountStatus? }`; role/status ignored for non-admins; 404 before 403 for missing targets |

---

## Developer profiles

### POST `/profiles` · private
`{ fullName?, bio?, avatarUrl?, githubUsername?, githubProfileUrl?, skills[]?, experienceLevel? }`
→ 201. One profile per account (409). `githubUsername` is unique (409) and
`githubProfileUrl` is derived from it unless supplied.

### GET `/profiles/me` · private
→ 200 `{ data: { profile: { …, stats } } }`, 404 when no profile exists.

`stats` = `{ contributions: { total, verified, approved, rejected, disputed,
pendingVerification, underReview, byStatus }, repositories, reviewsReceived,
trust: { received, averageTrustLevel }, reputation }`.

### PUT `/profiles/me` · private
Same fields, all optional; at least one required. 404 when no profile exists.

### GET `/profiles/:userId` · public
→ 200 public profile (username/role only, **no email**) + `stats`; 404.

`experienceLevel` ∈ `JUNIOR | MID | SENIOR | STAFF | PRINCIPAL`.

---

## Repositories

### POST `/repositories` · private
`{ fullName? "owner/repo" | repositoryUrl? "https://github.com/owner/repo", description? }`
→ 201 `{ data: { repository, memberRole } }`.

The backend fetches the repository from GitHub (never trusting client data) and
requires the caller to be: the GitHub owner of the repo, a GitHub collaborator
with admin/maintain/write permission, or a platform `ADMIN`. Requires a linked
`githubUsername` on the profile (ADMIN exempt).

Errors: 400 missing reference/unlinked GitHub identity, 403 not owner/maintainer,
404 repository not found on GitHub, 409 already registered, 503 GitHub
unavailable/rate limited.

### GET `/repositories`
Query: `search`, `language`, `visibility=PUBLIC|PRIVATE`, `sort=recent|stars|name`,
`page`, `limit`. → 200 paginated list with `_count.{members,contributions}`.

### GET `/repositories/:id` · public
→ 200 repository + `members[]` (with user id/username/role) + contribution count.

### PUT `/repositories/:id` · repository OWNER or ADMIN
`{ description?, visibility? }` → 200. GitHub-derived fields (name, stars,
language, url) are never client-writable.

### DELETE `/repositories/:id` · repository OWNER or ADMIN
→ 204. Cascades members, contributions, evidence, reviews, disputes.

### POST `/repositories/:id/members` · repository OWNER or ADMIN
`{ userId, role? = CONTRIBUTOR }` → 200 `{ data: { member } }`. Idempotent upsert.
404 unknown user; 400 inactive user.

### GET `/repositories/:id/contributions` · public
Same filters as `/contributions`.

---

## Contributions

### POST `/contributions` · private
```json
{ "repositoryId": "uuid", "githubPRNumber": 42,
  "githubPRUrl": "https://github.com/owner/repo/pull/42",
  "title": "Fix the bug", "description": "…",
  "contributionType": "FEATURE|BUG_FIX|DOCUMENTATION|REFACTORING|TESTING|OTHER" }
```
`githubPRNumber` or `githubPRUrl` is required; if both, they must agree. The
repository must already be registered, and the caller must have a linked GitHub
username. Creating a contribution also adds the caller as a `CONTRIBUTOR`
repository member. New contributions start as `SUBMITTED`.

Errors: 400 invalid/ mismatched PR reference or unlinked GitHub, 404 repository,
409 duplicate PR for that repository.

### GET `/contributions` · public
Query: `status`, `contributionType`, `repositoryId`, `contributorId`, `search`,
`sort=recent|oldest`, `page`, `limit` → paginated.

### GET `/contributions/me` · private
Caller's contributions (same filters).

### GET `/contributions/user/:userId` · public
### GET `/contributions/repository/:repositoryId` · public

### GET `/contributions/:id` · public
Full detail: repository, contributor, `evidence[]`, `verifications[]`,
`aiAnalyses[]`, `reviews[]`, `disputes[]`.

### PATCH `/contributions/:id/status` · private
Body: `{ "status": "...", "reason": "optional audit note" }`

State machine (any other transition → 409):

```
SUBMITTED → PENDING_VERIFICATION
PENDING_VERIFICATION → VERIFIED | SUBMITTED
VERIFIED → UNDER_AI_ANALYSIS | UNDER_COMMUNITY_REVIEW | APPROVED
UNDER_AI_ANALYSIS → VERIFIED | UNDER_COMMUNITY_REVIEW
UNDER_COMMUNITY_REVIEW → APPROVED | REJECTED
APPROVED | REJECTED → DISPUTED        (only via the disputes API)
DISPUTED → UNDER_COMMUNITY_REVIEW | APPROVED | REJECTED | VERIFIED | SUBMITTED | PENDING_VERIFICATION
```

Who may do what:

- **Contributor:** `SUBMITTED → PENDING_VERIFICATION` only; never their own
  `APPROVED`/`REJECTED`.
- **Repository OWNER/MAINTAINER member, or role MAINTAINER/REVIEWER:** review
  outcomes.
- **ADMIN:** any allowed transition.
- `DISPUTED` cannot be set here (400) — file a dispute instead.
- Repeating the current status is an idempotent 200 no-op.

`VERIFIED`/`APPROVED`/`REJECTED` trigger an automatic (idempotent) reputation
recalculation for the contributor.

---

## Verification

### POST `/verification/:contributionId` · private
Allowed: contributor, repository OWNER/MAINTAINER, role `MAINTAINER`/`REVIEWER`/
`ADMIN`. Refused for finalised contributions (409) and disputed ones except for
ADMIN (409).

Fetches the repository, pull request and commits from GitHub and records:

- `PULL_REQUEST` evidence (normalized PR + all checks)
- `COMMIT` evidence per commit (max 100)
- `MERGE` evidence when the PR is merged
- `GITHUB_API` evidence (raw normalized repository payload + fetch timestamp)
- one `VerificationRecord` per check: `PR_EXISTS`, `REPO_MATCH`,
  `CONTRIBUTOR_IDENTITY`, `PR_STATUS`, `COMMIT_VERIFICATION` and a final
  `FULL_VERIFICATION`

→ 200 `{ data: { verification: { status, verified, checks, pullRequest,
evidence, verificationHistory } } }`

Status effects: all critical checks pass → `VERIFIED` (never downgrades a later
stage); failure from `SUBMITTED` → `PENDING_VERIFICATION`; a merged PR is
**evidence, not approval** — nothing becomes `APPROVED`.

Errors: 404 PR not found, 503 GitHub unavailable/rate-limited/timeout. On GitHub
failure **nothing is written**.

### GET `/verification/:contributionId` · public
→ latest verification, full history, evidence summary by type, `verified` flag.

### GET `/verification/:contributionId/evidence` · public
Optional `?evidenceType=PULL_REQUEST|COMMIT|REVIEW|MERGE|GITHUB_API`.

---

## AI analysis

### POST `/ai/analyze/:contributionId` · private
Allowed: contributor, repository OWNER/MAINTAINER, `MAINTAINER`/`REVIEWER`/`ADMIN`.
Requires an authentic contribution (`VERIFIED`, `UNDER_AI_ANALYSIS`,
`UNDER_COMMUNITY_REVIEW`) — otherwise 409. One in-flight analysis per
contribution → 409.

→ 200 `{ data: { analysis } }` with stored `qualityScore`, `riskScore`,
`similarityIndicators`, `suspiciousIndicators`, `confidence`, `explanation`,
`modelVersion`, `analysisStatus`.

Errors: 502 AI rejected/invalid/mismatched response, 503 AI timeout or
unavailable. Every outcome is recorded (`COMPLETED`/`FAILED`/`TIMEOUT`) and the
contribution status is restored. See [AI_CONTRACT.md](AI_CONTRACT.md).

### GET `/ai/results/:contributionId` · public
→ `{ data: { contribution, latest, history[], summary: { totalAnalyses,
completedAnalyses, latestQualityScore, latestRiskScore, modelVersions } } }`

---

## Reputation

### GET `/reputation/me` · private
### GET `/reputation/:userId` · public
→ `{ data: { reputation: { userId, username, initialized, overallScore,
qualityScore, reliabilityScore, consistencyScore, communityScore,
totalContributions, updatedAt } } }`

When no score has been persisted, a live estimate is computed and
`initialized: false` is returned (nothing is written).

### GET `/reputation/:userId/history` · public
Paginated `{ previousScore, newScore, changeAmount, reason, sourceType, sourceId, createdAt }`.

### GET `/reputation/:userId/breakdown` · public
```json
{ "overallScore": 61.5, "storedOverallScore": 61.5, "lastCalculatedAt": "…",
  "totalContributions": 4,
  "weights": { "quality": 0.35, "reliability": 0.25, "consistency": 0.15,
               "community": 0.15, "impact": 0.1 },
  "normalizedWeights": { "quality": 0.35, "…": 0 },
  "components": { "quality": 80, "reliability": 75, "consistency": 50,
                  "community": 100, "impact": 40 },
  "misconductPenalty": 0,
  "breakdown": [ { "component": "quality", "score": 80, "baseWeight": 0.35,
                   "normalizedWeight": 0.35, "weightedPoints": 28,
                   "applied": true, "reason": "Mean AI quality score …" } ],
  "explanation": "Overall 61.5/100 from 5 available signal(s)",
  "evidence": { "contributions": 4, "authenticContributions": 4,
                "aiAnalyses": 2, "reviews": 3, "resolvedDisputes": 0 } }
```

### POST `/reputation/recalculate/:userId` · self or ADMIN
Body: `{ reason?, force? }` → 200 `{ data: { result: { changed, idempotent,
reputation, history?, snapshot, evidence } } }`. Idempotent: unchanged inputs
produce `changed: false` and no history row.

---

## Trust relationships

Trust levels: `1` weak endorsement, `2` has worked together, `3` would collaborate
again, `4` strong endorsement, `5` would vouch as a maintainer.

### POST `/trust` · private
`{ targetUserId, trustLevel 1–5, trustReason? }` → 201.

Requires a real interaction: a shared repository, a review the caller wrote for
the target, or maintainership of a repository the target contributed to.
Errors: 400 self-trust/inactive target, 403 no interaction evidence, 404 target,
409 duplicate.

### GET `/trust/me` · private
→ `{ data: { network: { given[], received[], stats: { given, received, mutual,
averageReceivedLevel, mutualWith[] }, trustLevels } } }`

### GET `/trust/:userId` · public
Same shape for any developer.

### PATCH `/trust/:relationshipId` · source developer or ADMIN
`{ trustLevel?, trustReason? }` → 200. 403 for anyone else.

### DELETE `/trust/:relationshipId` · source developer or ADMIN
→ 204. 403 otherwise.

---

## Reviews

### POST `/reviews` · private
`{ contributionId, decision: "APPROVE|REQUEST_CHANGES|REJECT", rating? 1–5, comments? }`
→ 201.

Reviewers must be role `REVIEWER`/`MAINTAINER`/`ADMIN` or a repository
OWNER/MAINTAINER member. Self-reviews are impossible (403). The contribution must
be `VERIFIED`/`UNDER_AI_ANALYSIS`/`UNDER_COMMUNITY_REVIEW` (409 otherwise), and
one review per reviewer per contribution (409). A review moves the contribution
to `UNDER_COMMUNITY_REVIEW` and triggers reputation recalculation.

Approving/rejecting the contribution itself remains a separate maintainer action
(`PATCH /contributions/:id/status`).

### GET `/reviews/contribution/:contributionId` · public
Paginated reviews plus a top-level `summary`:
`{ APPROVE, REQUEST_CHANGES, REJECT, totalReviews, averageRating }`.

### GET `/reviews/me` · private
Reviews written by the caller (includes contribution summary).

### PATCH `/reviews/:reviewId` · review author or ADMIN
`{ decision?, rating?, comments? }` → 200. 409 when the contribution is finalised
(ADMIN may still edit). Triggers recalculation.

---

## Disputes

Statuses: `OPEN → UNDER_REVIEW → RESOLVED | REJECTED`; `RESOLVED → APPEALED`;
`APPEALED → UNDER_REVIEW | RESOLVED | REJECTED`; `REJECTED` is terminal.

### POST `/disputes` · private
`{ contributionId, reason (5–500), description (10–5000), evidence? }` → 201.

The contributor cannot dispute their own contribution (403). A duplicate active
dispute by the same reporter is rejected (409). Filing a dispute sets the
contribution to `DISPUTED` and stores its previous status; **no reputation change
occurs**.

### GET `/disputes/:id` · public
### GET `/disputes/contribution/:contributionId` · public (paginated)
### GET `/disputes/me` · private
Disputes the caller filed or resolved (paginated).

### PATCH `/disputes/:id/status` · private
```json
{ "status": "UNDER_REVIEW|RESOLVED|REJECTED|APPEALED",
  "resolution": "required (≥10 chars) for RESOLVED and REJECTED",
  "contributionStatus": "APPROVED|REJECTED (optional, applied on close)" }
```

Permissions: `UNDER_REVIEW` by `REVIEWER`/`MAINTAINER`/`ADMIN`; `RESOLVED`/
`REJECTED` by `REVIEWER`/`ADMIN` only; `APPEALED` by the reporter or the
contribution's contributor (or reviewer/ADMIN). Others → 403; invalid
transition → 409.

Outcome handling: an explicit `contributionStatus` is applied; a dismissed
dispute (`REJECTED`) restores the contribution's previous status; an appeal
returns the contribution to `DISPUTED`. Resolutions trigger reputation
recalculation (confirmed misconduct = resolved dispute ending in `REJECTED`).

---

## Dashboards

### GET `/dashboard/developer` · private
`{ user, reputation, contributions: { total, byStatus, verified, awaitingReview },
repositories, recentContributions[5], recentReviews[5], openDisputes,
trust: { given, received, averageReceivedLevel } }`

### GET `/dashboard/maintainer` · private
`{ user, repositories[] (owned/maintained with counts), reviewQueue[10],
openDisputes, recentReviews[5], summary: { repositories, contributions,
awaitingReview } }` — empty summary when the user maintains nothing.

### GET `/dashboard/admin` · ADMIN
`{ users: { total, byRole }, repositories: { total }, contributions: { total,
byStatus }, disputes: { total, byStatus }, aiAnalyses: { byStatus }, reputation:
{ calculatedProfiles, averageOverallScore }, openDisputes[10] }`

### GET `/dashboard/statistics` · public
`{ developers, repositories, contributions: { total, verified, approved, rejected,
disputed }, disputes, reputation: { calculatedProfiles, averageOverallScore },
topLanguages[10], generatedAt }`
