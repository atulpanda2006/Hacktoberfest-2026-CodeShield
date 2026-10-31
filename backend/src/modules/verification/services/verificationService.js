import { getPrismaClient } from '../../../config/database.js';
import { AppError } from '../../../utils/AppError.js';
import { GitHubClient } from '../../../integrations/github/githubClient.js';
import { toAppError } from '../../../integrations/github/githubErrorMapper.js';
import { ReputationService } from '../../reputation/services/reputationService.js';
import { parsePullRequestNumber } from '../../contributions/services/contributionService.js';
import { GitHubAccountService } from '../../github/services/githubAccountService.js';

/**
 * VerificationService — establishes the authenticity of a contribution from
 * GitHub evidence (Module 6).
 *
 * Verification answers "is this real, and is it really theirs?" It does NOT
 * answer "is this good?" — quality is Module 7/10. A merged PR is recorded as
 * merged evidence, never as a quality signal.
 *
 * If GitHub cannot be reached, the request fails and nothing is written:
 * verification results are never invented.
 */

const OPEN_STATES = ['SUBMITTED', 'PENDING_VERIFICATION', 'VERIFIED', 'UNDER_AI_ANALYSIS'];

function sameValue(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export class VerificationService {
  /**
   * Run full verification for a contribution and persist evidence + history.
   */
  static async verifyContribution(contributionId, user) {
    const prisma = getPrismaClient();

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      select: {
        id: true,
        contributorId: true,
        repositoryId: true,
        githubPRNumber: true,
        githubPRUrl: true,
        status: true,
        title: true,
        repository: { select: { id: true, fullName: true, githubRepositoryId: true } },
        contributor: {
          select: {
            id: true,
            username: true,
            profile: { select: { githubUsername: true } },
          },
        },
      },
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    await VerificationService.assertCanVerify(contribution, user);

    if (['APPROVED', 'REJECTED'].includes(contribution.status) && user.role !== 'ADMIN') {
      throw AppError.conflict('A finalised contribution cannot be re-verified');
    }

    if (contribution.status === 'DISPUTED' && user.role !== 'ADMIN') {
      throw AppError.conflict('A disputed contribution can only be re-verified by an administrator');
    }

    if (!contribution.githubPRNumber) {
      throw AppError.badRequest('Contribution has no pull request number to verify');
    }

    const fullName = contribution.repository.fullName;

    // 1. Fetch live evidence from GitHub. Failures bubble up as 503/404 and
    //    leave the database untouched. The caller's own token is preferred so
    //    rate limits are charged per user rather than to a shared credential.
    const userToken = await GitHubAccountService.getOptionalUserToken(user.id);

    let githubRepo;
    let pullRequest;
    let commits = [];

    try {
      githubRepo = await GitHubClient.getRepository(fullName, userToken);
      pullRequest = await GitHubClient.getPullRequest(
        fullName,
        contribution.githubPRNumber,
        userToken
      );
      commits = await GitHubClient.getPullRequestCommits(fullName, contribution.githubPRNumber, {
        max: 100,
        token: userToken,
      });
    } catch (error) {
      throw toAppError(error, {
        notFoundMessage: `Pull request #${contribution.githubPRNumber} was not found on GitHub`,
      });
    }

    // 2. Evaluate the checks. Every check is recorded, pass or fail.
    const githubUsername = contribution.contributor.profile?.githubUsername ?? null;

    const checks = {
      PR_EXISTS: {
        passed: Boolean(pullRequest),
        details: pullRequest
          ? `Pull request #${pullRequest.githubPRNumber} exists in ${fullName}`
          : 'Pull request could not be retrieved',
      },
      REPO_MATCH: {
        passed:
          Boolean(githubRepo) &&
          sameValue(githubRepo.fullName, contribution.repository.fullName) &&
          (!pullRequest?.baseRepoGithubId ||
            String(pullRequest.baseRepoGithubId) ===
              String(contribution.repository.githubRepositoryId)),
        details: `GitHub repository: ${githubRepo?.fullName ?? 'unknown'}, registered: ${contribution.repository.fullName}`,
      },
      CONTRIBUTOR_IDENTITY: {
        passed: Boolean(githubUsername) && sameValue(pullRequest?.authorLogin, githubUsername),
        details: githubUsername
          ? `Pull request author: ${pullRequest?.authorLogin ?? 'unknown'}, linked GitHub username: ${githubUsername}`
          : 'The contributor has not linked a GitHub username',
      },
      PR_STATUS: {
        passed: Boolean(pullRequest?.state),
        details: pullRequest
          ? `Pull request state: ${pullRequest.state}${pullRequest.merged ? ' (merged)' : ''}`
          : 'Pull request state unavailable',
      },
      COMMIT_VERIFICATION: {
        passed: Array.isArray(commits) && commits.length > 0,
        details: `${commits.length} commit(s) retrieved from the pull request`,
      },
    };

    // PR number/URL consistency is part of repo + identity verification.
    const urlPRNumber = parsePullRequestNumber(contribution.githubPRUrl);
    const numberMatches = urlPRNumber === pullRequest?.githubPRNumber;
    checks.REPO_MATCH.passed = checks.REPO_MATCH.passed && numberMatches;

    const criticalChecks = ['PR_EXISTS', 'REPO_MATCH', 'CONTRIBUTOR_IDENTITY'];
    const allCriticalPassed = criticalChecks.every((key) => checks[key].passed);
    const fullVerificationPassed = allCriticalPassed && checks.PR_STATUS.passed;

    // 3. Persist evidence and verification history atomically.
    const now = new Date();
    const evidenceRows = [
      {
        contributionId: contribution.id,
        evidenceType: 'PULL_REQUEST',
        externalReference: pullRequest?.githubPRUrl ?? contribution.githubPRUrl,
        metadata: {
          pullRequest,
          checks,
          fetchedAt: now.toISOString(),
        },
        verified: allCriticalPassed,
      },
      {
        contributionId: contribution.id,
        evidenceType: 'GITHUB_API',
        externalReference: `repos/${fullName}/pulls/${contribution.githubPRNumber}`,
        metadata: {
          repository: githubRepo,
          apiBaseUrl: 'https://api.github.com',
          fetchedAt: now.toISOString(),
        },
        verified: Boolean(githubRepo),
      },
      ...commits.slice(0, 100).map((commit) => ({
        contributionId: contribution.id,
        evidenceType: 'COMMIT',
        externalReference: commit.sha,
        metadata: commit,
        verified: true,
      })),
    ];

    if (pullRequest?.merged) {
      evidenceRows.push({
        contributionId: contribution.id,
        evidenceType: 'MERGE',
        externalReference:
          pullRequest.mergeCommitSha ?? `${pullRequest.githubPRUrl}#merged`,
        metadata: {
          merged: true,
          mergedAt: pullRequest.mergedAt,
          mergeCommitSha: pullRequest.mergeCommitSha,
        },
        verified: true,
      });
    }

    const verificationRows = Object.entries(checks).map(([type, check]) => ({
      contributionId: contribution.id,
      verificationType: type,
      verificationStatus: check.passed ? 'PASSED' : 'FAILED',
      verificationDetails: {
        details: check.details,
        githubRepository: githubRepo?.fullName ?? null,
        pullRequestState: pullRequest?.state ?? null,
        merged: Boolean(pullRequest?.merged),
        checkedAt: now.toISOString(),
      },
    }));

    verificationRows.push({
      contributionId: contribution.id,
      verificationType: 'FULL_VERIFICATION',
      verificationStatus: fullVerificationPassed ? 'PASSED' : 'FAILED',
      verificationDetails: {
        checks: Object.fromEntries(
          Object.entries(checks).map(([type, check]) => [type, check.passed])
        ),
        merged: Boolean(pullRequest?.merged),
        commitCount: commits.length,
        checkedAt: now.toISOString(),
      },
    });

    // Decide the next status without ever downgrading a contribution that has
    // already progressed further in the workflow.
    let nextStatus = contribution.status;
    if (fullVerificationPassed) {
      nextStatus = OPEN_STATES.includes(contribution.status) ? 'VERIFIED' : contribution.status;
    } else if (['SUBMITTED'].includes(contribution.status)) {
      nextStatus = 'PENDING_VERIFICATION';
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.contributionEvidence.createMany({
        data: evidenceRows,
        skipDuplicates: true,
      });

      await tx.verificationRecord.createMany({ data: verificationRows });

      if (nextStatus !== contribution.status) {
        await tx.contribution.update({
          where: { id: contribution.id },
          data: { status: nextStatus },
        });
      }

      const evidence = await tx.contributionEvidence.findMany({
        where: { contributionId: contribution.id },
        orderBy: { createdAt: 'desc' },
      });

      const verifications = await tx.verificationRecord.findMany({
        where: { contributionId: contribution.id },
        orderBy: { verifiedAt: 'desc' },
      });

      return { evidence, verifications };
    });

    if (fullVerificationPassed && nextStatus === 'VERIFIED') {
      await ReputationService.recalculateAfterEvent(contribution.contributorId, {
        reason: `Contribution #${contribution.githubPRNumber} verified against GitHub`,
        sourceType: 'VERIFICATION',
        sourceId: contribution.id,
      });
    }

    return {
      contributionId: contribution.id,
      status: nextStatus,
      verified: fullVerificationPassed,
      checks,
      pullRequest,
      evidenceCount: result.evidence.length,
      evidence: result.evidence,
      verificationHistory: result.verifications,
    };
  }

  /**
   * Verification summary for a contribution (latest history + evidence overview).
   */
  static async getVerification(contributionId) {
    const prisma = getPrismaClient();

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      select: { id: true, status: true, githubPRNumber: true, githubPRUrl: true },
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    const [verifications, evidence, latestFull] = await Promise.all([
      prisma.verificationRecord.findMany({
        where: { contributionId },
        orderBy: { verifiedAt: 'desc' },
      }),
      prisma.contributionEvidence.findMany({
        where: { contributionId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.verificationRecord.findFirst({
        where: { contributionId, verificationType: 'FULL_VERIFICATION' },
        orderBy: { verifiedAt: 'desc' },
      }),
    ]);

    return {
      contribution,
      verified: latestFull?.verificationStatus === 'PASSED',
      latestVerification: latestFull,
      verifications,
      evidenceSummary: {
        total: evidence.length,
        byType: evidence.reduce((acc, item) => {
          acc[item.evidenceType] = (acc[item.evidenceType] ?? 0) + 1;
          return acc;
        }, {}),
      },
    };
  }

  /**
   * Evidence attached to a contribution.
   */
  static async getEvidence(contributionId, { evidenceType } = {}) {
    const prisma = getPrismaClient();

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      select: { id: true },
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    return prisma.contributionEvidence.findMany({
      where: { contributionId, ...(evidenceType ? { evidenceType } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Contributor, repository maintainers/reviewers, and platform reviewers may
   * trigger verification.
   */
  static async assertCanVerify(contribution, user) {
    if (user.role === 'ADMIN') return;

    if (contribution.contributorId === user.id) return;

    const prisma = getPrismaClient();
    const membership = await prisma.repositoryMember.findUnique({
      where: {
        repositoryId_userId: { repositoryId: contribution.repositoryId, userId: user.id },
      },
      select: { role: true },
    });

    if (['OWNER', 'MAINTAINER'].includes(membership?.role)) return;

    if (['MAINTAINER', 'REVIEWER'].includes(user.role)) return;

    throw AppError.forbidden('You are not allowed to verify this contribution');
  }
}

export default VerificationService;
