BEGIN;
SET LOCAL search_path=app;
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'SUBMISSION_REVIEWED';
ALTER TYPE "NotificationKind" ADD VALUE 'SUBMISSION_RESPONDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubmissionStatus" ADD VALUE 'CONTESTED';
ALTER TYPE "SubmissionStatus" ADD VALUE 'VOIDED';

-- AlterTable
ALTER TABLE "ActivitySubmission" ADD COLUMN     "analysisVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN     "reviewEventId" UUID;

-- AlterTable
ALTER TABLE "PointsEntry" ADD COLUMN     "compensatesEntryId" UUID,
ADD COLUMN     "reviewEventId" UUID;

-- CreateTable
CREATE TABLE "SubmissionReviewEvent" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "actorProfileId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "SubmissionStatus" NOT NULL,
    "toStatus" "SubmissionStatus" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "requestDigest" TEXT NOT NULL,
    "evidenceAssetId" UUID,
    "evidenceRevision" INTEGER,
    "requestId" UUID,
    "delta" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionReviewEvent_evidenceAssetId_key" ON "SubmissionReviewEvent"("evidenceAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionReviewEvent_requestId_key" ON "SubmissionReviewEvent"("requestId");

-- CreateIndex
CREATE INDEX "SubmissionReviewEvent_storeId_createdAt_id_idx" ON "SubmissionReviewEvent"("storeId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionReviewEvent_submissionId_version_key" ON "SubmissionReviewEvent"("submissionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionReviewEvent_id_submissionId_storeId_key" ON "SubmissionReviewEvent"("id", "submissionId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "PointsEntry_reviewEventId_key" ON "PointsEntry"("reviewEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PointsEntry_compensatesEntryId_key" ON "PointsEntry"("compensatesEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PointsEntry_id_storeId_participantMembershipId_submissionId_key" ON "PointsEntry"("id", "storeId", "participantMembershipId", "submissionId");

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_reviewEventId_fkey" FOREIGN KEY ("reviewEventId") REFERENCES "SubmissionReviewEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_reviewEventId_fkey" FOREIGN KEY ("reviewEventId") REFERENCES "SubmissionReviewEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_compensatesEntryId_fkey" FOREIGN KEY ("compensatesEntryId") REFERENCES "PointsEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionReviewEvent" ADD CONSTRAINT "SubmissionReviewEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionReviewEvent" ADD CONSTRAINT "SubmissionReviewEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ActivitySubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionReviewEvent" ADD CONSTRAINT "SubmissionReviewEvent_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionReviewEvent" ADD CONSTRAINT "SubmissionReviewEvent_evidenceAssetId_fkey" FOREIGN KEY ("evidenceAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionReviewEvent" ADD CONSTRAINT "SubmissionReviewEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SubmissionReviewEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preservar as FKs compostas de T05/T06/T07.
ALTER TABLE "ActivitySubmission" DROP CONSTRAINT "ActivitySubmission_state_check";
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_state_check" CHECK (
 (status::text='DRAFT' AND "analysisVersion"=0 AND "receivedAt" IS NULL AND "approvedAt" IS NULL AND "requestDigest" IS NULL
 AND "activityVersion" IS NULL AND "activityName" IS NULL AND "activityDescription" IS NULL
 AND "activityCategory" IS NULL AND "activitySticker" IS NULL AND points IS NULL
 AND frequency IS NULL AND "weeklyLimit" IS NULL AND "approvalMode" IS NULL
 AND caption='' AND timezone IS NULL AND "localDate" IS NULL AND "periodKey" IS NULL
 AND "periodStart" IS NULL AND "periodEnd" IS NULL AND "occurrenceNumber" IS NULL AND "evidenceAssetId" IS NULL)
 OR
 (status::text IN ('PENDING','APPROVED','CONTESTED','VOIDED') AND "analysisVersion">=0 AND "receivedAt" IS NOT NULL AND "receivedAt">="createdAt"
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
 AND ((status::text<>'APPROVED' AND ("approvedAt" IS NULL OR "approvedAt">="receivedAt"))
 OR (status::text='APPROVED' AND "approvedAt" IS NOT NULL AND "approvedAt">="receivedAt")))
);

ALTER TABLE "SubmissionReviewEvent" ADD CONSTRAINT "Review_submission_store_fkey"
 FOREIGN KEY ("submissionId","storeId") REFERENCES "ActivitySubmission"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "SubmissionReviewEvent" ADD CONSTRAINT "Review_request_context_fkey"
 FOREIGN KEY ("requestId","submissionId","storeId") REFERENCES "SubmissionReviewEvent"(id,"submissionId","storeId") ON DELETE RESTRICT;
ALTER TABLE "PointsEntry" ADD CONSTRAINT "Points_review_context_fkey"
 FOREIGN KEY ("reviewEventId","submissionId","storeId") REFERENCES "SubmissionReviewEvent"(id,"submissionId","storeId") ON DELETE RESTRICT;
ALTER TABLE "PointsEntry" ADD CONSTRAINT "Points_compensation_context_fkey"
 FOREIGN KEY ("compensatesEntryId","storeId","participantMembershipId","submissionId")
 REFERENCES "PointsEntry"(id,"storeId","participantMembershipId","submissionId") ON DELETE RESTRICT;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "Outbox_review_context_fkey"
 FOREIGN KEY ("reviewEventId","submissionId","storeId") REFERENCES "SubmissionReviewEvent"(id,"submissionId","storeId") ON DELETE RESTRICT;

ALTER TABLE "SubmissionReviewEvent" ADD CONSTRAINT "Review_fields_check" CHECK (
 version>=1 AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND char_length(reason)<=500 AND reason=btrim(reason) AND char_length(text)<=500 AND text=btrim(text)
 AND "fromStatus"::text<>'DRAFT' AND "toStatus"::text<>'DRAFT'
 AND ((action='APPROVE' AND "fromStatus"::text IN ('PENDING','CONTESTED') AND "toStatus"::text='APPROVED' AND reason='')
 OR (action='CONTEST' AND "fromStatus"::text IN ('PENDING','APPROVED','CONTESTED') AND "toStatus"::text='CONTESTED' AND reason<>'')
 OR (action='VOID' AND "fromStatus"::text IN ('PENDING','APPROVED','CONTESTED') AND "toStatus"::text='VOIDED' AND reason<>'')
 OR (action='REOPEN' AND "fromStatus"::text='VOIDED' AND "toStatus"::text='PENDING' AND reason<>'')
 OR (action='RESPOND' AND "fromStatus"::text='CONTESTED' AND "toStatus"::text='CONTESTED' AND reason=''))
 AND ((action='RESPOND' AND "requestId" IS NOT NULL AND "evidenceRevision" IS NOT NULL AND "evidenceRevision">=2
 AND (text<>'' OR "evidenceAssetId" IS NOT NULL) AND delta=0)
 OR (action<>'RESPOND' AND "requestId" IS NULL AND "evidenceAssetId" IS NULL AND text=''))
 AND ((action='CONTEST' AND "evidenceRevision" IS NOT NULL AND "evidenceRevision">=2 AND delta=0)
 OR (action='RESPOND') OR (action NOT IN ('CONTEST','RESPOND') AND "evidenceRevision" IS NULL))
 AND ((action='APPROVE' AND delta BETWEEN 0 AND 1000000) OR (action='VOID' AND delta BETWEEN -1000000 AND 0)
 OR (action IN ('CONTEST','REOPEN','RESPOND') AND delta=0))
);
ALTER TABLE "PointsEntry" DROP CONSTRAINT "PointsEntry_initial_check";
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_typed_check" CHECK (
 (kind='ACTIVITY_CREDIT' AND amount BETWEEN 1 AND 1000000 AND "compensatesEntryId" IS NULL
 AND "sourceKey"='submission.credit:'||"submissionId"::text)
 OR (kind='ACTIVITY_REVERSAL' AND amount BETWEEN -1000000 AND -1 AND "compensatesEntryId" IS NOT NULL
 AND "reviewEventId" IS NOT NULL AND "sourceKey"='submission.reverse:'||"reviewEventId"::text)
 OR (kind='ACTIVITY_RESTORE' AND amount BETWEEN 1 AND 1000000 AND "compensatesEntryId" IS NOT NULL
 AND "reviewEventId" IS NOT NULL AND "sourceKey"='submission.restore:'||"reviewEventId"::text)
);
ALTER TABLE "OutboxEvent" DROP CONSTRAINT "OutboxEvent_typed_source";
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_typed_source" CHECK (
 (kind::text='INVITATION_ACCEPTED' AND "invitationId" IS NOT NULL AND "commentId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)
 OR (kind::text='COMMENT_CREATED' AND "commentId" IS NOT NULL AND "invitationId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)
 OR (kind::text='SUBMISSION_RECEIVED' AND "submissionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL AND "reviewEventId" IS NULL)
 OR (kind::text IN ('SUBMISSION_REVIEWED','SUBMISSION_RESPONDED') AND "reviewEventId" IS NOT NULL
 AND "submissionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL)
);

CREATE OR REPLACE FUNCTION app.preserve_submission_snapshot() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF OLD."receivedAt" IS NOT NULL AND
  ((to_jsonb(NEW)-ARRAY['status','approvedAt','analysisVersion']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['status','approvedAt','analysisVersion'])
  OR (OLD."approvedAt" IS NOT NULL AND NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt")) THEN
  RAISE EXCEPTION 'Received submission snapshot is immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$fn$;

CREATE FUNCTION app.validate_submission_analysis() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF OLD."receivedAt" IS NOT NULL AND
  (NEW."analysisVersion"<>OLD."analysisVersion"+1 OR NOT EXISTS (
   SELECT 1 FROM app."SubmissionReviewEvent" e WHERE e."submissionId"=NEW.id AND e."storeId"=NEW."storeId"
   AND e.version=NEW."analysisVersion" AND e."fromStatus"=OLD.status AND e."toStatus"=NEW.status)) THEN
  RAISE EXCEPTION 'Analysis update requires corresponding event' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_submission_analysis AFTER UPDATE ON "ActivitySubmission"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_submission_analysis();

CREATE OR REPLACE FUNCTION app.validate_initial_credit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE source app."ActivitySubmission"; event app."SubmissionReviewEvent"; previous app."PointsEntry";
BEGIN
 SELECT * INTO source FROM app."ActivitySubmission" WHERE id=NEW."submissionId";
 IF source.points IS NULL OR abs(NEW.amount)<>source.points THEN
  RAISE EXCEPTION 'Movement requires snapshot points' USING ERRCODE='23514';
 END IF;
 IF NEW."reviewEventId" IS NULL THEN
  IF NEW.kind<>'ACTIVITY_CREDIT' OR source.status::text<>'APPROVED' OR source."approvalMode"::text<>'AUTOMATIC'
   OR NEW."actorProfileId"<>source."authorProfileId" OR source."analysisVersion"<>0 THEN
   RAISE EXCEPTION 'Initial credit requires automatic approval' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO event FROM app."SubmissionReviewEvent" WHERE id=NEW."reviewEventId";
  IF event.id IS NULL OR event."submissionId"<>source.id OR event."storeId"<>source."storeId"
   OR event.version<>source."analysisVersion" OR event.delta<>NEW.amount OR event."actorProfileId"<>NEW."actorProfileId"
   OR (NEW.kind IN ('ACTIVITY_CREDIT','ACTIVITY_RESTORE') AND (event.action<>'APPROVE' OR source.status::text<>'APPROVED'))
   OR (NEW.kind='ACTIVITY_REVERSAL' AND (event.action<>'VOID' OR source.status::text<>'VOIDED')) THEN
   RAISE EXCEPTION 'Movement requires corresponding decision' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW."compensatesEntryId" IS NOT NULL THEN
  SELECT * INTO previous FROM app."PointsEntry" WHERE id=NEW."compensatesEntryId";
  IF previous.id IS NULL OR previous.amount<>-NEW.amount
   OR (NEW.kind='ACTIVITY_REVERSAL' AND previous.kind NOT IN ('ACTIVITY_CREDIT','ACTIVITY_RESTORE'))
   OR (NEW.kind='ACTIVITY_RESTORE' AND previous.kind<>'ACTIVITY_REVERSAL') THEN
   RAISE EXCEPTION 'Compensation requires opposite movement' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$fn$;

CREATE FUNCTION app.validate_review_ledger() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE total numeric; entries integer; request app."SubmissionReviewEvent";
BEGIN
 SELECT COALESCE(sum(amount),0),count(*) INTO total,entries FROM app."PointsEntry" WHERE "reviewEventId"=NEW.id;
 IF total<>NEW.delta OR entries<>(CASE WHEN NEW.delta=0 THEN 0 ELSE 1 END) THEN
  RAISE EXCEPTION 'Review delta requires exact ledger' USING ERRCODE='23514';
 END IF;
 IF NEW.action='RESPOND' THEN
  SELECT * INTO request FROM app."SubmissionReviewEvent" WHERE id=NEW."requestId";
  IF request.action IS DISTINCT FROM 'CONTEST' OR request."evidenceRevision" IS DISTINCT FROM NEW."evidenceRevision"
   OR request.version>=NEW.version THEN
   RAISE EXCEPTION 'Response requires prior request' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_review_ledger AFTER INSERT ON "SubmissionReviewEvent"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_review_ledger();
REVOKE ALL ON FUNCTION app.validate_submission_analysis(),app.validate_review_ledger() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.validate_submission_analysis(),app.validate_review_ledger() TO meumimo_runtime;
REVOKE ALL ON "SubmissionReviewEvent" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON "SubmissionReviewEvent" TO meumimo_runtime;
GRANT UPDATE ("analysisVersion") ON "ActivitySubmission" TO meumimo_runtime;
ALTER TABLE "SubmissionReviewEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_review_event ON "SubmissionReviewEvent" TO meumimo_runtime USING(true) WITH CHECK(true);
COMMIT;
