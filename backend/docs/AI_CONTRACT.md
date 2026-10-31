# AI Service Integration Contract

The AI model is owned by the AI developer. This backend only speaks HTTP to it.
All contract details live in two files:

- `src/integrations/ai/aiClient.js` — transport, timeout, retries
- `src/integrations/ai/aiSchemas.js` — response validation (the single place to
  change if the contract evolves)

Base URL: `AI_SERVICE_URL` (default `http://localhost:5000/api`).
Analysis endpoint: `POST {AI_SERVICE_URL}/analyze`.

## 1. Backend → AI request

Header: `Content-Type: application/json`. No authentication is currently sent;
add a shared secret header here if required.

```json
{
  "requestId": "8f14e45f-ceea-4e7a-9c0f-2f1c3b5e8a11",
  "contributionId": "c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0",
  "contribution": {
    "title": "Fix cache invalidation",
    "description": "Adds a cache key version and tests",
    "type": "BUG_FIX",
    "submittedAt": "2026-10-31T10:00:00.000Z"
  },
  "repository": {
    "fullName": "owner/repo",
    "primaryLanguage": "JavaScript",
    "description": "A repo",
    "stars": 12,
    "forks": 3
  },
  "pullRequest": {
    "number": 42,
    "url": "https://github.com/owner/repo/pull/42",
    "title": "Fix cache invalidation",
    "state": "MERGED",
    "merged": true,
    "additions": 120,
    "deletions": 18,
    "changedFiles": 4,
    "author": "devone-gh"
  },
  "commits": [
    { "sha": "abc123", "message": "fix: cache key", "author": "devone-gh",
      "authoredAt": "2026-10-30T09:12:00Z", "additions": 100, "deletions": 10 }
  ],
  "diff": { "additions": 120, "deletions": 18, "changedFiles": 4 },
  "contributor": {
    "userId": "11111111-1111-4111-8111-111111111111",
    "username": "devone",
    "githubUsername": "devone-gh",
    "experienceLevel": "MID",
    "skills": ["Node.js", "PostgreSQL"],
    "reputation": { "overallScore": 61.5, "qualityScore": 70,
                    "reliabilityScore": 60, "communityScore": 60 }
  }
}
```

Notes:

- `requestId` is a fresh UUID per call. Repeat it verbatim in your logs so a retry
  can be recognised and answered idempotently.
- `commits` is capped (`AI_MAX_COMMITS`, default 100).
- `diff` contains **aggregate statistics only** — the backend does not store or
  forward source code.
- `state` is `OPEN`, `CLOSED`, or `MERGED` (GitHub reports merged PRs as
  `closed` + `merged: true`; the backend normalizes this).

## 2. AI → backend response

HTTP 200 with `application/json`:

```json
{
  "contributionId": "c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0",
  "qualityScore": 82,
  "riskScore": 15,
  "similarityIndicators": { "maxSimilarity": 0.12, "matches": [] },
  "suspiciousIndicators": [],
  "confidence": 0.91,
  "explanation": "Well-scoped fix with tests and no duplication signals.",
  "modelVersion": "1.0"
}
```

Validation rules (rejecting violations is safer than storing bad inputs):

| Field | Rule |
|---|---|
| `contributionId` | optional; **if present must equal** the analyzed contribution |
| `qualityScore` | required, number 0–100 |
| `riskScore` | required, number 0–100 |
| `confidence` | required, number 0–1 |
| `modelVersion` | required, 1–50 chars |
| `explanation` | optional, ≤ 5000 chars |
| `similarityIndicators` | optional, any JSON |
| `suspiciousIndicators` | optional array, ≤ 100 entries |

Unknown fields are ignored. Scores are stored as `Float`, so decimals are fine.

## 3. Timeouts, retries, failure handling

- Per-attempt timeout: `AI_SERVICE_TIMEOUT` (default 30 s) via `AbortController`.
- Retries: `AI_MAX_RETRIES` (default 2), exponential backoff with jitter
  (`AI_RETRY_BASE_DELAY_MS × 2^attempt + ≤100 ms`).
- Retried: connection failures, timeouts, HTTP 429, HTTP 5xx.
- **Not** retried: HTTP 4xx (other than 429) — the request itself is wrong.
- Every attempt is idempotent-safe to repeat because analysis is a pure read of
  the payload; `requestId` lets you de-duplicate.
- The backend never stores a fabricated result. Outcomes are recorded:

| Outcome | Stored `analysisStatus` | API response |
|---|---|---|
| Success | `COMPLETED` | 200 |
| Timeout | `TIMEOUT` | 503 |
| Network / 5xx / 429 | `FAILED` | 503 |
| Invalid JSON or schema violation | `FAILED` | 503 |
| `contributionId` mismatch | `FAILED` | 502 |
| 4xx rejection | `FAILED` | 502 |

During an analysis the contribution is temporarily `UNDER_AI_ANALYSIS` and is
restored to `VERIFIED` on completion or failure, so an AI outage never blocks the
rest of the platform.

## 4. Preconditions enforced by the backend

- The contribution must be authentically verified first (status `VERIFIED`,
  `UNDER_AI_ANALYSIS`, or `UNDER_COMMUNITY_REVIEW`).
- Finalised (`APPROVED`/`REJECTED`) or `DISPUTED` contributions are not analyzed.
- One in-flight analysis per contribution (5-minute window) → 409.
- Analysis history is append-only; each record keeps `modelVersion` and timestamps.
- AI output never modifies reputation directly. Only the reputation engine reads
  `qualityScore`, and only for authentic contributions.

## 5. Contract change process

1. Propose the change to the backend developer (field name, type, range, meaning).
2. Update `aiSchemas.js` (and `buildPayload` if the request changes).
3. Update this document and the tests in `tests/integration/ai.test.js`.
4. Keep `modelVersion` populated so historical analyses remain interpretable.
