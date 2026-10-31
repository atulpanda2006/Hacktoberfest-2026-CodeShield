/**
 * Development seed data — no GitHub or AI service calls.
 *
 * Purpose: give the testing frontend (and manual API testing) populated
 * dashboards without needing a GitHub token. Repositories, contributions,
 * evidence, reviews and disputes are written directly, then every developer's
 * reputation is produced by the real ReputationService so the stored scores and
 * history rows match the documented formula.
 *
 * Idempotent: the seeded users and repositories are deleted and recreated on
 * every run. Only the fixed seed identities below are touched.
 *
 * Run:  npm run prisma:seed
 */

import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { ReputationService } from '../src/modules/reputation/services/reputationService.js';

const prisma = new PrismaClient();

const PASSWORD = 'Password123';
const SALT_ROUNDS = 10;

const SEED_EMAILS = [
  'maya@trustnet.dev',
  'raj@trustnet.dev',
  'admin@trustnet.dev',
  'ada@trustnet.dev',
  'linus@trustnet.dev',
  'grace@trustnet.dev',
];

const SEED_REPO_FULL_NAMES = [
  'trustnet-labs/atlas-api',
  'trustnet-labs/atlas-web',
  'open-foundry/queue',
];

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

function evidenceReference(fullName, prNumber) {
  return `https://github.com/${fullName}/pull/${prNumber}`;
}

async function cleanPreviousSeed() {
  // Cascades remove profiles, contributions, evidence, reviews, disputes,
  // trust relationships, reputation and reputation history.
  await prisma.user.deleteMany({ where: { email: { in: SEED_EMAILS } } });
  await prisma.repository.deleteMany({ where: { fullName: { in: SEED_REPO_FULL_NAMES } } });
}

async function createUser({ username, email, role, fullName, githubUsername, experienceLevel, skills, bio }) {
  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { username, email, passwordHash, role, accountStatus: 'ACTIVE' },
  });

  await prisma.developerProfile.create({
    data: {
      userId: user.id,
      fullName,
      bio,
      githubUsername,
      githubProfileUrl: `https://github.com/${githubUsername}`,
      skills,
      experienceLevel,
    },
  });

  return user;
}

async function createRepository({ githubRepositoryId, name, fullName, description, language, stars, forks, visibility = 'PUBLIC' }) {
  return prisma.repository.create({
    data: {
      githubRepositoryId,
      name,
      fullName,
      description,
      repositoryUrl: `https://github.com/${fullName}`,
      ownerGithubUsername: fullName.split('/')[0],
      primaryLanguage: language,
      visibility,
      stars,
      forks,
    },
  });
}

/**
 * One contribution with its evidence, verification history, AI analysis and
 * reviews. Statuses mirror real workflow positions.
 */
async function createContribution({
  repository,
  contributor,
  githubUsername,
  prNumber,
  title,
  description,
  type,
  status,
  submittedDaysAgo,
  evidence = false,
  ai = null,
  reviews = [],
  merged = false,
}) {
  const contribution = await prisma.contribution.create({
    data: {
      contributorId: contributor.id,
      repositoryId: repository.id,
      githubPRNumber: prNumber,
      githubPRUrl: evidenceReference(repository.fullName, prNumber),
      githubPRId: `pr-${repository.githubRepositoryId}-${prNumber}`,
      title,
      description,
      contributionType: type,
      status,
      submittedAt: daysAgo(submittedDaysAgo),
    },
  });

  if (evidence) {
    const pullRequest = {
      githubPRId: contribution.githubPRId,
      githubPRNumber: prNumber,
      githubPRUrl: contribution.githubPRUrl,
      title,
      state: merged ? 'MERGED' : 'OPEN',
      merged,
      mergedAt: merged ? daysAgo(submittedDaysAgo - 2).toISOString() : null,
      mergeCommitSha: merged ? `merge-${prNumber}-${repository.githubRepositoryId}` : null,
      authorLogin: githubUsername,
      baseRepoFullName: repository.fullName,
      baseRepoGithubId: repository.githubRepositoryId,
      additions: 40 + prNumber,
      deletions: 12,
      changedFiles: 4,
    };

    await prisma.contributionEvidence.createMany({
      data: [
        {
          contributionId: contribution.id,
          evidenceType: 'PULL_REQUEST',
          externalReference: contribution.githubPRUrl,
          metadata: { pullRequest, checks: { PR_EXISTS: true, REPO_MATCH: true, CONTRIBUTOR_IDENTITY: true }, fetchedAt: daysAgo(submittedDaysAgo - 1).toISOString() },
          verified: true,
        },
        {
          contributionId: contribution.id,
          evidenceType: 'COMMIT',
          externalReference: `sha-${prNumber}a`,
          metadata: { sha: `sha-${prNumber}a`, message: `${title} (part 1)`, authorLogin: githubUsername, authoredAt: daysAgo(submittedDaysAgo - 1).toISOString(), additions: 26, deletions: 8 },
          verified: true,
        },
        {
          contributionId: contribution.id,
          evidenceType: 'COMMIT',
          externalReference: `sha-${prNumber}b`,
          metadata: { sha: `sha-${prNumber}b`, message: `${title} (tests)`, authorLogin: githubUsername, authoredAt: daysAgo(submittedDaysAgo - 1).toISOString(), additions: 14, deletions: 4 },
          verified: true,
        },
        {
          contributionId: contribution.id,
          evidenceType: 'GITHUB_API',
          externalReference: `repos/${repository.fullName}/pulls/${prNumber}`,
          metadata: { repository: repository.fullName, apiBaseUrl: 'https://api.github.com', fetchedAt: daysAgo(submittedDaysAgo - 1).toISOString() },
          verified: true,
        },
        ...(merged
          ? [{
              contributionId: contribution.id,
              evidenceType: 'MERGE',
              externalReference: `merge-${prNumber}-${repository.githubRepositoryId}`,
              metadata: { merged: true, mergeCommitSha: `merge-${prNumber}-${repository.githubRepositoryId}` },
              verified: true,
            }]
          : []),
      ],
      skipDuplicates: true,
    });

    await prisma.verificationRecord.createMany({
      data: [
        {
          contributionId: contribution.id,
          verificationType: 'REPO_MATCH',
          verificationStatus: 'PASSED',
          verificationDetails: { repository: repository.fullName, checkedAt: daysAgo(submittedDaysAgo - 1).toISOString() },
          verifiedAt: daysAgo(submittedDaysAgo - 1),
        },
        {
          contributionId: contribution.id,
          verificationType: 'CONTRIBUTOR_IDENTITY',
          verificationStatus: 'PASSED',
          verificationDetails: { pullRequestAuthor: githubUsername, linkedGithubUsername: githubUsername },
          verifiedAt: daysAgo(submittedDaysAgo - 1),
        },
        {
          contributionId: contribution.id,
          verificationType: 'FULL_VERIFICATION',
          verificationStatus: 'PASSED',
          verificationDetails: { checks: { PR_EXISTS: true, REPO_MATCH: true, CONTRIBUTOR_IDENTITY: true, PR_STATUS: true, COMMIT_VERIFICATION: true }, merged },
          verifiedAt: daysAgo(submittedDaysAgo - 1),
        },
      ],
    });
  }

  if (ai) {
    await prisma.aIAnalysis.create({
      data: {
        contributionId: contribution.id,
        modelVersion: ai.modelVersion ?? '1.0',
        qualityScore: ai.qualityScore,
        riskScore: ai.riskScore,
        similarityIndicators: ai.similarityIndicators ?? { maxSimilarity: ai.riskScore / 100, matches: [] },
        suspiciousIndicators: ai.suspiciousIndicators ?? [],
        explanation: ai.explanation,
        confidence: ai.confidence,
        analysisStatus: 'COMPLETED',
        analyzedAt: daysAgo(submittedDaysAgo - 2),
      },
    });
  }

  for (const review of reviews) {
    await prisma.review.create({
      data: {
        contributionId: contribution.id,
        reviewerId: review.reviewer.id,
        decision: review.decision,
        rating: review.rating ?? null,
        comments: review.comments ?? null,
        createdAt: daysAgo(review.daysAgo ?? 5),
      },
    });
  }

  return contribution;
}

async function main() {
  console.log('🧹 Removing previous seed data…');
  await cleanPreviousSeed();

  console.log('👤 Creating users and profiles…');
  const maya = await createUser({
    username: 'maya',
    email: 'maya@trustnet.dev',
    role: 'MAINTAINER',
    fullName: 'Maya Chen',
    githubUsername: 'mayachen',
    experienceLevel: 'SENIOR',
    skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    bio: 'Maintainer of the Atlas platform. Reviews contributions on weekends.',
  });

  const raj = await createUser({
    username: 'raj',
    email: 'raj@trustnet.dev',
    role: 'REVIEWER',
    fullName: 'Raj Patel',
    githubUsername: 'rajpatel-dev',
    experienceLevel: 'SENIOR',
    skills: ['Code review', 'Security'],
    bio: 'Security-focused reviewer.',
  });

  const admin = await createUser({
    username: 'admin',
    email: 'admin@trustnet.dev',
    role: 'ADMIN',
    fullName: 'Platform Admin',
    githubUsername: 'trustnet-admin',
    experienceLevel: 'STAFF',
    skills: ['Operations'],
    bio: 'Platform administration account.',
  });

  const ada = await createUser({
    username: 'ada',
    email: 'ada@trustnet.dev',
    role: 'DEVELOPER',
    fullName: 'Ada Lovelace',
    githubUsername: 'ada-dev',
    experienceLevel: 'MID',
    skills: ['JavaScript', 'React', 'Testing'],
    bio: 'Frontend and API contributor. Testing enthusiast.',
  });

  const linus = await createUser({
    username: 'linus',
    email: 'linus@trustnet.dev',
    role: 'DEVELOPER',
    fullName: 'Linus Park',
    githubUsername: 'linuspark',
    experienceLevel: 'JUNIOR',
    skills: ['Go', 'Docker'],
    bio: 'Learning distributed systems in public.',
  });

  const grace = await createUser({
    username: 'grace',
    email: 'grace@trustnet.dev',
    role: 'DEVELOPER',
    fullName: 'Grace Hopper',
    githubUsername: 'grace-h',
    experienceLevel: 'PRINCIPAL',
    skills: ['Compilers', 'Architecture', 'Mentoring'],
    bio: 'Long-time maintainer, now contributing across projects.',
  });

  console.log('📦 Creating repositories and members…');
  const atlasApi = await createRepository({
    githubRepositoryId: '1000001',
    name: 'atlas-api',
    fullName: 'trustnet-labs/atlas-api',
    description: 'REST API for the Atlas platform',
    language: 'JavaScript',
    stars: 128,
    forks: 21,
  });

  const atlasWeb = await createRepository({
    githubRepositoryId: '1000002',
    name: 'atlas-web',
    fullName: 'trustnet-labs/atlas-web',
    description: 'React dashboard for the Atlas platform',
    language: 'JavaScript',
    stars: 64,
    forks: 9,
  });

  const queue = await createRepository({
    githubRepositoryId: '1000003',
    name: 'queue',
    fullName: 'open-foundry/queue',
    description: 'Minimal job queue with at-least-once delivery',
    language: 'Go',
    stars: 311,
    forks: 48,
  });

  await prisma.repositoryMember.createMany({
    data: [
      { repositoryId: atlasApi.id, userId: maya.id, role: 'OWNER' },
      { repositoryId: atlasApi.id, userId: grace.id, role: 'MAINTAINER' },
      { repositoryId: atlasApi.id, userId: ada.id, role: 'CONTRIBUTOR' },
      { repositoryId: atlasApi.id, userId: linus.id, role: 'CONTRIBUTOR' },
      { repositoryId: atlasWeb.id, userId: maya.id, role: 'OWNER' },
      { repositoryId: atlasWeb.id, userId: ada.id, role: 'CONTRIBUTOR' },
      { repositoryId: queue.id, userId: linus.id, role: 'OWNER' },
      { repositoryId: queue.id, userId: grace.id, role: 'CONTRIBUTOR' },
    ],
  });

  console.log('🔀 Creating contributions, evidence, AI analyses and reviews…');

  // ada — strong record on atlas-api
  await createContribution({
    repository: atlasApi,
    contributor: ada,
    githubUsername: 'ada-dev',
    prNumber: 101,
    title: 'Add cursor pagination to /projects',
    description: 'Adds cursor-based pagination with tests and docs; keeps the offset endpoint for compatibility.',
    type: 'FEATURE',
    status: 'APPROVED',
    submittedDaysAgo: 150,
    evidence: true,
    merged: true,
    ai: {
      qualityScore: 90,
      riskScore: 6,
      confidence: 0.94,
      explanation: 'Well-scoped feature with tests, migration notes and no duplication signals.',
    },
    reviews: [
      { reviewer: maya, decision: 'APPROVE', rating: 5, comments: 'Clean implementation, tests cover the edge cases.', daysAgo: 145 },
      { reviewer: raj, decision: 'APPROVE', rating: 4, comments: 'No security concerns.', daysAgo: 144 },
    ],
  });

  await createContribution({
    repository: atlasApi,
    contributor: ada,
    githubUsername: 'ada-dev',
    prNumber: 102,
    title: 'Fix cache invalidation on project update',
    description: 'Invalidates the project cache when metadata changes.',
    type: 'BUG_FIX',
    status: 'VERIFIED',
    submittedDaysAgo: 60,
    evidence: true,
    ai: {
      qualityScore: 82,
      riskScore: 12,
      confidence: 0.89,
      explanation: 'Focused bug fix with a regression test; low risk.',
    },
  });

  await createContribution({
    repository: atlasWeb,
    contributor: ada,
    githubUsername: 'ada-dev',
    prNumber: 201,
    title: 'Rewrite dashboard chart component',
    description: 'Replaces the chart implementation.',
    type: 'REFACTORING',
    status: 'REJECTED',
    submittedDaysAgo: 90,
    evidence: true,
    ai: {
      qualityScore: 44,
      riskScore: 68,
      confidence: 0.86,
      explanation: 'Large unrequested rewrite with high similarity to an existing library and no tests.',
      suspiciousIndicators: ['large-unrequested-rewrite', 'no-tests-added'],
    },
    reviews: [
      { reviewer: maya, decision: 'REJECT', rating: 2, comments: 'Unsolicited rewrite; please split into reviewable changes.', daysAgo: 88 },
    ],
  });

  // linus — mixed record
  await createContribution({
    repository: atlasApi,
    contributor: linus,
    githubUsername: 'linuspark',
    prNumber: 103,
    title: 'Document the webhook retry policy',
    description: 'Adds a doc page describing retries and backoff.',
    type: 'DOCUMENTATION',
    status: 'UNDER_COMMUNITY_REVIEW',
    submittedDaysAgo: 20,
    evidence: true,
    ai: {
      qualityScore: 68,
      riskScore: 18,
      confidence: 0.77,
      explanation: 'Accurate documentation, but a section duplicates the existing API guide.',
    },
    reviews: [
      { reviewer: raj, decision: 'REQUEST_CHANGES', rating: 3, comments: 'Please link instead of duplicating the API guide.', daysAgo: 16 },
    ],
  });

  await createContribution({
    repository: atlasWeb,
    contributor: linus,
    githubUsername: 'linuspark',
    prNumber: 202,
    title: 'Add keyboard shortcuts to the inbox',
    description: 'Adds j/k navigation and bulk actions.',
    type: 'FEATURE',
    status: 'UNDER_AI_ANALYSIS',
    submittedDaysAgo: 10,
    evidence: true,
  });

  await createContribution({
    repository: queue,
    contributor: linus,
    githubUsername: 'linuspark',
    prNumber: 302,
    title: 'Add retry tests for the worker pool',
    description: 'Covers retry behaviour and poison-message handling.',
    type: 'TESTING',
    status: 'VERIFIED',
    submittedDaysAgo: 35,
    evidence: true,
    ai: {
      qualityScore: 79,
      riskScore: 9,
      confidence: 0.91,
      explanation: 'Adds meaningful coverage with deterministic timing.',
    },
  });

  // grace — senior contributor with one disputed contribution
  await createContribution({
    repository: queue,
    contributor: grace,
    githubUsername: 'grace-h',
    prNumber: 301,
    title: 'Rewrite the scheduler in a single file',
    description: 'Consolidates scheduling logic into one module.',
    type: 'REFACTORING',
    status: 'DISPUTED',
    submittedDaysAgo: 45,
    evidence: true,
    ai: {
      qualityScore: 57,
      riskScore: 74,
      confidence: 0.88,
      explanation: 'Structural rewrite with broad similarity to a third-party scheduler.',
      suspiciousIndicators: ['high-similarity', 'broad-scope-change'],
    },
  });

  await createContribution({
    repository: atlasApi,
    contributor: grace,
    githubUsername: 'grace-h',
    prNumber: 104,
    title: 'Harden rate limiting middleware',
    description: 'Adds per-IP and per-token limits with tests.',
    type: 'FEATURE',
    status: 'SUBMITTED',
    submittedDaysAgo: 3,
  });

  await createContribution({
    repository: atlasWeb,
    contributor: grace,
    githubUsername: 'grace-h',
    prNumber: 203,
    title: 'Fix table sorting regression',
    description: 'Fixes a regression introduced by the table refactor.',
    type: 'BUG_FIX',
    status: 'APPROVED',
    submittedDaysAgo: 120,
    evidence: true,
    merged: true,
    ai: {
      qualityScore: 85,
      riskScore: 7,
      confidence: 0.93,
      explanation: 'Small, well-tested regression fix with clear reproduction steps.',
    },
    reviews: [
      { reviewer: maya, decision: 'APPROVE', rating: 5, comments: 'Verified locally against the regression repro.', daysAgo: 118 },
    ],
  });

  await createContribution({
    repository: queue,
    contributor: grace,
    githubUsername: 'grace-h',
    prNumber: 303,
    title: 'Upgrade consumer to the new protocol',
    description: 'Work in progress upgrade of the consumer.',
    type: 'FEATURE',
    status: 'PENDING_VERIFICATION',
    submittedDaysAgo: 5,
  });

  console.log('⚖️  Filing disputes…');
  const disputedContribution = await prisma.contribution.findFirst({
    where: { repositoryId: queue.id, githubPRNumber: 301 },
  });

  await prisma.dispute.create({
    data: {
      contributionId: disputedContribution.id,
      reportedBy: linus.id,
      reason: 'Suspected copied implementation',
      description:
        'The scheduler rewrite closely matches a third-party library without attribution. Asking for a documented source review.',
      evidence: { links: ['https://github.com/example/scheduler'], similarity: 0.81 },
      status: 'UNDER_REVIEW',
      previousContributionStatus: 'VERIFIED',
    },
  });

  const rejectedContribution = await prisma.contribution.findFirst({
    where: { repositoryId: atlasWeb.id, githubPRNumber: 201 },
  });

  await prisma.dispute.create({
    data: {
      contributionId: rejectedContribution.id,
      reportedBy: raj.id,
      reason: 'Unrequested large rewrite',
      description: 'The rewrite replaced working code without prior discussion and reduced test coverage.',
      status: 'RESOLVED',
      resolution:
        'Confirmed: the rewrite was unrequested and removed tests. Contribution rejected; contributor encouraged to submit focused changes.',
      resolvedBy: raj.id,
      previousContributionStatus: 'VERIFIED',
    },
  });

  console.log('🤝 Creating trust relationships…');
  await prisma.trustRelationship.createMany({
    data: [
      { sourceUserId: maya.id, targetUserId: ada.id, trustLevel: 5, trustReason: 'Reviewed several high-quality contributions' },
      { sourceUserId: raj.id, targetUserId: ada.id, trustLevel: 4, trustReason: 'Consistently passes review without follow-ups' },
      { sourceUserId: maya.id, targetUserId: grace.id, trustLevel: 5, trustReason: 'Long-standing maintainer collaboration' },
      { sourceUserId: grace.id, targetUserId: maya.id, trustLevel: 4, trustReason: 'Reliable reviews and releases' },
      { sourceUserId: ada.id, targetUserId: linus.id, trustLevel: 2, trustReason: 'Worked together on the Atlas web dashboard' },
    ],
  });

  console.log('📊 Calculating reputation with the real engine…');
  const users = [ada, linus, grace, maya, raj];
  const scores = [];

  for (const user of users) {
    const result = await ReputationService.recalculateForUser(user.id, {
      reason: 'Initial calculation from seeded evidence',
      sourceType: 'SEED',
      force: true,
    });

    scores.push({
      username: user.username,
      score: result.reputation?.overallScore ?? result.snapshot?.overallScore ?? 0,
      contributions: result.reputation?.totalContributions ?? 0,
    });
  }

  // A genuine second recalculation: a late approval lands after the initial
  // calculation, so the history view shows a real score movement rather than a
  // fabricated row.
  console.log('📝 Adding a late review and recalculating Ada…');
  const lateContribution = await prisma.contribution.findFirst({
    where: { repositoryId: atlasApi.id, githubPRNumber: 102 },
  });

  await prisma.review.create({
    data: {
      contributionId: lateContribution.id,
      reviewerId: raj.id,
      decision: 'APPROVE',
      rating: 4,
      comments: 'Confirmed the cache invalidation path behaves correctly.',
      createdAt: daysAgo(1),
    },
  });

  const adaRecalculated = await ReputationService.recalculateForUser(ada.id, {
    reason: 'Late approval from a reviewer',
    sourceType: 'REVIEW',
    sourceId: lateContribution.id,
  });

  scores.find((entry) => entry.username === 'ada').score =
    adaRecalculated.reputation?.overallScore ?? adaRecalculated.snapshot?.overallScore ?? 0;

  console.log('\n✅ Seed complete.\n');
  console.log('Accounts (password: %s)', PASSWORD);
  for (const [label, user] of [
    ['Maintainer', maya],
    ['Reviewer', raj],
    ['Admin', admin],
    ['Developer', ada],
    ['Developer', linus],
    ['Developer', grace],
  ]) {
    console.log(`  ${label.padEnd(10)} ${user.email.padEnd(24)} ${user.username}`);
  }

  console.log('\nReputations:');
  for (const entry of scores.sort((a, b) => b.score - a.score)) {
    console.log(`  ${entry.username.padEnd(8)} overall ${entry.score}  (${entry.contributions} contributions)`);
  }

  const counts = {
    users: await prisma.user.count(),
    repositories: await prisma.repository.count(),
    contributions: await prisma.contribution.count(),
    evidence: await prisma.contributionEvidence.count(),
    reviews: await prisma.review.count(),
    disputes: await prisma.dispute.count(),
    trustRelationships: await prisma.trustRelationship.count(),
    aiAnalyses: await prisma.aIAnalysis.count(),
  };
  console.log('\nDatabase totals:', counts);
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
