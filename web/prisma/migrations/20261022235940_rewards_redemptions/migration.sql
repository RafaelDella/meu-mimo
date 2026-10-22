BEGIN;
SET LOCAL search_path=app;
-- CreateEnum
CREATE TYPE "app"."RedemptionStatus" AS ENUM ('WAITING_AGREEMENT', 'AGREED', 'FULFILLED', 'CANCELLATION_REQUESTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "app"."NotificationKind" ADD VALUE 'REDEMPTION_ISSUED';

-- AlterTable
ALTER TABLE "app"."OutboxEvent" ADD COLUMN     "redemptionId" UUID;

-- AlterTable
ALTER TABLE "app"."PointsEntry" ADD COLUMN     "redemptionId" UUID,
ALTER COLUMN "submissionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "app"."Reward" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdByProfileId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "sticker" TEXT NOT NULL DEFAULT 'gift',
    "cost" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "stock" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "stockRevision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."RewardEvent" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "rewardId" UUID NOT NULL,
    "actorProfileId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Redemption" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "rewardId" UUID NOT NULL,
    "participantMembershipId" UUID NOT NULL,
    "authorProfileId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "app"."RedemptionStatus" NOT NULL DEFAULT 'WAITING_AGREEMENT',
    "requestDigest" TEXT NOT NULL,
    "expectedBalance" BIGINT NOT NULL,
    "rewardVersion" INTEGER NOT NULL,
    "rewardName" TEXT NOT NULL,
    "rewardDescription" TEXT NOT NULL,
    "rewardCategory" TEXT NOT NULL,
    "rewardSticker" TEXT NOT NULL,
    "rewardCost" INTEGER NOT NULL,
    "rewardNote" TEXT NOT NULL,
    "rewardInstructions" TEXT NOT NULL,
    "balanceBefore" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "stockBefore" INTEGER,
    "stockAfter" INTEGER,
    "stockRevision" INTEGER,
    "timezone" TEXT NOT NULL,
    "localDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."RedemptionEvent" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "redemptionId" UUID NOT NULL,
    "actorProfileId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedemptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reward_storeId_archivedAt_createdAt_id_idx" ON "app"."Reward"("storeId", "archivedAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_id_storeId_key" ON "app"."Reward"("id", "storeId");

-- CreateIndex
CREATE INDEX "RewardEvent_storeId_createdAt_id_idx" ON "app"."RewardEvent"("storeId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RewardEvent_rewardId_version_key" ON "app"."RewardEvent"("rewardId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_code_key" ON "app"."Redemption"("code");

-- CreateIndex
CREATE INDEX "Redemption_storeId_participantMembershipId_status_createdAt_idx" ON "app"."Redemption"("storeId", "participantMembershipId", "status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_id_storeId_participantMembershipId_key" ON "app"."Redemption"("id", "storeId", "participantMembershipId");

-- CreateIndex
CREATE INDEX "RedemptionEvent_storeId_createdAt_id_idx" ON "app"."RedemptionEvent"("storeId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionEvent_redemptionId_kind_key" ON "app"."RedemptionEvent"("redemptionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PointsEntry_redemptionId_key" ON "app"."PointsEntry"("redemptionId");

-- AddForeignKey
ALTER TABLE "app"."OutboxEvent" ADD CONSTRAINT "OutboxEvent_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "app"."Redemption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."PointsEntry" ADD CONSTRAINT "PointsEntry_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "app"."Redemption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Reward" ADD CONSTRAINT "Reward_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "app"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Reward" ADD CONSTRAINT "Reward_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "app"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."RewardEvent" ADD CONSTRAINT "RewardEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "app"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."RewardEvent" ADD CONSTRAINT "RewardEvent_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "app"."Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."RewardEvent" ADD CONSTRAINT "RewardEvent_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "app"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Redemption" ADD CONSTRAINT "Redemption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "app"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Redemption" ADD CONSTRAINT "Redemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "app"."Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Redemption" ADD CONSTRAINT "Redemption_participantMembershipId_fkey" FOREIGN KEY ("participantMembershipId") REFERENCES "app"."Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Redemption" ADD CONSTRAINT "Redemption_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "app"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."RedemptionEvent" ADD CONSTRAINT "RedemptionEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "app"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."RedemptionEvent" ADD CONSTRAINT "RedemptionEvent_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "app"."Redemption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."RedemptionEvent" ADD CONSTRAINT "RedemptionEvent_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "app"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preservar as FKs compostas existentes; acrescentar o contexto da nova origem.
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_reward_store_fkey"
 FOREIGN KEY ("rewardId","storeId") REFERENCES "Reward"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_reward_store_fkey"
 FOREIGN KEY ("rewardId","storeId") REFERENCES "Reward"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_participant_store_fkey"
 FOREIGN KEY ("participantMembershipId","storeId") REFERENCES "Membership"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_author_membership_fkey"
 FOREIGN KEY ("participantMembershipId","authorProfileId") REFERENCES "Membership"(id,"profileId") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "Redemption_id_storeId_key" ON "Redemption"(id,"storeId");
CREATE UNIQUE INDEX "Redemption_reward_stock_revision_key" ON "Redemption"("rewardId","stockRevision") WHERE "stockRevision" IS NOT NULL;
ALTER TABLE "RedemptionEvent" ADD CONSTRAINT "RedemptionEvent_context_fkey"
 FOREIGN KEY ("redemptionId","storeId") REFERENCES "Redemption"(id,"storeId") ON DELETE RESTRICT;
ALTER TABLE "PointsEntry" ADD CONSTRAINT "Points_redemption_context_fkey"
 FOREIGN KEY ("redemptionId","storeId","participantMembershipId")
 REFERENCES "Redemption"(id,"storeId","participantMembershipId") ON DELETE RESTRICT;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "Outbox_redemption_context_fkey"
 FOREIGN KEY ("redemptionId","storeId","participantMembershipId")
 REFERENCES "Redemption"(id,"storeId","participantMembershipId") ON DELETE RESTRICT;

ALTER TABLE "Reward" ADD CONSTRAINT "Reward_fields_check" CHECK (
 char_length(name) BETWEEN 1 AND 80 AND name=btrim(name) AND char_length(description)<=1000
 AND char_length(category)<=80 AND sticker IN ('gift','coffee','takeout','envelope')
 AND cost BETWEEN 1 AND 1000000 AND char_length(note)<=500 AND char_length(instructions)<=1000
 AND (stock IS NULL OR stock BETWEEN 0 AND 1000000) AND version>=1 AND "stockRevision">=1);
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_fields_check" CHECK (
 version>=1 AND kind IN ('CREATE','UPDATE','ARCHIVE') AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND jsonb_typeof(configuration)='object');
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_fields_check" CHECK (
 status::text='WAITING_AGREEMENT' AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND "rewardVersion">=1 AND char_length("rewardName") BETWEEN 1 AND 80
 AND char_length("rewardDescription")<=1000 AND char_length("rewardCategory")<=80
 AND "rewardSticker" IN ('gift','coffee','takeout','envelope') AND "rewardCost" BETWEEN 1 AND 1000000
 AND char_length("rewardNote")<=500 AND char_length("rewardInstructions")<=1000
 AND "balanceBefore">="rewardCost" AND "expectedBalance"="balanceBefore"
 AND "balanceAfter"="balanceBefore"-"rewardCost" AND "localDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 AND char_length(timezone) BETWEEN 1 AND 80 AND code='MIMO-'||upper(id::text)
 AND (("stockBefore" IS NULL AND "stockAfter" IS NULL AND "stockRevision" IS NULL)
 OR ("stockBefore" IS NOT NULL AND "stockAfter" IS NOT NULL AND "stockRevision" IS NOT NULL
 AND "stockBefore" BETWEEN 1 AND 1000000 AND "stockAfter"="stockBefore"-1 AND "stockRevision">=2)));
ALTER TABLE "RedemptionEvent" ADD CONSTRAINT "RedemptionEvent_kind_check" CHECK (kind='ISSUED');

ALTER TABLE "PointsEntry" DROP CONSTRAINT "PointsEntry_typed_check";
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_typed_check" CHECK (
 num_nonnulls("submissionId","redemptionId")=1 AND (
 ("submissionId" IS NOT NULL AND "redemptionId" IS NULL AND (
  (kind='ACTIVITY_CREDIT' AND amount BETWEEN 1 AND 1000000 AND "compensatesEntryId" IS NULL
   AND "sourceKey"='submission.credit:'||"submissionId"::text)
  OR (kind='ACTIVITY_REVERSAL' AND amount BETWEEN -1000000 AND -1 AND "compensatesEntryId" IS NOT NULL
   AND "reviewEventId" IS NOT NULL AND "sourceKey"='submission.reverse:'||"reviewEventId"::text)
  OR (kind='ACTIVITY_RESTORE' AND amount BETWEEN 1 AND 1000000 AND "compensatesEntryId" IS NOT NULL
   AND "reviewEventId" IS NOT NULL AND "sourceKey"='submission.restore:'||"reviewEventId"::text)))
 OR ("redemptionId" IS NOT NULL AND "submissionId" IS NULL AND kind='REDEMPTION_DEBIT'
  AND amount BETWEEN -1000000 AND -1 AND "reviewEventId" IS NULL AND "compensatesEntryId" IS NULL
  AND "sourceKey"='redemption.debit:'||"redemptionId"::text)));
-- A função financeira fortalecida de T08 permanece intacta e só recebe conquistas.
DROP TRIGGER validate_initial_credit ON "PointsEntry";
CREATE TRIGGER validate_initial_credit BEFORE INSERT ON "PointsEntry"
 FOR EACH ROW WHEN (NEW."submissionId" IS NOT NULL) EXECUTE FUNCTION app.validate_initial_credit();

ALTER TABLE "OutboxEvent" DROP CONSTRAINT "OutboxEvent_typed_source";
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_typed_source" CHECK (
 ("redemptionId" IS NULL AND (
  (kind::text='INVITATION_ACCEPTED' AND "invitationId" IS NOT NULL AND "commentId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)
  OR (kind::text='COMMENT_CREATED' AND "commentId" IS NOT NULL AND "invitationId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)
  OR (kind::text='SUBMISSION_RECEIVED' AND "submissionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL AND "reviewEventId" IS NULL)
  OR (kind::text IN ('SUBMISSION_REVIEWED','SUBMISSION_RESPONDED') AND "reviewEventId" IS NOT NULL
   AND "submissionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL)))
 OR (kind::text='REDEMPTION_ISSUED' AND "redemptionId" IS NOT NULL
  AND "invitationId" IS NULL AND "commentId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL));

CREATE FUNCTION app.guard_reward_update() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF OLD."archivedAt" IS NOT NULL OR (to_jsonb(NEW)-ARRAY['name','description','category','sticker','cost','note',
 'instructions','available','stock','version','stockRevision','archivedAt']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['name','description','category','sticker','cost','note','instructions','available','stock','version','stockRevision','archivedAt'])
 OR NEW."stockRevision"<>OLD."stockRevision"+(CASE WHEN NEW.stock IS DISTINCT FROM OLD.stock THEN 1 ELSE 0 END) THEN
  RAISE EXCEPTION 'Reward identity and stock revision are protected' USING ERRCODE='23514';
 END IF;
 IF NEW.version=OLD.version THEN
  IF OLD.stock IS NULL OR NEW.stock IS NULL OR NEW.stock<>OLD.stock-1 OR
   (to_jsonb(NEW)-ARRAY['stock','stockRevision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['stock','stockRevision']) THEN
   RAISE EXCEPTION 'Stock-only update requires one reservation' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Reward configuration version must advance once' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_reward_update BEFORE UPDATE ON "Reward" FOR EACH ROW EXECUTE FUNCTION app.guard_reward_update();

CREATE FUNCTION app.validate_reward_change() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE expected_kind text; expected_configuration jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW.version=OLD.version THEN
  IF NOT EXISTS (SELECT 1 FROM app."Redemption" r WHERE r."rewardId"=NEW.id AND r."storeId"=NEW."storeId"
   AND r."stockRevision"=NEW."stockRevision" AND r."stockBefore"=OLD.stock AND r."stockAfter"=NEW.stock) THEN
   RAISE EXCEPTION 'Reservation requires its ticket' USING ERRCODE='23514';
  END IF;
 ELSE
  expected_kind:=CASE WHEN TG_OP='INSERT' THEN 'CREATE' WHEN NEW."archivedAt" IS NOT NULL THEN 'ARCHIVE' ELSE 'UPDATE' END;
  expected_configuration:=to_jsonb(NEW)-ARRAY['id','storeId','createdByProfileId','version','createdAt','archivedAt','stockRevision'];
  IF (TG_OP='INSERT' AND (NEW.version<>1 OR NEW."stockRevision"<>1)) OR NOT EXISTS (
   SELECT 1 FROM app."RewardEvent" e JOIN app."Membership" m ON m."profileId"=e."actorProfileId" AND m."storeId"=e."storeId"
   WHERE e."rewardId"=NEW.id AND e."storeId"=NEW."storeId" AND e.version=NEW.version AND e.kind=expected_kind
   AND e.configuration @> expected_configuration AND e.configuration @> jsonb_build_object('stockRevision',NEW."stockRevision")
   AND m.role='MERCHANT' AND m."accessRevokedAt" IS NULL
   AND (TG_OP<>'INSERT' OR (e.id=NEW.id AND e."actorProfileId"=NEW."createdByProfileId"))) THEN
   RAISE EXCEPTION 'Configuration requires its merchant audit' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_reward_change AFTER INSERT OR UPDATE ON "Reward"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_reward_change();

CREATE FUNCTION app.validate_reward_event() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE reward app."Reward";
BEGIN
 SELECT * INTO reward FROM app."Reward" WHERE id=NEW."rewardId" AND "storeId"=NEW."storeId";
 IF reward.id IS NULL OR reward.version<>NEW.version OR NOT NEW.configuration @>
  (to_jsonb(reward)-ARRAY['id','storeId','createdByProfileId','version','createdAt','archivedAt'])
 OR NOT EXISTS (SELECT 1 FROM app."Membership" m WHERE m."storeId"=NEW."storeId"
  AND m."profileId"=NEW."actorProfileId" AND m.role='MERCHANT' AND m."accessRevokedAt" IS NULL) THEN
  RAISE EXCEPTION 'Reward event requires its configuration update' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_reward_event AFTER INSERT ON "RewardEvent"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_reward_event();

CREATE FUNCTION app.validate_redemption_source() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE reward app."Reward"; store app."Store"; participant app."Membership"; balance numeric;
BEGIN
 SELECT * INTO store FROM app."Store" WHERE id=NEW."storeId" FOR UPDATE;
 SELECT * INTO reward FROM app."Reward" WHERE id=NEW."rewardId" AND "storeId"=NEW."storeId";
 SELECT * INTO participant FROM app."Membership" WHERE id=NEW."participantMembershipId" AND "storeId"=NEW."storeId";
 SELECT COALESCE(sum(amount),0) INTO balance FROM app."PointsEntry"
  WHERE "storeId"=NEW."storeId" AND "participantMembershipId"=NEW."participantMembershipId";
 IF store.id IS NULL OR store.state::text<>'ACTIVE' OR reward.id IS NULL OR NOT reward.available OR reward."archivedAt" IS NOT NULL
 OR participant.id IS NULL OR participant.role::text<>'PARTICIPANT' OR participant."closedAt" IS NOT NULL
 OR participant."accessRevokedAt" IS NOT NULL OR participant."profileId"<>NEW."authorProfileId"
 OR NOT EXISTS(SELECT 1 FROM app."Profile" p WHERE p.id=NEW."authorProfileId" AND p."suspendedAt" IS NULL)
 OR NEW."balanceBefore"<>balance OR NEW."balanceBefore"<reward.cost
 OR NEW.timezone<>store.timezone OR NEW."localDate"<>to_char(NEW."createdAt" AT TIME ZONE store.timezone,'YYYY-MM-DD')
 OR (NEW."rewardVersion",NEW."rewardName",NEW."rewardDescription",NEW."rewardCategory",NEW."rewardSticker",NEW."rewardCost",NEW."rewardNote",NEW."rewardInstructions")
 IS DISTINCT FROM (reward.version,reward.name,reward.description,reward.category,reward.sticker,reward.cost,reward.note,reward.instructions)
 OR (NEW."stockBefore" IS NULL AND reward.stock IS NOT NULL)
 OR (NEW."stockBefore" IS NOT NULL AND (reward.stock IS DISTINCT FROM NEW."stockAfter" OR reward."stockRevision"<>NEW."stockRevision"
  OR NOT EXISTS (SELECT 1 FROM app."Reward" r WHERE r.id=reward.id AND r.xmin=pg_current_xact_id()::text::xid)
  OR EXISTS (SELECT 1 FROM app."RewardEvent" e WHERE e."rewardId"=reward.id
   AND e.configuration->>'stockRevision'=NEW."stockRevision"::text))) THEN
  RAISE EXCEPTION 'Ticket requires authorized current snapshot, stock and funds' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER validate_redemption_source BEFORE INSERT ON "Redemption"
 FOR EACH ROW EXECUTE FUNCTION app.validate_redemption_source();

CREATE FUNCTION app.validate_redemption_debit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE source app."Redemption"; balance numeric;
BEGIN
 PERFORM id FROM app."Store" WHERE id=NEW."storeId" FOR UPDATE;
 SELECT * INTO source FROM app."Redemption" WHERE id=NEW."redemptionId";
 SELECT COALESCE(sum(amount),0) INTO balance FROM app."PointsEntry"
  WHERE "storeId"=NEW."storeId" AND "participantMembershipId"=NEW."participantMembershipId";
 IF source.id IS NULL OR NEW."storeId"<>source."storeId" OR NEW."participantMembershipId"<>source."participantMembershipId"
 OR NEW."actorProfileId"<>source."authorProfileId" OR NEW.amount<>-source."rewardCost"
 OR balance<>source."balanceBefore" OR balance<source."rewardCost" OR NEW."createdAt"<>source."createdAt" THEN
  RAISE EXCEPTION 'Debit requires exact funded ticket' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER validate_redemption_debit BEFORE INSERT ON "PointsEntry"
 FOR EACH ROW WHEN (NEW."redemptionId" IS NOT NULL) EXECUTE FUNCTION app.validate_redemption_debit();

CREATE FUNCTION app.validate_redemption_emission() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 -- A auditoria pode ter sido inserida depois do ticket na mesma transação.
 IF NEW."stockRevision" IS NOT NULL AND EXISTS (
  SELECT 1 FROM app."RewardEvent" e WHERE e."rewardId"=NEW."rewardId"
  AND e.configuration->>'stockRevision'=NEW."stockRevision"::text) THEN
  RAISE EXCEPTION 'Administrative stock revision cannot fund a reservation' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM app."PointsEntry" e WHERE e."redemptionId"=NEW.id AND e.kind='REDEMPTION_DEBIT'
  AND e.amount=-NEW."rewardCost" AND e."actorProfileId"=NEW."authorProfileId")
 OR NOT EXISTS (SELECT 1 FROM app."RedemptionEvent" e WHERE e."redemptionId"=NEW.id AND e."storeId"=NEW."storeId"
  AND e.kind='ISSUED' AND e."actorProfileId"=NEW."authorProfileId" AND e."createdAt"=NEW."createdAt")
 OR NOT EXISTS (SELECT 1 FROM app."Conversation" c WHERE c."subjectType"='TICKET' AND c."subjectId"=NEW.id
  AND c."storeId"=NEW."storeId" AND c."participantMembershipId"=NEW."participantMembershipId")
 OR NOT EXISTS (SELECT 1 FROM app."OutboxEvent" e JOIN app."Membership" m ON m.id=e."recipientMembershipId"
  WHERE e."redemptionId"=NEW.id AND e.kind::text='REDEMPTION_ISSUED' AND e.key='redemption.issued:'||NEW.id::text
  AND e."actorProfileId"=NEW."authorProfileId" AND m.role='MERCHANT' AND m."storeId"=NEW."storeId") THEN
  RAISE EXCEPTION 'Emission requires ledger, event, conversation and outbox' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_redemption_emission AFTER INSERT ON "Redemption"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_redemption_emission();

REVOKE ALL ON "Reward","RewardEvent","Redemption","RedemptionEvent" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON "Reward","RewardEvent","Redemption","RedemptionEvent" TO meumimo_runtime;
GRANT UPDATE (name,description,category,sticker,cost,note,instructions,available,stock,version,"stockRevision","archivedAt") ON "Reward" TO meumimo_runtime;
ALTER TABLE "Reward" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RewardEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Redemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RedemptionEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_reward ON "Reward" TO meumimo_runtime USING(true) WITH CHECK(true);
CREATE POLICY runtime_reward_event ON "RewardEvent" TO meumimo_runtime USING(true) WITH CHECK(true);
CREATE POLICY runtime_redemption ON "Redemption" TO meumimo_runtime USING(true) WITH CHECK(true);
CREATE POLICY runtime_redemption_event ON "RedemptionEvent" TO meumimo_runtime USING(true) WITH CHECK(true);
REVOKE ALL ON FUNCTION app.guard_reward_update(),app.validate_reward_change(),app.validate_redemption_source(),
 app.validate_redemption_debit(),app.validate_redemption_emission(),app.validate_reward_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_reward_update(),app.validate_reward_change(),app.validate_redemption_source(),
 app.validate_redemption_debit(),app.validate_redemption_emission(),app.validate_reward_event() TO meumimo_runtime;
COMMIT;

