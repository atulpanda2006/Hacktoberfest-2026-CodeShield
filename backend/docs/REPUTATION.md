# Reputation Engine

The score is deliberately **transparent, bounded, and evidence-based**. The
formula lives in a pure function (`src/modules/reputation/services/reputationEngine.js`)
so it can be read, unit-tested and audited without a database.

## 1. Formula

```
overall = Σ(weightᵢ × componentᵢ) / Σ(weightᵢ)  −  misconductPenalty
```

Only components with evidence take part in the sum; weights are **re-normalized
over the available signals**. A developer is never penalized for a signal that
simply does not exist yet (for example, no reviews received).

| Component | Weight | Definition | Available when |
|---|---|---|---|
| Quality | 35% | Mean `qualityScore` of **completed** AI analyses on authentic contributions | ≥ 1 completed analysis |
| Reliability | 25% | `authentic contributions / submitted contributions × 100` | ≥ 1 contribution submitted |
| Consistency | 15% | `distinct months with an authentic contribution in the last 6 / 6 × 100`, capped at 100 | ≥ 1 contribution submitted |
| Community | 15% | `APPROVE / all reviews received × 100` | ≥ 1 review received |
| Impact | 10% | `min(100, verified contributions × 10)` | ≥ 1 contribution submitted |

**Authentic** means status ∈ `VERIFIED`, `UNDER_AI_ANALYSIS`,
`UNDER_COMMUNITY_REVIEW`, `APPROVED`.

`misconductPenalty = min(30, 10 × confirmed misconduct cases)` where a confirmed
case is a **RESOLVED** dispute whose contribution ended `REJECTED`.

Scores are clamped to 0–100 and rounded to 2 decimals. Each component score is
also rounded to 2 decimals before weighting.

## 2. Rules the engine enforces

- **AI risk flags never lower a score.** Only `qualityScore` is used; `riskScore`
  and `suspiciousIndicators` are stored for human review.
- **Filing a dispute never lowers a score.** Only a documented, authorized
  resolution can (and only through`confirmedMisconductCount`).
- **Rejected contributions lower reliability**, while unresolved disputes do not.
- **Quantity cannot manufacture reputation:** impact is capped and weighted
  lowest; duplicates are impossible (unique `(repository_id, github_pr_number)`).
- **No self-reviews, no self-approval**, so community inputs cannot be forged.
- **Every change is auditable:** a `reputation_history` row records previous
  score, new score, change, reason, source type and source id.
- **Idempotent recalculation:** if no component or total changed (tolerance
  0.01), nothing is written and `changed: false` is returned.

## 3. Worked example

Inputs: 4 submitted, 4 authentic, AI quality mean 80, active in 6 of 6 months,
3 approvals / 1 rejection, no confirmed misconduct.

```
quality     80   × 0.35 = 28.00
reliability 100  × 0.25 = 25.00
consistency 100  × 0.15 = 15.00
community   75   × 0.15 = 11.25
impact      40   × 0.10 =  4.00
                         ------
                         83.25  → overall 83.25
```

The API exposes this arithmetic: `GET /api/v1/reputation/:userId/breakdown`
returns every component, its base weight, its normalized weight, its weighted
points and a human-readable reason.

## 4. Trust relationships are separate

`TrustRelationship` is a **directed, personal endorsement** (1–5) between two
developers, created only when a real interaction exists (shared repository, a
review written by the endorser, or maintainership of a repository the target
contributed to). It:

- is **not** aggregated into `overallScore`;
- is **not** proof that the target is credible;
- can be updated or withdrawn only by the developer who created it (or an admin).

## 5. Tuning

Weights are constants at the top of the engine (`REPUTATION_WEIGHTS`), with the
penalty constants beside them. Changing a weight automatically changes the
`weights` block in every breakdown response, so the UI and documentation stay
consistent. Re-run `npm run test:unit` after changing them — the unit tests pin
the documented arithmetic.

## 6. Known limitations

- Consistency uses the last six calendar months (UTC) of **submission** dates.
- Review decisions are counted once per reviewer; a reviewer who changes their
  decision replaces the previous one.
- The formula has not yet been calibrated against real platform data. Weights are
  provisional and intentionally visible so they can be debated.
