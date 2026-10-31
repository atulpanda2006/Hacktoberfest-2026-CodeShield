-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DEVELOPER', 'MAINTAINER', 'REVIEWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL');

-- CreateEnum
CREATE TYPE "RepositoryVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "RepositoryMemberRole" AS ENUM ('OWNER', 'MAINTAINER', 'CONTRIBUTOR');

-- CreateEnum
CREATE TYPE "ContributionType" AS ENUM ('FEATURE', 'BUG_FIX', 'DOCUMENTATION', 'REFACTORING', 'TESTING', 'OTHER');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('SUBMITTED', 'PENDING_VERIFICATION', 'VERIFIED', 'UNDER_AI_ANALYSIS', 'UNDER_COMMUNITY_REVIEW', 'APPROVED', 'REJECTED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('PULL_REQUEST', 'COMMIT', 'REVIEW', 'MERGE', 'GITHUB_API');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('PR_EXISTS', 'REPO_MATCH', 'CONTRIBUTOR_IDENTITY', 'PR_STATUS', 'COMMIT_VERIFICATION', 'FULL_VERIFICATION');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'ERROR');

-- CreateEnum
CREATE TYPE "AIAnalysisStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVE', 'REQUEST_CHANGES', 'REJECT');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'APPEALED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONTRIBUTION_SUBMITTED', 'CONTRIBUTION_VERIFIED', 'CONTRIBUTION_APPROVED', 'CONTRIBUTION_REJECTED', 'AI_ANALYSIS_COMPLETE', 'REVIEW_RECEIVED', 'DISPUTE_FILED', 'DISPUTE_RESOLVED', 'REPUTATION_UPDATED', 'TRUST_REQUEST', 'GENERAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'DEVELOPER',
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "developer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(100),
    "bio" TEXT,
    "avatar_url" VARCHAR(500),
    "github_username" VARCHAR(50),
    "github_profile_url" VARCHAR(500),
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experience_level" "ExperienceLevel" NOT NULL DEFAULT 'JUNIOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "developer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" UUID NOT NULL,
    "github_repository_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "repository_url" VARCHAR(500) NOT NULL,
    "owner_github_username" VARCHAR(50) NOT NULL,
    "primary_language" VARCHAR(50),
    "visibility" "RepositoryVisibility" NOT NULL DEFAULT 'PUBLIC',
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_members" (
    "id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "RepositoryMemberRole" NOT NULL DEFAULT 'CONTRIBUTOR',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "github_pr_number" INTEGER,
    "github_pr_url" VARCHAR(500),
    "github_pr_id" TEXT,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "contribution_type" "ContributionType" NOT NULL DEFAULT 'OTHER',
    "status" "ContributionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribution_evidence" (
    "id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "evidence_type" "EvidenceType" NOT NULL,
    "external_reference" VARCHAR(500),
    "metadata" JSONB,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contribution_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_records" (
    "id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "verification_type" "VerificationType" NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verification_details" JSONB,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "model_version" VARCHAR(50) NOT NULL,
    "quality_score" DOUBLE PRECISION,
    "risk_score" DOUBLE PRECISION,
    "similarity_indicators" JSONB,
    "suspicious_indicators" JSONB,
    "explanation" TEXT,
    "confidence" DOUBLE PRECISION,
    "analysis_status" "AIAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reliability_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consistency_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "community_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_contributions" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reputations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "previous_score" DOUBLE PRECISION NOT NULL,
    "new_score" DOUBLE PRECISION NOT NULL,
    "change_amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "source_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_relationships" (
    "id" UUID NOT NULL,
    "source_user_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "trust_level" INTEGER NOT NULL DEFAULT 1,
    "trust_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trust_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "rating" INTEGER,
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "reported_by" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "notification_type" "NotificationType" NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "developer_profiles_user_id_key" ON "developer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "developer_profiles_github_username_key" ON "developer_profiles"("github_username");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_github_repository_id_key" ON "repositories"("github_repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_full_name_key" ON "repositories"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "repository_members_repository_id_user_id_key" ON "repository_members"("repository_id", "user_id");

-- CreateIndex
CREATE INDEX "contributions_contributor_id_idx" ON "contributions"("contributor_id");

-- CreateIndex
CREATE INDEX "contributions_repository_id_idx" ON "contributions"("repository_id");

-- CreateIndex
CREATE INDEX "contributions_status_idx" ON "contributions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_repository_id_github_pr_number_key" ON "contributions"("repository_id", "github_pr_number");

-- CreateIndex
CREATE INDEX "contribution_evidence_contribution_id_idx" ON "contribution_evidence"("contribution_id");

-- CreateIndex
CREATE INDEX "verification_records_contribution_id_idx" ON "verification_records"("contribution_id");

-- CreateIndex
CREATE INDEX "ai_analyses_contribution_id_idx" ON "ai_analyses"("contribution_id");

-- CreateIndex
CREATE UNIQUE INDEX "reputations_user_id_key" ON "reputations"("user_id");

-- CreateIndex
CREATE INDEX "reputation_history_user_id_idx" ON "reputation_history"("user_id");

-- CreateIndex
CREATE INDEX "reputation_history_created_at_idx" ON "reputation_history"("created_at");

-- CreateIndex
CREATE INDEX "trust_relationships_source_user_id_idx" ON "trust_relationships"("source_user_id");

-- CreateIndex
CREATE INDEX "trust_relationships_target_user_id_idx" ON "trust_relationships"("target_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trust_relationships_source_user_id_target_user_id_key" ON "trust_relationships"("source_user_id", "target_user_id");

-- CreateIndex
CREATE INDEX "reviews_contribution_id_idx" ON "reviews"("contribution_id");

-- CreateIndex
CREATE INDEX "reviews_reviewer_id_idx" ON "reviews"("reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_contribution_id_reviewer_id_key" ON "reviews"("contribution_id", "reviewer_id");

-- CreateIndex
CREATE INDEX "disputes_contribution_id_idx" ON "disputes"("contribution_id");

-- CreateIndex
CREATE INDEX "disputes_reported_by_idx" ON "disputes"("reported_by");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- AddForeignKey
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_members" ADD CONSTRAINT "repository_members_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_members" ADD CONSTRAINT "repository_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_evidence" ADD CONSTRAINT "contribution_evidence_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputations" ADD CONSTRAINT "reputations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_history" ADD CONSTRAINT "reputation_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_relationships" ADD CONSTRAINT "trust_relationships_source_user_id_fkey" FOREIGN KEY ("source_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_relationships" ADD CONSTRAINT "trust_relationships_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
