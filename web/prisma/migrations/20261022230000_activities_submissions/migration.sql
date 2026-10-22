BEGIN;
SET LOCAL search_path=app;

-- CreateEnum
CREATE TYPE "ActivityFrequency" AS ENUM ('ONCE', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'SUBMISSION_RECEIVED';

-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN     "submissionId" UUID;

-- CreateTable
CREATE TABLE "Activity" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdByProfileId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "sticker" TEXT NOT NULL DEFAULT '',
    "points" INTEGER NOT NULL,
    "frequency" "ActivityFrequency" NOT NULL DEFAULT 'DAILY',
    "weeklyLimit" INTEGER NOT NULL DEFAULT 1,
    "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'MANUAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "actorProfileId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySubmission" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "participantMembershipId" UUID NOT NULL,
    "authorProfileId" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMPTZ(6),
    "approvedAt" TIMESTAMPTZ(6),
    "requestDigest" TEXT,
    "activityVersion" INTEGER,
    "activityName" TEXT,
    "activityDescription" TEXT,
    "activityCategory" TEXT,
    "activitySticker" TEXT,
    "points" INTEGER,
    "frequency" "ActivityFrequency",
    "weeklyLimit" INTEGER,
    "approvalMode" "ApprovalMode",
    "caption" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT,
    "localDate" VARCHAR(10),
    "periodKey" TEXT,
    "periodStart" TIMESTAMPTZ(6),
    "periodEnd" TIMESTAMPTZ(6),
    "occurrenceNumber" INTEGER,
    "evidenceAssetId" UUID,

    CONSTRAINT "ActivitySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionEvent" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "actorProfileId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsEntry" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "participantMembershipId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "actorProfileId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_storeId_archivedAt_createdAt_id_idx" ON "Activity"("storeId", "archivedAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_id_storeId_key" ON "Activity"("id", "storeId");

-- CreateIndex
CREATE INDEX "ActivityEvent_storeId_createdAt_id_idx" ON "ActivityEvent"("storeId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_activityId_version_key" ON "ActivityEvent"("activityId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySubmission_evidenceAssetId_key" ON "ActivitySubmission"("evidenceAssetId");

-- CreateIndex
CREATE INDEX "ActivitySubmission_activityId_participantMembershipId_recei_idx" ON "ActivitySubmission"("activityId", "participantMembershipId", "receivedAt");

-- CreateIndex
CREATE INDEX "ActivitySubmission_storeId_participantMembershipId_status_r_idx" ON "ActivitySubmission"("storeId", "participantMembershipId", "status", "receivedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySubmission_id_storeId_key" ON "ActivitySubmission"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySubmission_id_storeId_participantMembershipId_key" ON "ActivitySubmission"("id", "storeId", "participantMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySubmission_activityId_participantMembershipId_frequ_key" ON "ActivitySubmission"("activityId", "participantMembershipId", "frequency", "periodKey", "occurrenceNumber");

-- CreateIndex
CREATE INDEX "SubmissionEvent_storeId_createdAt_id_idx" ON "SubmissionEvent"("storeId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionEvent_submissionId_kind_key" ON "SubmissionEvent"("submissionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PointsEntry_sourceKey_key" ON "PointsEntry"("sourceKey");

-- CreateIndex
CREATE INDEX "PointsEntry_storeId_participantMembershipId_createdAt_id_idx" ON "PointsEntry"("storeId", "participantMembershipId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_profileId_key" ON "Membership"("id", "profileId");

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ActivitySubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_participantMembershipId_fkey" FOREIGN KEY ("participantMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_evidenceAssetId_fkey" FOREIGN KEY ("evidenceAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionEvent" ADD CONSTRAINT "SubmissionEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionEvent" ADD CONSTRAINT "SubmissionEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ActivitySubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionEvent" ADD CONSTRAINT "SubmissionEvent_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_participantMembershipId_fkey" FOREIGN KEY ("participantMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ActivitySubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preservar FKs manuais T05/T06; vincular novas origens ao mesmo contexto.
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_activity_store_fkey"
 FOREIGN KEY ("activityId","storeId") REFERENCES "Activity"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_activity_store_fkey"
 FOREIGN KEY ("activityId","storeId") REFERENCES "Activity"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_participant_store_fkey"
 FOREIGN KEY ("participantMembershipId","storeId") REFERENCES "Membership"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_author_membership_fkey"
 FOREIGN KEY ("participantMembershipId","authorProfileId") REFERENCES "Membership"(id,"profileId") ON DELETE RESTRICT;
ALTER TABLE "SubmissionEvent" ADD CONSTRAINT "SubmissionEvent_submission_store_fkey"
 FOREIGN KEY ("submissionId","storeId") REFERENCES "ActivitySubmission"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_submission_participant_store_fkey"
 FOREIGN KEY ("submissionId","storeId","participantMembershipId")
 REFERENCES "ActivitySubmission"(id,"storeId","participantMembershipId") ON DELETE RESTRICT;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_submission_participant_store_fkey"
 FOREIGN KEY ("submissionId","storeId","participantMembershipId")
 REFERENCES "ActivitySubmission"(id,"storeId","participantMembershipId") ON DELETE RESTRICT;

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_fields_check" CHECK (
 char_length(name) BETWEEN 1 AND 80 AND name=btrim(name) AND char_length(description)<=1000
 AND char_length(category)<=80 AND sticker IN ('','gift','coffee','takeout','envelope')
 AND points BETWEEN 1 AND 1000000 AND version>=1 AND "weeklyLimit" BETWEEN 1 AND 100
 AND (frequency='WEEKLY' OR "weeklyLimit"=1)
);
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_fields_check" CHECK (
 version>=1 AND kind IN ('CREATE','UPDATE','ARCHIVE')
 AND "requestDigest" ~ '^[a-f0-9]{64}$' AND jsonb_typeof(configuration)='object'
);
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_state_check" CHECK (
 (status='DRAFT' AND "receivedAt" IS NULL AND "approvedAt" IS NULL AND "requestDigest" IS NULL
 AND "activityVersion" IS NULL AND "activityName" IS NULL AND "activityDescription" IS NULL
 AND "activityCategory" IS NULL AND "activitySticker" IS NULL AND points IS NULL
 AND frequency IS NULL AND "weeklyLimit" IS NULL AND "approvalMode" IS NULL
 AND caption='' AND timezone IS NULL AND "localDate" IS NULL AND "periodKey" IS NULL
 AND "periodStart" IS NULL AND "periodEnd" IS NULL AND "occurrenceNumber" IS NULL AND "evidenceAssetId" IS NULL)
 OR
 (status IN ('PENDING','APPROVED') AND "receivedAt" IS NOT NULL AND "receivedAt">="createdAt"
 AND "requestDigest" IS NOT NULL AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND "activityVersion" IS NOT NULL AND "activityVersion">=1
 AND "activityName" IS NOT NULL AND char_length("activityName") BETWEEN 1 AND 80
 AND "activityDescription" IS NOT NULL AND char_length("activityDescription")<=1000
 AND "activityCategory" IS NOT NULL AND char_length("activityCategory")<=80
 AND "activitySticker" IS NOT NULL AND "activitySticker" IN ('','gift','coffee','takeout','envelope')
 AND points IS NOT NULL AND points BETWEEN 1 AND 1000000
 AND frequency IS NOT NULL AND "weeklyLimit" IS NOT NULL AND "weeklyLimit" BETWEEN 1 AND 100
 AND "approvalMode" IS NOT NULL AND timezone IS NOT NULL AND char_length(timezone) BETWEEN 1 AND 80
 AND "localDate" IS NOT NULL AND "localDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 AND "periodKey" IS NOT NULL AND char_length("periodKey") BETWEEN 1 AND 50
 AND "occurrenceNumber" IS NOT NULL AND "occurrenceNumber" BETWEEN 1 AND 100
 AND char_length(caption)<=500 AND caption=btrim(caption)
 AND ((frequency='ONCE' AND "periodStart" IS NULL AND "periodEnd" IS NULL)
 OR (frequency IN ('DAILY','WEEKLY') AND "periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL
 AND "periodStart"<="receivedAt" AND "receivedAt"<"periodEnd"))
 AND ((status='PENDING' AND "approvalMode"='MANUAL' AND "approvedAt" IS NULL)
 OR (status='APPROVED' AND "approvedAt" IS NOT NULL AND "approvedAt">="receivedAt")))
);
ALTER TABLE "SubmissionEvent" ADD CONSTRAINT "SubmissionEvent_kind_check"
 CHECK (kind IN ('RECEIVED','AUTO_APPROVED'));
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_initial_check"
 CHECK (kind='ACTIVITY_CREDIT' AND amount BETWEEN 1 AND 1000000
 AND "sourceKey"='submission.credit:'||"submissionId"::text);
CREATE UNIQUE INDEX "PointsEntry_initial_credit_key" ON "PointsEntry"("submissionId")
 WHERE kind='ACTIVITY_CREDIT';

ALTER TABLE "OutboxEvent" DROP CONSTRAINT "OutboxEvent_typed_source";
-- Comparar texto não usa o novo label enum antes do commit de ALTER TYPE.
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_typed_source" CHECK (
 (kind::text='INVITATION_ACCEPTED' AND "invitationId" IS NOT NULL AND "commentId" IS NULL AND "submissionId" IS NULL)
 OR (kind::text='COMMENT_CREATED' AND "commentId" IS NOT NULL AND "invitationId" IS NULL AND "submissionId" IS NULL)
 OR (kind::text='SUBMISSION_RECEIVED' AND "submissionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL)
);

CREATE FUNCTION app.preserve_submission_snapshot() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF OLD."receivedAt" IS NOT NULL AND
  (to_jsonb(NEW)-ARRAY['status','approvedAt']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['status','approvedAt']) THEN
  RAISE EXCEPTION 'Received submission snapshot is immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER preserve_submission_snapshot BEFORE UPDATE ON "ActivitySubmission"
 FOR EACH ROW EXECUTE FUNCTION app.preserve_submission_snapshot();

CREATE FUNCTION app.validate_initial_credit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE source app."ActivitySubmission";
BEGIN
 SELECT * INTO source FROM app."ActivitySubmission" WHERE id=NEW."submissionId";
 IF source.status IS DISTINCT FROM 'APPROVED'::app."SubmissionStatus"
 OR source.points IS NULL OR NEW.amount<>source.points THEN
  RAISE EXCEPTION 'Credit requires approved source points' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER validate_initial_credit BEFORE INSERT ON "PointsEntry"
 FOR EACH ROW EXECUTE FUNCTION app.validate_initial_credit();
REVOKE ALL ON FUNCTION app.preserve_submission_snapshot(), app.validate_initial_credit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.preserve_submission_snapshot(), app.validate_initial_credit() TO meumimo_runtime;

REVOKE ALL ON "Activity","ActivityEvent","ActivitySubmission","SubmissionEvent","PointsEntry" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON "Activity","ActivityEvent","ActivitySubmission","SubmissionEvent","PointsEntry" TO meumimo_runtime;
GRANT UPDATE (name,description,category,sticker,points,frequency,"weeklyLimit","approvalMode",version,"archivedAt") ON "Activity" TO meumimo_runtime;
GRANT UPDATE (status,"receivedAt","approvedAt","requestDigest","activityVersion","activityName","activityDescription",
 "activityCategory","activitySticker",points,frequency,"weeklyLimit","approvalMode",caption,timezone,"localDate",
 "periodKey","periodStart","periodEnd","occurrenceNumber","evidenceAssetId") ON "ActivitySubmission" TO meumimo_runtime;
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivitySubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubmissionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PointsEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_activity ON "Activity" TO meumimo_runtime USING(true) WITH CHECK(true);
CREATE POLICY runtime_activity_event ON "ActivityEvent" TO meumimo_runtime USING(true) WITH CHECK(true);
CREATE POLICY runtime_submission ON "ActivitySubmission" TO meumimo_runtime USING(true) WITH CHECK(true);
CREATE POLICY runtime_submission_event ON "SubmissionEvent" TO meumimo_runtime USING(true) WITH CHECK(true);
CREATE POLICY runtime_points ON "PointsEntry" TO meumimo_runtime USING(true) WITH CHECK(true);
COMMIT;

