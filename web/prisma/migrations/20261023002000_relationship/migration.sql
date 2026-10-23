BEGIN;
SET LOCAL search_path=app;
ALTER TYPE "NotificationKind" ADD VALUE 'NOTE_SENT';
ALTER TYPE "NotificationKind" ADD VALUE 'REACTION_CHANGED';

CREATE TABLE "PersonalNote" (
 id uuid PRIMARY KEY, "storeId" uuid NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "participantMembershipId" uuid NOT NULL UNIQUE REFERENCES "Membership"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version integer NOT NULL CHECK (version>=1),
 UNIQUE(id,"storeId","participantMembershipId"),
 CONSTRAINT "PersonalNote_membership_context_fkey" FOREIGN KEY ("participantMembershipId","storeId") REFERENCES "Membership"(id,"storeId") ON DELETE RESTRICT
);
CREATE TABLE "NoteVersion" (
 id uuid PRIMARY KEY, "noteId" uuid NOT NULL REFERENCES "PersonalNote"(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
 "storeId" uuid NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "participantMembershipId" uuid NOT NULL REFERENCES "Membership"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorProfileId" uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version integer NOT NULL, text text NOT NULL, "requestDigest" text NOT NULL,
 "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("noteId",version), UNIQUE(id,"storeId","participantMembershipId"),
 CONSTRAINT "NoteVersion_fields_check" CHECK (version>=1 AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND char_length(text) BETWEEN 1 AND 2000 AND app.ticket_text_valid(text)),
 CONSTRAINT "NoteVersion_note_context_fkey" FOREIGN KEY ("noteId","storeId","participantMembershipId")
 REFERENCES "PersonalNote"(id,"storeId","participantMembershipId") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX "NoteVersion_storeId_participantMembershipId_createdAt_id_idx" ON "NoteVersion"("storeId","participantMembershipId","createdAt",id);
CREATE TABLE "NoteRead" (
 "noteVersionId" uuid NOT NULL REFERENCES "NoteVersion"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "readerMembershipId" uuid NOT NULL REFERENCES "Membership"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorProfileId" uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "readAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("noteVersionId","readerMembershipId")
);
CREATE UNIQUE INDEX "Conversation_id_storeId_key" ON "Conversation"(id,"storeId");
CREATE TABLE "Reaction" (
 id uuid PRIMARY KEY, "storeId" uuid NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "conversationId" uuid NOT NULL REFERENCES "Conversation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorProfileId" uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version integer NOT NULL CHECK (version>=1), emoji text,
 UNIQUE("conversationId","actorProfileId"), UNIQUE(id,"storeId","conversationId","actorProfileId"),
 CONSTRAINT "Reaction_emoji_check" CHECK (emoji IS NULL OR emoji IN ('❤️','👏','🥹','🔥','😂','🌷')),
 CONSTRAINT "Reaction_conversation_context_fkey" FOREIGN KEY ("conversationId","storeId") REFERENCES "Conversation"(id,"storeId") ON DELETE RESTRICT
);
CREATE TABLE "ReactionEvent" (
 id uuid PRIMARY KEY, "reactionId" uuid NOT NULL REFERENCES "Reaction"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "storeId" uuid NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "conversationId" uuid NOT NULL REFERENCES "Conversation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorProfileId" uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version integer NOT NULL, "fromEmoji" text, "toEmoji" text, "requestDigest" text NOT NULL,
 "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("reactionId",version), UNIQUE(id,"storeId"),
 CONSTRAINT "ReactionEvent_fields_check" CHECK (version>=1 AND "requestDigest" ~ '^[a-f0-9]{64}$'
 AND ("fromEmoji" IS NULL OR "fromEmoji" IN ('❤️','👏','🥹','🔥','😂','🌷'))
 AND ("toEmoji" IS NULL OR "toEmoji" IN ('❤️','👏','🥹','🔥','😂','🌷'))),
 CONSTRAINT "ReactionEvent_reaction_context_fkey" FOREIGN KEY ("reactionId","storeId","conversationId","actorProfileId")
 REFERENCES "Reaction"(id,"storeId","conversationId","actorProfileId") ON DELETE RESTRICT
);
CREATE INDEX "ReactionEvent_storeId_createdAt_id_idx" ON "ReactionEvent"("storeId","createdAt",id);
CREATE TABLE "NotificationGroup" (
 id uuid PRIMARY KEY, key text NOT NULL UNIQUE,
 "storeId" uuid NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "recipientMembershipId" uuid NOT NULL REFERENCES "Membership"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorProfileId" uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 category text NOT NULL CHECK (category IN ('NOTES','ACTIVITIES','REWARDS','SOCIAL')),
 version integer NOT NULL CHECK (version>=0), "lastDeliveredAt" timestamptz(6) NOT NULL,
 CONSTRAINT "NotificationGroup_recipient_context_fkey" FOREIGN KEY ("recipientMembershipId","storeId") REFERENCES "Membership"(id,"storeId") ON DELETE RESTRICT
);
CREATE INDEX "NotificationGroup_recipientMembershipId_lastDeliveredAt_id_idx" ON "NotificationGroup"("recipientMembershipId","lastDeliveredAt",id);
ALTER TABLE "Notification" ADD COLUMN "groupId" uuid REFERENCES "NotificationGroup"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD COLUMN "groupVersion" integer;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_group_pair_check" CHECK (("groupId" IS NULL AND "groupVersion" IS NULL)
 OR ("groupId" IS NOT NULL AND "groupVersion" IS NOT NULL AND "groupVersion">=1));
CREATE UNIQUE INDEX "Notification_groupId_groupVersion_key" ON "Notification"("groupId","groupVersion");
CREATE TABLE "NotificationPreference" (
 "membershipId" uuid PRIMARY KEY REFERENCES "Membership"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "storeId" uuid NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version integer NOT NULL CHECK (version>=1), "socialMuted" boolean NOT NULL DEFAULT false,
 "automaticApprovalNotices" boolean NOT NULL DEFAULT true,
 CONSTRAINT "NotificationPreference_membership_context_fkey" FOREIGN KEY ("membershipId","storeId") REFERENCES "Membership"(id,"storeId") ON DELETE RESTRICT
);
CREATE TABLE "NotificationPreferenceEvent" (
 id uuid PRIMARY KEY, "membershipId" uuid NOT NULL REFERENCES "Membership"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "storeId" uuid NOT NULL REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorProfileId" uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version integer NOT NULL CHECK (version>=1), "requestDigest" text NOT NULL CHECK ("requestDigest" ~ '^[a-f0-9]{64}$'),
 "socialMuted" boolean NOT NULL, "automaticApprovalNotices" boolean NOT NULL,
 "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("membershipId",version),
 CONSTRAINT "PreferenceEvent_membership_context_fkey" FOREIGN KEY ("membershipId","storeId") REFERENCES "Membership"(id,"storeId") ON DELETE RESTRICT,
 CONSTRAINT "PreferenceEvent_actor_context_fkey" FOREIGN KEY ("membershipId","actorProfileId") REFERENCES "Membership"(id,"profileId") ON DELETE RESTRICT
);
CREATE INDEX "NotificationPreferenceEvent_storeId_createdAt_id_idx" ON "NotificationPreferenceEvent"("storeId","createdAt",id);
ALTER TABLE "OutboxEvent" ADD COLUMN "noteVersionId" uuid REFERENCES "NoteVersion"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD COLUMN "reactionEventId" uuid REFERENCES "ReactionEvent"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "Outbox_note_context_fkey" FOREIGN KEY ("noteVersionId","storeId","participantMembershipId")
 REFERENCES "NoteVersion"(id,"storeId","participantMembershipId") ON DELETE RESTRICT;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "Outbox_reaction_context_fkey" FOREIGN KEY ("reactionEventId","storeId") REFERENCES "ReactionEvent"(id,"storeId") ON DELETE RESTRICT;
DO $body$
DECLARE prior text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO prior FROM pg_constraint WHERE conrelid='app."OutboxEvent"'::regclass AND conname='OutboxEvent_typed_source';
 ALTER TABLE "OutboxEvent" DROP CONSTRAINT "OutboxEvent_typed_source";
 EXECUTE 'ALTER TABLE app."OutboxEvent" ADD CONSTRAINT "OutboxEvent_typed_source" CHECK '
 ||'(("noteVersionId" IS NULL AND "reactionEventId" IS NULL AND ('||prior||')) OR '
 ||'(kind::text=''NOTE_SENT'' AND "noteVersionId" IS NOT NULL AND "reactionEventId" IS NULL '
 ||'AND num_nonnulls("invitationId","commentId","submissionId","reviewEventId","redemptionId","redemptionEventId","albumEventId")=0) OR '
 ||'(kind::text=''REACTION_CHANGED'' AND "reactionEventId" IS NOT NULL AND "noteVersionId" IS NULL '
 ||'AND num_nonnulls("invitationId","commentId","submissionId","reviewEventId","redemptionId","redemptionEventId","albumEventId")=0))';
END;
$body$;

CREATE FUNCTION app.notification_category(kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
 SELECT CASE WHEN kind='NOTE_SENT' THEN 'NOTES' WHEN kind IN ('COMMENT_CREATED','REACTION_CHANGED') THEN 'SOCIAL'
 WHEN kind IN ('REDEMPTION_ISSUED','REDEMPTION_UPDATED','ALBUM_PUBLISHED') THEN 'REWARDS' ELSE 'ACTIVITIES' END;
$fn$;
CREATE FUNCTION app.notification_group_key(event_id uuid,notification_id uuid) RETURNS text LANGUAGE sql STABLE AS $fn$
 SELECT CASE WHEN e.kind::text IN ('COMMENT_CREATED','REACTION_CHANGED') THEN 'social:'||e."recipientMembershipId"::text||':'||e."storeId"::text
 ||':'||e."actorProfileId"::text||':'||COALESCE(c."conversationId",r."conversationId")::text||':'||floor(extract(epoch FROM e."createdAt")/300)::text
 ELSE 'event:'||notification_id::text END FROM app."OutboxEvent" e
 LEFT JOIN app."Comment" c ON c.id=e."commentId" LEFT JOIN app."ReactionEvent" r ON r.id=e."reactionEventId" WHERE e.id=event_id;
$fn$;
-- Cada evento antigo mantém seu ID, fonte e readAt. Só se acrescenta a projeção.
INSERT INTO "NotificationGroup" (id,key,"storeId","recipientMembershipId","actorProfileId",category,version,"lastDeliveredAt")
 SELECT gen_random_uuid(),app.notification_group_key(e.id,n.id),e."storeId",e."recipientMembershipId",e."actorProfileId",
 app.notification_category(e.kind::text),count(*)::integer,max(n."createdAt") FROM "Notification" n JOIN "OutboxEvent" e ON e.id=n."eventId"
 GROUP BY app.notification_group_key(e.id,n.id),e."storeId",e."recipientMembershipId",e."actorProfileId",app.notification_category(e.kind::text);
WITH members AS (SELECT n.id,g.id AS group_id,row_number() OVER (PARTITION BY g.id ORDER BY n."createdAt",n.id)::integer AS version
 FROM "Notification" n JOIN "OutboxEvent" e ON e.id=n."eventId" JOIN "NotificationGroup" g ON g.key=app.notification_group_key(e.id,n.id))
 UPDATE "Notification" n SET "groupId"=m.group_id,"groupVersion"=m.version FROM members m WHERE m.id=n.id;

CREATE FUNCTION app.guard_relationship_projection() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE mutable text[];
BEGIN
 mutable:=CASE TG_TABLE_NAME WHEN 'PersonalNote' THEN ARRAY['version'] WHEN 'Reaction' THEN ARRAY['version','emoji']
 WHEN 'NotificationPreference' THEN ARRAY['version','socialMuted','automaticApprovalNotices'] ELSE ARRAY['version','lastDeliveredAt'] END;
 IF TG_OP='INSERT' THEN
  IF TG_TABLE_NAME<>'NotificationGroup' AND NEW.version<>1 THEN RAISE EXCEPTION 'Projection begins at one' USING ERRCODE='23514'; END IF;
 ELSIF (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Projection identity is immutable and advances once' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_note_projection BEFORE INSERT OR UPDATE ON "PersonalNote" FOR EACH ROW EXECUTE FUNCTION app.guard_relationship_projection();
CREATE TRIGGER guard_reaction_projection BEFORE INSERT OR UPDATE ON "Reaction" FOR EACH ROW EXECUTE FUNCTION app.guard_relationship_projection();
CREATE TRIGGER guard_preference_projection BEFORE INSERT OR UPDATE ON "NotificationPreference" FOR EACH ROW EXECUTE FUNCTION app.guard_relationship_projection();
CREATE TRIGGER guard_notification_group_projection BEFORE INSERT OR UPDATE ON "NotificationGroup" FOR EACH ROW EXECUTE FUNCTION app.guard_relationship_projection();

CREATE FUNCTION app.validate_note_projection() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE note app."PersonalNote"; latest app."NoteVersion"; target uuid; total integer;
BEGIN
 IF TG_TABLE_NAME='PersonalNote' THEN target:=NEW.id; ELSE target:=NEW."noteId"; END IF;
 SELECT * INTO note FROM app."PersonalNote" WHERE id=target AND xmin=pg_current_xact_id()::text::xid;
 SELECT * INTO latest FROM app."NoteVersion" WHERE "noteId"=target ORDER BY version DESC LIMIT 1;
 SELECT count(*) INTO total FROM app."NoteVersion" WHERE "noteId"=target;
 IF note.id IS NULL OR latest.id IS NULL OR note.version<>latest.version OR total<>note.version THEN
  RAISE EXCEPTION 'Note requires its exact version projection' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_note_projection AFTER INSERT OR UPDATE ON "PersonalNote" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_note_projection();
CREATE CONSTRAINT TRIGGER validate_note_version_projection AFTER INSERT ON "NoteVersion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_note_projection();
CREATE FUNCTION app.validate_note_version() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE recipient app."Membership"; source app."Store";
BEGIN
 SELECT * INTO recipient FROM app."Membership" WHERE id=NEW."participantMembershipId";
 SELECT * INTO source FROM app."Store" WHERE id=NEW."storeId";
 IF recipient.id IS NULL OR recipient."storeId"<>source.id OR recipient.role::text<>'PARTICIPANT'
 OR recipient."accessRevokedAt" IS NOT NULL OR recipient."closedAt" IS NOT NULL OR source.state::text='CLOSED'
 OR NOT EXISTS (SELECT 1 FROM app."Profile" WHERE id=recipient."profileId" AND "suspendedAt" IS NULL)
 OR NOT EXISTS (SELECT 1 FROM app."Membership" m JOIN app."Profile" p ON p.id=m."profileId" WHERE m."storeId"=source.id
 AND m.role::text='MERCHANT' AND m."profileId"=NEW."actorProfileId" AND m."accessRevokedAt" IS NULL AND m."closedAt" IS NULL AND p."suspendedAt" IS NULL)
 OR (SELECT count(*) FROM app."OutboxEvent" WHERE "noteVersionId"=NEW.id)<>1 THEN
  RAISE EXCEPTION 'Note version requires author, open relation and one outbox' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_note_version AFTER INSERT ON "NoteVersion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_note_version();
CREATE FUNCTION app.validate_note_read() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE note app."NoteVersion"; reader app."Membership";
BEGIN
 SELECT * INTO note FROM app."NoteVersion" WHERE id=NEW."noteVersionId";
 SELECT * INTO reader FROM app."Membership" WHERE id=NEW."readerMembershipId";
 IF note.id IS NULL OR reader.id IS NULL OR reader.id<>note."participantMembershipId" OR reader.role::text<>'PARTICIPANT'
 OR reader."storeId"<>note."storeId" OR reader."profileId"<>NEW."actorProfileId" OR reader."accessRevokedAt" IS NOT NULL
 OR NOT EXISTS (SELECT 1 FROM app."Profile" WHERE id=reader."profileId" AND "suspendedAt" IS NULL) THEN
  RAISE EXCEPTION 'Note read belongs only to exact version recipient' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER validate_note_read BEFORE INSERT ON "NoteRead" FOR EACH ROW EXECUTE FUNCTION app.validate_note_read();

CREATE FUNCTION app.validate_reaction_projection() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE projection app."Reaction"; latest app."ReactionEvent"; target uuid; total integer;
BEGIN
 IF TG_TABLE_NAME='Reaction' THEN target:=NEW.id; ELSE target:=NEW."reactionId"; END IF;
 SELECT * INTO projection FROM app."Reaction" WHERE id=target AND xmin=pg_current_xact_id()::text::xid;
 SELECT * INTO latest FROM app."ReactionEvent" WHERE "reactionId"=target ORDER BY version DESC LIMIT 1;
 SELECT count(*) INTO total FROM app."ReactionEvent" WHERE "reactionId"=target;
 IF projection.id IS NULL OR latest.id IS NULL OR projection.version<>latest.version OR total<>projection.version
 OR projection.emoji IS DISTINCT FROM latest."toEmoji" THEN RAISE EXCEPTION 'Reaction requires matching event and projection' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_reaction_projection AFTER INSERT OR UPDATE ON "Reaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_reaction_projection();
CREATE CONSTRAINT TRIGGER validate_reaction_event_projection AFTER INSERT ON "ReactionEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_reaction_projection();
CREATE FUNCTION app.validate_reaction_event() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE conversation app."Conversation"; previous app."ReactionEvent"; source app."Store"; target app."Membership"; notices integer;
BEGIN
 SELECT * INTO conversation FROM app."Conversation" WHERE id=NEW."conversationId";
 SELECT * INTO source FROM app."Store" WHERE id=NEW."storeId";
 SELECT * INTO target FROM app."Membership" WHERE id=conversation."participantMembershipId";
 SELECT * INTO previous FROM app."ReactionEvent" WHERE "reactionId"=NEW."reactionId" AND version=NEW.version-1;
 SELECT count(*) INTO notices FROM app."OutboxEvent" WHERE "reactionEventId"=NEW.id;
 IF conversation.id IS NULL OR source.id IS NULL OR source.id<>conversation."storeId" OR conversation."commentsClosedAt" IS NOT NULL
 OR target.id IS NULL OR target.role::text<>'PARTICIPANT' OR target."accessRevokedAt" IS NOT NULL
 OR NOT EXISTS (SELECT 1 FROM app."Membership" m JOIN app."Profile" p ON p.id=m."profileId" WHERE m."storeId"=source.id
 AND m."profileId"=NEW."actorProfileId" AND m."accessRevokedAt" IS NULL AND p."suspendedAt" IS NULL
 AND (m.role::text='MERCHANT' OR m.id=target.id))
 OR (NEW.version=1 AND NEW."fromEmoji" IS NOT NULL) OR (NEW.version>1 AND (previous.id IS NULL OR previous."toEmoji" IS DISTINCT FROM NEW."fromEmoji"))
 OR notices<>(CASE WHEN NEW."toEmoji" IS NOT NULL AND NEW."toEmoji" IS DISTINCT FROM NEW."fromEmoji" THEN 1 ELSE 0 END) THEN
  RAISE EXCEPTION 'Reaction event requires its author, previous state and derived notice' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_reaction_event AFTER INSERT ON "ReactionEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_reaction_event();

CREATE FUNCTION app.validate_relationship_outbox() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE note app."NoteVersion"; reaction app."ReactionEvent"; conversation app."Conversation"; participant app."Membership"; recipient uuid;
BEGIN
 IF NEW.kind::text='NOTE_SENT' THEN
  SELECT * INTO note FROM app."NoteVersion" WHERE id=NEW."noteVersionId";
  IF note.id IS NULL OR NEW."storeId"<>note."storeId" OR NEW."participantMembershipId"<>note."participantMembershipId"
  OR NEW."recipientMembershipId"<>note."participantMembershipId" OR NEW."actorProfileId"<>note."actorProfileId" OR NEW.key<>'note.sent:'||note.id::text THEN
   RAISE EXCEPTION 'Note notice requires exact author and recipient' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO reaction FROM app."ReactionEvent" WHERE id=NEW."reactionEventId";
  SELECT * INTO conversation FROM app."Conversation" WHERE id=reaction."conversationId";
  SELECT * INTO participant FROM app."Membership" WHERE id=conversation."participantMembershipId";
  IF reaction."actorProfileId"=participant."profileId" THEN
   SELECT id INTO recipient FROM app."Membership" WHERE "storeId"=conversation."storeId" AND role::text='MERCHANT';
  ELSE recipient:=participant.id; END IF;
  IF reaction.id IS NULL OR conversation.id IS NULL OR recipient IS NULL OR reaction."toEmoji" IS NULL
  OR reaction."toEmoji" IS NOT DISTINCT FROM reaction."fromEmoji" OR NEW."storeId"<>reaction."storeId"
  OR NEW."participantMembershipId"<>participant.id OR NEW."recipientMembershipId"<>recipient
  OR NEW."actorProfileId"<>reaction."actorProfileId" OR NEW.key<>'reaction.changed:'||reaction.id::text THEN
   RAISE EXCEPTION 'Reaction notice requires changed state and exact opposite audience' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER validate_relationship_outbox BEFORE INSERT ON "OutboxEvent" FOR EACH ROW
 WHEN (NEW.kind::text IN ('NOTE_SENT','REACTION_CHANGED')) EXECUTE FUNCTION app.validate_relationship_outbox();

CREATE FUNCTION app.validate_preference_projection() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE projection app."NotificationPreference"; latest app."NotificationPreferenceEvent"; target uuid; total integer;
BEGIN
 target:=NEW."membershipId";
 SELECT * INTO projection FROM app."NotificationPreference" WHERE "membershipId"=target AND xmin=pg_current_xact_id()::text::xid;
 SELECT * INTO latest FROM app."NotificationPreferenceEvent" WHERE "membershipId"=target ORDER BY version DESC LIMIT 1;
 SELECT count(*) INTO total FROM app."NotificationPreferenceEvent" WHERE "membershipId"=target;
 IF projection."membershipId" IS NULL OR latest.id IS NULL OR projection.version<>latest.version OR total<>projection.version
 OR projection."socialMuted"<>latest."socialMuted" OR projection."automaticApprovalNotices"<>latest."automaticApprovalNotices" THEN
  RAISE EXCEPTION 'Preference requires matching immutable audit' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_preference_projection AFTER INSERT OR UPDATE ON "NotificationPreference" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_preference_projection();
CREATE CONSTRAINT TRIGGER validate_preference_event_projection AFTER INSERT ON "NotificationPreferenceEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_preference_projection();

CREATE FUNCTION app.guard_notification_membership() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['readAt','groupId','groupVersion']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['readAt','groupId','groupVersion'])
 OR (OLD."groupId" IS NOT NULL AND (NEW."groupId" IS DISTINCT FROM OLD."groupId" OR NEW."groupVersion" IS DISTINCT FROM OLD."groupVersion"))
 OR (OLD."readAt" IS NOT NULL AND NEW."readAt" IS DISTINCT FROM OLD."readAt") THEN
  RAISE EXCEPTION 'Notification source, group assignment and confirmed read are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER guard_notification_membership BEFORE UPDATE ON "Notification" FOR EACH ROW EXECUTE FUNCTION app.guard_notification_membership();
CREATE FUNCTION app.validate_notification_member() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE member app."Notification"; source app."OutboxEvent"; projection app."NotificationGroup";
BEGIN
 SELECT * INTO member FROM app."Notification" WHERE id=NEW.id;
 SELECT * INTO source FROM app."OutboxEvent" WHERE id=member."eventId";
 SELECT * INTO projection FROM app."NotificationGroup" WHERE id=member."groupId";
 IF projection.id IS NULL OR member."groupVersion" IS NULL OR member."groupVersion">projection.version
 OR projection.key IS DISTINCT FROM app.notification_group_key(source.id,member.id)
 OR projection.category IS DISTINCT FROM app.notification_category(source.kind::text)
 OR projection."storeId"<>source."storeId" OR projection."recipientMembershipId"<>source."recipientMembershipId"
 OR projection."actorProfileId"<>source."actorProfileId" THEN
  RAISE EXCEPTION 'Notification group cannot mix audience, source, window or category' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_notification_member AFTER INSERT OR UPDATE ON "Notification" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_notification_member();
CREATE FUNCTION app.validate_notification_group() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE projection app."NotificationGroup"; members integer; maximum integer;
BEGIN
 SELECT * INTO projection FROM app."NotificationGroup" WHERE id=NEW.id;
 SELECT count(*),max("groupVersion") INTO members,maximum FROM app."Notification" WHERE "groupId"=NEW.id;
 IF projection.version<1 OR members<>projection.version OR maximum IS DISTINCT FROM projection.version THEN
  RAISE EXCEPTION 'Notification group requires consecutive delivered members' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END;
$fn$;
CREATE CONSTRAINT TRIGGER validate_notification_group AFTER INSERT OR UPDATE ON "NotificationGroup" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_notification_group();

CREATE FUNCTION app.preserve_relationship_history() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'Relationship history is immutable' USING ERRCODE='23514'; END;
$fn$;
CREATE TRIGGER preserve_note_version BEFORE UPDATE ON "NoteVersion" FOR EACH ROW EXECUTE FUNCTION app.preserve_relationship_history();
CREATE TRIGGER preserve_note_read BEFORE UPDATE ON "NoteRead" FOR EACH ROW EXECUTE FUNCTION app.preserve_relationship_history();
CREATE TRIGGER preserve_reaction_event BEFORE UPDATE ON "ReactionEvent" FOR EACH ROW EXECUTE FUNCTION app.preserve_relationship_history();
CREATE TRIGGER preserve_preference_event BEFORE UPDATE ON "NotificationPreferenceEvent" FOR EACH ROW EXECUTE FUNCTION app.preserve_relationship_history();
DO $body$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['PersonalNote','NoteVersion','NoteRead','Reaction','ReactionEvent','NotificationGroup','NotificationPreference','NotificationPreferenceEvent'] LOOP
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,anon,authenticated',target);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO meumimo_runtime',target);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',target);
  EXECUTE format('CREATE POLICY runtime_relationship ON app.%I TO meumimo_runtime USING (true) WITH CHECK (true)',target);
 END LOOP;
END;
$body$;
GRANT UPDATE(version) ON "PersonalNote" TO meumimo_runtime;
GRANT UPDATE(version,emoji) ON "Reaction" TO meumimo_runtime;
GRANT UPDATE(version,"lastDeliveredAt") ON "NotificationGroup" TO meumimo_runtime;
GRANT UPDATE(version,"socialMuted","automaticApprovalNotices") ON "NotificationPreference" TO meumimo_runtime;
GRANT UPDATE("groupId","groupVersion") ON "Notification" TO meumimo_runtime;
REVOKE ALL ON FUNCTION app.notification_category(text),app.notification_group_key(uuid,uuid),app.guard_relationship_projection(),
 app.validate_note_projection(),app.validate_note_version(),app.validate_note_read(),app.validate_reaction_projection(),app.validate_reaction_event(),
 app.validate_relationship_outbox(),app.validate_preference_projection(),app.guard_notification_membership(),app.validate_notification_member(),
 app.validate_notification_group(),app.preserve_relationship_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.notification_category(text),app.notification_group_key(uuid,uuid) TO meumimo_runtime;
COMMIT;
