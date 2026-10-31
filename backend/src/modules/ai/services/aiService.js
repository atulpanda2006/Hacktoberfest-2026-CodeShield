import { v4 as uuidv4 } from 'uuid';

import { getPrismaClient } from '../../../config/database.js';
import env from '../../../config/env.js';
import logger from '../../../utils/logger.js';
import { AppError } from '../../../utils/AppError.js';
import { AIClient, AIError, AI_ERROR_CODES } from '../../../integrations/ai/aiClient.js';
import { validateAnalysisResponse } from '../../../integrations/ai/aiSchemas.js';
import { ReputationService } from '../../reputation/services/reputationService.js';

/**
 * AIService — orchestrates contribution analysis with the external AI service
 * (Module 7).
 *
 * Rules enforced here:
 *  - AI only analyzes contributions whose authenticity was established (Module 6)
 *  - AI output is validated and stored as an assessment, never as proof of
 *    wrongdoing or as a direct reputation change
 *  - every request and outcome is recorded with a model version + status so a
 *    manual reviewer can always see what happened
 */

const IN_FLIGHT_WINDOW_MS = 5 * 60 * 1000;

function mapAIError(error) {
  if (!(error instanceof AIError)) return error;

  switch (error.code) {
    case AI_ERROR_CODES.TIMEOUT:
      return AppError.serviceUnavailable('AI service timed out. Please try again.');
    case AI_ERROR_CODES.RATE_LIMITED:
      return AppError.serviceUnavailable('AI service is busy. Please try again shortly.');
    case AI_ERROR_CODES.SERVER_ERROR:
      return AppError.serviceUnavailable('AI service failed while analyzing the contribution');
    case AI_ERROR_CODES.REJECTED:
      return new AppError(`AI service rejected the analysis request: ${error.message}`, 502);
    case AI_ERROR_CODES.INVALID_RESPONSE:
      return new AppError('AI service returned an unreadable response', 502);
    case AI_ERROR_CODES.NOT_CONFIGURED:
    case AI_ERROR_CODES.UNAVAILABLE:
    default:
      return AppError.serviceUnavailable('AI service is currently unavailable');
  }
}

export class AIService {
  /**
   * Request an analysis for a contribution.
   */
  static async analyzeContribution(contributionId, user) {
    const prisma = getPrismaClient();

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      select: {
        id: true,
        contributorId: true,
        repositoryId: true,
        githubPRNumber: true,
        githubPRUrl: true,
        title: true,
        description: true,
        contributionType: true,
        status: true,
        repository: {
          select: {
            id: true,
            fullName: true,
            primaryLanguage: true,
            stars: true,
            forks: true,
            description: true,
          },
        },
        contributor: {
          select: {
            id: true,
            username: true,
            profile: {
              select: { githubUsername: true, experienceLevel: true, skills: true },
            },
            reputation: {
              select: {
                overallScore: true,
                qualityScore: true,
                reliabilityScore: true,
                communityScore: true,
              },
            },
          },
        },
        evidence: {
          orderBy: { createdAt: 'desc' },
          select: {
            evidenceType: true,
            externalReference: true,
            metadata: true,
            verified: true,
          },
        },
      },
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    await AIService.assertCanAnalyze(contribution, user);

    if (['APPROVED', 'REJECTED'].includes(contribution.status)) {
      throw AppError.conflict('A finalised contribution cannot be re-analyzed');
    }

    if (contribution.status === 'DISPUTED') {
      throw AppError.conflict('A disputed contribution cannot be analyzed until the dispute is resolved');
    }

    if (!['VERIFIED', 'UNDER_AI_ANALYSIS', 'UNDER_COMMUNITY_REVIEW'].includes(contribution.status)) {
      throw AppError.conflict(
        'Run contribution verification successfully before requesting AI analysis'
      );
    }

    // Refuse overlapping analyses so a double click cannot produce two records.
    const inFlight = await prisma.aIAnalysis.findFirst({
      where: {
        contributionId,
        analysisStatus: { in: ['PENDING', 'IN_PROGRESS'] },
        analyzedAt: { gte: new Date(Date.now() - IN_FLIGHT_WINDOW_MS) },
      },
      select: { id: true },
    });

    if (inFlight) {
      throw AppError.conflict('An AI analysis for this contribution is already in progress');
    }

    const payload = AIService.buildPayload(contribution);
    const requestId = payload.requestId;

    const record = await prisma.aIAnalysis.create({
      data: {
        contributionId,
        modelVersion: 'unreported',
        analysisStatus: 'IN_PROGRESS',
      },
      select: { id: true },
    });

    const shouldTrackStatus = contribution.status === 'VERIFIED';
    if (shouldTrackStatus) {
      await prisma.contribution.update({
        where: { id: contributionId },
        data: { status: 'UNDER_AI_ANALYSIS' },
      });
    }

    let rawResponse;
    try {
      rawResponse = await AIClient.analyze(payload);
    } catch (error) {
      const isTimeout = error instanceof AIError && error.code === AI_ERROR_CODES.TIMEOUT;

      await prisma.aIAnalysis.update({
        where: { id: record.id },
        data: {
          analysisStatus: isTimeout ? 'TIMEOUT' : 'FAILED',
          explanation: error?.message ?? 'AI analysis failed',
          analyzedAt: new Date(),
        },
      });

      if (shouldTrackStatus) {
        await prisma.contribution.update({
          where: { id: contributionId },
          data: { status: 'VERIFIED' },
        });
      }

      throw mapAIError(error);
    }

    let analysis;
    try {
      analysis = validateAnalysisResponse(rawResponse);
    } catch (error) {
      const message = `AI response failed validation: ${error.message}`;

      await AIService.markFailed(prisma, {
        recordId: record.id,
        contributionId,
        message,
        revertStatus: shouldTrackStatus,
      });

      throw AppError.serviceUnavailable('AI service returned an invalid analysis');
    }

    // A response for a different contribution is a broken upstream contract:
    // record it and refuse to attach it to this contribution.
    if (analysis.contributionId && analysis.contributionId !== contributionId) {
      const message = 'AI response contributionId did not match the requested contribution';

      await AIService.markFailed(prisma, {
        recordId: record.id,
        contributionId,
        message,
        revertStatus: shouldTrackStatus,
      });

      throw new AppError(message, 502);
    }

    const stored = await prisma.aIAnalysis.update({
      where: { id: record.id },
      data: {
        modelVersion: analysis.modelVersion,
        qualityScore: analysis.qualityScore,
        riskScore: analysis.riskScore,
        similarityIndicators: analysis.similarityIndicators ?? null,
        suspiciousIndicators: analysis.suspiciousIndicators ?? [],
        explanation: analysis.explanation ?? null,
        confidence: analysis.confidence,
        analysisStatus: 'COMPLETED',
        analyzedAt: new Date(),
      },
    });

    if (shouldTrackStatus) {
      await prisma.contribution.update({
        where: { id: contributionId },
        data: { status: 'VERIFIED' },
      });
    }

    // Quality inputs changed: refresh reputation (AI alone never lowers a score
    // below the documented formula's effect, and never implies misconduct).
    await ReputationService.recalculateAfterEvent(contribution.contributorId, {
      reason: `AI analysis ${analysis.modelVersion} completed for contribution ${contribution.id}`,
      sourceType: 'AI_ANALYSIS',
      sourceId: contribution.id,
    });

    return { ...stored, requestId };
  }

  /**
   * Analysis history for a contribution, newest first.
   */
  static async getResults(contributionId) {
    const prisma = getPrismaClient();

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      select: { id: true, status: true, title: true, githubPRUrl: true },
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    const analyses = await prisma.aIAnalysis.findMany({
      where: { contributionId },
      orderBy: { analyzedAt: 'desc' },
    });

    const completed = analyses.filter((item) => item.analysisStatus === 'COMPLETED');

    return {
      contribution,
      latest: completed[0] ?? analyses[0] ?? null,
      history: analyses,
      summary: {
        totalAnalyses: analyses.length,
        completedAnalyses: completed.length,
        latestQualityScore: completed[0]?.qualityScore ?? null,
        latestRiskScore: completed[0]?.riskScore ?? null,
        modelVersions: [...new Set(completed.map((item) => item.modelVersion))],
      },
    };
  }

  /**
   * Record an unusable AI response without leaving the contribution stuck in
   * UNDER_AI_ANALYSIS.
   */
  static async markFailed(prisma, { recordId, contributionId, message, revertStatus }) {
    await prisma.aIAnalysis.update({
      where: { id: recordId },
      data: {
        analysisStatus: 'FAILED',
        explanation: String(message).slice(0, 5000),
        analyzedAt: new Date(),
      },
    });

    if (revertStatus) {
      await prisma.contribution.update({
        where: { id: contributionId },
        data: { status: 'VERIFIED' },
      });
    }

    logger.warn(`AI analysis for contribution ${contributionId} failed: ${message}`);
  }

  /**
   * Build the documented AI request payload from stored, verified evidence.
   */
  static buildPayload(contribution) {
    const evidence = contribution.evidence ?? [];

    const prEvidence = evidence.find((item) => item.evidenceType === 'PULL_REQUEST');
    const mergeEvidence = evidence.find((item) => item.evidenceType === 'MERGE');

    const pullRequest = prEvidence?.metadata?.pullRequest ?? {};
    const commits = evidence
      .filter((item) => item.evidenceType === 'COMMIT')
      .map((item) => item.metadata)
      .filter(Boolean)
      .slice(0, env.ai.maxCommitsInPayload)
      .map((commit) => ({
        sha: commit.sha ?? null,
        message: commit.message ?? null,
        author: commit.authorLogin ?? null,
        authoredAt: commit.authoredAt ?? null,
        additions: commit.additions ?? null,
        deletions: commit.deletions ?? null,
      }));

    return {
      requestId: uuidv4(),
      contributionId: contribution.id,
      contribution: {
        title: contribution.title,
        description: contribution.description,
        type: contribution.contributionType,
        submittedAt: contribution.createdAt ?? null,
      },
      repository: {
        fullName: contribution.repository.fullName,
        primaryLanguage: contribution.repository.primaryLanguage,
        description: contribution.repository.description,
        stars: contribution.repository.stars,
        forks: contribution.repository.forks,
      },
      pullRequest: {
        number: contribution.githubPRNumber,
        url: contribution.githubPRUrl,
        title: pullRequest.title ?? contribution.title,
        state: pullRequest.state ?? null,
        merged: Boolean(pullRequest.merged ?? mergeEvidence),
        additions: pullRequest.additions ?? null,
        deletions: pullRequest.deletions ?? null,
        changedFiles: pullRequest.changedFiles ?? null,
        author: pullRequest.authorLogin ?? contribution.contributor?.profile?.githubUsername ?? null,
      },
      commits,
      diff: {
        // Only aggregate statistics are stored; source code is not retained.
        additions: pullRequest.additions ?? null,
        deletions: pullRequest.deletions ?? null,
        changedFiles: pullRequest.changedFiles ?? null,
      },
      contributor: {
        userId: contribution.contributorId,
        username: contribution.contributor?.username ?? null,
        githubUsername: contribution.contributor?.profile?.githubUsername ?? null,
        experienceLevel: contribution.contributor?.profile?.experienceLevel ?? null,
        skills: contribution.contributor?.profile?.skills ?? [],
        reputation: contribution.contributor?.reputation ?? null,
      },
    };
  }

  /**
   * Contributor, repository maintainers, and platform reviewers may request
   * analysis.
   */
  static async assertCanAnalyze(contribution, user) {
    if (user.role === 'ADMIN') return;
    if (contribution.contributorId === user.id) return;
    if (['MAINTAINER', 'REVIEWER'].includes(user.role)) return;

    const prisma = getPrismaClient();
    const membership = await prisma.repositoryMember.findUnique({
      where: {
        repositoryId_userId: { repositoryId: contribution.repositoryId, userId: user.id },
      },
      select: { role: true },
    });

    if (['OWNER', 'MAINTAINER'].includes(membership?.role)) return;

    throw AppError.forbidden('You are not allowed to request AI analysis for this contribution');
  }
}

export default AIService;
