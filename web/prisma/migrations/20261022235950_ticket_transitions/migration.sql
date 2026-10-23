BEGIN;
SET LOCAL search_path=app;

ALTER TYPE "NotificationKind" ADD VALUE 'REDEMPTION_UPDATED';
ALTER TABLE "Redemption"
 ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD COLUMN "agreementText" text NOT NULL DEFAULT '',
 ADD COLUMN "agreementDate" varchar(10),
 ADD COLUMN "cancellationFromStatus" "RedemptionStatus",
 ADD COLUMN "fulfilledAt" timestamptz(6),
 ADD COLUMN "cancelledAt" timestamptz(6);
ALTER TABLE "RedemptionEvent"
 ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD COLUMN "fromStatus" "RedemptionStatus",
 ADD COLUMN "toStatus" "RedemptionStatus" NOT NULL DEFAULT 'WAITING_AGREEMENT',
 ADD COLUMN text text NOT NULL DEFAULT '',
 ADD COLUMN "agreementDate" varchar(10),
 ADD COLUMN "requestDigest" text NOT NULL DEFAULT '',
 ADD COLUMN "requestId" uuid,
 ADD COLUMN delta bigint NOT NULL DEFAULT 0,
 ADD COLUMN restocked boolean NOT NULL DEFAULT false,
 ADD COLUMN "stockBefore" integer,
 ADD COLUMN "stockAfter" integer,
 ADD COLUMN "stockRevision" integer,
 ADD COLUMN "balanceBefore" bigint,
 ADD COLUMN "balanceAfter" bigint;
ALTER TABLE "PointsEntry" ADD COLUMN "redemptionEventId" uuid;
ALTER TABLE "OutboxEvent" ADD COLUMN "redemptionEventId" uuid;

DROP INDEX "RedemptionEvent_redemptionId_kind_key";
DROP INDEX "PointsEntry_redemptionId_key";
CREATE UNIQUE INDEX "RedemptionEvent_redemptionId_version_key" ON "RedemptionEvent"("redemptionId",version);
CREATE UNIQUE INDEX "RedemptionEvent_id_redemptionId_storeId_key" ON "RedemptionEvent"(id,"redemptionId","storeId");
CREATE UNIQUE INDEX "RedemptionEvent_requestId_key" ON "RedemptionEvent"("requestId");
CREATE UNIQUE INDEX "PointsEntry_redemptionEventId_key" ON "PointsEntry"("redemptionEventId");
CREATE UNIQUE INDEX "Points_redemption_kind_key" ON "PointsEntry"("redemptionId",kind) WHERE "redemptionId" IS NOT NULL;
CREATE UNIQUE INDEX "Points_redemption_compensation_key" ON "PointsEntry"(id,"storeId","participantMembershipId","redemptionId");
ALTER TABLE "RedemptionEvent" ADD CONSTRAINT "RedemptionEvent_requestId_fkey"
 FOREIGN KEY ("requestId") REFERENCES "RedemptionEvent"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RedemptionEvent" ADD CONSTRAINT "Ticket_request_context_fkey"
 FOREIGN KEY ("requestId","redemptionId","storeId") REFERENCES "RedemptionEvent"(id,"redemptionId","storeId") ON DELETE RESTRICT;
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_redemptionEventId_fkey"
 FOREIGN KEY ("redemptionEventId") REFERENCES "RedemptionEvent"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointsEntry" ADD CONSTRAINT "Points_ticket_event_context_fkey"
 FOREIGN KEY ("redemptionEventId","redemptionId","storeId") REFERENCES "RedemptionEvent"(id,"redemptionId","storeId") ON DELETE RESTRICT;
ALTER TABLE "PointsEntry" ADD CONSTRAINT "Points_ticket_compensation_context_fkey"
 FOREIGN KEY ("compensatesEntryId","storeId","participantMembershipId","redemptionId")
 REFERENCES "PointsEntry"(id,"storeId","participantMembershipId","redemptionId") ON DELETE RESTRICT;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_redemptionEventId_fkey"
 FOREIGN KEY ("redemptionEventId") REFERENCES "RedemptionEvent"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "Outbox_ticket_event_context_fkey"
 FOREIGN KEY ("redemptionEventId","redemptionId","storeId") REFERENCES "RedemptionEvent"(id,"redemptionId","storeId") ON DELETE RESTRICT;

-- A fotografia financeira e de catálogo da emissão continua protegida.
ALTER TABLE "Redemption" DROP CONSTRAINT "Redemption_fields_check";
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_fields_check" CHECK (
 "requestDigest" ~ '^[a-f0-9]{64}$'
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
ALTER TABLE "Redemption" ADD CONSTRAINT "Ticket_state_check" CHECK (
 version>=1 AND char_length("agreementText")<=500 AND "agreementText"=btrim("agreementText")
 AND ("agreementDate" IS NULL OR ("agreementDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 AND to_char("agreementDate"::date,'YYYY-MM-DD')="agreementDate"))
 AND ((status::text='WAITING_AGREEMENT' AND "agreementText"='' AND "agreementDate" IS NULL
 AND "cancellationFromStatus" IS NULL AND "fulfilledAt" IS NULL AND "cancelledAt" IS NULL)
 OR (status::text='AGREED' AND "agreementText"<>'' AND "cancellationFromStatus" IS NULL
 AND "fulfilledAt" IS NULL AND "cancelledAt" IS NULL)
 OR (status::text='CANCELLATION_REQUESTED' AND "cancellationFromStatus" IS NOT NULL
 AND "cancellationFromStatus"::text IN ('WAITING_AGREEMENT','AGREED')
 AND (("cancellationFromStatus"::text='WAITING_AGREEMENT' AND "agreementText"='' AND "agreementDate" IS NULL)
 OR ("cancellationFromStatus"::text='AGREED' AND "agreementText"<>''))
 AND "fulfilledAt" IS NULL AND "cancelledAt" IS NULL)
 OR (status::text='FULFILLED' AND "cancellationFromStatus" IS NULL AND "fulfilledAt" IS NOT NULL
 AND "fulfilledAt">="createdAt" AND "cancelledAt" IS NULL)
 OR (status::text='CANCELLED' AND "cancellationFromStatus" IS NULL AND "cancelledAt" IS NOT NULL
 AND "cancelledAt">="createdAt" AND "fulfilledAt" IS NULL)));

ALTER TABLE "RedemptionEvent" DROP CONSTRAINT "RedemptionEvent_kind_check";
ALTER TABLE "RedemptionEvent" ADD CONSTRAINT "Ticket_event_check" CHECK (
 version>=1 AND char_length(text)<=500 AND text=btrim(text)
 AND ("agreementDate" IS NULL OR ("agreementDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 AND to_char("agreementDate"::date,'YYYY-MM-DD')="agreementDate"))
 AND ((kind='ISSUED' AND version=1 AND "fromStatus" IS NULL AND "toStatus"::text='WAITING_AGREEMENT'
 AND text='' AND "agreementDate" IS NULL AND "requestDigest"='' AND "requestId" IS NULL)
 OR (version>=2 AND "fromStatus" IS NOT NULL AND "requestDigest" ~ '^[a-f0-9]{64}$' AND (
 (kind='AGREE' AND "fromStatus"::text IN ('WAITING_AGREEMENT','AGREED') AND "toStatus"::text='AGREED' AND text<>'' AND "requestId" IS NULL)
 OR (kind='FULFILL' AND "fromStatus"::text IN ('WAITING_AGREEMENT','AGREED') AND "toStatus"::text='FULFILLED' AND text='' AND "agreementDate" IS NULL AND "requestId" IS NULL)
 OR (kind='REQUEST_CANCELLATION' AND "fromStatus"::text IN ('WAITING_AGREEMENT','AGREED') AND "toStatus"::text='CANCELLATION_REQUESTED' AND text<>'' AND "agreementDate" IS NULL AND "requestId" IS NULL)
 OR (kind='REJECT_CANCELLATION' AND "fromStatus"::text='CANCELLATION_REQUESTED' AND "toStatus"::text IN ('WAITING_AGREEMENT','AGREED') AND text<>'' AND "agreementDate" IS NULL AND "requestId" IS NOT NULL)
 OR (kind='CANCEL' AND "fromStatus"::text IN ('WAITING_AGREEMENT','AGREED','CANCELLATION_REQUESTED') AND "toStatus"::text='CANCELLED' AND text<>'' AND "agreementDate" IS NULL
 AND (("fromStatus"::text='CANCELLATION_REQUESTED' AND "requestId" IS NOT NULL)
 OR ("fromStatus"::text<>'CANCELLATION_REQUESTED' AND "requestId" IS NULL))))))
 AND ((kind='CANCEL' AND delta BETWEEN 1 AND 1000000 AND "balanceBefore" IS NOT NULL AND "balanceAfter" IS NOT NULL
 AND "balanceAfter"="balanceBefore"+delta)
 OR (kind<>'CANCEL' AND delta=0 AND "balanceBefore" IS NULL AND "balanceAfter" IS NULL))
 AND ((restocked AND kind='CANCEL' AND "stockBefore" IS NOT NULL AND "stockAfter" IS NOT NULL AND "stockRevision" IS NOT NULL
 AND "stockBefore" BETWEEN 0 AND 999999 AND "stockAfter"="stockBefore"+1 AND "stockRevision">=2)
 OR (NOT restocked AND "stockBefore" IS NULL AND "stockAfter" IS NULL AND "stockRevision" IS NULL)));

ALTER TABLE "PointsEntry" DROP CONSTRAINT "PointsEntry_typed_check";
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_typed_check" CHECK (
 num_nonnulls("submissionId","redemptionId")=1 AND (
 ("submissionId" IS NOT NULL AND "redemptionId" IS NULL AND "redemptionEventId" IS NULL AND (
  (kind='ACTIVITY_CREDIT' AND amount BETWEEN 1 AND 1000000 AND "compensatesEntryId" IS NULL
   AND "sourceKey"='submission.credit:'||"submissionId"::text)
  OR (kind='ACTIVITY_REVERSAL' AND amount BETWEEN -1000000 AND -1 AND "compensatesEntryId" IS NOT NULL
   AND "reviewEventId" IS NOT NULL AND "sourceKey"='submission.reverse:'||"reviewEventId"::text)
  OR (kind='ACTIVITY_RESTORE' AND amount BETWEEN 1 AND 1000000 AND "compensatesEntryId" IS NOT NULL
   AND "reviewEventId" IS NOT NULL AND "sourceKey"='submission.restore:'||"reviewEventId"::text)))
 OR ("redemptionId" IS NOT NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL AND (
  (kind='REDEMPTION_DEBIT' AND amount BETWEEN -1000000 AND -1 AND "redemptionEventId" IS NULL AND "compensatesEntryId" IS NULL
   AND "sourceKey"='redemption.debit:'||"redemptionId"::text)
  OR (kind='REDEMPTION_REFUND' AND amount BETWEEN 1 AND 1000000 AND "redemptionEventId" IS NOT NULL AND "compensatesEntryId" IS NOT NULL
   AND "sourceKey"='redemption.refund:'||"redemptionId"::text)))));
-- As funções financeiras fortalecidas de T08 não são substituídas.
DROP TRIGGER validate_redemption_debit ON "PointsEntry";
CREATE TRIGGER validate_redemption_debit BEFORE INSERT ON "PointsEntry"
 FOR EACH ROW WHEN (NEW.kind='REDEMPTION_DEBIT') EXECUTE FUNCTION app.validate_redemption_debit();

ALTER TABLE "OutboxEvent" DROP CONSTRAINT "OutboxEvent_typed_source";
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_typed_source" CHECK (
 ("redemptionEventId" IS NULL AND (("redemptionId" IS NULL AND (
  (kind::text='INVITATION_ACCEPTED' AND "invitationId" IS NOT NULL AND "commentId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)
  OR (kind::text='COMMENT_CREATED' AND "commentId" IS NOT NULL AND "invitationId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)
  OR (kind::text='SUBMISSION_RECEIVED' AND "submissionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL AND "reviewEventId" IS NULL)
  OR (kind::text IN ('SUBMISSION_REVIEWED','SUBMISSION_RESPONDED') AND "reviewEventId" IS NOT NULL AND "submissionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL)))
 OR (kind::text='REDEMPTION_ISSUED' AND "redemptionId" IS NOT NULL AND "invitationId" IS NULL AND "commentId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL)))
 OR (kind::text='REDEMPTION_UPDATED' AND "redemptionId" IS NOT NULL AND "redemptionEventId" IS NOT NULL
 AND "invitationId" IS NULL AND "commentId" IS NULL AND "submissionId" IS NULL AND "reviewEventId" IS NULL));

CREATE FUNCTION app.guard_ticket_projection() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR NEW.status::text<>'WAITING_AGREEMENT' OR NEW."agreementText"<>''
   OR NEW."agreementDate" IS NOT NULL OR NEW."cancellationFromStatus" IS NOT NULL
   OR NEW."fulfilledAt" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL THEN
   RAISE EXCEPTION 'Tickets start at their issued version' USING ERRCODE='23514';
  END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','version','agreementText','agreementDate','cancellationFromStatus','fulfilledAt','cancelledAt'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','agreementText','agreementDate','cancellationFromStatus','fulfilledAt','cancelledAt'])
   OR NEW.version<>OLD.version+1 OR OLD.status::text IN ('FULFILLED','CANCELLED') THEN
   RAISE EXCEPTION 'Ticket snapshot and terminal states are immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_ticket_projection BEFORE INSERT OR UPDATE ON "Redemption"
 FOR EACH ROW EXECUTE FUNCTION app.guard_ticket_projection();

CREATE FUNCTION app.validate_ticket_projection() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE event app."RedemptionEvent";
BEGIN
 SELECT * INTO event FROM app."RedemptionEvent" WHERE "redemptionId"=NEW.id AND version=NEW.version;
 IF event.id IS NULL OR event."fromStatus" IS DISTINCT FROM OLD.status OR event."toStatus"<>NEW.status
 OR (event.kind='AGREE' AND (NEW."agreementText"<>event.text OR NEW."agreementDate" IS DISTINCT FROM event."agreementDate"))
 OR (event.kind<>'AGREE' AND (NEW."agreementText"<>OLD."agreementText" OR NEW."agreementDate" IS DISTINCT FROM OLD."agreementDate"))
 OR (event.kind='REQUEST_CANCELLATION' AND NEW."cancellationFromStatus" IS DISTINCT FROM OLD.status)
 OR (event.kind='REJECT_CANCELLATION' AND NEW.status IS DISTINCT FROM OLD."cancellationFromStatus")
 OR (event.kind<>'REQUEST_CANCELLATION' AND NEW."cancellationFromStatus" IS NOT NULL)
 OR (event.kind='FULFILL' AND NEW."fulfilledAt" IS DISTINCT FROM event."createdAt")
 OR (event.kind<>'FULFILL' AND NEW."fulfilledAt" IS DISTINCT FROM OLD."fulfilledAt")
 OR (event.kind='CANCEL' AND NEW."cancelledAt" IS DISTINCT FROM event."createdAt")
 OR (event.kind<>'CANCEL' AND NEW."cancelledAt" IS DISTINCT FROM OLD."cancelledAt") THEN
  RAISE EXCEPTION 'Ticket update requires its exact transition event' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_ticket_projection AFTER UPDATE ON "Redemption"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_ticket_projection();

CREATE FUNCTION app.validate_ticket_event() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE source app."Redemption"; previous app."RedemptionEvent"; request app."RedemptionEvent";
 actor app."Membership"; reward app."Reward"; total numeric; entries integer;
BEGIN
 SELECT * INTO source FROM app."Redemption" WHERE id=NEW."redemptionId" AND "storeId"=NEW."storeId";
 SELECT * INTO actor FROM app."Membership" WHERE "storeId"=NEW."storeId" AND "profileId"=NEW."actorProfileId";
 IF source.id IS NULL OR actor.id IS NULL OR actor."accessRevokedAt" IS NOT NULL
 OR NOT EXISTS (SELECT 1 FROM app."Profile" p WHERE p.id=NEW."actorProfileId" AND p."suspendedAt" IS NULL)
 OR NOT EXISTS (SELECT 1 FROM app."Membership" m WHERE m.id=source."participantMembershipId" AND m."accessRevokedAt" IS NULL)
 OR NEW."createdAt"<source."createdAt" THEN
  RAISE EXCEPTION 'Ticket event requires current authorized audience' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='ISSUED' THEN
  IF NEW."actorProfileId"<>source."authorProfileId" OR NEW."createdAt"<>source."createdAt" THEN
   RAISE EXCEPTION 'Issued event requires original author and timestamp' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO previous FROM app."RedemptionEvent" WHERE "redemptionId"=source.id AND version=NEW.version-1;
 IF previous.id IS NULL OR previous."toStatus" IS DISTINCT FROM NEW."fromStatus" OR NEW."createdAt"<previous."createdAt"
 OR source.version<>NEW.version OR source.status<>NEW."toStatus"
 OR (NEW.kind='REQUEST_CANCELLATION' AND actor.id<>source."participantMembershipId")
 OR (NEW.kind<>'REQUEST_CANCELLATION' AND actor.role::text<>'MERCHANT') THEN
  RAISE EXCEPTION 'Ticket transition requires ordered state and role' USING ERRCODE='23514';
 END IF;
 IF NEW."requestId" IS NOT NULL THEN
  SELECT * INTO request FROM app."RedemptionEvent" WHERE id=NEW."requestId";
  IF request.id IS NULL OR request.kind<>'REQUEST_CANCELLATION' OR request.version<>NEW.version-1
   OR (NEW.kind='REJECT_CANCELLATION' AND NEW."toStatus" IS DISTINCT FROM request."fromStatus") THEN
   RAISE EXCEPTION 'Resolution requires the pending cancellation request' USING ERRCODE='23514';
  END IF;
 END IF;
 SELECT COALESCE(sum(amount),0),count(*) INTO total,entries FROM app."PointsEntry" WHERE "redemptionEventId"=NEW.id;
 IF total<>NEW.delta OR entries<>(CASE WHEN NEW.kind='CANCEL' THEN 1 ELSE 0 END)
 OR (NEW.kind='CANCEL' AND NEW.delta<>source."rewardCost") THEN
  RAISE EXCEPTION 'Ticket transition requires its exact refund' USING ERRCODE='23514';
 END IF;
 IF NEW.restocked THEN
  SELECT * INTO reward FROM app."Reward" WHERE id=source."rewardId";
  IF source."stockRevision" IS NULL OR reward.stock IS NULL OR reward.stock<>NEW."stockAfter"
   OR reward."stockRevision"<>NEW."stockRevision"
   OR NOT EXISTS (SELECT 1 FROM app."Reward" r WHERE r.id=reward.id AND r.xmin=pg_current_xact_id()::text::xid)
   OR EXISTS (SELECT 1 FROM app."RewardEvent" e WHERE e."rewardId"=reward.id
    AND e.configuration->>'stockRevision'=NEW."stockRevision"::text)
   OR EXISTS (SELECT 1 FROM app."Redemption" r WHERE r."rewardId"=reward.id AND r."stockRevision"=NEW."stockRevision")
   OR (SELECT count(*) FROM app."RedemptionEvent" e JOIN app."Redemption" r ON r.id=e."redemptionId"
    WHERE r."rewardId"=reward.id AND e.restocked AND e."stockRevision"=NEW."stockRevision")<>1 THEN
   RAISE EXCEPTION 'Restock requires an exclusive limited-stock return' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM app."OutboxEvent" e JOIN app."Membership" m ON m.id=e."recipientMembershipId"
  WHERE e."redemptionEventId"=NEW.id AND e."redemptionId"=source.id AND e."storeId"=source."storeId"
  AND e."participantMembershipId"=source."participantMembershipId" AND e."actorProfileId"=NEW."actorProfileId"
  AND e.kind::text='REDEMPTION_UPDATED' AND e.key='redemption.updated:'||NEW.id::text
  AND m."storeId"=source."storeId" AND m."accessRevokedAt" IS NULL
  AND ((actor.role::text='MERCHANT' AND m.id=source."participantMembershipId")
   OR (actor.role::text='PARTICIPANT' AND m.role::text='MERCHANT'))) THEN
  RAISE EXCEPTION 'Ticket transition requires its private outbox event' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_ticket_event AFTER INSERT ON "RedemptionEvent"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_ticket_event();

CREATE FUNCTION app.validate_ticket_refund() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE source app."Redemption"; event app."RedemptionEvent"; debit app."PointsEntry"; balance numeric;
BEGIN
 PERFORM id FROM app."Store" WHERE id=NEW."storeId" FOR UPDATE;
 SELECT * INTO source FROM app."Redemption" WHERE id=NEW."redemptionId";
 SELECT * INTO event FROM app."RedemptionEvent" WHERE id=NEW."redemptionEventId";
 SELECT * INTO debit FROM app."PointsEntry" WHERE id=NEW."compensatesEntryId";
 SELECT COALESCE(sum(amount),0) INTO balance FROM app."PointsEntry"
  WHERE "storeId"=NEW."storeId" AND "participantMembershipId"=NEW."participantMembershipId";
 IF source.id IS NULL OR source.status::text<>'CANCELLED' OR event.id IS NULL OR event.kind<>'CANCEL'
 OR event.version<>source.version OR event."redemptionId"<>source.id OR event."storeId"<>source."storeId"
 OR NEW."storeId"<>source."storeId" OR NEW."participantMembershipId"<>source."participantMembershipId"
 OR NEW."actorProfileId"<>event."actorProfileId" OR NEW.amount<>source."rewardCost"
 OR NEW."createdAt"<>event."createdAt" OR event.delta<>NEW.amount OR event."balanceBefore" IS DISTINCT FROM balance
 OR event."balanceAfter" IS DISTINCT FROM balance+NEW.amount OR debit.id IS NULL OR debit.kind<>'REDEMPTION_DEBIT'
 OR debit."redemptionId"<>source.id OR debit.amount<>-NEW.amount THEN
  RAISE EXCEPTION 'Refund requires exact cancellation, debit and current balance' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER validate_ticket_refund BEFORE INSERT ON "PointsEntry"
 FOR EACH ROW WHEN (NEW.kind='REDEMPTION_REFUND') EXECUTE FUNCTION app.validate_ticket_refund();

CREATE FUNCTION app.validate_ticket_outbox() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE event app."RedemptionEvent"; source app."Redemption"; actor app."Membership"; recipient app."Membership";
BEGIN
 SELECT * INTO event FROM app."RedemptionEvent" WHERE id=NEW."redemptionEventId";
 SELECT * INTO source FROM app."Redemption" WHERE id=NEW."redemptionId";
 SELECT * INTO actor FROM app."Membership" WHERE "storeId"=NEW."storeId" AND "profileId"=NEW."actorProfileId";
 SELECT * INTO recipient FROM app."Membership" WHERE id=NEW."recipientMembershipId";
 IF event.id IS NULL OR source.id IS NULL OR actor.id IS NULL OR recipient.id IS NULL OR event.kind='ISSUED'
 OR event."redemptionId"<>source.id OR event."storeId"<>NEW."storeId" OR source."storeId"<>NEW."storeId"
 OR source."participantMembershipId"<>NEW."participantMembershipId" OR NEW."actorProfileId"<>event."actorProfileId"
 OR NEW.key<>'redemption.updated:'||event.id::text OR recipient."storeId"<>source."storeId"
 OR actor."accessRevokedAt" IS NOT NULL OR recipient."accessRevokedAt" IS NOT NULL
 OR NOT ((actor.role::text='MERCHANT' AND recipient.id=source."participantMembershipId")
 OR (actor.id=source."participantMembershipId" AND recipient.role::text='MERCHANT')) THEN
  RAISE EXCEPTION 'Ticket notification requires exact private transition audience' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER validate_ticket_outbox BEFORE INSERT ON "OutboxEvent"
 FOR EACH ROW WHEN (NEW.kind::text='REDEMPTION_UPDATED') EXECUTE FUNCTION app.validate_ticket_outbox();

-- Estoque pode voltar em mimo arquivado sem alterar sua configuração.
CREATE OR REPLACE FUNCTION app.guard_reward_update() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['name','description','category','sticker','cost','note',
 'instructions','available','stock','version','stockRevision','archivedAt']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['name','description','category','sticker','cost','note','instructions','available','stock','version','stockRevision','archivedAt'])
 OR NEW."stockRevision"<>OLD."stockRevision"+(CASE WHEN NEW.stock IS DISTINCT FROM OLD.stock THEN 1 ELSE 0 END) THEN
  RAISE EXCEPTION 'Reward identity and stock revision are protected' USING ERRCODE='23514';
 END IF;
 IF NEW.version=OLD.version THEN
  IF OLD.stock IS NULL OR NEW.stock IS NULL OR abs(NEW.stock-OLD.stock)<>1
   OR (OLD."archivedAt" IS NOT NULL AND NEW.stock<>OLD.stock+1)
   OR (to_jsonb(NEW)-ARRAY['stock','stockRevision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['stock','stockRevision']) THEN
   RAISE EXCEPTION 'Stock-only update requires one reservation or return' USING ERRCODE='23514';
  END IF;
 ELSIF OLD."archivedAt" IS NOT NULL OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Reward configuration version must advance once' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION app.validate_reward_change() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE expected_kind text; expected_configuration jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW.version=OLD.version THEN
  IF NEW.stock=OLD.stock-1 THEN
   IF NOT EXISTS (SELECT 1 FROM app."Redemption" r WHERE r."rewardId"=NEW.id AND r."storeId"=NEW."storeId"
    AND r."stockRevision"=NEW."stockRevision" AND r."stockBefore"=OLD.stock AND r."stockAfter"=NEW.stock) THEN
    RAISE EXCEPTION 'Reservation requires its ticket' USING ERRCODE='23514';
   END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM app."RedemptionEvent" e JOIN app."Redemption" r ON r.id=e."redemptionId"
   WHERE r."rewardId"=NEW.id AND r."storeId"=NEW."storeId" AND r."stockRevision" IS NOT NULL
   AND e.kind='CANCEL' AND e.restocked AND e."stockRevision"=NEW."stockRevision"
   AND e."stockBefore"=OLD.stock AND e."stockAfter"=NEW.stock) THEN
   RAISE EXCEPTION 'Restock requires its explicit cancellation event' USING ERRCODE='23514';
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

GRANT UPDATE (status,version,"agreementText","agreementDate","cancellationFromStatus","fulfilledAt","cancelledAt")
 ON "Redemption" TO meumimo_runtime;
REVOKE ALL ON FUNCTION app.guard_ticket_projection(),app.validate_ticket_projection(),app.validate_ticket_event(),app.validate_ticket_refund(),app.validate_ticket_outbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_ticket_projection(),app.validate_ticket_projection(),app.validate_ticket_event(),app.validate_ticket_refund(),app.validate_ticket_outbox() TO meumimo_runtime;
COMMIT;
