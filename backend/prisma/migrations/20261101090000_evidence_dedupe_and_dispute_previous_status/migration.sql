-- Prevent the same external evidence from being stored twice for a contribution
-- Name matches Prisma's canonical 63-character identifier so a fresh
-- `prisma migrate deploy` does not want to rename it later.
CREATE UNIQUE INDEX "contribution_evidence_contribution_id_evidence_type_externa_key"
  ON "contribution_evidence"("contribution_id", "evidence_type", "external_reference");

-- Remember the contribution status at the moment a dispute was filed so a
-- dismissed dispute can restore it instead of leaving it stuck in DISPUTED.
ALTER TABLE "disputes" ADD COLUMN "previous_contribution_status" "ContributionStatus";
